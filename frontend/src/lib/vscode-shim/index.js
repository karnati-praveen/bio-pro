// vscode namespace — the default export is the full VS Code API shim.
// Extensions that do `import * as vscode from 'vscode'` or
// `const vscode = require('vscode')` get this object.

import { Disposable, EventEmitter } from "./event-emitter.js";
import * as types from "./types.js";
import { Uri } from "./uri.js";
import { createLanguagesNamespace } from "./languages.js";
import { createWindowNamespace } from "./window.js";
import { createWorkspaceNamespace } from "./workspace.js";
import { createCommandsNamespace } from "./commands.js";
import { createExtensionsNamespace } from "./extensions.js";

const languages  = createLanguagesNamespace();
const window_    = createWindowNamespace();
const workspace  = createWorkspaceNamespace();
const commands   = createCommandsNamespace();
const extensions = createExtensionsNamespace();

const vscode = {
  // ── Namespace objects ──────────────────────────────────────────────────────
  languages,
  window: window_,
  workspace,
  commands,
  extensions,

  // ── Core types ─────────────────────────────────────────────────────────────
  Disposable,
  EventEmitter,
  Uri,
  ...types,

  // ── Version stub ───────────────────────────────────────────────────────────
  version: "1.85.0",

  // ── env namespace ──────────────────────────────────────────────────────────
  env: {
    appName: "BioIDE",
    appRoot: "/",
    language: navigator.language ?? "en",
    machineId: "bio-ide-local",
    sessionId: Math.random().toString(36).slice(2),
    isNewAppInstall: false,
    isTelemetryEnabled: false,
    uriScheme: "bioide",
    clipboard: {
      readText() { return navigator.clipboard?.readText() ?? Promise.resolve(""); },
      writeText(value) { return navigator.clipboard?.writeText(value) ?? Promise.resolve(); },
    },
    openExternal(uri) { window.open(uri.toString(), "_blank"); return Promise.resolve(true); },
    asExternalUri(uri) { return Promise.resolve(uri); },
    createTelemetryLogger() {
      return { logUsage() {}, logError() {}, dispose() {} };
    },
    onDidChangeTelemetryEnabled: (listener) => new Disposable(() => {}),
    onDidChangeShell: (listener) => new Disposable(() => {}),
    shell: "/bin/bash",
    remoteName: undefined,
    isNewAppInstall: false,
    logLevel: 2,
    onDidChangeLogLevel: (listener) => new Disposable(() => {}),
  },

  // ── debug namespace (stub) ─────────────────────────────────────────────────
  debug: {
    onDidStartDebugSession: (listener) => new Disposable(() => {}),
    onDidTerminateDebugSession: (listener) => new Disposable(() => {}),
    onDidChangeActiveDebugSession: (listener) => new Disposable(() => {}),
    onDidReceiveDebugSessionCustomEvent: (listener) => new Disposable(() => {}),
    onDidChangeBreakpoints: (listener) => new Disposable(() => {}),
    activeDebugSession: undefined,
    activeDebugConsole: { append() {}, appendLine() {} },
    breakpoints: [],
    startDebugging() { return Promise.resolve(false); },
    stopDebugging() { return Promise.resolve(); },
    addBreakpoints() {},
    removeBreakpoints() {},
    asDebugSourceUri(source) { return Uri.file(source.path ?? "/"); },
    registerDebugAdapterDescriptorFactory() { return new Disposable(() => {}); },
    registerDebugAdapterTrackerFactory() { return new Disposable(() => {}); },
    registerDebugConfigurationProvider() { return new Disposable(() => {}); },
  },

  // ── scm namespace (stub) ───────────────────────────────────────────────────
  scm: {
    createSourceControl() {
      return {
        inputBox: { value: "" },
        statusBarCommands: undefined,
        count: 0,
        dispose() {},
        createResourceGroup() {
          return { id: "", label: "", resourceStates: [], dispose() {} };
        },
      };
    },
  },

  // ── tasks namespace (stub) ─────────────────────────────────────────────────
  tasks: {
    registerTaskProvider() { return new Disposable(() => {}); },
    fetchTasks() { return Promise.resolve([]); },
    executeTask() { return Promise.resolve({ terminate() {} }); },
    onDidStartTask: (listener) => new Disposable(() => {}),
    onDidEndTask: (listener) => new Disposable(() => {}),
    taskExecutions: [],
  },

  // ── authentication namespace (stub) ───────────────────────────────────────
  authentication: {
    getSession() { return Promise.resolve(undefined); },
    getSessions() { return Promise.resolve([]); },
    registerAuthenticationProvider() { return new Disposable(() => {}); },
    onDidChangeSessions: (listener) => new Disposable(() => {}),
  },

  // ── notebook namespace (stub) ─────────────────────────────────────────────
  notebooks: {
    registerNotebookCellStatusBarItemProvider() { return new Disposable(() => {}); },
    registerNotebookSerializer() { return new Disposable(() => {}); },
    onDidOpenNotebookDocument: (listener) => new Disposable(() => {}),
    onDidCloseNotebookDocument: (listener) => new Disposable(() => {}),
    onDidSaveNotebookDocument: (listener) => new Disposable(() => {}),
    onDidChangeNotebookDocument: (listener) => new Disposable(() => {}),
  },

  // ── l10n namespace (stub) ─────────────────────────────────────────────────
  l10n: {
    t(message, ...args) {
      if (args.length === 0) return message;
      return message.replace(/\{(\d+)\}/g, (_, i) => String(args[i] ?? ""));
    },
    uri: undefined,
    bundle: undefined,
  },
};

export default vscode;

// Named exports so extensions using `import { window } from 'vscode'` also work.
export {
  languages, commands, workspace, extensions,
  Disposable, EventEmitter, Uri,
};
export const window = window_;
export const {
  Position, Range, Selection, Location,
  Diagnostic, MarkdownString, Hover,
  CompletionItem, CompletionList, CompletionItemKind, CompletionItemTag, CompletionTriggerKind,
  DiagnosticSeverity, DiagnosticTag,
  SymbolKind, DocumentSymbol,
  SignatureHelp, SignatureInformation, ParameterInformation,
  SnippetString, ThemeColor, ThemeIcon, RelativePattern,
  ViewColumn, EndOfLine, FileType, ExtensionMode, ConfigurationTarget,
  StatusBarAlignment, ProgressLocation, TreeItemCollapsibleState,
  TextEditorRevealType, TextEditorSelectionChangeKind,
  OverviewRulerLane, DecorationRangeBehavior, DocumentHighlightKind,
  CodeActionKind, SignatureHelpTriggerKind, InlayHintKind, FoldingRangeKind,
} = types;

export const version = vscode.version;
export const env = vscode.env;
export const debug = vscode.debug;
export const scm = vscode.scm;
export const tasks = vscode.tasks;
export const authentication = vscode.authentication;
export const notebooks = vscode.notebooks;
export const l10n = vscode.l10n;
