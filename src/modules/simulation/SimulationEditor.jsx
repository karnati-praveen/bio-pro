import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { simulateOde, sensitivity as apiSensitivity, stochasticSimulate } from "../../shared/lib/api/client.js";
import { useSimulationStore } from "../../shared/stores/simulationStore.js";
import SimulationPlot, { StochasticChart } from "./SimulationPlot.jsx";
import ParameterSweep from "./ParameterSweep.jsx";

const MODES = [
  { id: "ode", label: "Deterministic ODE" },
  { id: "stochastic", label: "Stochastic (Gillespie)" },
  { id: "sweep", label: "Parameter Sweep" },
  { id: "sensitivity", label: "Sensitivity Analysis" },
];
const PARAM_FIELDS = [
  { key: "beta_p", label: "β_P (max production)" },
  { key: "gamma_p", label: "γ_P (degradation)" },
  { key: "k", label: "K (Hill half-max)" },
  { key: "n", label: "n (cooperativity)" },
  { key: "i_max", label: "I_max (inducer level)" },
];

// Results-panel metrics derived from the reporter series.
function reporterMetrics(simulation) {
  if (!simulation) return null;
  const rep = simulation.series.find((s) => s.is_reporter) || simulation.series[0];
  if (!rep) return null;
  const peak = Math.max(...rep.values);
  const steady = rep.values[rep.values.length - 1];
  const riseIdx = rep.values.findIndex((v) => v >= 0.9 * peak);
  const riseTime = riseIdx >= 0 ? simulation.t[riseIdx] : null;
  return { name: rep.name, peak, steady, riseTime };
}

// Module 4 — Simulation Workbench. Four modes over a compiled circuit passed in
// via tab.meta.result. Left: parameters; centre: chart; right: results metrics.
export default function SimulationEditor({ tab }) {
  const result = tab.meta?.result;
  const record = useSimulationStore((s) => s.record);
  const history = useSimulationStore((s) => s.history);
  const fetchHistory = useSimulationStore((s) => s.fetchHistory);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const [mode, setMode] = useState("ode");
  const [params, setParams] = useState({ beta_p: "", gamma_p: "", k: "", n: "", i_max: "" });
  const [duration, setDuration] = useState(200);
  const [stochThreshold, setStochThreshold] = useState("");
  const [sim, setSim] = useState(result?.simulation || null);
  const [stoch, setStoch] = useState(null);
  const [stochLoading, setStochLoading] = useState(false);
  const [sens, setSens] = useState(null);
  const [busy, setBusy] = useState(false);

  const organism = result?.organism || result?.spec?.organism || "ecoli";
  const species = result?.simulation?.series?.map((s) => s.name) || [];

  const buildParams = () => {
    const p = {};
    for (const { key } of PARAM_FIELDS) {
      const v = params[key];
      if (v !== "" && !Number.isNaN(Number(v))) p[key] = Number(v);
    }
    if (duration) p.duration = Number(duration);
    return Object.keys(p).length ? p : { duration: Number(duration) };
  };

  const runOde = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const s = await simulateOde(result, buildParams());
      setSim(s);
      const m = reporterMetrics(s);
      record({ label: `${result.spec?.pattern || "circuit"} · ODE`, mode: "ode", organism,
        params: buildParams(), summary: m ? { peak: m.peak, steady: m.steady } : {} });
    } finally { setBusy(false); }
  };

  const runStoch = async (threshold) => {
    if (!result) return;
    setStochLoading(true);
    try {
      const data = await stochasticSimulate(result, 50, threshold);
      setStoch(data);
      record({ label: `${result.spec?.pattern || "circuit"} · stochastic`, mode: "stochastic",
        organism, params: { n_trajectories: 50 }, summary: { noise_index: data.noise_index } });
    } finally { setStochLoading(false); }
  };

  const runSensitivity = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const data = await apiSensitivity(result);
      setSens(data);
      record({ label: `${result.spec?.pattern || "circuit"} · sensitivity`, mode: "sensitivity",
        organism, params: {}, summary: { top: data.rows[0]?.parameter, impact: data.rows[0]?.impact_pct } });
    } finally { setBusy(false); }
  };

  // Auto-run when switching mode (except sweep which has its own controls).
  useEffect(() => {
    if (mode === "ode" && !sim) runOde();
    if (mode === "sensitivity" && !sens) runSensitivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const metrics = useMemo(() => reporterMetrics(sim), [sim]);

  if (!result) {
    return (
      <div className="placeholder-editor">
        <div className="placeholder-icon">📊</div>
        <h2>Simulation Workbench</h2>
        <p className="placeholder-phase">Open this from a compiled circuit (Open in Workbench).</p>
      </div>
    );
  }

  return (
    <div className="sim-workbench">
      {/* Left: parameters */}
      <div className="sim-params">
        <div className="sim-section-title">Mode</div>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>

        <div className="sim-section-title">Duration: {duration} min</div>
        <input type="range" min="20" max="1000" step="10" value={duration}
          onChange={(e) => setDuration(Number(e.target.value))} />

        <div className="sim-section-title">Parameter overrides</div>
        {PARAM_FIELDS.map(({ key, label }) => (
          <label key={key} className="sim-param-row">
            <span>{label}</span>
            <input type="number" min="0" step="0.1" placeholder="default"
              value={params[key]} onChange={(e) => setParams({ ...params, [key]: e.target.value })} />
          </label>
        ))}

        <div className="sim-section-title">Species ({species.length})</div>
        <ul className="sim-species">{species.map((s) => <li key={s}>{s}</li>)}</ul>

        <div className="sim-meta">host: {organism}</div>
        {mode === "ode" && <button className="btn primary" disabled={busy} onClick={runOde}>{busy ? "Running…" : "Run ODE ▶"}</button>}
        {mode === "sensitivity" && <button className="btn primary" disabled={busy} onClick={runSensitivity}>{busy ? "Running…" : "Run analysis ▶"}</button>}
        {mode === "stochastic" && (
          <>
            <label className="sim-param-row">
              <span>Threshold (optional)</span>
              <input type="number" min="0" step="1" placeholder="none"
                value={stochThreshold} onChange={(e) => setStochThreshold(e.target.value)} />
            </label>
            <button className="btn primary" disabled={stochLoading}
              onClick={() => {
                const t = stochThreshold !== "" && !isNaN(Number(stochThreshold)) ? Number(stochThreshold) : null;
                runStoch(t);
              }}>
              {stochLoading ? "Running…" : "Run (N=50) ▶"}
            </button>
          </>
        )}
      </div>

      {/* Centre: chart */}
      <div className="sim-canvas">
        {mode === "ode" && (sim ? (
          <div className="plot-wrap"><SimulationPlot simulation={sim} /></div>
        ) : <div className="panel-empty">Run the ODE to see results.</div>)}

        {mode === "stochastic" && (
          <div className="plot-wrap">
            {stochLoading
              ? <div className="panel-empty">Running stochastic simulation…</div>
              : stoch
              ? <StochasticChart stochastic={stoch}
                  threshold={stochThreshold !== "" && !isNaN(Number(stochThreshold)) ? Number(stochThreshold) : null} />
              : <div className="panel-empty">Click "Run (N=50) ▶" in the left panel to run the stochastic simulation.</div>
            }
          </div>
        )}

        {mode === "sweep" && <ParameterSweep result={result} />}

        {mode === "sensitivity" && (sens ? (
          <div className="sens-view">
            <h3>Tornado — peak-output sensitivity (±50% perturbation)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart layout="vertical" data={sens.rows} margin={{ left: 20, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} label={{ value: "% output change", position: "insideBottom", offset: -4 }} />
                <YAxis type="category" dataKey="parameter" width={70} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `${v}%`} />
                <ReferenceLine x={20} stroke="#e63946" strokeDasharray="4 3" />
                <Bar dataKey="impact_pct">
                  {sens.rows.map((r, i) => <Cell key={i} fill={r.critical ? "#e63946" : "#2a9d8f"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <table className="sens-table">
              <thead><tr><th>Parameter</th><th>Base</th><th>Low peak</th><th>High peak</th><th>Impact</th></tr></thead>
              <tbody>
                {sens.rows.map((r) => (
                  <tr key={r.parameter} className={r.critical ? "critical" : ""}>
                    <td>{r.parameter}</td><td>{r.base_value}</td><td>{r.low_peak}</td><td>{r.high_peak}</td>
                    <td>{r.impact_pct}%{r.critical ? " ⚠" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="panel-empty">Running sensitivity analysis…</div>)}
      </div>

      {/* Right: results */}
      <div className="sim-results">
        <div className="sim-section-title">Results</div>
        {mode === "stochastic" && stoch ? (
          <dl className="prop-list">
            <dt>Noise index (CV)</dt><dd>{stoch.noise_index?.toFixed(3)}</dd>
            <dt>Trajectories</dt><dd>{stoch.n_trajectories}</dd>
          </dl>
        ) : metrics ? (
          <dl className="prop-list">
            <dt>Reporter</dt><dd>{metrics.name}</dd>
            <dt>Peak</dt><dd>{metrics.peak.toFixed(2)}</dd>
            <dt>Steady-state</dt><dd>{metrics.steady.toFixed(2)}</dd>
            <dt>Rise time</dt><dd>{metrics.riseTime != null ? `${metrics.riseTime} min` : "—"}</dd>
          </dl>
        ) : <div className="hint">No metrics yet.</div>}
        {mode === "sensitivity" && sens && (
          <div className="sim-meta">Most sensitive: <b>{sens.rows[0]?.parameter}</b> ({sens.rows[0]?.impact_pct}%)</div>
        )}

        <div className="sim-section-title">History ({history.length})</div>
        <ul className="sim-history">
          {history.slice(0, 12).map((run) => (
            <li key={run.id} title={new Date(run.created_at).toLocaleString()}>
              <span className={`hist-mode hist-${run.mode}`}>{run.mode}</span>
              <span className="hist-label">{run.label || run.organism}</span>
            </li>
          ))}
          {history.length === 0 && <li className="hint">No runs yet.</li>}
        </ul>
      </div>
    </div>
  );
}
