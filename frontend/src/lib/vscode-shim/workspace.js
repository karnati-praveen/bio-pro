// vscode.workspace namespace shim.

import { EventEmitter, Disposable } from "./event-emitter.js";
import { Uri } from "./uri.js";
import { monacoModelToTextDocument } from "./text-document.js";
import { getMonaco } from "./boot.js";
import { useProjectStore } from "../../stores/projectStore.js";
import { useTabStore } from "../../stores/tabStore.js";
import { tauriReadFile, tauriWriteFile, isTauri } from "../tauriFs.js";

// Event emitters — singletons wired to store subscriptions in boot.js.
export const _onDidOpenTextDocumentEmitter = new EventEmitter();
export const _onDidCloseTextDocumentEmitter = new EventEmitter();
export const _onDidChangeTextDocumentEmitter = new EventEmitter();
export const _onDidSaveTextDocumentEmitter = new EventEmitter();
export const _onDidChangeConfigurationEmitter = new EventEmitter();
export const _onDidChangeWorkspaceFoldersEmitter = new EventEmitter();

// Per-extension config overrides.
const _extConfigMap = new Map();

function makeWorkspaceConfiguration(section) {
  return {
    get(key, defaultValue) {
      const fullKey = section ? `${section}.${key}` : key;
      if (_extConfigMap.has(fullKey)) return _extConfigMap.get(fullKey);
      const settings = useProjectStore.getState().settings ?? {};
      if (fullKey in settings) return settings[fullKey];
      if (key in settings) return settings[key];
      return defaultValue;
    },
    has(key) {
      return _extConfigMap.has(section ? `${section}.${key}` : key);
    },
    inspect() { return undefined; },
    update(key, value) {
      const fullKey = section ? `${section}.${key}` : key;
      _extConfigMap.set(fullKey, value);
      _onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (s) => s === fullKey || fullKey.startsWith(s),
      });
      return Promise.resolve();
    },
  };
}

export function createWorkspaceNamespace() {
  return {
    get name() {
      const root = useProjectStore.getState().rootPath;
      return root ? root.split(/[\\/]/).pop() : undefined;
    },

    get workspaceFolders() {
      const root = useProjectStore.getState().rootPath;
      if (!root) return undefined;
      return [{ uri: Uri.file(root), name: root.split(/[\\/]/).pop(), index: 0 }];
    },

    get textDocuments() {
      const monaco = getMonaco();
      if (!monaco) return [];
      return monaco.editor.getModels().map(monacoModelToTextDocument);
    },

    getConfiguration(section) {
      return makeWorkspaceConfiguration(section);
    },

    async openTextDocument(uriOrPath) {
      const path = typeof uriOrPath === "string"
        ? uriOrPath
        : (uriOrPath.fsPath ?? uriOrPath.path ?? String(uriOrPath));

      const monaco = getMonaco();
      if (monaco) {
        const existing = monaco.editor.getModels().find((m) => {
          const mp = m.uri.path;
          return mp === path || mp.endsWith(path) || path.endsWith(mp);
        });
        if (existing) return monacoModelToTextDocument(existing);
      }

      if (isTauri) {
        const content = await tauriReadFile(path);
        if (monaco) {
          const ext = path.split(".").pop()?.toLowerCase() ?? "text";
          const langMap = { biopro: "biopro", sbol: "xml", gb: "text", gbk: "text", fasta: "text", json: "json", md: "markdown" };
          const model = monaco.editor.createModel(content, langMap[ext] ?? "text", monaco.Uri.file(path));
          return monacoModelToTextDocument(model);
        }
      }

      return {
        uri: Uri.file(path), fileName: path, languageId: "text",
        isUntitled: false, isDirty: false, isClosed: false, version: 1, lineCount: 1,
        getText() { return ""; }, lineAt(n) { return { text: "", lineNumber: n }; },
        offsetAt() { return 0; }, positionAt() { return { line: 0, character: 0 }; },
        save() { return Promise.resolve(true); },
      };
    },

    async findFiles(include, exclude, maxResults) {
      const entries = useProjectStore.getState().entries ?? [];
      const pattern = typeof include === "string" ? include : (include?.pattern ?? "**/*");
      const regex = new RegExp(
        "^" + pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]") + "$"
      );
      let results = entries.filter((e) => regex.test(e.path ?? e.name));
      if (maxResults != null) results = results.slice(0, maxResults);
      return results.map((e) => Uri.file(e.path ?? e.name));
    },

    fs: {
      async readFile(uri) {
        const path = uri.fsPath ?? uri.path;
        const text = await tauriReadFile(path);
        return new TextEncoder().encode(text);
      },
      async writeFile(uri, content) {
        const path = uri.fsPath ?? uri.path;
        await tauriWriteFile(path, new TextDecoder().decode(content));
      },
      async stat() { return { type: 1, ctime: 0, mtime: Date.now(), size: 0 }; },
      async readDirectory() { return []; },
      async createDirectory() {},
      async delete() {},
      async rename() {},
      async copy() {},
      isWritableFileSystem(scheme) { return scheme === "file"; },
    },

    get onDidOpenTextDocument()          { return _onDidOpenTextDocumentEmitter.event; },
    get onDidCloseTextDocument()         { return _onDidCloseTextDocumentEmitter.event; },
    get onDidChangeTextDocument()        { return _onDidChangeTextDocumentEmitter.event; },
    get onDidSaveTextDocument()          { return _onDidSaveTextDocumentEmitter.event; },
    get onDidChangeConfiguration()       { return _onDidChangeConfigurationEmitter.event; },
    get onDidChangeWorkspaceFolders()    { return _onDidChangeWorkspaceFoldersEmitter.event; },
    get onWillSaveTextDocument()         { return (listener) => new Disposable(() => {}); },

    getWorkspaceFolder() { return this.workspaceFolders?.[0]; },
    asRelativePath(pathOrUri) {
      const p = typeof pathOrUri === "string" ? pathOrUri : (pathOrUri.fsPath ?? pathOrUri.path);
      const root = this.workspaceFolders?.[0]?.uri.path ?? "";
      return root && p.startsWith(root) ? p.slice(root.length + 1) : p;
    },
    updateWorkspaceFolders() { return false; },
    createFileSystemWatcher() {
      return {
        onDidCreate: () => new Disposable(() => {}),
        onDidChange: () => new Disposable(() => {}),
        onDidDelete: () => new Disposable(() => {}),
        dispose() {},
      };
    },
  };
}
