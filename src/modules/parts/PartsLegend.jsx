// Static key mapping part types -> colors/glyphs used in the circuit diagram.
const LEGEND = [
  { type: "promoter", glyph: "→", label: "Promoter", color: "var(--feat-promoter)" },
  { type: "cds", glyph: "▭", label: "Gene (CDS)", color: "var(--feat-cds)" },
  { type: "inducer", glyph: "◆", label: "Inducer", color: "var(--parts-inducer)" },
  { type: "rbs", glyph: "○", label: "RBS", color: "var(--info)" },
  { type: "terminator", glyph: "⊤", label: "Terminator", color: "var(--text-muted)" },
  { type: "logic", glyph: "⋈", label: "Logic gate", color: "var(--text-muted)" },
];

const EDGES = [
  { label: "expresses / activates (→)", color: "var(--accent)" },
  { label: "represses (⊣)", color: "var(--error)" },
  { label: "inhibits inducer→repressor (⊣ dashed)", color: "var(--feat-operator)" },
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
