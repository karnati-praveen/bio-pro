import { useState } from "react";
import { useTabStore } from "../shared/stores/tabStore.js";
import { maybeCloseTab } from "./commands.js";

// Tab strip: compact 35px tabs, file-type accent top border, hover-close,
// middle-click close, drag-to-reorder, drag-to-split.
export default function TabStrip({ group }) {
  const tabsById    = useTabStore((s) => s.tabsById);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const pinTab      = useTabStore((s) => s.pinTab);
  const moveTab     = useTabStore((s) => s.moveTab);
  const splitRight  = useTabStore((s) => s.splitRight);
  const [dragIndex, setDragIndex] = useState(null);

  if (!group) return null;

  return (
    <div className="tab-strip">
      {group.tabIds.map((id, i) => {
        const tab = tabsById[id];
        if (!tab) return null;
        const isActive = group.activeTabId === id;
        return (
          <div
            key={id}
            className={`tab${isActive ? " active" : ""}${tab.pinned ? " pinned" : ""}${tab.dirty ? " dirty" : ""}`}
            data-type={tab.type}
            title={tab.filePath || tab.title}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== i) moveTab(group.id, dragIndex, i);
              setDragIndex(null);
            }}
            onClick={() => setActiveTab(id)}
            onDoubleClick={() => pinTab(id)}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); maybeCloseTab(id); } }}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-name">{tab.title}</span>
            {tab.dirty
              ? <span className="tab-dot" title="Unsaved changes">●</span>
              : null}
            <button
              className="tab-close"
              title="Close (middle-click or ×)"
              onClick={(e) => { e.stopPropagation(); maybeCloseTab(id); }}
            >
              ×
            </button>
          </div>
        );
      })}
      <div
        className="tab-split-zone"
        title="Drop a tab here to split"
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (dragIndex !== null) splitRight(group.tabIds[dragIndex]);
          setDragIndex(null);
        }}
      />
    </div>
  );
}
