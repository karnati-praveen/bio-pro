import { useEffect } from "react";
import { Allotment } from "allotment";
import ActivityBar from "./ActivityBar.jsx";
import PrimarySidebar from "./PrimarySidebar.jsx";
import SecondarySidebar from "./SecondarySidebar.jsx";
import EditorArea from "./EditorArea.jsx";
import BottomPanel from "./BottomPanel.jsx";
import StatusBar from "./StatusBar.jsx";
import CommandPalette from "./CommandPalette.jsx";
import { useGlobalKeybindings } from "./keybindings.js";
import { useUiStore } from "../shared/stores/uiStore.js";

// VSCode-equivalent outer shell: activity bar | sidebar | (editor over panel) | properties,
// with a status bar pinned at the bottom and a global command palette overlay.
export default function Shell() {
  useGlobalKeybindings();

  const theme = useUiStore((s) => s.theme);
  const colorBlind = useUiStore((s) => s.colorBlind);
  const sidebarVisible = useUiStore((s) => s.sidebarVisible);
  const panelVisible = useUiStore((s) => s.panelVisible);
  const secondaryVisible = useUiStore((s) => s.secondaryVisible);

  // Drive theming via root data attributes consumed by CSS custom properties.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-palette", colorBlind ? "colorblind" : "default");
  }, [theme, colorBlind]);

  return (
    <div className="shell">
      <div className="shell-body">
        <ActivityBar />
        <Allotment proportionalLayout={false}>
          <Allotment.Pane minSize={180} preferredSize={260} visible={sidebarVisible} snap>
            <PrimarySidebar />
          </Allotment.Pane>

          <Allotment.Pane minSize={320}>
            <Allotment vertical>
              <Allotment.Pane minSize={120}>
                <EditorArea />
              </Allotment.Pane>
              <Allotment.Pane minSize={80} preferredSize={220} visible={panelVisible} snap>
                <BottomPanel />
              </Allotment.Pane>
            </Allotment>
          </Allotment.Pane>

          <Allotment.Pane minSize={220} preferredSize={300} visible={secondaryVisible} snap>
            <SecondarySidebar />
          </Allotment.Pane>
        </Allotment>
      </div>
      <StatusBar />
      <CommandPalette />
    </div>
  );
}
