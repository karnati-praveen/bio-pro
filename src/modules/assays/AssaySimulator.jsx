import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, ReferenceLine, Legend, ResponsiveContainer,
} from "recharts";
import {
  assayFlow, assayPlate, assayQpcr, assayGel,
  createExperiment,
} from "../../shared/lib/api/client.js";
import { useTabStore } from "../../shared/stores/tabStore.js";
import { useUiStore } from "../../shared/stores/uiStore.js";

const TABS = [
  { id: "flow",  label: "Flow Cytometry" },
  { id: "plate", label: "Plate Reader"   },
  { id: "qpcr",  label: "qPCR"           },
  { id: "gel",   label: "Gel"            },
];

const LINE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

// --------------------------------------------------------------------------- //
// Flow cytometry panel
// --------------------------------------------------------------------------- //
function FlowPanel({ simulation }) {
  const [nCells, setNCells]   = useState(1000);
  const [gate, setGate]       = useState("");
  const [noiseCv, setNoiseCv] = useState(0.35);
  const [result, setResult]   = useState(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const toast = useUiStore((s) => s.addToast);
  const tabs  = useTabStore((s) => s.openTab);

  const run = async () => {
    if (!simulation) { setError("Compile a circuit first."); return; }
    setBusy(true); setError(null);
    try {
      const opts = { n_cells: nCells, noise_cv: noiseCv };
      if (gate !== "") opts.gate_threshold = parseFloat(gate);
      setResult(await assayFlow(simulation, opts));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const addToNotebook = async () => {
    if (!result) return;
    const now = new Date().toISOString().slice(0, 10);
    try {
      await createExperiment({
        title: `Flow cytometry prediction (${now})`,
        exp_type: "assay",
        date: now,
        columns: ["Assay", "Mean FL (a.u.)", "Gate", "%Positive", "n cells"],
        rows: [["Flow Cytometry", result.mean_fluorescence, result.gate_threshold,
                result.percent_positive, result.n_cells]],
        notes_md: "Predicted flow cytometry readout from AssaySimulator.",
      });
      tabs({ type: "notebook", title: "Experiment Notebook" });
      toast("Flow result added to notebook", "success");
    } catch (e) { toast(e.message, "error"); }
  };

  const chartData = result
    ? result.histogram.bins.map((b, i) => ({ fl: b.toFixed(2), count: result.histogram.counts[i] }))
    : [];

  return (
    <div className="assay-panel">
      <div className="assay-controls">
        <label>Cells<input type="number" value={nCells} min={10} max={100000}
          onChange={(e) => setNCells(+e.target.value)} /></label>
        <label>Noise CV<input type="number" step={0.05} value={noiseCv} min={0.05} max={2}
          onChange={(e) => setNoiseCv(+e.target.value)} /></label>
        <label>Gate (blank = auto)<input type="number" step={0.1} value={gate}
          onChange={(e) => setGate(e.target.value)} placeholder="auto" /></label>
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "Running…" : "Run"}
        </button>
        {result && (
          <button className="btn" onClick={addToNotebook}>Add to Notebook</button>
        )}
      </div>

      {error && <div className="assay-error">{error}</div>}

      {result && (
        <div className="assay-result">
          <div className="assay-metrics">
            <span className="assay-metric"><b>%Positive</b> {result.percent_positive}%</span>
            <span className="assay-metric"><b>Mean FL</b> {result.mean_fluorescence.toFixed(3)} a.u.</span>
            <span className="assay-metric"><b>Gate</b> {result.gate_threshold.toFixed(3)} a.u.</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ left: 10, right: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="fl" label={{ value: "Fluorescence (a.u.)", position: "insideBottom", offset: -10 }}
                tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis label={{ value: "Cells", angle: -90, position: "insideLeft", offset: 10 }} />
              <Tooltip formatter={(v) => [v, "Cells"]} labelFormatter={(l) => `FL ${l}`} />
              <Bar dataKey="count" fill="var(--series-1)" radius={[2, 2, 0, 0]} />
              <ReferenceLine x={result.gate_threshold.toFixed(2)} stroke="var(--error)"
                strokeDasharray="5 4" label={{ value: "Gate", position: "top", fill: "var(--error)", fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Plate reader panel
// --------------------------------------------------------------------------- //
function PlatePanel({ simulation }) {
  const [nCond, setNCond]   = useState(12);
  const [result, setResult] = useState(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);
  const [view, setView]     = useState("dose");
  const toast = useUiStore((s) => s.addToast);
  const tabs  = useTabStore((s) => s.openTab);

  const run = async () => {
    if (!simulation) { setError("Compile a circuit first."); return; }
    setBusy(true); setError(null);
    try {
      setResult(await assayPlate(simulation, { n_conditions: nCond }));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const addToNotebook = async () => {
    if (!result) return;
    const now = new Date().toISOString().slice(0, 10);
    try {
      await createExperiment({
        title: `Plate reader prediction (${now})`,
        exp_type: "assay",
        date: now,
        columns: ["Inducer Conc.", "Final Fluorescence"],
        rows: result.dose_response.map((w) => [w.condition, w.final_fluorescence]),
        notes_md: "Predicted plate reader dose-response from AssaySimulator.",
      });
      tabs({ type: "notebook", title: "Experiment Notebook" });
      toast("Plate result added to notebook", "success");
    } catch (e) { toast(e.message, "error"); }
  };

  const doseData = result
    ? result.dose_response.map((w) => ({ conc: w.condition.toFixed(2), fl: w.final_fluorescence }))
    : [];

  // Show 6 representative time-course lines
  const tcWells = result
    ? result.wells.filter((_, i) => i % Math.max(1, Math.floor(result.wells.length / 6)) === 0)
    : [];
  const tcData = result
    ? result.t.map((t, ti) => {
        const row = { t: t.toFixed(0) };
        tcWells.forEach((w) => { row[`${w.condition.toFixed(1)}`] = w.fluorescence[ti]; });
        return row;
      })
    : [];

  return (
    <div className="assay-panel">
      <div className="assay-controls">
        <label>Conditions<input type="number" value={nCond} min={2} max={96}
          onChange={(e) => setNCond(+e.target.value)} /></label>
        <div className="assay-view-switch">
          <button className={`btn micro ${view === "dose" ? "active" : ""}`} onClick={() => setView("dose")}>
            Dose–response
          </button>
          <button className={`btn micro ${view === "tc" ? "active" : ""}`} onClick={() => setView("tc")}>
            Time courses
          </button>
        </div>
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "Running…" : "Run"}
        </button>
        {result && (
          <button className="btn" onClick={addToNotebook}>Add to Notebook</button>
        )}
      </div>

      {error && <div className="assay-error">{error}</div>}

      {result && view === "dose" && (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={doseData} margin={{ left: 10, right: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="conc" label={{ value: "Inducer conc.", position: "insideBottom", offset: -10 }} />
            <YAxis label={{ value: "Fluorescence (a.u.)", angle: -90, position: "insideLeft", offset: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="fl" stroke="var(--series-2)" dot={false} strokeWidth={2} name="FL" />
          </LineChart>
        </ResponsiveContainer>
      )}

      {result && view === "tc" && (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={tcData} margin={{ left: 10, right: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" label={{ value: "Time (min)", position: "insideBottom", offset: -10 }} />
            <YAxis label={{ value: "Fluorescence (a.u.)", angle: -90, position: "insideLeft", offset: 10 }} />
            <Tooltip />
            <Legend />
            {tcWells.map((w, i) => (
              <Line key={w.condition} type="monotone" dataKey={`${w.condition.toFixed(1)}`}
                stroke={LINE_COLORS[i % LINE_COLORS.length]} dot={false} strokeWidth={1.5}
                name={`${w.condition.toFixed(1)} a.u.`} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// qPCR panel
// --------------------------------------------------------------------------- //
const DEFAULT_COPIES = [1e6, 1e5, 1e4, 1e3, 1e2];

function QpcrPanel() {
  const [copiesText, setCopiesText] = useState(DEFAULT_COPIES.join(", "));
  const [result, setResult]         = useState(null);
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState(null);
  const toast = useUiStore((s) => s.addToast);
  const tabs  = useTabStore((s) => s.openTab);

  const run = async () => {
    const estimates = copiesText.split(",").map((s) => parseFloat(s.trim())).filter(isFinite);
    if (!estimates.length) { setError("Enter at least one copy number."); return; }
    setBusy(true); setError(null);
    try {
      setResult(await assayQpcr(estimates));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const addToNotebook = async () => {
    if (!result) return;
    const now = new Date().toISOString().slice(0, 10);
    try {
      await createExperiment({
        title: `qPCR prediction (${now})`,
        exp_type: "assay",
        date: now,
        columns: ["Starting Copies", "Ct"],
        rows: result.curves.map((c) => [c.label, c.ct]),
        notes_md: "Predicted qPCR Ct values from AssaySimulator.",
      });
      tabs({ type: "notebook", title: "Experiment Notebook" });
      toast("qPCR result added to notebook", "success");
    } catch (e) { toast(e.message, "error"); }
  };

  const chartData = result
    ? result.cycles.map((c, ci) => {
        const row = { cycle: c };
        result.curves.forEach((curve) => { row[curve.label] = curve.fluorescence[ci]; });
        return row;
      })
    : [];

  return (
    <div className="assay-panel">
      <div className="assay-controls">
        <label style={{ flex: 1 }}>
          Starting copies (comma-separated)
          <input value={copiesText} onChange={(e) => setCopiesText(e.target.value)}
            style={{ width: "100%" }} />
        </label>
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "Running…" : "Run"}
        </button>
        {result && (
          <button className="btn" onClick={addToNotebook}>Add to Notebook</button>
        )}
      </div>

      {error && <div className="assay-error">{error}</div>}

      {result && (
        <div className="assay-result">
          <div className="assay-metrics">
            {result.curves.map((c) => (
              <span key={c.label} className="assay-metric">
                <b>{c.label}</b> Ct&nbsp;{c.ct}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ left: 10, right: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="cycle" label={{ value: "Cycle", position: "insideBottom", offset: -10 }} />
              <YAxis label={{ value: "Fluorescence (RFU)", angle: -90, position: "insideLeft", offset: 10 }} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={result.threshold} stroke="var(--error)" strokeDasharray="5 4"
                label={{ value: "Threshold", position: "right", fill: "var(--error)", fontSize: 11 }} />
              {result.curves.map((c, i) => (
                <Line key={c.label} type="monotone" dataKey={c.label}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]} dot={false} strokeWidth={1.5} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Gel panel
// --------------------------------------------------------------------------- //
const DEFAULT_FRAGS = "Insert, 1200\nVector backbone, 3500\nPCR product, 450";
const GEL_H = 420;
const GEL_LANE_W = 60;
const GEL_PAD_TOP = 30;
const GEL_PAD_BOTTOM = 20;

function gelY(position) {
  // position: 0–100 scale → y in SVG pixels
  return GEL_PAD_TOP + (position / 100) * (GEL_H - GEL_PAD_TOP - GEL_PAD_BOTTOM);
}

function GelPanel() {
  const [fragsText, setFragsText] = useState(DEFAULT_FRAGS);
  const [result, setResult]       = useState(null);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState(null);
  const toast = useUiStore((s) => s.addToast);
  const tabs  = useTabStore((s) => s.openTab);

  const run = async () => {
    const frags = fragsText.split("\n")
      .map((line) => {
        const parts = line.split(",").map((s) => s.trim());
        return parts.length >= 2 ? { name: parts[0], length: parseInt(parts[1], 10) } : null;
      })
      .filter((f) => f && !isNaN(f.length) && f.length > 0);
    if (!frags.length) { setError("Enter fragments as: Name, length_bp (one per line)"); return; }
    setBusy(true); setError(null);
    try {
      setResult(await assayGel(frags));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const addToNotebook = async () => {
    if (!result) return;
    const now = new Date().toISOString().slice(0, 10);
    try {
      await createExperiment({
        title: `Gel prediction (${now})`,
        exp_type: "assay",
        date: now,
        columns: ["Fragment", "Size (bp)", "Migration (%)"],
        rows: result.bands.map((b) => [b.name, b.length, b.position]),
        notes_md: "Predicted agarose gel band positions from AssaySimulator.",
      });
      tabs({ type: "notebook", title: "Experiment Notebook" });
      toast("Gel result added to notebook", "success");
    } catch (e) { toast(e.message, "error"); }
  };

  const nSampleLanes  = result?.bands.length ?? 0;
  const ladderX       = 30;
  const sampleStartX  = ladderX + GEL_LANE_W + 30;
  const svgW          = sampleStartX + nSampleLanes * (GEL_LANE_W + 20) + 80;

  return (
    <div className="assay-panel">
      <div className="assay-controls">
        <label style={{ flex: 1 }}>
          Fragments (Name, bp — one per line)
          <textarea rows={4} value={fragsText} onChange={(e) => setFragsText(e.target.value)}
            style={{ width: "100%", resize: "vertical" }} />
        </label>
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "Running…" : "Run"}
        </button>
        {result && (
          <button className="btn" onClick={addToNotebook}>Add to Notebook</button>
        )}
      </div>

      {error && <div className="assay-error">{error}</div>}

      {result && (
        <div style={{ overflowX: "auto" }}>
          <svg width={svgW} height={GEL_H} style={{ fontFamily: "var(--font-mono, monospace)" }}>
            {/* Gel background */}
            <rect x={0} y={0} width={svgW} height={GEL_H}
              fill="var(--surface-2)" rx={6} />

            {/* Top border (wells side) */}
            <rect x={10} y={GEL_PAD_TOP - 4} width={svgW - 20} height={4}
              fill="var(--border)" rx={2} />

            {/* Ladder lane */}
            <text x={ladderX + GEL_LANE_W / 2} y={GEL_PAD_TOP - 10}
              textAnchor="middle" fontSize={10} fill="var(--text-muted)">Ladder</text>
            {result.ladder.map((band) => (
              <g key={band.size}>
                <rect x={ladderX} y={gelY(band.position) - 2}
                  width={GEL_LANE_W} height={4} fill="var(--text-muted)" rx={1} opacity={0.85} />
                <text x={ladderX + GEL_LANE_W + 4} y={gelY(band.position) + 3}
                  fontSize={9} fill="var(--text-muted)">{band.size} bp</text>
              </g>
            ))}

            {/* Sample lanes */}
            {result.bands.map((band, i) => {
              const lx = sampleStartX + i * (GEL_LANE_W + 20);
              return (
                <g key={band.name}>
                  <text x={lx + GEL_LANE_W / 2} y={GEL_PAD_TOP - 10}
                    textAnchor="middle" fontSize={10} fill="var(--text-muted)"
                    style={{ maxWidth: GEL_LANE_W }}>
                    {band.name.length > 8 ? band.name.slice(0, 7) + "…" : band.name}
                  </text>
                  <rect x={lx} y={gelY(band.position) - 3}
                    width={GEL_LANE_W} height={6} fill="var(--series-1)" rx={2} opacity={0.9} />
                  <text x={lx + GEL_LANE_W / 2} y={gelY(band.position) + 16}
                    textAnchor="middle" fontSize={9} fill="var(--series-1)">{band.length} bp</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Root component
// --------------------------------------------------------------------------- //
export default function AssaySimulator({ tab }) {
  const result     = tab?.meta?.result;
  const simulation = result?.simulation ?? null;

  const [activeTab, setActiveTab] = useState("flow");

  return (
    <div className="assay-simulator">
      <div className="assay-header">
        <span className="assay-title">Assay Simulator</span>
        {result && (
          <span className="assay-circuit-label">
            Circuit: <b>{result.spec?.output ?? "—"}</b>
          </span>
        )}
      </div>

      <div className="assay-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`assay-tab-btn${activeTab === t.id ? " active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="assay-body">
        {activeTab === "flow"  && <FlowPanel  simulation={simulation} />}
        {activeTab === "plate" && <PlatePanel simulation={simulation} />}
        {activeTab === "qpcr"  && <QpcrPanel />}
        {activeTab === "gel"   && <GelPanel />}
      </div>
    </div>
  );
}
