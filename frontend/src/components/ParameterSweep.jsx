// Feature 5: Parameter sweep panel with color-gradient overlay chart.

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { parameterSweep } from "../api/client.js";

const PARAM_OPTIONS = [
  { value: "beta_p", label: "β_P — max reporter production rate" },
  { value: "gamma_p", label: "γ_P — reporter degradation rate" },
  { value: "k", label: "K — Hill half-max constant" },
  { value: "n", label: "n — Hill cooperativity" },
  { value: "i_max", label: "I_max — inducer level" },
];

const PARAM_DEFAULTS = {
  beta_p: { min: 1, max: 20, steps: 8 },
  gamma_p: { min: 0.01, max: 0.3, steps: 8 },
  k: { min: 1, max: 50, steps: 8 },
  n: { min: 1, max: 4, steps: 7 },
  i_max: { min: 1, max: 15, steps: 8 },
};

// Interpolate from blue (low) to red (high) across n steps
function gradientColor(idx, total) {
  const t = total <= 1 ? 0 : idx / (total - 1);
  const r = Math.round(30 + t * 200);
  const g = Math.round(80 - t * 60);
  const b = Math.round(220 - t * 200);
  return `rgb(${r},${g},${b})`;
}

export default function ParameterSweep({ result }) {
  const [param, setParam] = useState("k");
  const [minVal, setMinVal] = useState(PARAM_DEFAULTS.k.min);
  const [maxVal, setMaxVal] = useState(PARAM_DEFAULTS.k.max);
  const [steps, setSteps] = useState(PARAM_DEFAULTS.k.steps);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sweepData, setSweepData] = useState(null);

  if (!result) return null;

  const handleParamChange = p => {
    setParam(p);
    const d = PARAM_DEFAULTS[p];
    if (d) { setMinVal(d.min); setMaxVal(d.max); setSteps(d.steps); }
    setSweepData(null);
  };

  const runSweep = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await parameterSweep(result, param, Number(minVal), Number(maxVal), Number(steps));
      setSweepData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Build recharts data from sweep curves
  let chartData = [];
  if (sweepData?.curves?.length) {
    chartData = sweepData.t.map((t, i) => {
      const row = { t: Number(t.toFixed(1)) };
      sweepData.curves.forEach((c, ci) => {
        row[`v${ci}`] = c.values[i];
      });
      return row;
    });
  }

  return (
    <div className="card sweep-panel">
      <h2>Parameter sweep</h2>

      <div className="sweep-controls">
        <label>
          Parameter
          <select value={param} onChange={e => handleParamChange(e.target.value)}>
            {PARAM_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label>
          Min
          <input type="number" min="0" step="any" value={minVal}
            onChange={e => setMinVal(e.target.value)} style={{ width: 70 }} />
        </label>
        <label>
          Max
          <input type="number" min="0" step="any" value={maxVal}
            onChange={e => setMaxVal(e.target.value)} style={{ width: 70 }} />
        </label>
        <label>
          Steps
          <input type="number" min="2" max="50" value={steps}
            onChange={e => setSteps(e.target.value)} style={{ width: 60 }} />
        </label>
        <button className="compile-btn small" onClick={runSweep} disabled={loading}>
          {loading ? "Sweeping…" : "Run sweep ▶"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {sweepData && (
        <>
          <div className="plot-wrap" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f4" />
                <XAxis
                  dataKey="t"
                  label={{ value: "time (a.u.)", position: "insideBottom", offset: -10 }}
                  tick={{ fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) => {
                    const idx = parseInt(name.slice(1));
                    const c = sweepData.curves[idx];
                    return [value?.toFixed(2), `${param}=${c?.param_value?.toFixed(3)}`];
                  }}
                />
                {sweepData.curves.map((c, ci) => (
                  <Line
                    key={`v${ci}`}
                    type="monotone"
                    dataKey={`v${ci}`}
                    stroke={gradientColor(ci, sweepData.curves.length)}
                    strokeWidth={1.5}
                    dot={false}
                    name={`v${ci}`}
                    legendType="none"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Gradient legend */}
          <div className="sweep-legend">
            <span style={{ color: gradientColor(0, sweepData.curves.length) }}>
              ■ {param} = {sweepData.curves[0]?.param_value?.toFixed(3)} (low)
            </span>
            <span className="muted"> → </span>
            <span style={{ color: gradientColor(sweepData.curves.length - 1, sweepData.curves.length) }}>
              ■ {param} = {sweepData.curves[sweepData.curves.length - 1]?.param_value?.toFixed(3)} (high)
            </span>
          </div>

          {/* Sensitivity scores */}
          <div className="sweep-sensitivity">
            <div>
              <strong>Sensitivity score</strong> for {param}:{" "}
              <span className="badge">
                {(sweepData.sensitivity_score * 100).toFixed(1)}%
              </span>
              <span className="muted"> (% change peak output / % change parameter)</span>
            </div>

            {sweepData.top_sensitive?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <strong>Top 3 most sensitive parameters:</strong>
                <ol className="sensitivity-ranking">
                  {sweepData.top_sensitive.map((item, i) => (
                    <li key={i}>
                      <code>{item.parameter}</code>{" "}
                      <span className="badge">{(item.sensitivity * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
