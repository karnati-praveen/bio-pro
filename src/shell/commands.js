import { useUiStore } from "../shared/stores/uiStore.js";
import { useTabStore } from "../shared/stores/tabStore.js";
import { useCircuitStore } from "../shared/stores/circuitStore.js";
import { useProjectStore } from "../shared/stores/projectStore.js";
import { exportInline } from "../shared/lib/api/client.js";
import { isTauri } from "../shared/lib/tauriFs.js";

// Central command registry. Each command is { id, title, category, keybinding, run }.
// `run` reads the latest store state at call time via getState(), so commands stay
// valid regardless of which component triggered them (palette, keybinding, button).

const ui = () => useUiStore.getState();
const tabs = () => useTabStore.getState();
const circuits = () => useCircuitStore.getState();
const project = () => useProjectStore.getState();
const toast = (msg, type = "info") => ui().addToast(msg, type);

function activeCircuitTab() {
  const t = tabs().activeTab();
  return t && t.type === "circuit" ? t : null;
}

function _browserDownload(filename, content) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function saveActiveTab() {
  const t = tabs().activeTab();
  if (!t) return;
  let content = t.content ?? "";
  if (t.type === "circuit") content = circuits().get(t.id)?.dsl ?? content;

  // Browser without a folder handle: use showSaveFilePicker or trigger a download.
  if (!isTauri && !project().dirHandle) {
    const name = (t.title ?? "untitled.biopro").replace(/ \(unsaved\)$/, "");
    if ("showSaveFilePicker" in window) {
      try {
        const fh = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: "BioIDE file", accept: { "text/plain": [".biopro", ".gb", ".fasta", ".pathway", ".notebook", ".mol", ".smiles"] } }],
        });
        const writable = await fh.createWritable();
        await writable.write(content);
        await writable.close();
        tabs().markDirty(t.id, false);
        ui().setStatus(`Saved ${fh.name}`);
        toast(`Saved ${fh.name}`, "success");
      } catch (e) {
        if (e.name !== "AbortError") { ui().setStatus(`Save failed: ${e.message}`); toast(`Save failed: ${e.message}`, "error"); }
      }
    } else {
      _browserDownload(name, content);
      tabs().markDirty(t.id, false);
      ui().setStatus(`Downloaded ${name} (open a folder with Ctrl+O to save in-place)`);
      toast(`Downloaded ${name}`, "success");
    }
    return;
  }

  if (!t.filePath) {
    ui().setStatus("Cannot save: open a folder first (Ctrl+O), then create a file.");
    return;
  }
  try {
    const entry = (project().entries.find((e) => e.path === t.filePath)) ?? {
      name: t.filePath.split(/[\\/]/).pop(),
      path: t.filePath,
      _handle: t.meta?._handle ?? null,
    };
    await project().writeFile(entry, content);
    tabs().markDirty(t.id, false);
    ui().setStatus(`Saved ${entry.name}`);
    toast(`Saved ${entry.name}`, "success");
    // Notify the vscode-shim workspace.onDidSaveTextDocument listeners.
    try {
      import("../shared/lib/vscode-shim/workspace.js").then(({ _onDidSaveTextDocumentEmitter }) => {
        import("../shared/lib/vscode-shim/text-document.js").then(({ monacoModelToTextDocument }) => {
          import("monaco-editor").then(({ editor }) => {
            const model = editor.getModels().find((m) => m.uri.path === entry.path || m.uri.path.endsWith(entry.path));
            if (model) _onDidSaveTextDocumentEmitter.fire(monacoModelToTextDocument(model));
          });
        });
      });
    } catch {}
  } catch (e) {
    ui().setStatus(`Save failed: ${e.message}`);
  }
}

// Prompts the user if a tab has unsaved changes before closing it.
// Used by the × button, middle-click, and the file.closeTab command (Ctrl+W).
export async function maybeCloseTab(id) {
  const tabState = useTabStore.getState();
  const tab = tabState.tabsById[id];
  if (!tab) return;
  if (!tab.dirty) {
    tabState.closeTab(id);
    return;
  }
  const choice = await new Promise((resolve) => {
    useUiStore.getState().showQuickPick(
      ["Save and close", "Close without saving", "Cancel"],
      { title: "Unsaved changes", placeHolder: "This file has unsaved changes." },
      resolve,
    );
  });
  if (choice === "Save and close") {
    tabState.setActiveTab(id);
    await saveActiveTab();
    useTabStore.getState().closeTab(id);
  } else if (choice === "Close without saving") {
    useTabStore.getState().closeTab(id);
  }
}

// Extension-contributed commands land here via registerCommand() below so they
// appear in the command palette and are reachable via executeCommand().
export function registerCommand(id, handler) {
  const existing = COMMANDS.find((c) => c.id === id);
  if (existing) return { dispose() {} }; // idempotent
  const entry = { id, title: id, category: "Extension", run: handler };
  COMMANDS.push(entry);
  return {
    dispose() {
      const idx = COMMANDS.indexOf(entry);
      if (idx >= 0) COMMANDS.splice(idx, 1);
    },
  };
}

export function unregisterCommand(id) {
  const idx = COMMANDS.findIndex((c) => c.id === id);
  if (idx >= 0) COMMANDS.splice(idx, 1);
}

export const COMMANDS = [
  // ── Welcome ───────────────────────────────────────────────────────────
  { id: "help.welcome", title: "Show Welcome Screen", category: "Help",
    description: "Open the welcome tab with examples and quick-start actions",
    run: () => tabs().openTab({ type: "welcome", title: "Welcome", icon: "🏠" }) },
  { id: "help.templates", title: "Template Gallery", category: "Help", keybinding: "Ctrl+Shift+T",
    description: "Browse curated circuit, chemistry, and workflow templates — click any card to open pre-filled",
    run: () => tabs().openTab({ type: "templates", title: "Template Gallery", icon: "📚" }) },
  { id: "help.shortcuts", title: "Keyboard Shortcuts Reference", category: "Help", keybinding: "Ctrl+Shift+?",
    description: "Show all keyboard shortcuts grouped by category",
    run: () => ui().openModal("keyboard-shortcuts") },

  // ── File ──────────────────────────────────────────────────────────────
  {
    id: "file.new", title: "New Circuit File", category: "File", keybinding: "Ctrl+N",
    description: "Create a blank .biopro genetic circuit file",
    run: () => {
      const entry = project().newFileEntry(`untitled-${Date.now() % 1000}`);
      const id = tabs().openTab({ type: "circuit", title: entry.name, filePath: entry.path, content: "" });
      circuits().ensure(id, "");
    },
  },
  { id: "file.newSequence", title: "New Sequence File", category: "File",
    description: "Open a FASTA sequence editor",
    run: () => tabs().openTab({ type: "sequence", title: "sequence.fasta", content: "" }) },
  { id: "file.newSimulation", title: "New Simulation Workbench", category: "File",
    description: "Open the full ODE/stochastic simulation workbench (compile a circuit first)",
    run: () => ui().setStatus("Compile a circuit first, then use the '📊 Workbench' button.") },
  { id: "file.open", title: "Open Folder…", category: "File", keybinding: "Ctrl+O",
    description: "Open a local folder as the project workspace",
    run: () => project().openProject() },
  { id: "file.save", title: "Save", category: "File", keybinding: "Ctrl+S",
    description: "Save the active tab to disk",
    run: saveActiveTab },
  {
    id: "file.saveAll", title: "Save All", category: "File", keybinding: "Ctrl+Shift+S",
    description: "Save all unsaved tabs",
    run: () => saveActiveTab(),
  },
  {
    id: "file.closeTab", title: "Close Tab", category: "File", keybinding: "Ctrl+W",
    description: "Close the active editor tab",
    run: () => { const t = tabs().activeTab(); if (t) maybeCloseTab(t.id); },
  },

  // ── Chemistry (Module 6) ──────────────────────────────────────────────
  { id: "chem.newMolecule", title: "New Molecule", category: "Chemistry",
    description: "Look up a molecule by name or SMILES and view 2D/3D structure",
    run: () => tabs().openTab({ type: "molecule", title: "molecule.smiles" }) },
  { id: "chem.newReaction", title: "New Reaction", category: "Chemistry",
    description: "Model a chemical reaction and its kinetics",
    run: () => tabs().openTab({ type: "reaction", title: "reaction.rxn" }) },
  { id: "chem.newSpectrum", title: "New Spectrum", category: "Chemistry",
    description: "Visualize a JCAMP-DX spectrum file",
    run: () => tabs().openTab({ type: "spectrum", title: "spectrum.jdx" }) },
  { id: "chem.titration", title: "Acid–Base Titration", category: "Chemistry",
    description: "Plot a titration curve with equivalence point, half-equivalence (pH=pKa), and buffer-region shading",
    run: () => tabs().openTab({ type: "titration", title: "Titration", icon: "⚗️" }) },

  // ── Workflow (Phase 5) ────────────────────────────────────────────────
  { id: "wf.newPathway", title: "New Pathway (FBA)", category: "Workflow",
    description: "Open the flux-balance analysis pathway editor",
    run: () => tabs().openTab({ type: "pathway", title: "pathway.pathway" }) },
  { id: "wf.newNotebook", title: "New Experiment Notebook", category: "Workflow",
    description: "Create a wet-lab experiment notebook with results table and notes",
    run: () => tabs().openTab({ type: "notebook", title: "experiments.notebook" }) },
  { id: "wf.newPrimers", title: "New Primer Design", category: "Workflow",
    description: "Design PCR primer pairs using SantaLucia nearest-neighbor thermodynamics",
    run: () => tabs().openTab({ type: "primers", title: "Primer Design", icon: "🧬" }) },
  { id: "biology.crisprDesign", title: "CRISPR Guide RNA Design", category: "Biology",
    description: "Design SpCas9 / SaCas9 / Cas12a guide RNAs for a target sequence",
    run: () => tabs().openTab({ type: "crispr", title: "CRISPR Guide Design" }) },
  { id: "biology.codonOptimize", title: "Codon Optimizer", category: "Biology",
    description: "Back-translate or recode a CDS / protein for E. coli, yeast, or human expression; reports CAI before/after",
    run: () => tabs().openTab({ type: "codon", title: "Codon Optimizer" }) },
  { id: "biology.align", title: "Sequence Alignment", category: "Biology",
    description: "Global (Needleman-Wunsch), local (Smith-Waterman), or center-star MSA for up to 20 sequences; colored residue grid, conservation, and identity matrix",
    run: () => tabs().openTab({ type: "alignment", title: "Sequence Alignment" }) },
  {
    id: "wf.generateProtocol", title: "Generate Protocol", category: "Workflow",
    run: () => {
      const t = activeCircuitTab();
      const c = t && circuits().get(t.id);
      if (!c?.result) { ui().setStatus("Compile a circuit first (Ctrl+Enter)."); return; }
      tabs().openTab({ type: "protocol", title: `Protocol: ${c.result.spec?.output || t.title}`,
        meta: { result: c.result } });
    },
  },
  {
    id: "experiment.simulateAssay",
    title: "Simulate Assay Readout",
    category: "Experiment",
    description: "Predict flow cytometry, plate reader, qPCR, and gel readouts for the compiled circuit",
    run: () => {
      const t = activeCircuitTab();
      const c = t && circuits().get(t.id);
      const meta = c?.result ? { result: c.result } : {};
      const label = c?.result?.spec?.output ? `Assay: ${c.result.spec.output}` : "Assay Simulator";
      tabs().openTab({ type: "assay", title: label, meta });
    },
  },

  // ── View ──────────────────────────────────────────────────────────────
  { id: "view.toggleSidebar", title: "Toggle Primary Sidebar", category: "View", keybinding: "Ctrl+B",
    run: () => ui().toggleSidebar() },
  { id: "view.togglePanel", title: "Toggle Bottom Panel", category: "View", keybinding: "Ctrl+J",
    run: () => ui().togglePanel() },
  { id: "view.toggleTerminal", title: "Toggle Terminal", category: "View", keybinding: "Ctrl+`",
    run: () => { ui().setBottomTab("terminal"); } },
  { id: "view.toggleSecondary", title: "Toggle Properties Panel", category: "View",
    run: () => ui().toggleSecondary() },
  { id: "view.toggleTheme", title: "Toggle Light/Dark Theme", category: "View",
    run: () => ui().toggleTheme() },
  { id: "view.colorBlind", title: "Toggle Color-Blind Palette", category: "View",
    run: () => ui().toggleColorBlind() },
  { id: "view.problems", title: "Show Problems", category: "View",
    run: () => ui().setBottomTab("problems") },
  { id: "view.citations", title: "Show Citations", category: "View",
    run: () => ui().setBottomTab("citations") },
  { id: "palette.open", title: "Show All Commands", category: "View", keybinding: "Ctrl+Shift+P",
    run: () => ui().openPalette() },

  // ── Activity bar views ──────────────────────────────────────────────────
  { id: "go.explorer", title: "Show Explorer", category: "Go", run: () => ui().setActivity("explorer") },
  { id: "go.parts", title: "Show Parts Library", category: "Go", run: () => ui().setActivity("parts") },
  { id: "go.search", title: "Show Search", category: "Go", run: () => ui().setActivity("search") },
  { id: "go.git", title: "Show Source Control", category: "Go", run: () => ui().setActivity("git") },
  { id: "go.sim", title: "Show Simulation", category: "Go", run: () => ui().setActivity("sim") },
  { id: "go.templates", title: "Show Template Gallery", category: "Go",
    description: "Open the template gallery sidebar panel",
    run: () => ui().setActivity("templates") },
  { id: "go.settings", title: "Open Settings", category: "Go", run: () => ui().setActivity("settings") },

  // ── Circuit / simulation ────────────────────────────────────────────────
  {
    id: "circuit.compile", title: "Compile Circuit", category: "Circuit", keybinding: "Ctrl+Enter",
    run: async () => {
      const t = activeCircuitTab();
      if (!t) { ui().setStatus("Open a circuit (.biopro) tab to compile."); toast("Open a circuit tab first", "warning"); return; }
      ui().setStatus("Compiling…");
      try {
        await circuits().compile(t.id);
        const c = circuits().get(t.id);
        const hasErrors = (c?.findings || []).some((f) => f.severity === "error");
        ui().setStatus("Compiled");
        ui().setBottomTab("problems");
        toast(hasErrors ? "Compiled with errors — see Problems" : "Circuit compiled successfully", hasErrors ? "warning" : "success");
      } catch (e) {
        ui().setStatus(`Compile failed: ${e.message}`);
        toast(`Compile failed: ${e.message}`, "error");
      }
    },
  },
  {
    id: "sim.run", title: "Run Simulation", category: "Simulation", keybinding: "Ctrl+R",
    run: async () => {
      const t = activeCircuitTab();
      if (!t) { ui().setStatus("Open a circuit tab to simulate."); return; }
      const c = circuits().get(t.id);
      if (!c.result) { await circuits().compile(t.id); }
      ui().setStatus("Simulation ready (see Simulation view in the editor).");
    },
  },
  {
    id: "sim.stochastic", title: "Run Stochastic Simulation", category: "Simulation", keybinding: "F5",
    run: async () => {
      const t = activeCircuitTab();
      if (!t) return;
      ui().setStatus("Running stochastic simulation…");
      await circuits().runStochastic(t.id, null);
      ui().setStatus("Stochastic simulation complete.");
    },
  },

  // ── Biology ───────────────────────────────────────────────────────────
  {
    id: "biology.plasmidMap",
    title: "View Plasmid Map",
    category: "Biology",
    keybinding: "Ctrl+Shift+M",
    description: "Open a circular/linear plasmid map for the active sequence file or compiled circuit",
    run: () => {
      const t = tabs().activeTab();
      if (!t) { toast("Open a sequence or circuit tab first", "warning"); return; }

      if (t.type === "circuit") {
        const c = circuits().get(t.id);
        if (!c?.result) {
          ui().setStatus("Compile the circuit first (Ctrl+Enter).");
          toast("Compile a circuit first", "warning");
          return;
        }
        tabs().openTab({
          type:  "plasmid",
          title: `Map: ${c.result.spec?.output || t.title}`,
          meta:  { source: "circuit", result: c.result },
        });
        return;
      }

      // Sequence tab or .gb/.fasta file
      const ext = (t.filePath || t.title || "").split(".").pop().toLowerCase();
      if (t.type === "sequence" || ["gb", "gbk", "fasta", "fa"].includes(ext)) {
        tabs().openTab({
          type:  "plasmid",
          title: `Map: ${t.title}`,
          meta:  { source: "sequence", content: t.content, filename: t.filePath || t.title },
        });
        return;
      }

      toast("Active tab is not a sequence file or compiled circuit", "warning");
    },
  },

  // ── Export ────────────────────────────────────────────────────────────
  {
    id: "export.genbank", title: "Export: GenBank", category: "Export",
    run: () => { const t = activeCircuitTab(); const c = t && circuits().get(t.id);
      if (c?.result) { exportInline(c.result, "genbank"); toast("Exported as GenBank", "success"); }
      else toast("Compile a circuit first", "warning"); },
  },
  {
    id: "export.fasta", title: "Export: FASTA", category: "Export",
    run: () => { const t = activeCircuitTab(); const c = t && circuits().get(t.id);
      if (c?.result) { exportInline(c.result, "fasta"); toast("Exported as FASTA", "success"); }
      else toast("Compile a circuit first", "warning"); },
  },
  {
    id: "export.sbol", title: "Export: SBOL", category: "Export",
    run: () => { const t = activeCircuitTab(); const c = t && circuits().get(t.id);
      if (c?.result) exportInline(c.result, "sbol"); },
  },
];

export function runCommand(id) {
  const cmd = COMMANDS.find((c) => c.id === id);
  if (cmd) cmd.run();
  return !!cmd;
}
