import { useTabStore } from "../stores/tabStore.js";
import { useCircuitStore } from "../stores/circuitStore.js";
import { useUiStore } from "../stores/uiStore.js";
import { runCommand } from "../shell/commands.js";

// Quick simulation launcher for the active circuit. The full Simulation
// Workbench (4 modes, history) becomes its own editor tab in Phase 3.
export default function SimulationView() {
  const activeTab = useTabStore((s) => s.activeTab());
  const byTab = useCircuitStore((s) => s.byTab);
  const setStatus = useUiStore((s) => s.setStatus);
  const session = activeTab && activeTab.type === "circuit" ? byTab[activeTab.id] : null;

  if (!session) {
    return <div className="sidebar-placeholder"><p className="hint">Open a circuit tab to run simulations.</p></div>;
  }

  return (
    <div className="sim-launcher">
      <button className="btn primary" onClick={() => runCommand("circuit.compile")}>Compile (Ctrl+Enter)</button>
      <button className="btn" onClick={() => runCommand("sim.stochastic")}>Run Stochastic (F5)</button>
      <div className="sim-launcher-status">
        Status: {session.loading ? "compiling…" : session.result ? "compiled" : "idle"}
      </div>
      {session.result && (
        <div className="sim-launcher-meta">
          {session.result.simulation?.series?.length || 0} species ·
          {" "}{session.result.simulation?.t?.length || 0} time points
        </div>
      )}
    </div>
  );
}
