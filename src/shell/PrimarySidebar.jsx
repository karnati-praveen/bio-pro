import { VscRefresh, VscNewFile, VscNewFolder, VscCollapseAll } from "react-icons/vsc";
import { useUiStore } from "../shared/stores/uiStore.js";
import { PanelHeader } from "../shared/ui/primitives/index.js";
import ExplorerView from "../shared/ui/ExplorerView.jsx";
import PartsLibraryView from "../modules/parts/PartsLibraryView.jsx";
import SearchView from "../shared/ui/SearchView.jsx";
import SourceControlView from "../modules/git/SourceControlView.jsx";
import SimulationView from "../modules/simulation/SimulationView.jsx";
import SettingsView from "../modules/settings/SettingsView.jsx";
import ExtensionView from "../shared/ui/ExtensionView.jsx";
import TemplateGallery from "../modules/templates/TemplateGallery.jsx";

const VIEWS = {
  explorer:  { title: "Explorer",         Comp: ExplorerView,      actions: [VscNewFile, VscNewFolder, VscRefresh] },
  parts:     { title: "Parts Library",    Comp: PartsLibraryView,  actions: [VscRefresh] },
  templates: { title: "Templates",        Comp: TemplateGallery,   actions: [] },
  search:    { title: "Search",           Comp: SearchView,        actions: [] },
  git:       { title: "Source Control",   Comp: SourceControlView, actions: [VscRefresh] },
  sim:       { title: "Simulation",       Comp: SimulationView,    actions: [] },
  settings:  { title: "Settings",         Comp: SettingsView,      actions: [] },
};

export default function PrimarySidebar() {
  const activity = useUiStore((s) => s.activeActivity);

  if (activity.startsWith("ext:")) {
    const viewId = activity.slice(4);
    return (
      <div className="primary-sidebar">
        <PanelHeader title={viewId} />
        <div className="sidebar-body" style={{ padding: 0, height: "100%" }}>
          <ExtensionView viewId={viewId} />
        </div>
      </div>
    );
  }

  const { title, Comp } = VIEWS[activity] ?? VIEWS.explorer;

  return (
    <div className="primary-sidebar">
      <PanelHeader title={title} />
      <div className="sidebar-body">
        <Comp />
      </div>
    </div>
  );
}
