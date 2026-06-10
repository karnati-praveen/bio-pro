import { useEffect, useRef, useState } from "react";
import { chemProperties, chemSdf } from "../../shared/lib/api/client.js";
import { useUiStore } from "../../shared/stores/uiStore.js";

const STYLES_3D = ["stick", "sphere", "line", "cartoon"];

// Module 6 — Molecular Structure Editor. Enter a SMILES or a PubChem name, render
// the 2D structure (smiles-drawer) and an interactive 3D model (3Dmol from a PubChem
// SDF), and show computed properties + Lipinski rule-of-five.
export default function MoleculeEditor({ tab }) {
  const [query, setQuery] = useState(tab.meta?.smiles || tab.content?.trim() || "aspirin");
  const [inputType, setInputType] = useState(tab.meta?.smiles || tab.content?.trim() ? "smiles" : "name");
  const [props, setProps] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("2d");
  const [style3d, setStyle3d] = useState("stick");

  const theme = useUiStore((s) => s.theme);

  const canvasRef = useRef(null);
  const viewer3dRef = useRef(null);
  const viewerInstance = useRef(null);

  const load = async (q = query, t = inputType) => {
    setLoading(true); setError(null);
    try {
      const data = await chemProperties(q, t);
      setProps(data);
    } catch (e) {
      setError(e.message);
      setProps(null);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* initial */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw 2D whenever the SMILES or theme changes and the 2D view is active.
  useEffect(() => {
    if (view !== "2d" || !props?.smiles || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("smiles-drawer");
        const SmilesDrawer = mod.default || mod;
        const drawer = new SmilesDrawer.Drawer({ width: 360, height: 280, bondThickness: 1.0 });
        SmilesDrawer.parse(props.smiles, (tree) => {
          if (!cancelled && canvasRef.current) drawer.draw(tree, canvasRef.current, theme);
        }, () => { if (!cancelled) setError("Could not render this structure in 2D."); });
      } catch {
        setError("2D renderer unavailable.");
      }
    })();
    return () => { cancelled = true; };
  }, [view, props?.smiles, theme]);

  // Build the 3D viewer from a PubChem SDF when 3D view or theme changes.
  useEffect(() => {
    if (view !== "3d" || !props || !viewer3dRef.current) return;
    let cancelled = false;
    const bg3d = theme === "dark" ? "#0d1117" : "#ffffff";
    (async () => {
      const q = props.cid ? String(props.cid) : props.smiles;
      const t = props.cid ? "cid" : "smiles";
      const sdf = await chemSdf(q, t, "3d");
      if (cancelled || !sdf) { if (!cancelled) setError("No 3D conformer available."); return; }
      try {
        const $3Dmol = await import("3dmol");
        const el = viewer3dRef.current;
        el.innerHTML = "";
        const viewer = $3Dmol.createViewer(el, { backgroundColor: bg3d });
        viewer.addModel(sdf, "sdf");
        applyStyle(viewer, style3d);
        viewer.zoomTo();
        viewer.render();
        viewerInstance.current = viewer;
      } catch {
        setError("3D viewer unavailable.");
      }
    })();
    return () => { cancelled = true; };
  }, [view, props, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restyle the existing 3D model without refetching.
  useEffect(() => {
    if (view === "3d" && viewerInstance.current) {
      applyStyle(viewerInstance.current, style3d);
      viewerInstance.current.render();
    }
  }, [style3d]); // eslint-disable-line react-hooks/exhaustive-deps

  const lip = props?.lipinski;

  return (
    <div className="mol-editor">
      <div className="mol-toolbar">
        <select value={inputType} onChange={(e) => setInputType(e.target.value)}>
          <option value="name">Name</option>
          <option value="smiles">SMILES</option>
        </select>
        <input className="mol-search" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()} placeholder="aspirin or CC(=O)Oc1ccccc1C(=O)O" />
        <button className="btn primary" onClick={() => load()} disabled={loading}>{loading ? "…" : "Load"}</button>
        <div className="mol-view-toggle">
          <button className={`btn${view === "2d" ? " primary" : ""}`} onClick={() => setView("2d")}>2D</button>
          <button className={`btn${view === "3d" ? " primary" : ""}`} onClick={() => setView("3d")}>3D</button>
        </div>
        {view === "3d" && (
          <select value={style3d} onChange={(e) => setStyle3d(e.target.value)}>
            {STYLES_3D.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {error && <div className="dsl-error">{error}</div>}

      <div className="mol-body">
        <div className="mol-render">
          {view === "2d"
            ? <canvas ref={canvasRef} width={360} height={280} className="mol-canvas" />
            : <div ref={viewer3dRef} className="mol-3d" />}
        </div>

        <div className="mol-props">
          {props ? (
            <>
              <h3>{props.name || query}</h3>
              {props.source === "offline" && <div className="mol-note">{props.note}</div>}
              <dl className="prop-list">
                <dt>Formula</dt><dd>{props.formula || "—"}</dd>
                <dt>MW</dt><dd>{fmt(props.mw)} g/mol</dd>
                <dt>Exact mass</dt><dd>{fmt(props.exact_mass)}</dd>
                <dt>LogP</dt><dd>{fmt(props.logp)}</dd>
                <dt>TPSA</dt><dd>{fmt(props.tpsa)} Å²</dd>
                <dt>H-bond donors</dt><dd>{nz(props.hbd)}</dd>
                <dt>H-bond acceptors</dt><dd>{nz(props.hba)}</dd>
                <dt>Rotatable bonds</dt><dd>{nz(props.rotatable_bonds)}</dd>
                {props.cid && <><dt>PubChem CID</dt><dd>{props.cid}</dd></>}
              </dl>

              {lip && (
                <div className={`lipinski ${lip.passes ? "pass" : "fail"}`}>
                  Lipinski Rule of Five: <b>{lip.passes ? "PASS" : "FAIL"}</b> ({lip.violations} violation{lip.violations === 1 ? "" : "s"})
                  <ul>
                    <li className={cls(lip.checks.mw_le_500)}>MW ≤ 500</li>
                    <li className={cls(lip.checks.logp_le_5)}>LogP ≤ 5</li>
                    <li className={cls(lip.checks.hbd_le_5)}>HBD ≤ 5</li>
                    <li className={cls(lip.checks.hba_le_10)}>HBA ≤ 10</li>
                  </ul>
                </div>
              )}

              {props.smiles && <CopyRow label="SMILES" value={props.smiles} />}
              {props.inchikey && <CopyRow label="InChIKey" value={props.inchikey} />}
            </>
          ) : <div className="panel-empty">Search a compound to see properties.</div>}
        </div>
      </div>
    </div>
  );
}

function applyStyle(viewer, style) {
  viewer.setStyle({}, {});
  if (style === "sphere") viewer.setStyle({}, { sphere: { scale: 0.3 }, stick: { radius: 0.15 } });
  else if (style === "line") viewer.setStyle({}, { line: {} });
  else if (style === "cartoon") viewer.setStyle({}, { cartoon: { color: "spectrum" }, stick: { radius: 0.1 } });
  else viewer.setStyle({}, { stick: {} });
}

const fmt = (v) => (v == null ? "—" : v);
const nz = (v) => (v == null ? "—" : v);
const cls = (ok) => (ok ? "lip-ok" : "lip-bad");

function CopyRow({ label, value }) {
  return (
    <div className="copy-row">
      <span className="copy-label">{label}</span>
      <code className="copy-value" title={value}>{value}</code>
      <button className="btn micro" onClick={() => navigator.clipboard?.writeText(value)}>copy</button>
    </div>
  );
}
