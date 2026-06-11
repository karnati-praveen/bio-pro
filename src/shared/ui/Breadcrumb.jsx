import { useTabStore } from "../stores/tabStore.js";
import { useBioProjectStore } from "../stores/bioProjectStore.js";
import { useCircuitStore } from "../stores/circuitStore.js";

const EDITOR_LABELS = {
  welcome:    "Welcome",
  templates:  "Templates",
  circuit:    "Circuit",
  plasmid:    "Plasmid Map",
  sequence:   "Sequence",
  webview:    "Web",
  simulation: "Simulation",
  molecule:   "Molecule",
  reaction:   "Reaction",
  spectrum:   "Spectrum",
  titration:  "Titration",
  protocol:   "Protocol",
  notebook:   "Notebook",
  pathway:    "Pathway",
  primers:    "Primers",
  crispr:     "CRISPR",
  codon:      "Codon",
  alignment:  "Alignment",
  assay:      "Assay",
};

export default function Breadcrumb() {
  const tab = useTabStore((s) => s.activeTab());
  const activeProject = useBioProjectStore((s) => s.activeProject);
  const circuitResult = useCircuitStore((s) => tab ? s.byTab[tab.id]?.result : null);

  if (!tab) return null;

  const projectName = activeProject?.name ?? "No project";
  const editorLabel = EDITOR_LABELS[tab.type] ?? tab.type ?? "Editor";
  const docName = circuitResult?.spec?.output ?? tab.title ?? "";

  const segments = [projectName, editorLabel, docName].filter(Boolean);

  return (
    <nav className="breadcrumb" aria-label="Editor location">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="breadcrumb-segment-wrap">
            {i > 0 && <span className="breadcrumb-sep" aria-hidden="true">›</span>}
            <span className={`breadcrumb-seg${isLast ? " breadcrumb-seg-active" : ""}`}>
              {seg}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
