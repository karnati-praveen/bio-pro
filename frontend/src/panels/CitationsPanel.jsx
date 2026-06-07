import { useTabStore } from "../stores/tabStore.js";
import { useCircuitStore } from "../stores/circuitStore.js";

// Lists literature citations collected during compile (parts' source DOIs,
// pattern references, kinetic-parameter sources) from the active circuit tab.
export default function CitationsPanel() {
  const activeTab = useTabStore((s) => s.activeTab());
  const byTab = useCircuitStore((s) => s.byTab);
  const citations = (activeTab && byTab[activeTab.id]?.result?.citations) || [];

  if (citations.length === 0) {
    return <div className="panel-empty">No citations yet — compile a circuit.</div>;
  }

  return (
    <ul className="citations-list">
      {citations.map((c, i) => (
        <li key={`${c.doi}-${i}`} className="citation-item">
          <div className="citation-title">{c.title || c.doi}</div>
          <div className="citation-meta">
            {[c.authors, c.journal, c.year].filter(Boolean).join(" · ")}
          </div>
          {c.context && <div className="citation-context">{c.context}</div>}
          <a
            className="citation-doi"
            href={c.url || `https://doi.org/${c.doi}`}
            target="_blank"
            rel="noreferrer"
          >
            {c.doi}
          </a>
        </li>
      ))}
    </ul>
  );
}
