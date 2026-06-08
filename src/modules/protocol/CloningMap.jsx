import { useEffect, useRef, useState } from "react";
import { getCloningMap } from "../../shared/lib/api/client.js";

const SVG_W = 900;
const SVG_H_LINEAR = 260;
const SVG_H_CIRCULAR = 440;
const TRACK_Y = 100;
const TRACK_H = 40;
const CX = SVG_W / 2;
const CY = 210;

export default function CloningMap({ result, method = "gibson" }) {
  const [mapData, setMapData] = useState(null);
  const [topology, setTopology] = useState("linear");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    if (!result) return;
    setLoading(true);
    setError(null);
    getCloningMap(result, method, topology)
      .then(setMapData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [result, method, topology]);

  if (!result) return null;

  const svgH = topology === "circular" ? SVG_H_CIRCULAR : SVG_H_LINEAR;

  return (
    <div className="cloning-map">
      <div className="cloning-map-toolbar">
        <span className="cloning-map-title">Cloning Map</span>
        <div className="cloning-map-toggle">
          <button
            className={`btn-ghost ${topology === "linear" ? "active" : ""}`}
            onClick={() => setTopology("linear")}
          >
            Linear
          </button>
          <button
            className={`btn-ghost ${topology === "circular" ? "active" : ""}`}
            onClick={() => setTopology("circular")}
          >
            Circular
          </button>
        </div>
        {mapData && (
          <span className="cloning-map-info">{mapData.total_bp.toLocaleString()} bp total</span>
        )}
      </div>

      {loading && <div className="diff-loading">Computing map…</div>}
      {error && <div className="dsl-error">{error}</div>}

      {mapData && !loading && (
        <>
          <div className="cloning-map-svg-wrap" style={{ position: "relative" }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_W} ${svgH}`}
              width="100%"
              style={{ display: "block", maxHeight: svgH }}
              onMouseLeave={() => setTooltip(null)}
            >
              {topology === "linear"
                ? <LinearMap data={mapData} onHover={setTooltip} />
                : <CircularMap data={mapData} onHover={setTooltip} />}
            </svg>
            {tooltip && (
              <div className="cloning-map-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
                {tooltip.text}
              </div>
            )}
          </div>
          <Legend data={mapData} />
        </>
      )}
    </div>
  );
}

// ---- Linear renderer ------------------------------------------------------- //

function LinearMap({ data, onHover }) {
  const { parts, total_bp, restriction_sites: rsites, primer_sites: psites } = data;
  if (!total_bp) return null;
  const scale = (bp) => (bp / total_bp) * (SVG_W - 80) + 40;

  return (
    <g>
      {/* Backbone line */}
      <line x1={40} y1={TRACK_Y + TRACK_H / 2} x2={SVG_W - 40} y2={TRACK_Y + TRACK_H / 2}
        stroke="#475569" strokeWidth={2} />

      {/* Parts */}
      {parts.map((p) => {
        const x = scale(p.start);
        const w = Math.max(scale(p.end) - x, 4);
        return (
          <g key={p.name}>
            <rect
              x={x} y={TRACK_Y} width={w} height={TRACK_H}
              fill={p.color} rx={4}
              onMouseEnter={(e) => onHover({ x: e.clientX, y: e.clientY - 40, text: `${p.name} (${p.bp} bp)` })}
              style={{ cursor: "pointer" }}
            />
            {w > 30 && (
              <text
                x={x + w / 2} y={TRACK_Y + TRACK_H / 2 + 5}
                textAnchor="middle" fontSize={11} fill="#fff" fontWeight={600}
                style={{ pointerEvents: "none" }}
              >
                {p.name.length > 10 ? p.name.slice(0, 9) + "…" : p.name}
              </text>
            )}
            {/* size label below */}
            <text
              x={x + w / 2} y={TRACK_Y + TRACK_H + 16}
              textAnchor="middle" fontSize={9} fill="#94a3b8"
              style={{ pointerEvents: "none" }}
            >
              {p.bp} bp
            </text>
          </g>
        );
      })}

      {/* Restriction sites */}
      {rsites.map((rs, i) => {
        const x = scale(rs.position);
        return (
          <g key={i}>
            <line x1={x} y1={TRACK_Y - 14} x2={x} y2={TRACK_Y + TRACK_H + 14}
              stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3,2" />
            <text x={x} y={TRACK_Y - 18} textAnchor="middle" fontSize={8} fill="#f59e0b"
              onMouseEnter={(e) => onHover({ x: e.clientX, y: e.clientY - 40, text: `${rs.enzyme} @${rs.position}` })}
            >
              {rs.enzyme}
            </text>
          </g>
        );
      })}

      {/* Primer arrows */}
      {psites.map((ps, i) => {
        const x1 = scale(ps.start);
        const x2 = scale(ps.end);
        const arrowY = ps.strand === 1 ? TRACK_Y - 28 : TRACK_Y + TRACK_H + 28;
        const arrowHead = ps.strand === 1
          ? `M${x2},${arrowY} L${x2 - 6},${arrowY - 5} L${x2 - 6},${arrowY + 5}Z`
          : `M${x1},${arrowY} L${x1 + 6},${arrowY - 5} L${x1 + 6},${arrowY + 5}Z`;
        return (
          <g key={i}
            onMouseEnter={(e) => onHover({ x: e.clientX, y: e.clientY - 40, text: `${ps.name} Tm=${ps.tm}°C` })}
            style={{ cursor: "pointer" }}
          >
            <line x1={x1} y1={arrowY} x2={x2} y2={arrowY} stroke="#38bdf8" strokeWidth={2} />
            <path d={arrowHead} fill="#38bdf8" />
          </g>
        );
      })}
    </g>
  );
}

// ---- Circular renderer ----------------------------------------------------- //

const R_OUTER = 140;
const R_INNER = 100;

function CircularMap({ data, onHover }) {
  const { parts, total_bp, restriction_sites: rsites, primer_sites: psites } = data;
  if (!total_bp) return null;

  const toAngle = (bp) => (bp / total_bp) * 2 * Math.PI - Math.PI / 2;
  const arc = (startBp, endBp, r) => {
    const a1 = toAngle(startBp);
    const a2 = toAngle(endBp);
    const large = endBp - startBp > total_bp / 2 ? 1 : 0;
    const x1 = CX + r * Math.cos(a1);
    const y1 = CY + r * Math.sin(a1);
    const x2 = CX + r * Math.cos(a2);
    const y2 = CY + r * Math.sin(a2);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  const sectorPath = (p, rOuter, rInner) => {
    const a1 = toAngle(p.start);
    const a2 = toAngle(p.end);
    const large = p.end - p.start > total_bp / 2 ? 1 : 0;
    const ox1 = CX + rOuter * Math.cos(a1), oy1 = CY + rOuter * Math.sin(a1);
    const ox2 = CX + rOuter * Math.cos(a2), oy2 = CY + rOuter * Math.sin(a2);
    const ix1 = CX + rInner * Math.cos(a2), iy1 = CY + rInner * Math.sin(a2);
    const ix2 = CX + rInner * Math.cos(a1), iy2 = CY + rInner * Math.sin(a1);
    return `M ${ox1} ${oy1} A ${rOuter} ${rOuter} 0 ${large} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${rInner} ${rInner} 0 ${large} 0 ${ix2} ${iy2} Z`;
  };

  return (
    <g>
      {/* Outer backbone ring */}
      <circle cx={CX} cy={CY} r={R_OUTER} fill="none" stroke="#475569" strokeWidth={2} />
      <circle cx={CX} cy={CY} r={R_INNER} fill="none" stroke="#334155" strokeWidth={1} />

      {/* Total bp label */}
      <text x={CX} y={CY + 6} textAnchor="middle" fontSize={14} fill="#94a3b8" fontWeight={600}>
        {total_bp.toLocaleString()} bp
      </text>

      {/* Part sectors */}
      {parts.map((p) => {
        const midAngle = toAngle((p.start + p.end) / 2);
        const labelR = R_OUTER + 22;
        const lx = CX + labelR * Math.cos(midAngle);
        const ly = CY + labelR * Math.sin(midAngle);
        return (
          <g key={p.name}
            onMouseEnter={(e) => onHover({ x: e.clientX, y: e.clientY - 40, text: `${p.name} (${p.bp} bp)` })}
            style={{ cursor: "pointer" }}
          >
            <path d={sectorPath(p, R_OUTER, R_INNER)} fill={p.color} opacity={0.85} />
            <text x={lx} y={ly + 4} textAnchor="middle" fontSize={10} fill="#e2e8f0">
              {p.name.length > 9 ? p.name.slice(0, 8) + "…" : p.name}
            </text>
          </g>
        );
      })}

      {/* Restriction sites */}
      {rsites.map((rs, i) => {
        const a = toAngle(rs.position);
        const x1 = CX + (R_INNER - 8) * Math.cos(a);
        const y1 = CY + (R_INNER - 8) * Math.sin(a);
        const x2 = CX + (R_OUTER + 8) * Math.cos(a);
        const y2 = CY + (R_OUTER + 8) * Math.sin(a);
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3,2"
            onMouseEnter={(e) => onHover({ x: e.clientX, y: e.clientY - 40, text: `${rs.enzyme} @${rs.position}` })}
            style={{ cursor: "pointer" }}
          />
        );
      })}

      {/* Primer arcs */}
      {psites.map((ps, i) => {
        const r = ps.strand === 1 ? R_OUTER + 12 : R_INNER - 12;
        return (
          <path key={i} d={arc(ps.start, ps.end, r)}
            fill="none" stroke="#38bdf8" strokeWidth={3}
            markerEnd="url(#primer-arrow)"
            onMouseEnter={(e) => onHover({ x: e.clientX, y: e.clientY - 40, text: `${ps.name} Tm=${ps.tm}°C` })}
            style={{ cursor: "pointer" }}
          />
        );
      })}

      <defs>
        <marker id="primer-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6Z" fill="#38bdf8" />
        </marker>
      </defs>
    </g>
  );
}

// ---- Legend ---------------------------------------------------------------- //

function Legend({ data }) {
  return (
    <div className="cloning-map-legend">
      {data.parts.map((p) => (
        <div key={p.name} className="legend-item">
          <span className="legend-swatch" style={{ background: p.color }} />
          <span className="legend-name">{p.name}</span>
          <span className="legend-bp">{p.bp} bp</span>
        </div>
      ))}
      {data.restriction_sites.length > 0 && (
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: "#f59e0b" }} />
          <span className="legend-name">Restriction sites ({data.restriction_sites.length})</span>
        </div>
      )}
      {data.primer_sites.length > 0 && (
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: "#38bdf8" }} />
          <span className="legend-name">Primer sites ({data.primer_sites.length})</span>
        </div>
      )}
    </div>
  );
}
