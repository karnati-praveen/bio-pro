import {
  VscFiles, VscLibrary, VscSearch, VscSourceControl,
  VscGraph, VscSettingsGear, VscExtensions, VscBeaker, VscBook,
} from "react-icons/vsc";
import { useUiStore } from "../shared/stores/uiStore.js";

const STATIC_ITEMS = [
  { id: "explorer",  title: "Explorer (Ctrl+Shift+E)",      Icon: VscFiles },
  { id: "parts",     title: "Parts Library",                 Icon: VscBeaker },
  { id: "templates", title: "Template Gallery (Ctrl+Shift+T)", Icon: VscBook },
  { id: "search",    title: "Search (Ctrl+Shift+F)",         Icon: VscSearch },
  { id: "git",       title: "Source Control",                 Icon: VscSourceControl },
  { id: "sim",       title: "Simulation",                     Icon: VscGraph },
];

export default function ActivityBar() {
  const active = useUiStore((s) => s.activeActivity);
  const sidebarVisible = useUiStore((s) => s.sidebarVisible);
  const setActivity = useUiStore((s) => s.setActivity);
  const extItems = useUiStore((s) => s.activityItems);

  const isActive = (id) => active === id && sidebarVisible;

  return (
    <div className="activity-bar">
      <div className="activity-top">
        {STATIC_ITEMS.map(({ id, title, Icon }) => (
          <button
            key={id}
            data-id={id}
            className={`activity-item${isActive(id) ? " active" : ""}`}
            title={title}
            aria-label={title}
            onClick={() => setActivity(id)}
          >
            <Icon size={22} />
          </button>
        ))}
        {extItems.map(({ id, title }) => (
          <button
            key={id}
            className={`activity-item${isActive(id) ? " active" : ""}`}
            title={title}
            aria-label={title}
            onClick={() => setActivity(id)}
          >
            <VscExtensions size={22} />
          </button>
        ))}
      </div>
      <div className="activity-bottom">
        <button
          className={`activity-item${isActive("settings") ? " active" : ""}`}
          title="Settings"
          aria-label="Settings"
          data-id="settings"
          onClick={() => setActivity("settings")}
        >
          <VscSettingsGear size={22} />
        </button>
      </div>
    </div>
  );
}
