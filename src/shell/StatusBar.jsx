import { useState } from "react";
import { VscError, VscWarning, VscSourceControl, VscColorMode, VscProject } from "react-icons/vsc";
import { useUiStore } from "../shared/stores/uiStore.js";
import { useTabStore } from "../shared/stores/tabStore.js";
import { useCircuitStore } from "../shared/stores/circuitStore.js";
import { useGitStore } from "../modules/git/gitStore.js";
import { useBioProjectStore } from "../shared/stores/bioProjectStore.js";
import { typeInfoForFile } from "../shared/lib/fileTypes.js";
import NotificationStrip from "../shared/ui/NotificationStrip.jsx";
import InputBoxOverlay from "../shared/ui/InputBoxOverlay.jsx";
import ToastContainer from "../shared/ui/ToastContainer.jsx";
import ProjectPickerModal from "../shared/ui/ProjectPickerModal.jsx";

export default function StatusBar() {
  const status      = useUiStore((s) => s.status);
  const theme       = useUiStore((s) => s.theme);
  const progress    = useUiStore((s) => s.progress);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const setBottomTab = useUiStore((s) => s.setBottomTab);

  const activeTab = useTabStore((s) => s.activeTab());
  const byTab     = useCircuitStore((s) => s.byTab);
  const session   = activeTab ? byTab[activeTab.id] : null;
  const gitBranch = useGitStore((s) => s.branch);

  const activeProject = useBioProjectStore((s) => s.activeProject);
  const [showPicker, setShowPicker] = useState(false);

  const findings  = session?.findings || [];
  const errors    = findings.filter((f) => f.severity === "error").length;
  const warnings  = findings.filter((f) => f.severity === "warning").length;
  const organism  = session?.organism || session?.result?.organism || null;
  const fileType  = activeTab?.filePath
    ? typeInfoForFile(activeTab.filePath).editor
    : (activeTab?.type || null);
  const simStatus = session?.loading ? "compiling…" : session?.result ? "compiled ✓" : null;

  return (
    <>
      <ToastContainer />
      <NotificationStrip />
      <InputBoxOverlay />
      {showPicker && <ProjectPickerModal onClose={() => setShowPicker(false)} />}
      <div className="status-bar">
        <div className="status-left">
          <button
            className="status-item"
            onClick={() => setBottomTab("problems")}
            title={`${errors} error(s), ${warnings} warning(s) — click to open Problems`}
          >
            <VscError size={12} />
            <span>{errors}</span>
            <VscWarning size={12} style={{ marginLeft: 4 }} />
            <span>{warnings}</span>
          </button>
          {(gitBranch || true) && (
            <span className="status-item" title="Git branch">
              <VscSourceControl size={12} />
              <span>{gitBranch || "main"}</span>
            </span>
          )}
          <button
            className={`status-item status-project${activeProject ? " status-project-active" : ""}`}
            onClick={() => setShowPicker(true)}
            title={activeProject ? `Project: ${activeProject.name} — click to switch` : "No project — click to open or create one"}
          >
            <VscProject size={12} />
            <span>{activeProject ? activeProject.name : "No project"}</span>
          </button>
        </div>

        <div className="status-right">
          {progress && (
            <span className="status-item status-progress" title={progress.message || progress.title}>
              <span className="progress-spinner" aria-label="busy" />
              {progress.message || progress.title}
            </span>
          )}
          {status && status !== "Ready" && (
            <span className="status-item status-message" title={status}>{status}</span>
          )}
          {simStatus && <span className="status-item" title="Simulation status">{simStatus}</span>}
          {organism && <span className="status-item" title="Host organism">host: {organism}</span>}
          {fileType && <span className="status-item" title="File type">{fileType}</span>}
          <button
            className="status-item"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={toggleTheme}
          >
            <VscColorMode size={12} />
            <span>{theme}</span>
          </button>
        </div>
      </div>
    </>
  );
}
