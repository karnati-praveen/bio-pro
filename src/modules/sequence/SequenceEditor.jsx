import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  seqParse, seqRevComp, seqTranslate, seqGC, seqOrfs, seqRestriction, designPrimers,
} from "../../shared/lib/api/client.js";

const BASE_COLOR = { A: "var(--base-a)", C: "var(--base-c)", G: "var(--base-g)", T: "var(--base-t)", U: "var(--base-t)", N: "var(--base-n)" };
const FEATURE_COLOR = {
  promoter: "var(--feat-promoter)", CDS: "var(--feat-cds)", cds: "var(--feat-cds)", gene: "var(--feat-cds)",
  RBS: "var(--feat-rbs)", rbs: "var(--feat-rbs)", terminator: "var(--feat-terminator)", operator: "var(--feat-operator)",
  misc_feature: "var(--feat-misc)",
};
const ROW = 60;

// Module 2 — DNA Sequence Editor. Linear base-pair view (60/row with position
// rulers), feature track, restriction sites, GC plot, translation. Backed by the
// /api/sequence/* router.
export default function SequenceEditor({ tab }) {
  const [data, setData] = useState(null);        // { name, sequence, features, topology, length }
  const [error, setError] = useState(null);
  const [showGC, setShowGC] = useState(true);
  const [showSites, setShowSites] = useState(false);
  const [gc, setGc] = useState(null);
  const [sites, setSites] = useState([]);
  const [orfs, setOrfs] = useState([]);
  const [translation, setTranslation] = useState(null);
  const [frame, setFrame] = useState(0);
  const [primers, setPrimers] = useState(null);

  // Parse on mount (from tab.meta.sequence if present, else tab.content).
  useEffect(() => {
    const content = tab.meta?.sequence
      ? `>${tab.meta.name || tab.title}\n${tab.meta.sequence}`
      : tab.content || "";
    seqParse(tab.filePath || tab.title, content)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [tab]);

  const seq = data?.sequence || "";

  useEffect(() => {
    if (!seq) return;
    seqGC(seq, 50).then(setGc).catch(() => {});
    seqOrfs(seq, 90).then((r) => setOrfs(r.orfs)).catch(() => {});
  }, [seq]);

  useEffect(() => {
    if (showSites && seq) seqRestriction(seq).then((r) => setSites(r.sites)).catch(() => {});
  }, [showSites, seq]);

  const featureAt = useMemo(() => {
    const map = new Array(seq.length).fill(null);
    for (const f of data?.features || []) {
      for (let i = f.start; i < f.end && i < seq.length; i++) map[i] = f;
    }
    return map;
  }, [data, seq]);

  const sitesByPos = useMemo(() => {
    const m = {};
    for (const s of sites) (m[s.position] ??= []).push(s.enzyme);
    return m;
  }, [sites]);

  const doRevComp = async () => {
    const r = await seqRevComp(seq);
    setData((d) => ({ ...d, sequence: r.sequence, features: [] }));
  };
  const doTranslate = async () => setTranslation(await seqTranslate(seq, frame));
  const doPrimers = async () => {
    try { setPrimers((await designPrimers(seq, { target_tm: 60 })).primers); }
    catch (e) { setError(e.message); }
  };

  if (error) return <div className="seq-editor"><div className="dsl-error">{error}</div></div>;
  if (!data) return <div className="panel-empty">Parsing sequence…</div>;

  const rows = [];
  for (let i = 0; i < seq.length; i += ROW) rows.push(i);

  return (
    <div className="seq-editor">
      <div className="seq-toolbar">
        <span className="seq-name">{data.name}</span>
        <span className="seq-meta">{data.length} bp · {data.topology}{gc ? ` · GC ${gc.overall}%` : ""}</span>
        <span className="seq-spacer" />
        <label className="seq-check"><input type="checkbox" checked={showGC} onChange={() => setShowGC((v) => !v)} /> GC plot</label>
        <label className="seq-check"><input type="checkbox" checked={showSites} onChange={() => setShowSites((v) => !v)} /> Enzymes</label>
        <select value={frame} onChange={(e) => setFrame(Number(e.target.value))}>
          <option value={0}>Frame +1</option><option value={1}>Frame +2</option><option value={2}>Frame +3</option>
        </select>
        <button className="btn" onClick={doTranslate}>Translate</button>
        <button className="btn" onClick={doRevComp}>Rev-comp</button>
        <button className="btn" onClick={doPrimers}>Design Primers</button>
      </div>

      {primers && (
        <div className="primer-results">
          <table className="protocol-table">
            <thead><tr><th>Primer</th><th>Sequence (5'→3')</th><th>Len</th><th>Tm</th><th>GC%</th><th>Notes</th></tr></thead>
            <tbody>
              {primers.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td><td className="mono">{p.sequence}</td><td>{p.length}</td>
                  <td>{p.tm}°C</td><td>{p.gc}</td>
                  <td>{p.warnings?.length ? p.warnings.join("; ") : "✓"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showGC && gc && (
        <div className="seq-gc">
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={gc.positions.map((p, i) => ({ pos: p, gc: gc.gc[i] }))}>
              <XAxis dataKey="pos" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} width={28} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <ReferenceLine y={50} stroke="var(--border)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="gc" stroke="var(--accent)" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.features.length > 0 && (
        <div className="seq-feature-legend">
          {data.features.map((f, i) => (
            <span key={i} className="feature-chip" style={{ background: FEATURE_COLOR[f.type] || "var(--feat-misc)" }}>
              {f.label} ({f.start + 1}–{f.end})
            </span>
          ))}
        </div>
      )}

      {showSites && sites.length > 0 && (
        <div className="seq-sites">{sites.length} restriction sites: {[...new Set(sites.map((s) => s.enzyme))].join(", ")}</div>
      )}

      <div className="seq-rows">
        {rows.map((start) => (
          <div key={start} className="seq-row">
            <span className="seq-pos">{String(start + 1).padStart(6, " ")}</span>
            <span className="seq-bases">
              {seq.slice(start, start + ROW).split("").map((b, j) => {
                const idx = start + j;
                const feat = featureAt[idx];
                const hasSite = sitesByPos[idx];
                return (
                  <span
                    key={j}
                    className={`seq-base${hasSite ? " has-site" : ""}`}
                    style={{ color: feat ? "var(--on-accent)" : BASE_COLOR[b] || "var(--text)",
                             background: feat ? (FEATURE_COLOR[feat.type] || "var(--feat-misc)") : "transparent" }}
                    title={feat ? feat.label : hasSite ? hasSite.join(", ") : `pos ${idx + 1}`}
                  >
                    {b}
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </div>

      {orfs.length > 0 && (
        <div className="seq-orfs">ORFs: {orfs.length} (longest {Math.max(...orfs.map((o) => o.aa))} aa)</div>
      )}

      {translation && (
        <div className="seq-translation">
          <h4>Translation (frame +{frame + 1})</h4>
          <code className="prop-seq">{translation.protein}</code>
        </div>
      )}
    </div>
  );
}
