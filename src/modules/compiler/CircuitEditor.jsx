import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Allotment } from "allotment";
import { registerBioproLanguage, findingsToMarkers } from "../../shared/lib/biopro-language.js";
import { lint, suggestGoals } from "../../shared/lib/api/client.js";
import { useCircuitStore } from "../../shared/stores/circuitStore.js";
import { useTabStore } from "../../shared/stores/tabStore.js";
import { useUiStore } from "../../shared/stores/uiStore.js";
import { useLlmStore, PROVIDERS } from "../../shared/stores/llmStore.js";
import { runCommand } from "../../shell/commands.js";

import CircuitDiagram from "./CircuitDiagram.jsx";
import SimulationPlot from "../simulation/SimulationPlot.jsx";
import ParameterSweep from "../simulation/ParameterSweep.jsx";
import AssemblyPanel from "../assembly/AssemblyPanel.jsx";
import OrderPanel from "../ordering/OrderPanel.jsx";
import PartsLegend from "../parts/PartsLegend.jsx";
import DesignsPanel from "./DesignsPanel.jsx";
import ExportPanel from "../export/ExportPanel.jsx";

const ORGANISMS = [
  { value: "", label: "Any organism" },
  { value: "ecoli", label: "E. coli" },
  { value: "yeast", label: "S. cerevisiae" },
  { value: "mammalian", label: "Mammalian / HEK293" },
];

const OUTPUT_TABS = [
  { id: "circuit", label: "Genetic Circuit" },
  { id: "simulation", label: "Simulation" },
  { id: "sweep", label: "Param Sweep" },
  { id: "assembly", label: "Cloning" },
  { id: "order", label: "Order DNA" },
  { id: "export", label: "Export" },
  { id: "designs", label: "Designs" },
];

// ---- Ambiguous Goal Dialog ------------------------------------------------ //
function AmbiguousGoalDialog({ goal, organism, onRetry, onDismiss }) {
  const llmStore = useLlmStore();
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cfg = llmStore.getLlmConfig();
    if (!cfg) { setSuggestions([]); setLoading(false); return; }
    suggestGoals(goal, "ambiguous_goal", organism, cfg).then((res) => {
      setSuggestions(res.suggestions || []);
      setLoading(false);
    });
  }, [goal, organism]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Ambiguous Goal</span>
          <button className="modal-close" onClick={onDismiss}>✕</button>
        </div>
        <p className="modal-body">
          The compiler could not map your goal to a known circuit pattern.
          Try one of these reformulations:
        </p>
        {loading ? (
          <div className="modal-loading">Generating suggestions…</div>
        ) : (
          <ul className="suggestion-list">
            {suggestions?.map((s, i) => (
              <li key={i}>
                <button className="suggestion-btn" onClick={() => onRetry(s)}>{s}</button>
              </li>
            ))}
            {suggestions?.length === 0 && (
              <li className="suggestion-empty">No suggestions available. Try rephrasing manually.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---- Provider badge ------------------------------------------------------- //
function ProviderBadge({ onClick }) {
  const { llm } = useLlmStore();
  if (!llm.enabled) {
    return (
      <button className="provider-badge off" title="No LLM configured — using rule-based compiler" onClick={onClick}>
        ● Rule-based
      </button>
    );
  }
  const label = PROVIDERS.find((p) => p.id === llm.provider)?.label || llm.provider;
  return (
    <button className="provider-badge on" title={`LLM active: ${llm.model}`} onClick={onClick}>
      ● {label}
    </button>
  );
}

// ---- Main component ------------------------------------------------------- //
// Circuit tab: Monaco DSL editor (left) wired to the .biopro language + live lint,
// and the visual outputs (right) reusing the existing diagram/sim/sweep/assembly/
// order components. Compile/stochastic flow through circuitStore for this tabId.
export default function CircuitEditor({ tabId, tab }) {
  const ensure = useCircuitStore((s) => s.ensure);
  const session = useCircuitStore((s) => s.byTab[tabId]);
  const setDsl = useCircuitStore((s) => s.setDsl);
  const setOrganism = useCircuitStore((s) => s.setOrganism);
  const applyFindings = useCircuitStore((s) => s.applyFindings);
  const runStochastic = useCircuitStore((s) => s.runStochastic);
  const loadResult = useCircuitStore((s) => s.loadResult);
  const markDirty = useTabStore((s) => s.markDirty);
  const openTab = useTabStore((s) => s.openTab);
  const setStatus = useUiStore((s) => s.setStatus);
  const setActivity = useUiStore((s) => s.setActivity);
  const compileStore = useCircuitStore();

  const openWorkbench = () => {
    const cur = useCircuitStore.getState().byTab[tabId];
    if (!cur?.result) { setStatus("Compile the circuit first (Ctrl+Enter)."); return; }
    openTab({
      type: "simulation",
      title: `Sim: ${cur.result.spec?.output || tab.title}`,
      meta: { result: cur.result, request: cur.request },
    });
  };

  const [outputTab, setOutputTab] = useState("circuit");
  const [ambiguousGoal, setAmbiguousGoal] = useState(null); // { goal, organism }
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const lintTimer = useRef(null);

  useEffect(() => { registerBioproLanguage(); }, []);
  useEffect(() => { ensure(tabId, tab.content ?? ""); }, [tabId, tab.content, ensure]);

  const dsl = session?.dsl ?? tab.content ?? "";
  const organism = session?.organism ?? "";
  const result = session?.result ?? null;

  // Auto-switch to the circuit view once a compile produces a result.
  useEffect(() => {
    if (result) setOutputTab((t) => (t === "circuit" || t === "simulation" ? t : t));
  }, [result]);

  const setMarkers = useCallback((findings) => {
    const ed = editorRef.current, mo = monacoRef.current;
    if (!ed || !mo) return;
    const model = ed.getModel();
    if (model) mo.editor.setModelMarkers(model, "bio-compiler", findingsToMarkers(model, findings || []));
  }, []);

  const handleMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runCommand("circuit.compile"));
  }, []);

  const handleChange = useCallback((value) => {
    const val = value ?? "";
    setDsl(tabId, val);
    markDirty(tabId, true);
    clearTimeout(lintTimer.current);
    lintTimer.current = setTimeout(async () => {
      const res = await lint(val, organism);
      if (res) { applyFindings(tabId, res.findings); setMarkers(res.findings); }
    }, 500);
  }, [tabId, organism, setDsl, markDirty, applyFindings, setMarkers]);

  // Reflect freshly compiled findings as squiggles.
  useEffect(() => { setMarkers(session?.findings); }, [session?.findings, setMarkers]);

  // Compile with ambiguous-goal detection.
  const handleCompile = useCallback(async () => {
    setStatus("Compiling…");
    try {
      await compileStore.compile(tabId);
      setStatus("Compiled");
      setActivity && useUiStore.getState().setBottomTab("problems");
    } catch (e) {
      // 422 with ambiguous_goal detail — show dialog
      const msg = e.message || "";
      if (msg.includes("ambiguous_goal") || e.status === 422) {
        setAmbiguousGoal({ goal: dsl, organism: organism || null });
      }
      setStatus(`Compile failed: ${msg}`);
    }
  }, [tabId, dsl, organism, compileStore, setStatus, setActivity]);

  return (
    <div className="circuit-editor">
      {ambiguousGoal && (
        <AmbiguousGoalDialog
          goal={ambiguousGoal.goal}
          organism={ambiguousGoal.organism}
          onRetry={(suggestion) => {
            setDsl(tabId, suggestion, { pushHistory: true });
            setAmbiguousGoal(null);
            // trigger compile after state update
            setTimeout(() => handleCompile(), 50);
          }}
          onDismiss={() => setAmbiguousGoal(null)}
        />
      )}
      <Allotment>
        <Allotment.Pane minSize={260} preferredSize={380}>
          <div className="dsl-pane">
            <div className="dsl-toolbar">
              <select value={organism} onChange={(e) => setOrganism(tabId, e.target.value)}>
                {ORGANISMS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ProviderBadge onClick={() => useUiStore.getState().setActivity("settings")} />
              <button className="btn primary" disabled={session?.loading}
                onClick={handleCompile}>
                {session?.loading ? "Compiling…" : "Compile ▶"}
              </button>
            </div>
            <div className="dsl-editor">
              <Editor
                language="biopro"
                theme="biopro-dark"
                value={dsl}
                onChange={handleChange}
                onMount={handleMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: '"Fira Mono", "Consolas", monospace',
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  padding: { top: 8 },
                  quickSuggestions: true,
                }}
              />
            </div>
            {session?.error && <div className="dsl-error">{session.error}</div>}
          </div>
        </Allotment.Pane>

        <Allotment.Pane minSize={320}>
          <div className="output-pane">
            <div className="output-tab-bar">
              {OUTPUT_TABS.map((t) => (
                <button key={t.id} className={`output-tab${outputTab === t.id ? " active" : ""}`}
                  onClick={() => setOutputTab(t.id)}>
                  {t.label}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button className="output-tab workbench-btn" title="Open the full Simulation Workbench"
                onClick={openWorkbench}>📊 Workbench</button>
            </div>
            <div className="output-content">
              {outputTab === "circuit" && (
                <div className="output-card">
                  <CircuitDiagram circuit={result?.circuit} />
                  <PartsLegend />
                </div>
              )}
              {outputTab === "simulation" && (
                <div className="output-card">
                  <SimulationPlot
                    simulation={result?.simulation}
                    stochastic={session?.stochastic}
                    onRunStochastic={(threshold) => runStochastic(tabId, threshold)}
                    stochLoading={session?.stochLoading}
                  />
                </div>
              )}
              {outputTab === "sweep" && <div className="output-card"><ParameterSweep result={result} /></div>}
              {outputTab === "assembly" && <div className="output-card"><AssemblyPanel result={result} /></div>}
              {outputTab === "order" && <div className="output-card"><OrderPanel result={result} /></div>}
              {outputTab === "export" && (
                <div className="output-card">
                  <ExportPanel result={result} />
                </div>
              )}
              {outputTab === "designs" && (
                <div className="output-card">
                  <DesignsPanel
                    result={result}
                    request={session?.request}
                    onLoad={(loadedResult, loadedRequest) => loadResult(tabId, loadedResult, loadedRequest)}
                  />
                </div>
              )}
            </div>
          </div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}
