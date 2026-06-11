import { VscError, VscWarning, VscInfo } from "react-icons/vsc";
import { useTabStore } from "../stores/tabStore.js";
import { useCircuitStore } from "../stores/circuitStore.js";
import { useMarkersStore } from "../stores/markersStore.js";
import EmptyState from "./primitives/EmptyState.jsx";

const SEV_ICON = {
  error: <VscError className="sev-error" />,
  warning: <VscWarning className="sev-warning" />,
  info: <VscInfo className="sev-info" />,
};

function _markerSeverityLabel(severity) {
  // Monaco MarkerSeverity: Error=8, Warning=4, Info=2, Hint=1
  if (severity >= 8) return "error";
  if (severity >= 4) return "warning";
  return "info";
}

export default function ProblemsPanel() {
  const activeTab = useTabStore((s) => s.activeTab());
  const byTab = useCircuitStore((s) => s.byTab);
  const byPath = useMarkersStore((s) => s.byPath);
  const setFocusTarget = useCircuitStore((s) => s.setFocusTarget);

  // Bio-compiler findings from the active circuit tab.
  const compilerFindings = (activeTab && byTab[activeTab.id]?.findings) || [];

  // Extension-contributed Monaco markers for the active file.
  const activeFilePath = activeTab?.filePath ?? "";
  const extensionFindings = activeFilePath
    ? Object.entries(byPath)
        .filter(([path]) => path === activeFilePath || path.endsWith(activeFilePath) || activeFilePath.endsWith(path))
        .flatMap(([, markers]) =>
          markers.map((m) => ({
            severity: _markerSeverityLabel(m.severity),
            message: m.message,
            code: m.source ?? m.code ?? "ext",
            target: `${m.startLineNumber}:${m.startColumn}`,
            source: m.source,
          }))
        )
    : [];

  const findings = [...compilerFindings, ...extensionFindings];

  const handleClick = (f) => {
    if (!f.target || !activeTab?.id) return;
    setFocusTarget(activeTab.id, f.target);
  };

  if (!activeTab) {
    return <EmptyState title="Open a file to see problems." />;
  }
  if (findings.length === 0) {
    return <EmptyState icon="✓" title="No problems detected." />;
  }

  return (
    <ul className="problems-list">
      {findings.map((f, i) => (
        <li
          key={`${f.code}-${i}`}
          className={`problem-item${f.target ? " problem-item--locatable" : ""}`}
          onClick={() => handleClick(f)}
          title={f.target ? "Click to locate in diagram / editor" : undefined}
        >
          <span className="problem-icon">{SEV_ICON[f.severity] ?? SEV_ICON.info}</span>
          <div className="problem-body">
            <div className="problem-message">{f.message}</div>
            <div className="problem-meta">
              {f.code}{f.target ? ` · ${f.target}` : ""}{f.source ? ` [${f.source}]` : ""}
            </div>
            {f.fix_suggestion && (
              <div className="problem-fix">
                💡 <strong>Suggested fix:</strong> {f.fix_suggestion}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
