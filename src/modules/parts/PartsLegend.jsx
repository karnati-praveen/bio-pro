// Static key mapping part types -> colors/glyphs used in the circuit diagram.
const LEGEND = [
  { type: "promoter", glyph: "→", label: "Promoter", color: "#8ecae6" },
  { type: "cds", glyph: "▭", label: "Gene (CDS)", color: "#52b788" },
  { type: "inducer", glyph: "◆", label: "Inducer", color: "#cdb4db" },
  { type: "rbs", glyph: "○", label: "RBS", color: "#bde0fe" },
  { type: "terminator", glyph: "⊤", label: "Terminator", color: "#c8c8c8" },
  { type: "logic", glyph: "⋈", label: "Logic gate", color: "#6c757d" },
];

const EDGES = [
  { label: "expresses / activates (→)", color: "#2a9d8f" },
  { label: "represses (⊣)", color: "#e76f51" },
  { label: "inhibits inducer→repressor (⊣ dashed)", color: "#9d4edd" },
];

export default function PartsLegend() {
  return (
    <div className="legend">
      <div className="legend-group">
        <span className="legend-title">Parts</span>
        {LEGEND.map((l) => (
          <span className="legend-item" key={l.type}>
            <span className="legend-swatch" style={{ background: l.color }}>
              {l.glyph}
            </span>
            {l.label}
          </span>
        ))}
      </div>
      <div className="legend-group">
        <span className="legend-title">Edges</span>
        {EDGES.map((e) => (
          <span className="legend-item" key={e.label}>
            <span className="legend-line" style={{ background: e.color }} />
            {e.label}
          </span>
        ))}
      </div>
    </div>
  );
}
