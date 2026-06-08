import { useEffect } from "react";
import Shell from "./Shell.jsx";
import { useTabStore } from "../shared/stores/tabStore.js";
import { useCircuitStore } from "../shared/stores/circuitStore.js";

// BioIDE entry point: mounts the shell and opens a Welcome tab on first launch
// (or a scratch circuit if the user opted to hide the welcome screen).
export default function App() {
  useEffect(() => {
    const tabs = useTabStore.getState();
    if (Object.keys(tabs.tabsById).length > 0) return;

    const hideWelcome = localStorage.getItem("bio-welcome-hide") === "1";
    if (!hideWelcome) {
      tabs.openTab({ type: "welcome", title: "Welcome", icon: "🏠" });
    } else {
      const DSL = "Express GFP when IPTG is present";
      const id = tabs.openTab({ type: "circuit", title: "scratch.biopro", content: DSL });
      useCircuitStore.getState().ensure(id, DSL);
      useCircuitStore.getState().setDsl(id, DSL);
    }
  }, []);

  return <Shell />;
}
