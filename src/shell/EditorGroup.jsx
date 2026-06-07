import TabStrip from "./TabStrip.jsx";
import { useTabStore } from "../shared/stores/tabStore.js";
import { resolveEditor } from "./editorRegistry.js";

// One editor pane: its tab strip plus the active tab's resolved editor component.
export default function EditorGroup({ group }) {
  const tabsById = useTabStore((s) => s.tabsById);
  const setActiveGroup = useTabStore((s) => s.setActiveGroup);
  const activeGroupId = useTabStore((s) => s.activeGroupId);

  const activeTab = group.activeTabId ? tabsById[group.activeTabId] : null;
  const Editor = activeTab ? resolveEditor(activeTab.type) : null;

  return (
    <div
      className={`editor-group${activeGroupId === group.id ? " focused" : ""}`}
      onMouseDown={() => setActiveGroup(group.id)}
    >
      <TabStrip group={group} />
      <div className="editor-host">
        {activeTab ? (
          <Editor key={activeTab.id} tab={activeTab} tabId={activeTab.id} />
        ) : (
          <div className="editor-empty">
            <p>No file open.</p>
            <p className="hint">Open a folder from the Explorer, or press <kbd>Ctrl+N</kbd> for a new circuit.</p>
          </div>
        )}
      </div>
    </div>
  );
}
