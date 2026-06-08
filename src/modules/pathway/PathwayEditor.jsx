import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import {
  runFba, listPathwayTemplates, getPathwayTemplate,
} from "../../shared/lib/api/client.js";

// Module 12 — Pathway Designer + simplified FBA. Loads a metabolic template, renders
// it as a metabolite/reaction graph, runs Flux Balance Analysis, and overlays the
// flux distribution as edge thickness with bottleneck reactions highlighted red.
export default function PathwayEditor() {
  const [templates, setTemplates] = useState([]);
  const [model, setModel] = useState(null);   // { metabolites, reactions, objective }
  const [fba, setFba] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listPathwayTemplates().then((r) => {
      setTemplates(r.templates);
      if (r.templates[0]) loadTemplate(r.templates[0].id);
    }).catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTemplate = async (id) => {
    const tpl = await getPathwayTemplate(id);
    setModel({ metabolites: tpl.metabolites, reactions: tpl.reactions, objective: tpl.objective });
    setFba(null);
  };

  const run = useCallback(async () => {
    if (!model) return;
    setError(null);
    try {
      setFba(await runFba(model.metabolites, model.reactions, model.objective));
    } catch (e) { setError(e.message); }
  }, [model]);

  const setBound = (rid, field, value) =>
    setModel((m) => ({
      ...m,
      reactions: m.reactions.map((r) => r.id === rid ? { ...r, [field]: Number(value) } : r),
    }));

  const { nodes, edges } = useMemo(() => buildGraph(model, fba), [model, fba]);

  if (error && !model) return <div className="pathway-editor"><div className="dsl-error">{error}</div></div>;
  if (!model) return <div className="panel-empty">Loading pathway…</div>;

  return (
    <div className="pathway-editor">
      <div className="pathway-toolbar">
        <select onChange={(e) => loadTemplate(e.target.value)}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label className="pathway-obj">Objective
          <select value={model.objective} onChange={(e) => setModel({ ...model, objective: e.target.value })}>
            {model.reactions.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={run}>Run FBA ▶</button>
        {fba?.status === "optimal" && (
          <span className="pathway-result">
            max {fba.objective} = <b>{fba.objective_value}</b>
            {fba.bottlenecks.length > 0 && <span className="pathway-bottleneck"> · bottleneck: {fba.bottlenecks.join(", ")}</span>}
          </span>
        )}
        {error && <span className="dsl-error" style={{ padding: "2px 8px" }}>{error}</span>}
      </div>

      <div className="pathway-body">
        <div className="pathway-canvas">
          <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesDraggable>
            <Background gap={18} color="#e8eef2" />
            <Controls showInteractive={false} />
            <MiniMap />
          </ReactFlow>
        </div>

        <div className="pathway-bounds">
          <div className="sim-section-title">Reaction bounds</div>
          <table className="pathway-table">
            <thead><tr><th>Reaction</th><th>lb</th><th>ub</th><th>flux</th></tr></thead>
            <tbody>
              {model.reactions.map((r) => {
                const flux = fba?.fluxes?.[r.id];
                const bottleneck = fba?.bottlenecks?.includes(r.id);
                return (
                  <tr key={r.id} className={bottleneck ? "critical" : ""}>
                    <td title={r.enzyme}>{r.id}</td>
                    <td><input type="number" value={r.lb ?? 0} onChange={(e) => setBound(r.id, "lb", e.target.value)} /></td>
                    <td><input type="number" value={r.ub ?? 1000} onChange={(e) => setBound(r.id, "ub", e.target.value)} /></td>
                    <td>{flux != null ? flux : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Build a metabolite/reaction graph from the model, with flux-weighted edges.
function buildGraph(model, fba) {
  if (!model) return { nodes: [], edges: [] };
  const nodes = [];
  const metY = {};
  model.metabolites.forEach((m, i) => {
    metY[m] = i;
    nodes.push({
      id: `m:${m}`, data: { label: m }, position: { x: 0, y: i * 70 },
      style: { background: "#e8f5f3", border: "1px solid #2a9d8f", borderRadius: 16, fontSize: 11, padding: 4, width: 110 },
    });
  });
  model.reactions.forEach((r, i) => {
    nodes.push({
      id: `r:${r.id}`, data: { label: r.id }, position: { x: 320, y: i * 60 },
      style: { background: "#fff", border: "1px solid #457b9d", borderRadius: 4, fontSize: 11, padding: 4, width: 120 },
    });
  });

  const edges = [];
  const maxFlux = fba ? Math.max(1, ...Object.values(fba.fluxes).map(Math.abs)) : 1;
  model.reactions.forEach((r) => {
    const flux = fba?.fluxes?.[r.id] ?? 0;
    const bottleneck = fba?.bottlenecks?.includes(r.id);
    const w = fba ? 1 + (Math.abs(flux) / maxFlux) * 6 : 1.5;
    const color = bottleneck ? "#e63946" : flux > 0 ? "#2a9d8f" : "#adb5bd";
    Object.entries(r.stoich || {}).forEach(([met, coeff]) => {
      const consumed = coeff < 0;
      edges.push({
        id: `${r.id}:${met}`,
        source: consumed ? `m:${met}` : `r:${r.id}`,
        target: consumed ? `r:${r.id}` : `m:${met}`,
        style: { stroke: color, strokeWidth: w },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      });
    });
  });
  return { nodes, edges };
}
