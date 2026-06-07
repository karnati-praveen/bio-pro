import { useState } from "react";
import { useTabStore } from "../shared/stores/tabStore.js";

// Generalises the original EditorTabs.jsx: per-group tab row with select, close,
// pin (double-click), drag-to-reorder, and drag-to-split (drop on the split zone).
export default function TabStrip({ group }) {
  const tabsById = useTabStore((s) => s.tabsById);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const pinTab = useTabStore((s) => s.pinTab);
  const moveTab = useTabStore((s) => s.moveTab);
  const splitRight = useTabStore((s) => s.splitRight);
  const [dragIndex, setDragIndex] = useState(null);

  if (!group) return null;

  return (
    <div className="tab-strip">
      {group.tabIds.map((id, i) => {
        const tab = tabsById[id];
        if (!tab) return null;
        return (
          <div
            key={id}
            className={`tab${group.activeTabId === id ? " active" : ""}${tab.pinned ? " pinned" : ""}${tab.dirty ? " dirty" : ""}`}
            title={tab.filePath || tab.title}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIndex !== null && dragIndex !== i) moveTab(group.id, dragIndex, i); setDragIndex(null); }}
            onClick={() => setActiveTab(id)}
            onDoubleClick={() => pinTab(id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-name">{tab.title}</span>
            {tab.dirty
              ? <span className="tab-dot" title="Unsaved changes">●</span>
              : <button className="tab-close" title="Close" onClick={(e) => { e.stopPropagation(); closeTab(id); }}>×</button>}
          </div>
        );
      })}
      {/* split drop zone — drag a tab here to open a second editor group */}
      <div
        className="tab-split-zone"
        title="Drop a tab here to split"
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => { if (dragIndex !== null) splitRight(group.tabIds[dragIndex]); setDragIndex(null); }}
      />
    </div>
  );
}
