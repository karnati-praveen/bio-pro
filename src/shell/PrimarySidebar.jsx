import { useUiStore } from "../shared/stores/uiStore.js";
import ExplorerView from "../shared/ui/ExplorerView.jsx";
import PartsLibraryView from "../modules/parts/PartsLibraryView.jsx";
import SearchView from "../shared/ui/SearchView.jsx";
import SourceControlView from "../shared/ui/SourceControlView.jsx";
import SimulationView from "../modules/simulation/SimulationView.jsx";
import SettingsView from "../modules/settings/SettingsView.jsx";
import ExtensionView from "../shared/ui/ExtensionView.jsx";

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
