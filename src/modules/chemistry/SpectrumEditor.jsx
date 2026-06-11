import { useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot,
} from "recharts";
import { chemIsotopes } from "../../shared/lib/api/client.js";
import { useUiStore } from "../../shared/stores/uiStore.js";

const TYPES = {
  nmr:   { label: "NMR (¹H/¹³C)", x: "chemical shift (ppm)", reverse: true },
  ir:    { label: "IR / FTIR", x: "wavenumber (cm⁻¹)", reverse: true },
  ms:    { label: "Mass Spec", x: "m/z", reverse: false },
  uvvis: { label: "UV-Vis", x: "wavelength (nm)", reverse: false },
};

// Module 6 — Spectroscopy Viewer. Imports CSV or JCAMP-DX peak/XY data and renders
// an interactive spectrum; for MS it can overlay the calculated isotope pattern.
export default function SpectrumEditor({ tab }) {
  const [type, setType] = useState("ms");
  const [data, setData] = useState(() => (tab.content ? parseSpectrum(tab.content) : null));
  const [peaks, setPeaks] = useState([]);
  const [formula, setFormula] = useState("");
  const [isotopes, setIsotopes] = useState(null);
  const fileRef = useRef(null);
  const theme = useUiStore((s) => s.theme);
  const isDark = theme === "dark";
  const tickColor     = "var(--text-muted)";
  const labelColor    = "var(--text)";
  const tooltipBg     = "var(--surface-2)";
  const tooltipBorder = "var(--border)";

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const parsed = parseSpectrum(text);
    setData(parsed);
    setPeaks(detectPeaks(parsed));
    e.target.value = "";
  };

  const overlayIsotopes = async () => {
    if (!formula) return;
    const res = await chemIsotopes(formula);
    setIsotopes(res.peaks);
  };

  const chartData = useMemo(
    () => (data ? data.x.map((x, i) => ({ x, y: data.y[i] })) : []),
    [data],
  );
  const meta = TYPES[type];

  return (
    <div className="spectrum-editor">
      <div className="spectrum-toolbar">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV / JCAMP-DX</button>
        <input ref={fileRef} type="file" accept=".csv,.jdx,.dx,.txt" hidden onChange={onFile} />
        {type === "ms" && (
          <>
            <input className="mol-search" style={{ maxWidth: 140 }} placeholder="formula e.g. C9H8O4"
              value={formula} onChange={(e) => setFormula(e.target.value)} />
            <button className="btn" onClick={overlayIsotopes}>Overlay isotopes</button>
          </>
        )}
      </div>

      {!data ? (
        <div className="panel-empty">Import a spectrum file (CSV: two columns x,y).</div>
      ) : (
        <div className="spectrum-plot">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 24, left: 8 }}>
              <XAxis dataKey="x" type="number" reversed={meta.reverse}
                domain={["dataMin", "dataMax"]} tick={{ fontSize: 11, fill: tickColor }}
                label={{ value: meta.x, position: "insideBottom", offset: -12, fill: labelColor }} />
              <YAxis tick={{ fontSize: 11, fill: tickColor }}
                label={{ value: "intensity", angle: -90, position: "insideLeft", fill: labelColor }} />
              <Tooltip formatter={(v) => v.toFixed?.(2) ?? v}
                contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, color: labelColor }}
                labelStyle={{ color: labelColor }} />
              <Line type="monotone" dataKey="y" stroke="var(--accent)" dot={false} strokeWidth={1.3} isAnimationActive={false} />
              {isotopes?.map((p, i) => (
                <ReferenceDot key={i} x={p.mz} y={(p.intensity / 100) * (data.ymax || 1)} r={4}
                  fill="var(--error)" stroke="none" label={{ value: p.label, fontSize: 10, fill: "var(--error)" }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {peaks.length > 0 && (
            <div className="spectrum-peaks">Detected peaks: {peaks.slice(0, 10).map((p) => p.x.toFixed(1)).join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

// CSV ("x,y" per line) or JCAMP-DX peak tables / simple XY pairs.
function parseSpectrum(text) {
  const x = [], y = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("##") || line.startsWith("#") || /[A-Za-z]{3,}/.test(line)) continue;
    const nums = line.split(/[,;\s]+/).map(Number).filter((n) => !Number.isNaN(n));
    if (nums.length >= 2) { x.push(nums[0]); y.push(nums[1]); }
  }
  const ymax = y.length ? Math.max(...y) : 1;
  return { x, y, ymax };
}

function detectPeaks({ x, y }) {
  const out = [];
  const thresh = (Math.max(...y) || 0) * 0.2;
  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] > thresh && y[i] >= y[i - 1] && y[i] > y[i + 1]) out.push({ x: x[i], y: y[i] });
  }
  return out.sort((a, b) => b.y - a.y);
}
