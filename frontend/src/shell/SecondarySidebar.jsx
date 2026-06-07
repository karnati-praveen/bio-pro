import { useUiStore } from "../stores/uiStore.js";
import PropertiesPanel from "../panels/PropertiesPanel.jsx";

// Collapsible right-hand Properties panel, context-sensitive to the active editor.
export default function SecondarySidebar() {
  const visible = useUiStore((s) => s.secondaryVisible);
  const toggle = useUiStore((s) => s.toggleSecondary);
  if (!visible) return null;
  return (
    <div className="secondary-sidebar">
      <div className="sidebar-header">
        PROPERTIES
        <button className="sidebar-header-btn" title="Hide" onClick={toggle}>×</button>
      </div>
      <div className="sidebar-body">
        <PropertiesPanel />
      </div>
    </div>
  );
}
