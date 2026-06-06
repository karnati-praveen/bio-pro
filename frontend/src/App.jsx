import { useEffect, useRef, useState } from "react";
import { compile, exportInline, fetchParts, stochasticSimulate } from "./api/client.js";
import GoalInput from "./components/GoalInput.jsx";
import SpecPanel from "./components/SpecPanel.jsx";
import CircuitDiagram from "./components/CircuitDiagram.jsx";
import SimulationPlot from "./components/SimulationPlot.jsx";
import PartsLegend from "./components/PartsLegend.jsx";
import DesignsPanel from "./components/DesignsPanel.jsx";
import ParameterSweep from "./components/ParameterSweep.jsx";
import AssemblyPanel from "./components/AssemblyPanel.jsx";
import OrderPanel from "./components/OrderPanel.jsx";
import FileTree, { tauriWriteFile } from "./components/FileTree.jsx";
import EditorTabs from "./components/EditorTabs.jsx";

export default function App() {
  const [parts, setParts]         = useState(null);
  const [result, setResult]       = useState(null);
  const [request, setRequest]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [stochastic, setStochastic]       = useState(null);
  const [stochLoading, setStochLoading]   = useState(false);
  const [activeTab, setActiveTab] = useState("sweep");

  // ── File management ────────────────────────────────────────────────────────
  const [openFiles, setOpenFiles]             = useState([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  // Ref to Monaco actions exposed by GoalInput.onEditorMount
  const editorActionsRef = useRef(null);

  useEffect(() => {
    fetchParts()
      .then(setParts)
      .catch((e) => setError(e.message));
  }, []);

  // ── Compile ────────────────────────────────────────────────────────────────
  const handleCompile = async (payload) => {
    setLoading(true);
    setError(null);
    setStochastic(null);
    try {
      const res = await compile(payload);
      setResult(res);
      setRequest(payload);
      // Apply validation squiggles in the Monaco editor
      editorActionsRef.current?.applyFindings?.(res.validation.findings);
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDesign = (loadedResult, loadedRequest) => {
    setResult(loadedResult);
    setRequest(loadedRequest);
    setStochastic(null);
    setError(null);
  };

  const handleRunStochastic = async (threshold) => {
    if (!result) return;
    setStochLoading(true);
    try {
      const data = await stochasticSimulate(result, 50, threshold);
      setStochastic(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setStochLoading(false);
    }
  };

  // ── File tree callbacks ────────────────────────────────────────────────────
  const handleOpenFile = (fileObj) => {
    const existing = openFiles.findIndex(f => f.path === fileObj.path);
    if (existing >= 0) {
      setActiveFileIndex(existing);
      return;
    }
    setOpenFiles(prev => [...prev, fileObj]);
    setActiveFileIndex(openFiles.length);
  };

  const handleNewFile = (fileObj) => {
    setOpenFiles(prev => [...prev, fileObj]);
    setActiveFileIndex(openFiles.length);
  };

  const handleCloseTab = (idx) => {
    setOpenFiles(prev => prev.filter((_, i) => i !== idx));
    setActiveFileIndex(prev => Math.max(0, idx <= prev ? prev - 1 : prev));
  };

  const handleSaveFile = async () => {
    const file = openFiles[activeFileIndex];
    if (!file) return;
    const content = editorActionsRef.current?.editor?.getValue() ?? "";
    try {
      if (typeof window !== "undefined" && window.__TAURI__) {
        await tauriWriteFile(file.path, content);
      } else if (file._handle) {
        const writable = await file._handle.createWritable();
        await writable.write(content);
        await writable.close();
      }
      setOpenFiles(prev =>
        prev.map((f, i) => i === activeFileIndex ? { ...f, dirty: false, content } : f),
      );
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    }
  };

  // Mark active file dirty when editor content changes
  const handleFileContentChange = () => {
    setOpenFiles(prev =>
      prev.map((f, i) => i === activeFileIndex && !f.dirty ? { ...f, dirty: true } : f),
    );
  };

  // ── Editor mount callback from GoalInput ──────────────────────────────────
  const handleEditorMount = (actions) => {
    editorActionsRef.current = {
      ...actions,
      save:         handleSaveFile,
      exportFormat: (fmt) => result && exportInline(result, fmt),
      runStochastic:() => handleRunStochastic(null),
    };
  };

  const bottomTabs = [
    { id: "sweep",    label: "Parameter sweep" },
    { id: "assembly", label: "Cloning strategy" },
    { id: "order",    label: "Order DNA" },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <h1>&#129516; Biological Compiler</h1>
        <span className="subtitle">
          synthetic biology IDE — intent &#8594; genetic circuit &#8594; simulation
        </span>
      </header>

      <div className="layout">
        {/* ── Left: file tree ─────────────────────────────────────────── */}
        <FileTree onOpenFile={handleOpenFile} onNewFile={handleNewFile} />

        {/* ── Center: editor sidebar ──────────────────────────────────── */}
        <aside className="sidebar">
          <EditorTabs
            openFiles={openFiles}
            activeIndex={activeFileIndex}
            onSelect={setActiveFileIndex}
            onClose={handleCloseTab}
          />
          <GoalInput
            parts={parts}
            onCompile={handleCompile}
            loading={loading}
            activeFile={openFiles[activeFileIndex]}
            onEditorMount={handleEditorMount}
          />
          {error && <div className="error-box">{error}</div>}
          {result && (
            <SpecPanel
              spec={result.spec}
              validation={result.validation}
              trace={result.trace}
              citations={result.citations}
            />
          )}
          <DesignsPanel
            result={result}
            request={request}
            onLoad={handleLoadDesign}
          />
        </aside>

        {/* ── Right: circuit + plots ──────────────────────────────────── */}
        <main className="main">
          <section className="card">
            <h2>Genetic circuit</h2>
            <CircuitDiagram circuit={result?.circuit} />
            <PartsLegend />
          </section>

          <section className="card">
            <h2>Simulated expression</h2>
            <SimulationPlot
              simulation={result?.simulation}
              stochastic={stochastic}
              onRunStochastic={handleRunStochastic}
              stochLoading={stochLoading}
            />
          </section>

          {result && (
            <section className="card bottom-tabs-card" style={{ padding: 0 }}>
              <div className="tabs">
                {bottomTabs.map(tab => (
                  <button
                    key={tab.id}
                    className={activeTab === tab.id ? "tab active" : "tab"}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ padding: 16 }}>
                {activeTab === "sweep"    && <ParameterSweep result={result} />}
                {activeTab === "assembly" && <AssemblyPanel result={result} />}
                {activeTab === "order"    && <OrderPanel result={result} />}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
