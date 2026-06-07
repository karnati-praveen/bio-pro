import { useUiStore } from "../shared/stores/uiStore.js";
import { useTabStore } from "../shared/stores/tabStore.js";
import { useCircuitStore } from "../shared/stores/circuitStore.js";
import { useProjectStore } from "../shared/stores/projectStore.js";
import { exportInline } from "../shared/lib/api/client.js";

// Central command registry. Each command is { id, title, category, keybinding, run }.
// `run` reads the latest store state at call time via getState(), so commands stay
// valid regardless of which component triggered them (palette, keybinding, button).

const ui = () => useUiStore.getState();
const tabs = () => useTabStore.getState();
const circuits = () => useCircuitStore.getState();
const project = () => useProjectStore.getState();

function activeCircuitTab() {
  const t = tabs().activeTab();
  return t && t.type === "circuit" ? t : null;
}

async function saveActiveTab() {
  const t = tabs().activeTab();
  if (!t) return;
  let content = t.content ?? "";
  if (t.type === "circuit") content = circuits().get(t.id).dsl;
  if (!t.filePath) {
    ui().setStatus("Cannot save: untitled file (use the Explorer to create a file).");
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
  // ── File ──────────────────────────────────────────────────────────────
  {
    id: "file.new", title: "New Circuit File", category: "File", keybinding: "Ctrl+N",
    run: () => {
      const entry = project().newFileEntry(`untitled-${Date.now() % 1000}`);
      const id = tabs().openTab({ type: "circuit", title: entry.name, filePath: entry.path, content: "" });
      circuits().ensure(id, "");
    },
  },
  { id: "file.open", title: "Open Folder…", category: "File", keybinding: "Ctrl+O",
    run: () => project().openProject() },
  { id: "file.save", title: "Save", category: "File", keybinding: "Ctrl+S", run: saveActiveTab },
  {
    id: "file.saveAll", title: "Save All", category: "File", keybinding: "Ctrl+Shift+S",
    run: () => saveActiveTab(),
  },
  {
    id: "file.closeTab", title: "Close Tab", category: "File", keybinding: "Ctrl+W",
    run: () => { const t = tabs().activeTab(); if (t) tabs().closeTab(t.id); },
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
  { id: "go.git", title: "Show Source Control", category: "Go", run: () => ui().setActivity("git") },
  { id: "go.settings", title: "Open Settings", category: "Go", run: () => ui().setActivity("settings") },

  // ── Circuit / simulation ────────────────────────────────────────────────
  {
    id: "circuit.compile", title: "Compile Circuit", category: "Circuit", keybinding: "Ctrl+Enter",
    run: async () => {
      const t = activeCircuitTab();
      if (!t) { ui().setStatus("Open a circuit (.biopro) tab to compile."); return; }
      ui().setStatus("Compiling…");
      try {
        await circuits().compile(t.id);
        ui().setStatus("Compiled");
        ui().setBottomTab("problems");
      } catch (e) {
        ui().setStatus(`Compile failed: ${e.message}`);
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

  // ── Export ────────────────────────────────────────────────────────────
  {
    id: "export.genbank", title: "Export: GenBank", category: "Export",
    run: () => { const t = activeCircuitTab(); const c = t && circuits().get(t.id);
      if (c?.result) exportInline(c.result, "genbank"); },
  },
  {
    id: "export.fasta", title: "Export: FASTA", category: "Export",
    run: () => { const t = activeCircuitTab(); const c = t && circuits().get(t.id);
      if (c?.result) exportInline(c.result, "fasta"); },
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
