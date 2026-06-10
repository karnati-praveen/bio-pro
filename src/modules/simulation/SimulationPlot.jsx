import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
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

// Classify a series by its biological role
function seriesRole(s) {
  if (s.is_reporter) return "Output reporter";
  if (s.name.includes("(input)")) return "Input signal";
  return "Regulator";
}

// Compute plain-English statistics from a deterministic simulation
function computeStats(simulation) {
  if (!simulation?.series?.length || !simulation.t?.length) return null;
  const reporter = simulation.series.find(s => s.is_reporter) ?? simulation.series[0];
  if (!reporter?.values?.length) return null;

  const { values } = reporter;
  const t = simulation.t;
  const n = values.length;

  // Steady-state: mean of last 10%
  const ssSlice = values.slice(Math.max(0, Math.floor(n * 0.9)));
  const steadyState = ssSlice.reduce((a, b) => a + b, 0) / ssSlice.length;

  // Basal: mean of first 5%
  const basalSlice = values.slice(0, Math.max(2, Math.floor(n * 0.05)));
  const basal = basalSlice.reduce((a, b) => a + b, 0) / basalSlice.length;

  const foldChange = basal > 1e-6 ? steadyState / basal : null;

  // Response time: time to reach 90% of full excursion (only when clearly induced/repressed)
  let responseTime = null;
  if (foldChange !== null && (foldChange > 1.5 || foldChange < 0.67)) {
    const target = basal + 0.9 * (steadyState - basal);
    const idx =
      steadyState > basal
        ? values.findIndex(v => v >= target)
        : values.findIndex(v => v <= target);
    if (idx >= 0) responseTime = t[idx];
  }

  // Oscillation: find significant local maxima after the initial transient
  const peakStart = Math.floor(n * 0.15);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const peakThreshold = minVal + 0.6 * (maxVal - minVal); // top 40% of range
  // >= on left so flat-top peaks (consecutive equal values) are included;
  // > on right ensures only the trailing edge of a flat top is counted once.
  const peaks = [];
  for (let i = peakStart + 1; i < n - 1; i++) {
    if (
      values[i] >= values[i - 1] &&
      values[i] > values[i + 1] &&
      values[i] >= peakThreshold
    ) {
      peaks.push(t[i]);
    }
  }
  let oscillation = null;
  if (peaks.length >= 2) {
    const periods = peaks.slice(1).map((p, i) => p - peaks[i]);
    const avg = periods.reduce((a, b) => a + b, 0) / periods.length;
    const cv =
      avg > 0
        ? Math.sqrt(periods.reduce((a, b) => a + (b - avg) ** 2, 0) / periods.length) / avg
        : 1;
    if (cv < 0.3) oscillation = { period: avg, nCycles: peaks.length };
  }

  return { name: reporter.name, steadyState, basal, foldChange, responseTime, oscillation };
}

// Plain-English interpretation card
function SimSummary({ simulation }) {
  const s = computeStats(simulation);
  if (!s) return null;
  const { name, steadyState, basal, foldChange, responseTime, oscillation } = s;

  return (
    <div className="sim-summary">
      <span className="sim-summary-heading">What this simulation shows</span>
      {oscillation ? (
        <>
          <p>
            <strong>Oscillating circuit</strong> — {name} cycles with an approximate period of{" "}
            <strong>{oscillation.period.toFixed(1)} time units</strong>{" "}
            ({oscillation.nCycles} peak{oscillation.nCycles !== 1 ? "s" : ""} detected).
            Useful for generating rhythmic biological signals or timing pulses.
          </p>
          <p>
            <strong>Mean output level:</strong> ~{steadyState.toFixed(2)} a.u.
          </p>
        </>
      ) : foldChange !== null && foldChange > 1.5 ? (
        <>
          <p>
            <strong>{foldChange.toFixed(1)}× fold-induction</strong> — {name} rises from a basal
            level of <strong>{basal.toFixed(2)}</strong> to{" "}
            <strong>{steadyState.toFixed(2)} a.u.</strong> when the inducer is applied.
          </p>
          {responseTime !== null && (
            <p>
              <strong>Response time:</strong> 90% of the final output is reached at{" "}
              t&nbsp;≈&nbsp;<strong>{responseTime.toFixed(1)} a.u.</strong>
            </p>
          )}
        </>
      ) : foldChange !== null && foldChange < 0.67 ? (
        <>
          <p>
            <strong>{(1 / foldChange).toFixed(1)}× repression</strong> — {name} drops from{" "}
            <strong>{basal.toFixed(2)}</strong> (uninduced) to{" "}
            <strong>{steadyState.toFixed(2)} a.u.</strong> when the repressor is active.
          </p>
          {responseTime !== null && (
            <p>
              <strong>Response time:</strong> reaches 90% of the repressed level at{" "}
              t&nbsp;≈&nbsp;<strong>{responseTime.toFixed(1)} a.u.</strong>
            </p>
          )}
        </>
      ) : (
        <p>
          <strong>Constitutive expression</strong> — {name} maintains a steady level of{" "}
          <strong>{steadyState.toFixed(2)} a.u.</strong> with no external trigger required.
        </p>
      )}
    </div>
  );
}

// Deterministic simulation chart with role-aware legend and formatted hover
function DeterministicChart({ simulation }) {
  const data = simulation.t.map((t, i) => {
    const row = { t: Number(t.toFixed(1)) };
    simulation.series.forEach(s => { row[s.name] = s.values[i]; });
    return row;
  });

  // name → role label lookup (closed over by tooltip and legend renderers)
  const roleOf = {};
  simulation.series.forEach(s => { roleOf[s.name] = seriesRole(s); });

  const colorOf = {};
  simulation.series.forEach((s, i) => {
    colorOf[s.name] = s.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
  });

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="sim-tooltip-box">
        <div className="sim-tooltip-time">t = {label}</div>
        {payload.map((entry, i) => (
          <div key={i} className="sim-tooltip-row">
            <span className="sim-tooltip-swatch" style={{ background: entry.color }} />
            <span className="sim-tooltip-name">{entry.dataKey}</span>
            <span className="sim-tooltip-role">{roleOf[entry.dataKey]}</span>
            <span className="sim-tooltip-value">{Number(entry.value).toFixed(3)}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderLegend = ({ payload }) => (
    <div className="sim-series-legend">
      {(payload || []).map((entry, i) => {
        const isInput = simulation.series.find(s => s.name === entry.value)?.name.includes("(input)");
        return (
          <div key={i} className="sim-legend-entry">
            <svg width="18" height="6" className="sim-legend-line">
              <line
                x1="0" y1="3" x2="18" y2="3"
                stroke={entry.color}
                strokeWidth="2.5"
                strokeDasharray={isInput ? "4 3" : undefined}
              />
            </svg>
            <span className="sim-legend-name">{entry.value}</span>
            {roleOf[entry.value] && (
              <span className="sim-legend-role">{roleOf[entry.value]}</span>
            )}
          </div>
        );
      })}
    </div>
  );

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
        <Tooltip content={renderTooltip} />
        <Legend content={renderLegend} />
        {simulation.series.map((s, i) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={colorOf[s.name]}
            strokeWidth={s.is_reporter ? 3 : 1.5}
            strokeDasharray={s.name.includes("(input)") ? "5 4" : undefined}
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

  const data = stochastic.t.map((t, i) => ({
    t: Number(t.toFixed(1)),
    mean: reporter.mean[i],
    p10: reporter.p10[i],
    p90: reporter.p90[i],
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

// Dose-response chart: steady-state output vs inducer concentration (log x-axis)
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
          tickFormatter={(v) =>
            v < 0.01 ? v.toExponential(0) : Number(v.toPrecision(2)).toString()
          }
          label={{
            value: `[${dr.inducer}] (a.u., log scale)`,
            position: "insideBottom",
            offset: -18,
          }}
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

      {mode === "deterministic" && <SimSummary simulation={simulation} />}

      {storeStochastic && (
        <div className="stoch-inline-section">
          <h3 className="stoch-inline-heading">Stochastic Simulation</h3>
          <StochasticInlineChart stochastic={storeStochastic} />
        </div>
      )}
    </div>
  );
}
