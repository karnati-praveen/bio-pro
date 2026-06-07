import { useUiStore } from "../shared/stores/uiStore.js";
import { useTabStore } from "../shared/stores/tabStore.js";
import { useCircuitStore } from "../shared/stores/circuitStore.js";
import ProblemsPanel from "../shared/ui/ProblemsPanel.jsx";
import CitationsPanel from "../modules/citations/CitationsPanel.jsx";
import SimConsolePanel from "../modules/simulation/SimConsolePanel.jsx";
import OutputLogPanel from "../shared/ui/OutputLogPanel.jsx";
import TerminalPanel from "../shared/ui/TerminalPanel.jsx";

const STATIC_TABS = [
  { id: "problems",  label: "Problems" },
  { id: "console",   label: "Simulation Console" },
  { id: "citations", label: "Citations" },
  { id: "output",    label: "Output" },
  { id: "terminal",  label: "Terminal" },
];

export default function BottomPanel() {
  const bottomTab = useUiStore((s) => s.bottomTab);
  const setBottomTab = useUiStore((s) => s.setBottomTab);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const extTabs = useUiStore((s) => s.bottomTabs); // extension-contributed tabs

  const activeTab = useTabStore((s) => s.activeTab());
  const byTab = useCircuitStore((s) => s.byTab);
  const findings = (activeTab && byTab[activeTab.id]?.findings) || [];
  const problemCount = findings.length;

  const allTabs = [...STATIC_TABS, ...extTabs];

  return (
    <div className="bottom-panel">
      <div className="bottom-tab-bar">
        {allTabs.map((t) => (
          <button
            key={t.id}
            className={`bottom-tab${bottomTab === t.id ? " active" : ""}`}
            onClick={() => setBottomTab(t.id)}
          >
            {t.label}
            {t.id === "problems" && problemCount > 0 && (
              <span className="bottom-tab-badge">{problemCount}</span>
            )}
          </button>
        ))}
        <div className="bottom-tab-spacer" />
        <button className="bottom-collapse" title="Hide panel (Ctrl+J)" onClick={togglePanel}>⌄</button>
      </div>
      <div className="bottom-content">
        {bottomTab === "problems"  && <ProblemsPanel />}
        {bottomTab === "console"   && <SimConsolePanel />}
        {bottomTab === "citations" && <CitationsPanel />}
        {bottomTab === "output"    && <OutputLogPanel />}
        {bottomTab === "terminal"  && <TerminalPanel />}
      </div>
    </div>
  );
}
