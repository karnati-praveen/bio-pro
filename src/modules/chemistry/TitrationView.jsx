import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Label, Line, LineChart, ReferenceArea, ReferenceDot,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { chemTitration, chemPkaTable } from "../../shared/lib/api/client.js";
import { useUiStore } from "../../shared/stores/uiStore.js";

const ANALYTE_KINDS = [
  { value: "weak_acid",   label: "Weak acid + strong base" },
  { value: "strong_acid", label: "Strong acid + strong base" },
  { value: "weak_base",   label: "Weak base + strong acid" },
  { value: "strong_base", label: "Strong base + strong acid" },
];

const isAcid = (kind) => kind.includes("acid");
const isWeak = (kind) => kind.startsWith("weak");

// Module 6 — Acid–Base Titration. Plots pH vs added titrant volume with the
// equivalence point, the half-equivalence point (pH = pKa), and the buffer
// region shaded. Backed by /api/chem/titration (full charge-balance solve).
export default function TitrationView({ tab }) {
  const m = tab.meta || {};
  const [kind, setKind] = useState(m.kind || "weak_acid");
  const [conc, setConc] = useState(m.conc ?? 0.1);
  const [volume, setVolume] = useState(m.volume ?? 25);
  const [pk, setPk] = useState(m.pka ?? 4.76);          // pKa (acid) or pKb (base)
  const [titrantConc, setTitrantConc] = useState(m.titrantConc ?? 0.1);
  const [presets, setPresets] = useState([]);
  const [curve, setCurve] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const theme = useUiStore((s) => s.theme);
  const isDark = theme === "dark";
  const tickColor     = "var(--text-muted)";
  const labelColor    = "var(--text)";
  const gridColor     = "var(--border)";
  const tooltipBg     = "var(--surface-2)";
  const tooltipBorder = "var(--border)";

  const weak = isWeak(kind);
  const pkLabel = isAcid(kind) ? "pKa" : "pKb";

  // Load the reference pKa table once to populate the preset dropdown.
  useEffect(() => {
    let cancelled = false;
    chemPkaTable()
      .then((res) => {
        if (cancelled) return;
        const out = [];
        for (const [name, info] of Object.entries(res.table || {})) {
          if (info.type === "weak_acid" || info.type === "buffer" || info.type === "amino_acid") {
            (info.pka || []).forEach((p, i) => out.push({
              key: `${name}-${i}`, name, kind: "weak_acid", pk: p,
              label: `${name}${(info.pka.length > 1) ? ` (pKa${i + 1})` : ""} — ${p}`,
            }));
          } else if (info.type === "weak_base") {
            (info.pkb || []).forEach((p) => out.push({
              key: `${name}-b`, name, kind: "weak_base", pk: p,
              label: `${name} (pKb ${p})`,
            }));
          }
        }
        setPresets(out);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const plot = async () => {
    setLoading(true); setError(null);
    try {
      const analyte = { conc: Number(conc), volume: Number(volume), kind };
      if (weak) analyte[isAcid(kind) ? "pka" : "pkb"] = Number(pk);
      const titrant = { conc: Number(titrantConc), kind: isAcid(kind) ? "strong_base" : "strong_acid" };
      const data = await chemTitration(analyte, titrant);
      setCurve(data);
    } catch (e) {
      setError(e.message); setCurve(null);
    } finally { setLoading(false); }
  };

  // Plot once on mount with the default parameters.
  useEffect(() => { plot(); /* initial */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = useMemo(
    () => (curve ? curve.points.map((p) => ({ volume: p.volume, ph: p.ph })) : []),
    [curve],
  );

  const onPreset = (e) => {
    const p = presets.find((x) => x.key === e.target.value);
    if (!p) return;
    setKind(p.kind);
    setPk(p.pk);
  };

  return (
    <div className="mol-editor titration-view">
      <div className="mol-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} title="Titration system">
          {ANALYTE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>

        <label className="titration-field">analyte [mol/L]
          <input type="number" min="0" step="0.01" value={conc}
            onChange={(e) => setConc(e.target.value)} />
        </label>
        <label className="titration-field">volume [mL]
          <input type="number" min="0" step="1" value={volume}
            onChange={(e) => setVolume(e.target.value)} />
        </label>
        {weak && (
          <label className="titration-field">{pkLabel}
            <input type="number" step="0.01" value={pk}
              onChange={(e) => setPk(e.target.value)} />
          </label>
        )}
        <label className="titration-field">titrant [mol/L]
          <input type="number" min="0" step="0.01" value={titrantConc}
            onChange={(e) => setTitrantConc(e.target.value)} />
        </label>

        <button className="btn primary" onClick={plot} disabled={loading}>
          {loading ? "…" : "Plot"}
        </button>

        {presets.length > 0 && (
          <select value="" onChange={onPreset} title="Load a common acid/base/buffer" style={{ marginLeft: "auto" }}>
            <option value="">Preset (pKa table)…</option>
            {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        )}
      </div>

      {error && <div className="dsl-error">{error}</div>}

      {!curve ? (
        <div className="panel-empty">Set the parameters and click “Plot”.</div>
      ) : (
        <div className="titration-body">
          <div className="titration-plot">
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={chartData} margin={{ top: 12, right: 24, bottom: 28, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />

                {/* Buffer-region shade (≈ pKa ± 1, the 10–90 % neutralised window). */}
                {curve.buffer_region && (
                  <ReferenceArea
                    x1={curve.buffer_region.start} x2={curve.buffer_region.end}
                    fill="var(--success)" fillOpacity={0.14} stroke="none"
                    ifOverflow="extendDomain"
                  >
                    <Label value="buffer region" position="insideTop"
                      fill="var(--success)" fontSize={11} />
                  </ReferenceArea>
                )}

                <XAxis dataKey="volume" type="number" domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 11, fill: tickColor }}
                  tickFormatter={(v) => Number(v).toFixed(1)}
                  label={{ value: "titrant added (mL)", position: "insideBottom", offset: -14, fill: labelColor }} />
                <YAxis domain={[0, 14]} ticks={[0, 2, 4, 6, 7, 8, 10, 12, 14]}
                  tick={{ fontSize: 11, fill: tickColor }}
                  label={{ value: "pH", angle: -90, position: "insideLeft", fill: labelColor }} />
                <Tooltip
                  contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, color: labelColor }}
                  labelStyle={{ color: labelColor }}
                  formatter={(v) => [Number(v).toFixed(2), "pH"]}
                  labelFormatter={(v) => `${Number(v).toFixed(2)} mL`} />

                {/* Half-equivalence: vertical marker where pH = pKa. */}
                {curve.half_equivalence && (
                  <ReferenceLine x={curve.half_equivalence.volume} stroke="var(--warning)"
                    strokeDasharray="5 4">
                    <Label value="½ eq (pH = pKa)" position="insideTopLeft" angle={-90}
                      fill="var(--warning)" fontSize={10} />
                  </ReferenceLine>
                )}
                {curve.pka != null && (
                  <ReferenceLine y={curve.pka} stroke="var(--warning)" strokeOpacity={0.5}
                    strokeDasharray="2 4" />
                )}

                {/* Equivalence point. */}
                <ReferenceLine x={curve.equivalence.volume} stroke="var(--error)" strokeDasharray="5 4">
                  <Label value="equivalence" position="insideTopRight" angle={-90}
                    fill="var(--error)" fontSize={10} />
                </ReferenceLine>
                <ReferenceDot x={curve.equivalence.volume} y={curve.equivalence.ph} r={5}
                  fill="var(--error)" stroke="var(--bg)" strokeWidth={1.5} />

                <Line type="monotone" dataKey="ph" stroke="var(--accent)" dot={false}
                  strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="titration-readout">
            <h3>Titration summary</h3>
            <dl className="prop-list">
              <dt>System</dt>
              <dd>{ANALYTE_KINDS.find((k) => k.value === kind)?.label}</dd>
              <dt>Equivalence</dt>
              <dd>{curve.equivalence.volume.toFixed(2)} mL · pH {curve.equivalence.ph.toFixed(2)}</dd>
              {curve.half_equivalence && (
                <>
                  <dt>Half-equivalence</dt>
                  <dd>{curve.half_equivalence.volume.toFixed(2)} mL · pH {curve.half_equivalence.ph.toFixed(2)}</dd>
                  <dt>pKa (= pH at ½ eq)</dt>
                  <dd>{curve.pka?.toFixed(2)}</dd>
                </>
              )}
              {curve.buffer_region && (
                <>
                  <dt>Buffer region</dt>
                  <dd>{curve.buffer_region.start.toFixed(1)}–{curve.buffer_region.end.toFixed(1)} mL
                    {curve.buffer_region.ph_low != null && (
                      <> (pH {curve.buffer_region.ph_low.toFixed(1)}–{curve.buffer_region.ph_high.toFixed(1)})</>
                    )}</dd>
                </>
              )}
              <dt>Start / end pH</dt>
              <dd>{curve.points[0].ph.toFixed(2)} → {curve.points[curve.points.length - 1].ph.toFixed(2)}</dd>
            </dl>

            <div className="titration-legend">
              <span><i className="swatch" style={{ background: "var(--error)" }} /> equivalence point</span>
              {curve.half_equivalence && (
                <span><i className="swatch" style={{ background: "var(--warning)" }} /> half-equivalence (pH = pKa)</span>
              )}
              {curve.buffer_region && (
                <span><i className="swatch" style={{ background: "var(--success)", opacity: 0.5 }} /> buffer region</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
