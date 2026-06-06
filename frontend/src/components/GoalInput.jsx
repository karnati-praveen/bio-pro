import { useState, useRef, useCallback, useEffect } from "react";
import Editor from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { registerBioproLanguage, findingsToMarkers } from "../lib/biopro-language.js";

const EXAMPLES = [
  "Express GFP when IPTG is present",
  "Produce RFP when arabinose is present",
  "Express YFP when IPTG and arabinose are present",
  "Express GFP when aTc or IPTG is present",
  "Constitutive GFP expression",
  "Toggle switch with GFP",
  "Oscillator with GFP (repressilator)",
  "Negative feedback loop with GFP and IPTG",
  "Positive feedback with GFP and IPTG",
  "Feed-forward loop with GFP and IPTG",
  "Band-pass filter GFP IPTG",
  "Express GFP without IPTG (NOT gate)",
];

const PARAM_FIELDS = [
  { key: "beta_p",  label: "β_P (max production)", step: 1 },
  { key: "gamma_p", label: "γ_P (degradation)",    step: 0.01 },
  { key: "k",       label: "K (Hill half-max)",    step: 1 },
  { key: "n",       label: "n (cooperativity)",    step: 1 },
  { key: "i_max",   label: "I_max (inducer level)", step: 1 },
];

function buildParams(paramState) {
  const params = {};
  for (const { key } of PARAM_FIELDS) {
    const v = paramState[key];
    if (v !== "" && v != null && !Number.isNaN(Number(v))) {
      params[key] = Number(v);
    }
  }
  return Object.keys(params).length ? params : undefined;
}

const ORGANISMS = [
  { value: "",          label: "Any organism" },
  { value: "ecoli",     label: "E. coli" },
  { value: "yeast",     label: "S. cerevisiae (yeast)" },
  { value: "mammalian", label: "Mammalian / HEK293" },
];

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function lintText(text, organism) {
  try {
    const res = await fetch(`${BASE_URL}/api/lint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, organism: organism || null }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * GoalInput — the left-sidebar input panel.
 *
 * New props vs. original:
 *   activeFile    — current open file object { name, path, content } from App
 *   onEditorMount — called with { editor, monaco, applyFindings } after Monaco mounts
 */
export default function GoalInput({ parts, onCompile, loading, activeFile, onEditorMount }) {
  const [mode, setMode]           = useState("text");
  const [text, setText]           = useState(EXAMPLES[0]);
  const [organism, setOrganism]   = useState("");
  const [form, setForm]           = useState({
    output: "GFP", inducer: "IPTG", presence: "present", gate: "", inducer2: "arabinose",
  });
  const [showParams, setShowParams] = useState(false);
  const [paramState, setParamState] = useState({
    beta_p: "", gamma_p: "", k: "", n: "", i_max: "",
  });

  const editorRef   = useRef(null);
  const monacoRef   = useRef(null);
  const lintTimer   = useRef(null);

  // Register language on first render (idempotent)
  useEffect(() => { registerBioproLanguage(); }, []);

  // Sync active file content into the editor when the user switches tabs
  useEffect(() => {
    if (activeFile && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model && model.getValue() !== activeFile.content) {
        model.setValue(activeFile.content);
        setText(activeFile.content);
      }
    }
  }, [activeFile]);

  // Filter reporters and inducers by selected organism
  const allParts  = parts?.parts || [];
  const reporters = organism
    ? allParts.filter(p => p.role === "reporter" && (p.host_compatibility || []).includes(organism)).map(p => p.id)
    : (parts?.reporters || []);
  const inducers  = organism
    ? allParts.filter(p => p.type === "inducer" && (p.host_compatibility || []).includes(organism)).map(p => p.id)
    : (parts?.inducers || []);

  // ── Marker (squiggle) helpers ──────────────────────────────────────────────
  const applyFindings = useCallback((findings) => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    const markers = findingsToMarkers(model, findings);
    monacoRef.current.editor.setModelMarkers(model, "bio-compiler", markers);
  }, []);

  const clearMarkers = useCallback(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (model) monacoRef.current.editor.setModelMarkers(model, "bio-compiler", []);
  }, []);

  // ── Monaco onMount ─────────────────────────────────────────────────────────
  const handleEditorMount = useCallback((editor, monacoInstance) => {
    editorRef.current  = editor;
    monacoRef.current  = monacoInstance;

    // Ctrl/Cmd+Enter → compile
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
      () => submitWithValue(editor.getValue()),
    );

    // Ctrl/Cmd+S → delegate save to App via the ref callback
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
      () => onEditorMount?.current?.save?.(),
    );

    // Ctrl/Cmd+Shift+P → open Monaco command palette (built-in action)
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyP,
      () => editor.trigger("keyboard", "editor.action.quickCommand", null),
    );

    // Register custom actions that appear in the palette
    editor.addAction({
      id:    "biopro.export-genbank",
      label: "Export: GenBank",
      run:   () => onEditorMount?.current?.exportFormat?.("genbank"),
    });
    editor.addAction({
      id:    "biopro.export-fasta",
      label: "Export: FASTA",
      run:   () => onEditorMount?.current?.exportFormat?.("fasta"),
    });
    editor.addAction({
      id:    "biopro.simulate-stochastic",
      label: "Simulate: Run stochastic",
      run:   () => onEditorMount?.current?.runStochastic?.(),
    });

    // Expose refs upward so App can drive the editor (apply findings, save, etc.)
    if (typeof onEditorMount === "function") {
      onEditorMount({ editor, monaco: monacoInstance, applyFindings });
    }
  }, [applyFindings]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Change handler with debounced lint ────────────────────────────────────
  const handleChange = useCallback((value) => {
    const val = value ?? "";
    setText(val);
    clearMarkers();
    clearTimeout(lintTimer.current);
    lintTimer.current = setTimeout(async () => {
      const result = await lintText(val, organism);
      if (result) applyFindings(result.findings);
    }, 500);
  }, [organism, applyFindings, clearMarkers]);

  // ── Compile submit ─────────────────────────────────────────────────────────
  const submitWithValue = useCallback((val) => {
    const params = buildParams(paramState);
    const org    = organism || undefined;
    onCompile({ text: val, organism: org, ...(params && { params }) });
  }, [paramState, organism, onCompile]);

  const submit = () => {
    const params = buildParams(paramState);
    const org    = organism || undefined;
    if (mode === "text") {
      onCompile({ text, organism: org, ...(params && { params }) });
    } else {
      const payload = { ...form };
      if (!payload.gate) { delete payload.gate; delete payload.inducer2; }
      onCompile({ form: payload, organism: org, ...(params && { params }) });
    }
  };

  // ── Chip click — update both React state AND the Monaco model ────────────
  const pickExample = (ex) => {
    setText(ex);
    editorRef.current?.setValue(ex);
  };

  return (
    <div className="goal-input">
      {/* Host organism selector */}
      <div className="organism-selector">
        <label>
          Host organism
          <select value={organism} onChange={e => setOrganism(e.target.value)}>
            {ORGANISMS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="tabs">
        <button className={mode === "text" ? "tab active" : "tab"} onClick={() => setMode("text")}>
          Plain language
        </button>
        <button className={mode === "form" ? "tab active" : "tab"} onClick={() => setMode("form")}>
          Structured form
        </button>
      </div>

      {mode === "text" ? (
        <div className="mode-body">
          <div className="monaco-wrap">
            <Editor
              height="180px"
              language="biopro"
              theme="biopro-dark"
              defaultValue={text}
              onChange={handleChange}
              onMount={handleEditorMount}
              options={{
                minimap:              { enabled: false },
                lineNumbers:          "on",
                wordWrap:             "on",
                scrollBeyondLastLine: false,
                fontSize:             13,
                fontFamily:           '"Fira Mono", "Consolas", monospace',
                padding:              { top: 8, bottom: 8 },
                contextmenu:          true,
                quickSuggestions:     true,
                suggestOnTriggerCharacters: true,
                renderLineHighlight:  "line",
                overviewRulerLanes:   0,
                scrollbar:            { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
              }}
            />
          </div>
          <div className="examples">
            {EXAMPLES.map(ex => (
              <button key={ex} className="chip" onClick={() => pickExample(ex)}>{ex}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mode-body form-grid">
          <label>
            Output reporter
            <select value={form.output} onChange={e => setForm({ ...form, output: e.target.value })}>
              {reporters.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label>
            Inducer
            <select value={form.inducer} onChange={e => setForm({ ...form, inducer: e.target.value })}>
              {inducers.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
          <label>
            Logic
            <select value={form.gate} onChange={e => setForm({ ...form, gate: e.target.value })}>
              <option value="">single input</option>
              <option value="and">AND second inducer</option>
              <option value="or">OR second inducer</option>
            </select>
          </label>
          {form.gate ? (
            <label>
              Second inducer
              <select value={form.inducer2} onChange={e => setForm({ ...form, inducer2: e.target.value })}>
                {inducers.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </label>
          ) : (
            <label>
              Condition
              <select value={form.presence} onChange={e => setForm({ ...form, presence: e.target.value })}>
                <option value="present">inducer present</option>
                <option value="absent">inducer absent</option>
              </select>
            </label>
          )}
        </div>
      )}

      <div className="params">
        <button className="params-toggle" onClick={() => setShowParams(s => !s)} type="button">
          {showParams ? "▾" : "▸"} Simulation parameters
        </button>
        {showParams && (
          <div className="params-grid">
            {PARAM_FIELDS.map(({ key, label, step }) => (
              <label key={key}>
                {label}
                <input
                  type="number" step={step} min="0" placeholder="default"
                  value={paramState[key]}
                  onChange={e => setParamState({ ...paramState, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <button className="compile-btn" onClick={submit} disabled={loading}>
        {loading ? "Compiling…" : "Compile ▶"}
      </button>
    </div>
  );
}
