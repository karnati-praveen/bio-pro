import { useUiStore } from "../stores/uiStore.js";
import ExplorerView from "../sidebars/ExplorerView.jsx";
import PartsLibraryView from "../sidebars/PartsLibraryView.jsx";
import SearchView from "../sidebars/SearchView.jsx";
import SourceControlView from "../sidebars/SourceControlView.jsx";
import SimulationView from "../sidebars/SimulationView.jsx";
import SettingsView from "../sidebars/SettingsView.jsx";
import ExtensionView from "../sidebars/ExtensionView.jsx";

const VIEWS = {
  explorer: { title: "Explorer",        Comp: ExplorerView },
  parts:    { title: "Parts Library",   Comp: PartsLibraryView },
  search:   { title: "Search",          Comp: SearchView },
  git:      { title: "Source Control",  Comp: SourceControlView },
  sim:      { title: "Simulation",      Comp: SimulationView },
  settings: { title: "Settings",        Comp: SettingsView },
};

export default function PrimarySidebar() {
  const activity = useUiStore((s) => s.activeActivity);

  // Extension-contributed views have ids prefixed with "ext:".
  if (activity.startsWith("ext:")) {
    const viewId = activity.slice(4);
    return (
      <div className="primary-sidebar">
        <div className="sidebar-header">{viewId.toUpperCase()}</div>
        <div className="sidebar-body" style={{ padding: 0, height: "100%" }}>
          <ExtensionView viewId={viewId} />
        </div>
      </div>
    );
  }

  const { title, Comp } = VIEWS[activity] ?? VIEWS.explorer;

  return (
    <div className="primary-sidebar">
      <div className="sidebar-header">{title.toUpperCase()}</div>
      <div className="sidebar-body">
        <Comp />
      </div>
    </div>
  );
}
