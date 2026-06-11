import { useEffect, useRef, useState } from "react";
import { seqmapRender } from "../../shared/lib/api/client.js";

// ── SVG constants (viewBox 0 0 600 600, centre at 300,300) ───────────────── //
const CX = 300, CY = 300;
const R_INNER    = 152;   // inner white/dark circle
const R_FEAT_I   = 156;   // feature ring inner edge
const R_FEAT_O   = 202;   // feature ring outer edge  (46 px wide)
const R_GC_I     = 207;   // GC ring inner
const R_GC_O     = 226;   // GC ring outer            (19 px wide)
const R_TICK     = 234;   // backbone tick ring radius
const R_TICK_MAJ = 224;   // major tick inner edge
const R_TICK_MIN = 229;   // minor tick inner edge
const R_LABEL    = 256;   // position-label text radius

// ── Geometry helpers ─────────────────────────────────────────────────────── //
function polar(r, angle) {
  // angle=0 → 12-o'clock, increases clockwise
  return {
    x: CX + r * Math.cos(angle - Math.PI / 2),
    y: CY + r * Math.sin(angle - Math.PI / 2),
  };
}

function arcPath(rO, rI, a1, a2) {
  const span = ((a2 - a1) + 2 * Math.PI) % (2 * Math.PI);
  if (span < 0.003) return "";
  const large = span > Math.PI ? 1 : 0;
  const p1 = polar(rO, a1), p2 = polar(rO, a2);
  const p3 = polar(rI, a2), p4 = polar(rI, a1);
  return [
    `M${p1.x.toFixed(2)},${p1.y.toFixed(2)}`,
    `A${rO},${rO} 0 ${large},1 ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
    `L${p3.x.toFixed(2)},${p3.y.toFixed(2)}`,
    `A${rI},${rI} 0 ${large},0 ${p4.x.toFixed(2)},${p4.y.toFixed(2)}Z`,
  ].join(" ");
}

function seqAngle(pos, len) {
  return (pos / len) * 2 * Math.PI;
}

// Small triangular arrowhead at angle `a`, at radius `r`, pointing in
// direction of `strand` (+1 clockwise, -1 counter-clockwise)
function arrowTip(a, r, strand) {
  const dir  = strand === 1 ? 1 : -1;
  const tip  = polar(r,     a);
  const b1   = polar(r + 7, a - dir * 0.07);
  const b2   = polar(r - 7, a - dir * 0.07);
  return `M${tip.x.toFixed(1)},${tip.y.toFixed(1)} L${b1.x.toFixed(1)},${b1.y.toFixed(1)} L${b2.x.toFixed(1)},${b2.y.toFixed(1)}Z`;
}

// GC percentage → CSS colour (cool-to-warm: blue → teal → amber)
function gcColor(gc) {
  if (gc < 40) return "var(--feat-promoter)";
  if (gc < 58) return "var(--accent)";
  return "var(--badge-warn-fg)";
}

// Tick spacing: choose smallest step that keeps ≤ 14 major ticks
function tickStep(len) {
  for (const s of [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]) {
    if (len / s <= 14) return s;
  }
  return 100000;
}

function fmtPos(pos) {
  return pos >= 1000 ? `${(pos / 1000).toFixed(pos % 1000 === 0 ? 0 : 1)}k` : String(pos);
}

// ── Circular map ─────────────────────────────────────────────────────────── //
function CircularMap({ layout, selected, onSelect, showGC, showSites, singleOnly }) {
  const [hovered, setHovered] = useState(null);
  const [tip, setTip]         = useState(null);
  const { length: len, features, gc_windows, restriction_sites, name, topology } = layout;

  if (!len) return null;

  // ── Tick marks ─────────────────────────────────────────────────────── //
  const step = tickStep(len);
  const minorStep = step / 5;
  const tickElems = [];

  for (let pos = 0; pos < len; pos += minorStep) {
    const a = seqAngle(pos, len);
    const isMajor = pos % step === 0;
    const o = polar(R_TICK,          a);
    const i = polar(isMajor ? R_TICK_MAJ : R_TICK_MIN, a);
    tickElems.push(
      <line key={`t${pos}`}
        x1={o.x} y1={o.y} x2={i.x} y2={i.y}
        stroke="var(--border-strong)" strokeWidth={isMajor ? 1.5 : 0.7}
      />
    );
    if (isMajor) {
      const lp = polar(R_LABEL, a);
      const rot = (a * 180) / Math.PI;
      tickElems.push(
        <text key={`tl${pos}`} x={lp.x} y={lp.y}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fill="var(--text-faint)" fontFamily="var(--font-ui)"
          transform={`rotate(${rot},${lp.x.toFixed(1)},${lp.y.toFixed(1)})`}
        >{fmtPos(pos)}</text>
      );
    }
  }

  // ── GC ring ─────────────────────────────────────────────────────────── //
  const gcElems = showGC
    ? gc_windows.map((w, i) => {
        const a1 = seqAngle(w.start, len);
        const a2 = seqAngle(w.end,   len);
        return <path key={i} d={arcPath(R_GC_O, R_GC_I, a1, a2)}
                 fill={gcColor(w.gc)} opacity="0.82" />;
      })
    : null;

  // ── Restriction-site markers ─────────────────────────────────────────── //
  const siteElems = showSites
    ? restriction_sites
        .filter(s => !singleOnly || s.single_cutter)
        .map((s, i) => {
          const a  = seqAngle(s.position, len);
          const o  = polar(R_FEAT_O + 4, a);
          const ii = polar(R_FEAT_I - 4, a);
          const lp = polar(R_GC_O + 16,  a);
          const rot = (a * 180) / Math.PI;
          return (
            <g key={i}>
              <line x1={o.x} y1={o.y} x2={ii.x} y2={ii.y}
                stroke={s.single_cutter ? "var(--warning)" : "var(--border-strong)"}
                strokeWidth={s.single_cutter ? 1.6 : 0.7}
                strokeDasharray={s.single_cutter ? undefined : "2,2"}
              />
              {s.single_cutter && (
                <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize="7.5" fill="var(--warning)" fontFamily="var(--font-mono)"
                  transform={`rotate(${rot},${lp.x.toFixed(1)},${lp.y.toFixed(1)})`}
                >{s.enzyme}</text>
              )}
            </g>
          );
        })
    : null;

  // ── Feature arcs ─────────────────────────────────────────────────────── //
  const featElems = features.map((f, i) => {
    const a1 = seqAngle(f.start, len);
    const a2 = seqAngle(f.end,   len);
    if (Math.abs(a2 - a1) < 0.002) return null;

    const isSelected = selected === i;
    const isHovered  = hovered  === i;

    // Strand: forward sits in the outer half of the ring, reverse in inner half
    const rO = f.strand === -1 ? R_FEAT_I + 22 : R_FEAT_O;
    const rI = f.strand === -1 ? R_FEAT_I      : R_FEAT_O - 22;
    const rMid = (rO + rI) / 2;

    // Arrowhead at end (→) or start (←)
    const arrowAngle = f.strand === 1 ? a2 : a1;
    const arcLen = Math.abs(a2 - a1) * rMid;

    // Inline label when arc is wide enough
    const mid = (a1 + a2) / 2;
    const lp  = polar(rMid, mid);
    const rot = (mid * 180) / Math.PI;
    const lbl = f.label.length > 11 ? f.label.slice(0, 11) + "…" : f.label;

    return (
      <g key={i} style={{ cursor: "pointer" }}
        onClick={() => onSelect(selected === i ? null : i)}
        onMouseEnter={(e) => { setHovered(i); setTip({ x: e.clientX, y: e.clientY, f }); }}
        onMouseMove={(e)  => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
        onMouseLeave={()  => { setHovered(null); setTip(null); }}
      >
        <path d={arcPath(rO, rI, a1, a2)} fill={f.color}
          stroke={isSelected ? "var(--accent)" : isHovered ? "var(--accent-hover)" : "none"}
          strokeWidth={isSelected || isHovered ? 2 : 0}
          opacity={isSelected || isHovered ? 1 : 0.84}
        />
        <path d={arrowTip(arrowAngle, rMid, f.strand)} fill={f.color} opacity={0.95}
          style={{ pointerEvents: "none" }} />
        {arcLen > 26 && (
          <text x={lp.x.toFixed(2)} y={lp.y.toFixed(2)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fontWeight="700" fill="white"
            transform={`rotate(${rot.toFixed(1)},${lp.x.toFixed(2)},${lp.y.toFixed(2)})`}
            style={{ pointerEvents: "none" }}
          >{lbl}</text>
        )}
        <title>{`${f.label} · ${f.type} · ${f.start}–${f.end} · ${f.strand === 1 ? "+" : "−"}`}</title>
      </g>
    );
  });

  return (
    <>
      <svg viewBox="0 0 600 600" className="pm-svg" role="img"
        aria-label={`Circular plasmid map — ${name}, ${len.toLocaleString()} bp`}>

        {/* Outer tick ring */}
        <circle cx={CX} cy={CY} r={R_TICK} fill="none" stroke="var(--border)" strokeWidth="1" />

        {/* GC ring background + segments */}
        {showGC && (
          <circle cx={CX} cy={CY} r={(R_GC_O + R_GC_I) / 2} fill="none"
            stroke="var(--surface-3)" strokeWidth={R_GC_O - R_GC_I + 1} />
        )}
        {gcElems}

        {/* Feature ring background */}
        <circle cx={CX} cy={CY} r={(R_FEAT_O + R_FEAT_I) / 2} fill="none"
          stroke="var(--surface-3)" strokeWidth={R_FEAT_O - R_FEAT_I + 1} />
        {featElems}

        {/* Restriction sites */}
        {siteElems}

        {/* Tick marks + labels */}
        {tickElems}

        {/* Inner circle — name/length label area */}
        <circle cx={CX} cy={CY} r={R_INNER}
          fill="var(--editor-bg)" stroke="var(--border)" strokeWidth="1.5" />

        <text x={CX} y={CY - 16} textAnchor="middle" dominantBaseline="middle"
          fontSize="14" fontWeight="600" fill="var(--text)" fontFamily="var(--font-ui)">
          {name.length > 18 ? name.slice(0, 18) + "…" : name}
        </text>
        <text x={CX} y={CY + 4} textAnchor="middle" dominantBaseline="middle"
          fontSize="12" fill="var(--text-muted)" fontFamily="var(--font-ui)">
          {len.toLocaleString()} bp
        </text>
        <text x={CX} y={CY + 20} textAnchor="middle" dominantBaseline="middle"
          fontSize="10" fill="var(--text-faint)" fontFamily="var(--font-ui)">
          {topology}
        </text>
      </svg>

      {/* Floating tooltip */}
      {tip && (
        <div className="pm-tooltip" style={{ left: tip.x + 14, top: tip.y - 8 }}>
          <span className="pm-tip-label">{tip.f.label}</span>
          <span className="pm-tip-meta">{tip.f.type}</span>
          <span className="pm-tip-pos">
            {tip.f.start.toLocaleString()}–{tip.f.end.toLocaleString()}
            &nbsp;·&nbsp;{tip.f.strand === 1 ? "+" : "−"}
          </span>
        </div>
      )}
    </>
  );
}

// ── Linear map ───────────────────────────────────────────────────────────── //
function LinearMap({ layout, selected, onSelect, showSites, singleOnly }) {
  const [hovered, setHovered] = useState(null);
  const [tip, setTip]         = useState(null);
  const { length: len, features, restriction_sites } = layout;
  if (!len) return null;

  const W = 560, MARGIN = 20;
  const FWD_Y = 38, REV_Y = 68, TRACK_H = 22;

  const xOf = (pos) => MARGIN + (pos / len) * W;
  const step = tickStep(len);

  // Tick marks
  const ticks = [];
  for (let pos = 0; pos <= len; pos += step) {
    const x = xOf(pos);
    ticks.push(
      <g key={pos}>
        <line x1={x} y1={55} x2={x} y2={63} stroke="var(--border-strong)" strokeWidth="1.5" />
        <text x={x} y={73} textAnchor="middle" fontSize="9" fill="var(--text-faint)"
          fontFamily="var(--font-ui)">{fmtPos(pos)}</text>
      </g>
    );
  }
  // minor ticks
  for (let pos = 0; pos < len; pos += step / 5) {
    if (pos % step === 0) continue;
    const x = xOf(pos);
    ticks.push(
      <line key={`m${pos}`} x1={x} y1={57} x2={x} y2={62}
        stroke="var(--border)" strokeWidth="0.7" />
    );
  }

  // Feature rects
  const featElems = features.map((f, i) => {
    const x = xOf(f.start);
    const w = Math.max(2, xOf(f.end) - xOf(f.start));
    const y = f.strand === -1 ? REV_Y : FWD_Y;
    const isSelected = selected === i;
    const isHovered  = hovered  === i;
    const lbl = f.label.length > 10 ? f.label.slice(0, 10) + "…" : f.label;

    return (
      <g key={i} style={{ cursor: "pointer" }}
        onClick={() => onSelect(selected === i ? null : i)}
        onMouseEnter={(e) => { setHovered(i); setTip({ x: e.clientX, y: e.clientY, f }); }}
        onMouseMove={(e)  => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
        onMouseLeave={()  => { setHovered(null); setTip(null); }}
      >
        <rect x={x} y={y} width={w} height={TRACK_H} rx="3"
          fill={f.color} opacity={isSelected || isHovered ? 1 : 0.8}
          stroke={isSelected ? "var(--accent)" : isHovered ? "var(--accent-hover)" : "none"}
          strokeWidth={isSelected || isHovered ? 2 : 0}
        />
        {/* arrowhead triangle at right (fwd) or left (rev) end */}
        {w > 10 && (() => {
          if (f.strand === 1) {
            return <polygon
              points={`${(x + w).toFixed(1)},${(y + TRACK_H / 2).toFixed(1)} ${(x + w - 6).toFixed(1)},${y.toFixed(1)} ${(x + w - 6).toFixed(1)},${(y + TRACK_H).toFixed(1)}`}
              fill={f.color} opacity="0.95" style={{ pointerEvents: "none" }} />;
          }
          return <polygon
            points={`${x.toFixed(1)},${(y + TRACK_H / 2).toFixed(1)} ${(x + 6).toFixed(1)},${y.toFixed(1)} ${(x + 6).toFixed(1)},${(y + TRACK_H).toFixed(1)}`}
            fill={f.color} opacity="0.95" style={{ pointerEvents: "none" }} />;
        })()}
        {w > 32 && (
          <text x={x + w / 2} y={y + TRACK_H / 2} textAnchor="middle"
            dominantBaseline="middle" fontSize="8" fontWeight="700" fill="white"
            style={{ pointerEvents: "none" }}
          >{lbl}</text>
        )}
        <title>{`${f.label} · ${f.type} · ${f.start}–${f.end} · ${f.strand === 1 ? "+" : "−"}`}</title>
      </g>
    );
  });

  // Restriction site markers
  const siteElems = showSites
    ? restriction_sites
        .filter(s => !singleOnly || s.single_cutter)
        .map((s, i) => {
          const x = xOf(s.position);
          return (
            <g key={i}>
              <line x1={x} y1={FWD_Y - 4} x2={x} y2={REV_Y + TRACK_H + 4}
                stroke={s.single_cutter ? "var(--warning)" : "var(--border-strong)"}
                strokeWidth={s.single_cutter ? 1.5 : 0.7}
                strokeDasharray={s.single_cutter ? undefined : "2,2"}
                opacity="0.7"
              />
              {s.single_cutter && (
                <text x={x} y={FWD_Y - 8} textAnchor="middle" fontSize="7.5"
                  fill="var(--warning)" fontFamily="var(--font-mono)">{s.enzyme}</text>
              )}
            </g>
          );
        })
    : null;

  return (
    <>
      <svg viewBox={`0 0 600 92`} className="pm-svg pm-linear" preserveAspectRatio="xMidYMid meet">
        {/* Backbone */}
        <line x1={MARGIN} y1={59} x2={MARGIN + W} y2={59}
          stroke="var(--border-strong)" strokeWidth="2" />
        {/* Strand labels */}
        <text x={8} y={FWD_Y + TRACK_H / 2} textAnchor="middle" dominantBaseline="middle"
          fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-ui)"
          transform={`rotate(-90,8,${FWD_Y + TRACK_H / 2})`}>+</text>
        <text x={8} y={REV_Y + TRACK_H / 2} textAnchor="middle" dominantBaseline="middle"
          fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-ui)"
          transform={`rotate(-90,8,${REV_Y + TRACK_H / 2})`}>−</text>

        {siteElems}
        {featElems}
        {ticks}
      </svg>

      {tip && (
        <div className="pm-tooltip" style={{ left: tip.x + 14, top: tip.y - 8 }}>
          <span className="pm-tip-label">{tip.f.label}</span>
          <span className="pm-tip-meta">{tip.f.type}</span>
          <span className="pm-tip-pos">
            {tip.f.start.toLocaleString()}–{tip.f.end.toLocaleString()}
            &nbsp;·&nbsp;{tip.f.strand === 1 ? "+" : "−"}
          </span>
        </div>
      )}
    </>
  );
}

// ── Root component ───────────────────────────────────────────────────────── //
export default function PlasmidMap({ tab }) {
  const [layout,     setLayout]     = useState(null);
  const [error,      setError]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [mode,       setMode]       = useState("circular");
  const [selected,   setSelected]   = useState(null);
  const [showGC,     setShowGC]     = useState(true);
  const [showSites,  setShowSites]  = useState(true);
  const [singleOnly, setSingleOnly] = useState(false);
  const prevTabId = useRef(null);

  useEffect(() => {
    if (prevTabId.current === tab.id) return;
    prevTabId.current = tab.id;
    setLoading(true);
    setError(null);
    setSelected(null);

    let req;
    if (tab.meta?.source === "circuit" && tab.meta?.result) {
      req = seqmapRender({ compile_result: tab.meta.result });
    } else {
      req = seqmapRender({
        filename: tab.filePath || tab.title || "sequence",
        content:  tab.content || tab.meta?.content || "",
        topology: tab.meta?.topology ?? null,
      });
    }

    req.then(setLayout)
       .catch((e) => setError(e.message))
       .finally(() => setLoading(false));
  });

  // ── Loading / error states ──────────────────────────────────────────── //
  if (loading) {
    return (
      <div className="pm-root pm-state">
        <div className="pm-spinner" />
        <p>Building plasmid map…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="pm-root pm-state pm-error-state">
        <span style={{ fontSize: 32 }}>⚠</span>
        <p>{error}</p>
      </div>
    );
  }
  if (!layout || layout.length === 0) {
    return (
      <div className="pm-root pm-state">
        <span style={{ fontSize: 32, opacity: 0.35 }}>🧬</span>
        <p style={{ color: "var(--text-muted)" }}>No sequence to display.</p>
      </div>
    );
  }

  const { features, restriction_sites, name, length: len, topology } = layout;

  // ── Render ─────────────────────────────────────────────────────────── //
  return (
    <div className="pm-root">
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="pm-toolbar">
        <span className="pm-name">{name}</span>
        <span className="pm-meta">{len.toLocaleString()} bp · {topology}</span>

        <div className="pm-segmented">
          <button className={`bio-btn pm-seg${mode === "circular" ? " active" : ""}`}
            onClick={() => setMode("circular")} title="Circular map">⊙ Circular</button>
          <button className={`bio-btn pm-seg${mode === "linear" ? " active" : ""}`}
            onClick={() => setMode("linear")} title="Linear map">⇌ Linear</button>
        </div>

        <label className="pm-check">
          <input type="checkbox" checked={showGC}
            onChange={(e) => setShowGC(e.target.checked)} />
          GC ring
        </label>
        <label className="pm-check">
          <input type="checkbox" checked={showSites}
            onChange={(e) => setShowSites(e.target.checked)} />
          Cut sites
        </label>
        {showSites && (
          <label className="pm-check">
            <input type="checkbox" checked={singleOnly}
              onChange={(e) => setSingleOnly(e.target.checked)} />
            Single only
          </label>
        )}

        {selected !== null && (
          <button className="bio-btn ghost pm-clear"
            onClick={() => setSelected(null)} title="Clear selection">✕</button>
        )}
      </div>

      {/* ── Map canvas ────────────────────────────────────────────────── */}
      <div className="pm-canvas">
        {mode === "circular" ? (
          <CircularMap layout={layout} selected={selected} onSelect={setSelected}
            showGC={showGC} showSites={showSites} singleOnly={singleOnly} />
        ) : (
          <LinearMap layout={layout} selected={selected} onSelect={setSelected}
            showSites={showSites} singleOnly={singleOnly} />
        )}
      </div>

      {/* ── Feature legend ────────────────────────────────────────────── */}
      {features.length > 0 && (
        <div className="pm-legend">
          <div className="pm-legend-title">Features ({features.length})</div>
          <div className="pm-legend-grid">
            {features.map((f, i) => (
              <div key={i}
                className={`pm-legend-item${selected === i ? " active" : ""}`}
                onClick={() => setSelected(selected === i ? null : i)}
                title={`${f.type} · ${f.start}–${f.end} · ${f.strand === 1 ? "+" : "−"}`}
              >
                <span className="pm-legend-swatch" style={{ background: f.color }} />
                <span className="pm-legend-label">{f.label}</span>
                <span className="pm-legend-pos">
                  {f.start.toLocaleString()}–{f.end.toLocaleString()}
                </span>
                <span className="pm-legend-strand">{f.strand === 1 ? "+" : "−"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Selection detail panel ────────────────────────────────────── */}
      {selected !== null && features[selected] && (() => {
        const f = features[selected];
        const span = f.end - f.start;
        return (
          <div className="pm-detail">
            <span className="pm-detail-dot" style={{ background: f.color }} />
            <strong>{f.label}</strong>
            <span className="pm-detail-type">{f.type}</span>
            <span className="pm-detail-pos">
              {f.start.toLocaleString()}–{f.end.toLocaleString()} ({span.toLocaleString()} bp)
            </span>
            <span className="pm-detail-strand">strand {f.strand === 1 ? "(+)" : "(−)"}</span>
          </div>
        );
      })()}
    </div>
  );
}
