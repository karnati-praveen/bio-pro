import { useEffect, useState } from "react";
import { generateProtocol } from "../../shared/lib/api/client.js";
import CloningMap from "./CloningMap.jsx";

const METHODS = [
  { id: "gibson", label: "Gibson Assembly" },
  { id: "golden_gate", label: "Golden Gate" },
  { id: "biobrick", label: "BioBrick (RFC[10])" },
];

const TABS = [
  { id: "protocol", label: "Protocol" },
  { id: "map", label: "Cloning Map" },
];

// Module 7 — Protocol Generator + Module 8 — Cloning Map.
export default function ProtocolEditor({ tab }) {
  const result = tab.meta?.result;
  const [method, setMethod] = useState("gibson");
  const [proto, setProto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("protocol");

  const run = async (m = method) => {
    if (!result) return;
    setLoading(true); setError(null);
    try {
      setProto(await generateProtocol(result, m));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { run(); /* initial */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!result) {
    return (
      <div className="placeholder-editor">
        <div className="placeholder-icon">📋</div>
        <h2>Protocol Generator</h2>
        <p className="placeholder-phase">Open this from a compiled circuit (Generate Protocol).</p>
      </div>
    );
  }

  const exportText = () => {
    if (!proto) return;
    const lines = [
      `# ${proto.method.toUpperCase()} Assembly Protocol`, "",
      `Estimated time: ${fmtTime(proto.est_time_min)} · Estimated cost: $${proto.est_cost_usd}`, "",
      "## Steps", ...proto.steps, "",
      "## Materials", ...proto.materials.map((m) => `- ${m.item} (${m.catalog}) — $${m.unit_cost}`),
    ];
    if (proto.primers?.length) lines.push("", "## Primers",
      ...proto.primers.map((p) => `${p.name}\t${p.sequence}\tTm ${p.tm}°C`));
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `protocol_${proto.method}.txt`; a.click();
  };

  return (
    <div className="protocol-editor">
      <div className="protocol-toolbar">
        <select value={method} onChange={(e) => { setMethod(e.target.value); run(e.target.value); }}>
          {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button className="btn" onClick={() => run()} disabled={loading}>{loading ? "…" : "Regenerate"}</button>
        {proto && <button className="btn" onClick={exportText}>Export .txt</button>}
        {proto && (
          <span className="protocol-estimates">
            ⏱ {fmtTime(proto.est_time_min)} · 💲 ${proto.est_cost_usd}
          </span>
        )}
      </div>

      {/* Sub-tabs: Protocol | Cloning Map */}
      <div className="protocol-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`protocol-tab ${activeTab === t.id ? "protocol-tab-active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="dsl-error">{error}</div>}

      {activeTab === "map" && (
        <CloningMap result={result} method={method} />
      )}

      {activeTab === "protocol" && proto && (
        <div className="protocol-body">
          <section>
            <h3>Protocol — {proto.method}</h3>
            <ol className="protocol-steps">{proto.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </section>

          {proto.primers?.length > 0 && (
            <section>
              <h4>Designed primers</h4>
              <table className="protocol-table">
                <thead><tr><th>Name</th><th>Sequence (5'→3')</th><th>Len</th><th>Tm</th><th>GC%</th></tr></thead>
                <tbody>
                  {proto.primers.map((p, i) => (
                    <tr key={i}><td>{p.name}</td><td className="mono">{p.sequence}</td><td>{p.length}</td><td>{p.tm}°C</td><td>{p.gc}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section>
            <h4>Materials</h4>
            <table className="protocol-table">
              <thead><tr><th>Item</th><th>NEB catalog</th><th>Unit cost</th></tr></thead>
              <tbody>
                {proto.materials.map((m, i) => (
                  <tr key={i}><td>{m.item}</td><td className="mono">{m.catalog}</td><td>${m.unit_cost}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          {proto.notes?.length > 0 && (
            <section>
              <h4>Notes</h4>
              <ul className="protocol-notes">{proto.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function fmtTime(min) {
  if (!min) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
