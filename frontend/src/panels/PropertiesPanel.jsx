import { usePartsStore } from "../stores/partsStore.js";
import { useTabStore } from "../stores/tabStore.js";
import { useCircuitStore } from "../stores/circuitStore.js";

// Context-sensitive right panel. Phase 1: show the part selected in the Parts
// Library, otherwise summarise the active circuit's compiled spec.
export default function PropertiesPanel() {
  const parts = usePartsStore((s) => s.parts);
  const selectedPartId = usePartsStore((s) => s.selectedPartId);
  const activeTab = useTabStore((s) => s.activeTab());
  const byTab = useCircuitStore((s) => s.byTab);

  const part = selectedPartId && parts?.parts?.find((p) => p.id === selectedPartId);

  if (part) {
    const kp = part.kinetic_parameters || {};
    return (
      <div className="properties">
        <h3>{part.name}</h3>
        <div className="prop-id">{part.part_id || part.id}</div>
        <dl className="prop-list">
          <dt>Type</dt><dd>{part.type}{part.role ? ` · ${part.role}` : ""}</dd>
          <dt>Hosts</dt><dd>{(part.host_compatibility || []).join(", ") || "—"}</dd>
          {part.strength != null && (<><dt>Strength</dt><dd>{part.strength}</dd></>)}
          {Object.entries(kp).map(([k, v]) => (
            <span key={k}><dt>{k}</dt><dd>{String(v)}</dd></span>
          ))}
          {part.source_doi && (
            <><dt>Source</dt><dd>
              <a href={`https://doi.org/${part.source_doi}`} target="_blank" rel="noreferrer">{part.source_doi}</a>
            </dd></>
          )}
        </dl>
        {part.description && <p className="prop-desc">{part.description}</p>}
        {part.seq && <code className="prop-seq">{part.seq.slice(0, 120)}{part.seq.length > 120 ? "…" : ""}</code>}
      </div>
    );
  }

  const spec = activeTab && byTab[activeTab.id]?.result?.spec;
  if (spec) {
    return (
      <div className="properties">
        <h3>Circuit spec</h3>
        <dl className="prop-list">
          <dt>Output</dt><dd>{spec.output}</dd>
          <dt>Pattern</dt><dd>{spec.pattern}</dd>
          <dt>Organism</dt><dd>{spec.organism || "any"}</dd>
          <dt>Triggers</dt><dd>{spec.triggers?.map((t) => `${t.inducer} (${t.presence})`).join(", ") || "—"}</dd>
        </dl>
      </div>
    );
  }

  return <div className="panel-empty">Select a part or compile a circuit to see properties.</div>;
}
