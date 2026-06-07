import { useEffect } from "react";
import Shell from "./shell/Shell.jsx";
import { useTabStore } from "./stores/tabStore.js";
import { useCircuitStore } from "./stores/circuitStore.js";

const WELCOME_DSL = "Express GFP when IPTG is present";

// BioIDE entry point: mounts the VSCode-equivalent shell and seeds one scratch
// circuit tab so the editor is never empty on first launch.
export default function App() {
  useEffect(() => {
    const tabs = useTabStore.getState();
    if (Object.keys(tabs.tabsById).length > 0) return;
    const id = tabs.openTab({ type: "circuit", title: "scratch.biopro", content: WELCOME_DSL });
    useCircuitStore.getState().ensure(id, WELCOME_DSL);
    useCircuitStore.getState().setDsl(id, WELCOME_DSL);
  }, []);

  return <Shell />;
}
