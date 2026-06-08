import TabStrip from "./TabStrip.jsx";
import { useTabStore } from "../shared/stores/tabStore.js";
import { resolveEditor } from "./editorRegistry.js";
import ErrorBoundary from "../shared/ui/ErrorBoundary.jsx";

export default function EditorGroup({ group }) {
  const tabsById       = useTabStore((s) => s.tabsById);
  const setActiveGroup = useTabStore((s) => s.setActiveGroup);
  const activeGroupId  = useTabStore((s) => s.activeGroupId);

  const activeTab = group.activeTabId ? tabsById[group.activeTabId] : null;
  const Editor    = activeTab ? resolveEditor(activeTab.type) : null;

  return (
    <div
      className={`editor-group${activeGroupId === group.id ? " focused" : ""}`}
      onMouseDown={() => setActiveGroup(group.id)}
    >
      <TabStrip group={group} />
      <div className="editor-host">
        {activeTab ? (
          <ErrorBoundary key={activeTab.id}>
            <Editor tab={activeTab} tabId={activeTab.id} />
          </ErrorBoundary>
        ) : (
          <div className="editor-empty">
            <div style={{ fontSize: 40, opacity: 0.35 }}>🧪</div>
            <p style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: 600, color: "var(--text-muted)" }}>
              No file open
            </p>
            <p className="hint">
              Press <kbd>Ctrl+N</kbd> for a new circuit,{" "}
              <kbd>Ctrl+O</kbd> to open a folder, or{" "}
              <kbd>Ctrl+Shift+P</kbd> for all commands.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
