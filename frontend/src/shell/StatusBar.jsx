import { VscError, VscWarning, VscSourceControl } from "react-icons/vsc";
import { useUiStore } from "../stores/uiStore.js";
import { useTabStore } from "../stores/tabStore.js";
import { useCircuitStore } from "../stores/circuitStore.js";
import { typeInfoForFile } from "../lib/fileTypes.js";
import NotificationStrip from "../components/NotificationStrip.jsx";
import InputBoxOverlay from "../components/InputBoxOverlay.jsx";

export default function StatusBar() {
  const status = useUiStore((s) => s.status);
  const theme = useUiStore((s) => s.theme);
  const progress = useUiStore((s) => s.progress);
  const setBottomTab = useUiStore((s) => s.setBottomTab);

  const activeTab = useTabStore((s) => s.activeTab());
  const byTab = useCircuitStore((s) => s.byTab);
  const session = activeTab ? byTab[activeTab.id] : null;

  const findings = session?.findings || [];
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const organism = session?.organism || session?.result?.organism || "no host";
  const fileType = activeTab?.filePath
    ? typeInfoForFile(activeTab.filePath).editor
    : (activeTab?.type || "—");
  const simStatus = session?.loading
    ? "compiling…"
    : session?.result
    ? "compiled"
    : "idle";

  return (
    <>
      <NotificationStrip />
      <InputBoxOverlay />
      <div className="status-bar">
        <div className="status-left">
          <button className="status-item" onClick={() => setBottomTab("problems")} title="Problems">
            <VscError size={13} /> {errors}
            <VscWarning size={13} style={{ marginLeft: 6 }} /> {warnings}
          </button>
          <span className="status-item"><VscSourceControl size={13} /> main</span>
        </div>
        <div className="status-right">
          <span className="status-item">host: {organism}</span>
          <span className="status-item">{fileType}</span>
          <span className="status-item">sim: {simStatus}</span>
          <span className="status-item">{theme}</span>
          {progress && (
            <span className="status-item status-progress" title={progress.message || progress.title}>
              <span className="progress-spinner" aria-label="busy" />
              {progress.message || progress.title}
            </span>
          )}
          <span className="status-item status-message">{status}</span>
        </div>
      </div>
    </>
  );
}
