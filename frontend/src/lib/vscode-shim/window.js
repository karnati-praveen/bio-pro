// vscode.window namespace shim.

import { EventEmitter, Disposable } from "./event-emitter.js";
import { TextEditor } from "./text-editor.js";
import { createOutputChannel } from "./output-channel.js";
import { getMonaco } from "./boot.js";
import { useUiStore } from "../../stores/uiStore.js";
import { useTabStore } from "../../stores/tabStore.js";
import { useExtensionStore } from "../../stores/extensionStore.js";
import { tauriOpenFolder, isTauri } from "../tauriFs.js";
import { resolveExtensionAsset } from "./asset-registry.js";

export const _onDidChangeActiveTextEditorEmitter = new EventEmitter();
export const _onDidChangeVisibleTextEditorsEmitter = new EventEmitter();
export const _onDidChangeTextEditorSelectionEmitter = new EventEmitter();

function _activeMonacoEditor() {
  const monaco = getMonaco();
  return monaco?.editor.getEditors()[0] ?? null;
}

export function createWindowNamespace() {
  return {
    showInformationMessage(message, ...itemsOrOptions) {
      return _showMessage("ℹ", message, itemsOrOptions);
    },
    showWarningMessage(message, ...itemsOrOptions) {
      return _showMessage("⚠", message, itemsOrOptions);
    },
    showErrorMessage(message, ...itemsOrOptions) {
      return _showMessage("✖", message, itemsOrOptions);
    },

    createOutputChannel(name) {
      return createOutputChannel(name);
    },

    showQuickPick(items, options) {
      return new Promise((resolve) => {
        const resolved = Array.isArray(items) ? Promise.resolve(items) : items;
        resolved.then((list) => {
          useUiStore.getState().showQuickPick(list, options ?? {}, (selected) => resolve(selected));
        });
      });
    },

    showInputBox(options) {
      return new Promise((resolve) => {
        useUiStore.getState().showInputBox(options ?? {}, (value) => resolve(value));
      });
    },

    withProgress(options, task) {
      const title = options?.title ?? "";
      const ui = useUiStore.getState();
      ui.startProgress(title || "Working…");
      const progress = {
        report({ message, increment }) {
          if (message) {
            ui.reportProgress(message);
            ui.setStatus(message);
          }
        },
      };
      const token = { isCancellationRequested: false, onCancellationRequested: () => new Disposable(() => {}) };
      return Promise.resolve(task(progress, token)).then((r) => {
        ui.endProgress();
        ui.setStatus(title ? `${title} done.` : "Ready");
        return r;
      }).catch((e) => {
        ui.endProgress();
        throw e;
      });
    },

    get activeTextEditor() {
      const editor = _activeMonacoEditor();
      return editor ? new TextEditor(editor) : undefined;
    },

    get visibleTextEditors() {
      const monaco = getMonaco();
      return monaco ? monaco.editor.getEditors().map((e) => new TextEditor(e)) : [];
    },

    get onDidChangeActiveTextEditor()      { return _onDidChangeActiveTextEditorEmitter.event; },
    get onDidChangeVisibleTextEditors()    { return _onDidChangeVisibleTextEditorsEmitter.event; },
    get onDidChangeTextEditorSelection()   { return _onDidChangeTextEditorSelectionEmitter.event; },
    get onDidChangeTextEditorVisibleRanges() { return (l) => new Disposable(() => {}); },
    get onDidChangeTextEditorOptions()     { return (l) => new Disposable(() => {}); },

    async showTextDocument(uriOrDoc) {
      const path = typeof uriOrDoc === "string"
        ? uriOrDoc
        : (uriOrDoc.fsPath ?? uriOrDoc.path ?? uriOrDoc.fileName ?? "");
      useTabStore.getState().openTab({
        type: "circuit",
        title: path.split(/[\\/]/).pop() || "file",
        filePath: path,
        content: "",
      });
      const editor = _activeMonacoEditor();
      return editor ? new TextEditor(editor) : undefined;
    },

    createTextEditorDecorationType(options) {
      const monaco = getMonaco();
      if (!monaco) return { key: "", _ids: [], dispose() {} };
      const type = { key: String(Date.now()), _ids: [], dispose() {} };
      return type;
    },

    createWebviewPanel(viewType, title, showOptions, options) {
      const tabStore = useTabStore.getState();
      const extStore = useExtensionStore.getState();
      const tabId = tabStore.openTab({
        type: "webview",
        title,
        filePath: null,
        meta: { webviewType: viewType, retainContextWhenHidden: options?.retainContextWhenHidden ?? false },
      });
      const panel = _makeWebviewPanel(tabId, viewType, title, options);
      extStore.registerWebviewPanel(tabId, panel);
      return panel;
    },

    registerWebviewViewProvider(viewId, provider, options) {
      useExtensionStore.getState().registerWebviewViewProvider(viewId, provider, options ?? {});
      useUiStore.getState().addActivityItem({ id: `ext:${viewId}`, title: viewId });
      return new Disposable(() => {
        useExtensionStore.getState().registerWebviewViewProvider(viewId, null, {});
        useUiStore.getState().removeActivityItem(`ext:${viewId}`);
      });
    },

    createTerminal(options) {
      return {
        name: options?.name ?? "Terminal",
        processId: Promise.resolve(undefined),
        creationOptions: options ?? {},
        exitStatus: undefined,
        state: { isInteractedWith: false },
        sendText() {},
        show() { useUiStore.getState().setBottomTab("terminal"); },
        hide() {},
        dispose() {},
      };
    },

    get terminals() { return []; },
    get onDidOpenTerminal()          { return (l) => new Disposable(() => {}); },
    get onDidCloseTerminal()         { return (l) => new Disposable(() => {}); },
    get onDidChangeActiveTerminal()  { return (l) => new Disposable(() => {}); },

    createStatusBarItem(alignmentOrId, priority) {
      let text = "";
      return {
        id: typeof alignmentOrId === "string" ? alignmentOrId : "ext-status",
        alignment: 1, priority: priority ?? 0,
        get text() { return text; },
        set text(v) { text = v; },
        tooltip: "", color: undefined, backgroundColor: undefined, command: undefined,
        show() { useUiStore.getState().setStatus(text); },
        hide() {},
        dispose() {},
      };
    },

    createTreeView(viewId) {
      return {
        visible: false, selection: [],
        onDidChangeSelection: (l) => new Disposable(() => {}),
        onDidChangeVisibility: (l) => new Disposable(() => {}),
        onDidCollapseElement: (l) => new Disposable(() => {}),
        onDidExpandElement: (l) => new Disposable(() => {}),
        reveal() { return Promise.resolve(); },
        dispose() {},
      };
    },

    get state() { return { focused: document.hasFocus() }; },
    get onDidChangeWindowState() { return (l) => new Disposable(() => {}); },

    async showOpenDialog() {
      if (!isTauri) return undefined;
      const result = await tauriOpenFolder();
      return result ? [{ fsPath: result, path: result, scheme: "file", toString: () => result }] : undefined;
    },
    async showSaveDialog() { return undefined; },
  };
}

function _showMessage(prefix, message, itemsOrOptions) {
  const items = itemsOrOptions.filter((i) => typeof i === "string" || (i && typeof i.label === "string"));
  const label = `${prefix} ${message}`;
  if (items.length === 0) {
    useUiStore.getState().setStatus(label);
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    useUiStore.getState().showNotification(label, items, (selected) => resolve(selected));
  });
}

function _makeWebviewPanel(tabId, viewType, title, options) {
  let _html = "";
  let _disposed = false;
  const onDisposeEmitter = new EventEmitter();
  const onMessageEmitter = new EventEmitter();

  const webview = {
    options: options ?? { enableScripts: true },
    cspSource: "'self' blob: data:",
    get html() { return _html; },
    set html(value) {
      _html = value;
      window.dispatchEvent(new CustomEvent("vscode-webview-html-update", { detail: { tabId, html: value } }));
    },
    get onDidReceiveMessage() { return onMessageEmitter.event; },
    postMessage(message) {
      window.dispatchEvent(new CustomEvent("vscode-webview-post-message", { detail: { tabId, message } }));
      return Promise.resolve(true);
    },
    asWebviewUri(uri) {
      // Convert a VSIX-internal URI to a Blob URL loadable inside an iframe.
      // Extensions call: panel.webview.asWebviewUri(Uri.joinPath(context.extensionUri, 'media', 'foo.png'))
      // extensionUri is like Uri.file('/extensions/<id>'), so the path is /extensions/<id>/media/foo.png
      const uriPath = uri?.fsPath ?? uri?.path ?? "";
      const match = uriPath.match(/^\/extensions\/([^/]+)\/(.+)$/);
      if (match) {
        const [, extId, relative] = match;
        const blobUrl = resolveExtensionAsset(extId, relative);
        if (blobUrl) return { toString: () => blobUrl, scheme: "blob", path: blobUrl };
      }
      return uri;
    },
  };

  const msgHandler = (e) => {
    if (e.detail?.tabId === tabId && e.detail?.source === "webview") {
      onMessageEmitter.fire(e.detail.message);
    }
  };
  window.addEventListener("vscode-webview-message-from-frame", msgHandler);

  return {
    webview, viewType, title,
    get visible() {
      return useTabStore.getState().groups.some((g) => g.activeTabId === tabId);
    },
    get active() { return this.visible; },
    get viewColumn() { return 1; },
    get onDidDispose() { return onDisposeEmitter.event; },
    get onDidChangeViewState() { return (l) => new Disposable(() => {}); },
    reveal() { useTabStore.getState().setActiveTab?.(tabId); },
    dispose() {
      if (_disposed) return;
      _disposed = true;
      window.removeEventListener("vscode-webview-message-from-frame", msgHandler);
      onDisposeEmitter.fire(undefined);
      try { useTabStore.getState().closeTab(tabId); } catch {}
      try { useExtensionStore.getState().removeWebviewPanel(tabId); } catch {}
    },
  };
}
