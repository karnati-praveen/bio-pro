import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
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
import { useCircuitStore } from "../../shared/stores/circuitStore.js";
import { useTabStore } from "../../shared/stores/tabStore.js";
import { doseResponse as fetchDoseResponse } from "../../shared/lib/api/client.js";

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
export function StochasticChart({ stochastic, threshold }) {
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

function StochasticInlineChart({ stochastic }) {
  const data = stochastic.t.map((t, i) => {
    const row = { t: Number(t.toFixed(1)) };
    stochastic.series.forEach(s => {
      row[`${s.name}_p10`] = s.p10[i];
      row[`${s.name}_band`] = s.p90[i] - s.p10[i];
      row[`${s.name}_mean`] = s.mean[i];
    });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
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
        <Tooltip formatter={(v, name) => [v?.toFixed ? v.toFixed(2) : v, name]} />
        <Legend />
        {stochastic.series.flatMap((s, i) => {
          const color = FALLBACK_COLORS[i % FALLBACK_COLORS.length];
          const stackId = `band_${s.name}`;
          return [
            <Area
              key={`${s.name}_base`}
              type="monotone"
              dataKey={`${s.name}_p10`}
              stackId={stackId}
              stroke="none"
              fill="transparent"
              legendType="none"
              isAnimationActive={false}
            />,
            <Area
              key={`${s.name}_cap`}
              type="monotone"
              dataKey={`${s.name}_band`}
              stackId={stackId}
              stroke="none"
              fill={color}
              fillOpacity={0.15}
              name={`${s.name} p10–p90`}
              isAnimationActive={false}
            />,
            <Line
              key={`${s.name}_mean`}
              type="monotone"
              dataKey={`${s.name}_mean`}
              stroke={color}
              strokeWidth={2}
              dot={false}
              name={`${s.name} mean`}
              isAnimationActive={false}
            />,
          ];
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Dose-response chart: steady-state output vs inducer concentration (log x-axis).
// Band-pass shows a peak; inducible shows a sigmoid; repressible an inverse sigmoid.
function DoseResponseChart({ dr, loading }) {
  if (loading) return <div className="panel-empty">Computing dose-response…</div>;
  if (!dr) return <div className="panel-empty">Click "Run dose-response ▶" to compute.</div>;

  const data = dr.dose.map((d, i) => ({ dose: d, output: dr.output[i] }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 24, bottom: 36, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f4" />
        <XAxis
          dataKey="dose"
          scale="log"
          domain={["auto", "auto"]}
          type="number"
          tickFormatter={(v) => v < 0.01 ? v.toExponential(0) : Number(v.toPrecision(2)).toString()}
          label={{ value: `[${dr.inducer}] (a.u., log scale)`, position: "insideBottom", offset: -18 }}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          label={{
            value: `${dr.reporter} steady-state (a.u.)`,
            angle: -90,
            position: "insideLeft",
            style: { textAnchor: "middle" },
          }}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          formatter={(v) => [v.toFixed(3), dr.reporter]}
          labelFormatter={(v) => `[${dr.inducer}] = ${Number(v).toExponential(2)}`}
        />
        <Line
          type="monotone"
          dataKey="output"
          stroke="#52b788"
          strokeWidth={2.5}
          dot={false}
          name={dr.reporter}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function SimulationPlot({ simulation, stochastic, onRunStochastic, stochLoading, compileResult }) {
  const [mode, setMode] = useState("deterministic");
  const [threshold, setThreshold] = useState("");
  const [dr, setDr] = useState(null);
  const [drLoading, setDrLoading] = useState(false);

  const activeTab = useTabStore((s) => s.activeTab());
  const storeStochastic = useCircuitStore((s) => {
    if (!activeTab || activeTab.type !== "circuit") return null;
    return (s.byTab[activeTab.id] ?? {}).stochastic ?? null;
  });

  if (!simulation) {
    return <div className="panel-empty">Simulation will appear here after compiling.</div>;
  }

  const thresholdNum = threshold !== "" && !isNaN(Number(threshold)) ? Number(threshold) : null;

  const runDoseResponse = async () => {
    if (!compileResult) return;
    setDrLoading(true);
    try {
      const data = await fetchDoseResponse(compileResult);
      setDr(data);
    } catch (e) {
      console.error("Dose-response failed:", e);
    } finally {
      setDrLoading(false);
    }
  };

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
        {compileResult && (
          <button
            className={mode === "dose-response" ? "tab active" : "tab"}
            onClick={() => setMode("dose-response")}
          >
            Dose-Response
          </button>
        )}

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
        {mode === "dose-response" && (
          <button
            className="compile-btn small"
            onClick={runDoseResponse}
            disabled={drLoading}
            style={{ marginLeft: "auto" }}
          >
            {drLoading ? "Running…" : "Run dose-response ▶"}
          </button>
        )}
      </div>

      <div className="plot-wrap">
        {mode === "deterministic" ? (
          <DeterministicChart simulation={simulation} />
        ) : mode === "dose-response" ? (
          <DoseResponseChart dr={dr} loading={drLoading} />
        ) : (
          <StochasticChart stochastic={stochastic} threshold={thresholdNum} />
        )}
      </div>

      {storeStochastic && (
        <div className="stoch-inline-section">
          <h3 className="stoch-inline-heading">Stochastic Simulation</h3>
          <StochasticInlineChart stochastic={storeStochastic} />
        </div>
      )}
    </div>
  );
}
