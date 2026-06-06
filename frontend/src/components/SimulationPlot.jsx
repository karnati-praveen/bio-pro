import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const FALLBACK_COLORS = ["#52b788", "#ffb703", "#cdb4db", "#e63946"];

// Deterministic simulation chart
function DeterministicChart({ simulation }) {
  const data = simulation.t.map((t, i) => {
    const row = { t: Number(t.toFixed(1)) };
    simulation.series.forEach(s => { row[s.name] = s.values[i]; });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f4" />
        <XAxis
          dataKey="t"
          label={{ value: "time (a.u.)", position: "insideBottom", offset: -10 }}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          label={{
            value: "concentration (a.u.)",
            angle: -90,
            position: "insideLeft",
            style: { textAnchor: "middle" },
          }}
          tick={{ fontSize: 11 }}
        />
        <Tooltip />
        <Legend />
        {simulation.series.map((s, i) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={s.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
            strokeWidth={s.is_reporter ? 3 : 1.5}
            strokeDasharray={s.name.includes("input") ? "5 4" : undefined}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// Stochastic simulation chart with shaded percentile band
function StochasticChart({ stochastic, threshold }) {
  if (!stochastic) return <div className="panel-empty">Run stochastic simulation to see results.</div>;

  const reporter = stochastic.series.find(s => s.is_reporter) || stochastic.series[0];
  if (!reporter) return null;

  const color = reporter.color || "#52b788";

  // Build data rows with mean, p10, p90
  const data = stochastic.t.map((t, i) => ({
    t: Number(t.toFixed(1)),
    mean: reporter.mean[i],
    p10: reporter.p10[i],
    p90: reporter.p90[i],
    band: [reporter.p10[i], reporter.p90[i]],
  }));

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f4" />
          <XAxis
            dataKey="t"
            label={{ value: "time (a.u.)", position: "insideBottom", offset: -10 }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            label={{
              value: "molecules (a.u.)",
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle" },
            }}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(value, name) => [value?.toFixed ? value.toFixed(2) : value, name]}
          />
          <Legend />

          {/* Shaded band: render p90 as filled area above p10 */}
          <Line
            type="monotone"
            dataKey="p90"
            stroke={color}
            strokeOpacity={0.3}
            strokeWidth={1}
            dot={false}
            name="90th percentile"
          />
          <Line
            type="monotone"
            dataKey="p10"
            stroke={color}
            strokeOpacity={0.3}
            strokeWidth={1}
            dot={false}
            name="10th percentile"
          />
          {/* Mean trajectory (solid, thick) */}
          <Line
            type="monotone"
            dataKey="mean"
            stroke={color}
            strokeWidth={3}
            dot={false}
            name={`${reporter.name} (mean)`}
          />
          {threshold != null && (
            <ReferenceLine
              y={threshold}
              stroke="#e63946"
              strokeDasharray="4 3"
              label={{ value: `threshold ${threshold}`, fill: "#e63946", fontSize: 11 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <div className="stoch-metrics">
        <span>
          <strong>Noise index (CV):</strong>{" "}
          {reporter.cv_steady_state != null
            ? `${(reporter.cv_steady_state * 100).toFixed(1)}%`
            : "—"}
        </span>
        {reporter.prob_above_threshold != null && (
          <span>
            <strong>P(output &gt; threshold):</strong>{" "}
            {(reporter.prob_above_threshold * 100).toFixed(1)}%
          </span>
        )}
        <span className="muted">n = {stochastic.n_trajectories} trajectories</span>
      </div>
    </div>
  );
}

export default function SimulationPlot({ simulation, stochastic, onRunStochastic, stochLoading }) {
  const [mode, setMode] = useState("deterministic");
  const [threshold, setThreshold] = useState("");

  if (!simulation) {
    return <div className="panel-empty">Simulation will appear here after compiling.</div>;
  }

  const thresholdNum = threshold !== "" && !isNaN(Number(threshold)) ? Number(threshold) : null;

  return (
    <div className="sim-plot-wrap">
      <div className="sim-mode-bar">
        <button
          className={mode === "deterministic" ? "tab active" : "tab"}
          onClick={() => setMode("deterministic")}
        >
          Deterministic ODE
        </button>
        <button
          className={mode === "stochastic" ? "tab active" : "tab"}
          onClick={() => setMode("stochastic")}
        >
          Stochastic (Gillespie)
        </button>

        {mode === "stochastic" && (
          <>
            <button
              className="compile-btn small"
              onClick={() => onRunStochastic && onRunStochastic(thresholdNum)}
              disabled={stochLoading}
              style={{ marginLeft: "auto" }}
            >
              {stochLoading ? "Running…" : "Run (N=50)"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              Threshold
              <input
                type="number"
                min="0"
                step="1"
                placeholder="optional"
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                style={{ width: 70, padding: "2px 4px" }}
              />
            </label>
          </>
        )}
      </div>

      <div className="plot-wrap">
        {mode === "deterministic" ? (
          <DeterministicChart simulation={simulation} />
        ) : (
          <StochasticChart stochastic={stochastic} threshold={thresholdNum} />
        )}
      </div>
    </div>
  );
}
