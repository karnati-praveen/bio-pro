// extensionLoader.js — loads VS Code extensions (.vsix) into BioIDE.
//
// Two loading paths:
//   1. ESM web extensions  (package.json has a "browser" field) → Blob URL import
//   2. CJS node extensions (package.json has a "main" field)    → new Function eval
//
// In both cases `require('vscode')` / `import from 'vscode'` resolves to the
// vscode-shim via either the import map (ESM) or virtualRequire (CJS).

import { makeExtensionContext } from "./vscode-shim/extension-context.js";
import { useExtensionStore } from "../stores/extensionStore.js";
import { _onDidChangeExtensionsEmitter } from "./vscode-shim/extensions.js";
import { isTauri } from "./tauriFs.js";
import { registerExtensionAssets } from "./vscode-shim/asset-registry.js";

// ── Extension persistence directory ──────────────────────────────────────────

async function _getExtensionsDir() {
  if (!isTauri) return null;
  try {
    const { homeDir } = await import("@tauri-apps/api/path");
    const home = await homeDir();
    return `${home}/.bio-pro/extensions`;
  } catch {
    return null;
  }
}

export async function saveVsixToDisk(extensionId, bytes) {
  if (!isTauri) return;
  const dir = await _getExtensionsDir();
  if (!dir) return;
  const { tauriEnsureDir, tauriWriteBinaryFile } = await import("./tauriFs.js");
  await tauriEnsureDir(dir);
  const safeId = extensionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  await tauriWriteBinaryFile(`${dir}/${safeId}.vsix`, bytes);
}

export async function loadPersistedExtensions() {
  if (!isTauri) return;
  const dir = await _getExtensionsDir();
  if (!dir) return;
  const { tauriEnsureDir, tauriListAllFiles, tauriReadBinaryFile } = await import("./tauriFs.js");
  await tauriEnsureDir(dir);
  const files = await tauriListAllFiles(dir);
  for (const f of files) {
    if (!f.name.endsWith(".vsix")) continue;
    try {
      const bytes = await tauriReadBinaryFile(f.path);
      await loadVsix(bytes);
      console.info(`[vscode-shim] Reloaded persisted extension: ${f.name}`);
    } catch (e) {
      console.error(`[vscode-shim] Failed to reload extension ${f.name}:`, e);
    }
  }
}

// ── Node.js built-in stubs for CJS bundles ────────────────────────────────────
// We lazy-import path-browserify and events only when needed so they don't bloat
// the main bundle if no CJS extensions are loaded.

async function _getNodeStubs() {
  const stubs = {};

  try {
    stubs.path = await import("path-browserify");
  } catch {
    stubs.path = {
      join: (...parts) => parts.join("/").replace(/\/+/g, "/"),
      resolve: (...parts) => "/" + parts.join("/").replace(/\/+/g, "/"),
      dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
      basename: (p, ext) => { const b = p.split("/").pop() ?? p; return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; },
      extname: (p) => { const i = p.lastIndexOf("."); return i > 0 ? p.slice(i) : ""; },
      sep: "/",
      delimiter: ":",
      normalize: (p) => p.replace(/\/+/g, "/"),
      isAbsolute: (p) => p.startsWith("/"),
    };
  }

  try {
    stubs.events = (await import("events")).default ?? (await import("events"));
  } catch {
    stubs.events = {
      EventEmitter: class {
        constructor() { this._events = {}; }
        on(ev, fn) { (this._events[ev] ??= []).push(fn); return this; }
        off(ev, fn) { this._events[ev] = (this._events[ev] ?? []).filter((f) => f !== fn); return this; }
        emit(ev, ...args) { (this._events[ev] ?? []).forEach((f) => f(...args)); }
        once(ev, fn) { const w = (...a) => { this.off(ev, w); fn(...a); }; return this.on(ev, w); }
        removeAllListeners(ev) { if (ev) delete this._events[ev]; else this._events = {}; return this; }
        listeners(ev) { return [...(this._events[ev] ?? [])]; }
      },
    };
  }

  return stubs;
}

// ── VSIX unpack ───────────────────────────────────────────────────────────────

async function _unpackVsix(bytes) {
  const { unzipSync } = await import("fflate");
  return unzipSync(bytes); // returns { [path: string]: Uint8Array }
}

function _parseManifestXml(xmlBytes) {
  const text = new TextDecoder().decode(xmlBytes);
  const id = (text.match(/Id[^>]*>([^<]+)/)?.[1] ?? "unknown").trim();
  const publisher = (text.match(/Publisher[^>]*>([^<]+)/)?.[1] ?? "unknown").trim();
  const version = (text.match(/Version[^>]*>([^<]+)/)?.[1] ?? "0.0.0").trim();
  return { id, publisher, version, fullId: `${publisher}.${id}` };
}

function _parsePackageJson(bytes) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}

// ── CJS virtualRequire ────────────────────────────────────────────────────────

function _makeVirtualRequire(vscode, nodeStubs) {
  const cache = new Map();

  function virtualRequire(id) {
    if (id === "vscode") return vscode;
    if (cache.has(id)) return cache.get(id);

    // Node built-ins
    if (id === "path") return nodeStubs.path;
    if (id === "events") return nodeStubs.events;
    if (id === "util") return { promisify: (fn) => (...args) => new Promise((res, rej) => fn(...args, (e, v) => e ? rej(e) : res(v))), format: String };
    if (id === "os") return { platform: () => "linux", homedir: () => "/", tmpdir: () => "/tmp", EOL: "\n", arch: () => "x64" };
    if (id === "assert") return { ok: (v, m) => { if (!v) throw new Error(m); }, strictEqual: (a, b, m) => { if (a !== b) throw new Error(m); } };
    if (id === "buffer") return { Buffer: typeof Buffer !== "undefined" ? Buffer : { from: (d) => new Uint8Array(d), isBuffer: () => false } };
    if (id === "fs") return _makeFsStub();
    if (id === "child_process") return _makeChildProcessStub();
    if (id === "net") return { createServer: () => ({ listen() {}, on() {} }), Socket: class {} };
    if (id === "tty") return { isatty: () => false };
    if (id === "crypto") return { randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)), createHash: () => ({ update() { return this; }, digest: () => "" }) };

    // Common npm packages that bio extensions bundle
    if (id === "vscode-languageserver-types") return _makeLspTypes();
    if (id === "vscode-uri") return { URI: { parse: (s) => ({ toString: () => s, fsPath: s }), file: (p) => ({ toString: () => `file://${p}`, fsPath: p }) } };

    console.warn(`[vscode-shim] virtualRequire: unresolved module '${id}' — returning empty object`);
    const stub = {};
    cache.set(id, stub);
    return stub;
  }

  virtualRequire.resolve = (id) => id;
  virtualRequire.main = { filename: "/extension/main.js" };
  virtualRequire.cache = {};
  return virtualRequire;
}

function _makeFsStub() {
  return {
    readFile(path, options, cb) {
      if (typeof options === "function") { cb = options; options = {}; }
      import("./tauriFs.js").then(({ tauriReadFile }) => {
        tauriReadFile(path).then((t) => cb(null, t)).catch(cb);
      });
    },
    writeFile(path, data, options, cb) {
      if (typeof options === "function") { cb = options; options = {}; }
      import("./tauriFs.js").then(({ tauriWriteFile }) => {
        const text = typeof data === "string" ? data : new TextDecoder().decode(data);
        tauriWriteFile(path, text).then(() => cb(null)).catch(cb);
      });
    },
    existsSync: () => false,
    mkdirSync: () => {},
    readdirSync: () => [],
    statSync: () => ({ isFile: () => true, isDirectory: () => false }),
    promises: {
      readFile: (p) => import("./tauriFs.js").then(({ tauriReadFile }) => tauriReadFile(p)),
      writeFile: (p, d) => import("./tauriFs.js").then(({ tauriWriteFile }) => tauriWriteFile(p, typeof d === "string" ? d : new TextDecoder().decode(d))),
    },
  };
}

function _makeChildProcessStub() {
  return {
    spawn: () => ({
      stdout: { on() {}, pipe() {} },
      stderr: { on() {}, pipe() {} },
      stdin: { write() {}, end() {} },
      on() {},
      kill() {},
    }),
    exec: (cmd, opts, cb) => {
      if (typeof opts === "function") cb = opts;
      if (cb) cb(null, "", "");
    },
  };
}

function _makeLspTypes() {
  return {
    DiagnosticSeverity: { Error: 1, Warning: 2, Information: 3, Hint: 4 },
    CompletionItemKind: { Text: 1, Method: 2, Function: 3, Constructor: 4, Field: 5, Variable: 6, Class: 7, Interface: 8, Module: 9, Property: 10, Unit: 11, Value: 12, Enum: 13, Keyword: 14, Snippet: 15, Color: 16, File: 17, Reference: 18, Folder: 19, EnumMember: 20, Constant: 21, Struct: 22, Event: 23, Operator: 24, TypeParameter: 25 },
    SymbolKind: { File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4, Method: 5, Property: 6, Field: 7, Constructor: 8, Enum: 9, Interface: 10, Function: 11, Variable: 12, Constant: 13, String: 14, Number: 15, Boolean: 16, Array: 17, Object: 18 },
    TextDocumentSyncKind: { None: 0, Full: 1, Incremental: 2 },
    Position: class { constructor(l, c) { this.line = l; this.character = c; } },
    Range: class { constructor(s, e) { this.start = s; this.end = e; } },
  };
}

// ── CJS bundle evaluation ─────────────────────────────────────────────────────

function _evalCjsBundle(source, vscode, nodeStubs) {
  const module = { exports: {} };
  const exports = module.exports;
  const require = _makeVirtualRequire(vscode, nodeStubs);

  // Detect webpack runtime and handle it.
  if (source.includes("__webpack_require__") || source.includes("webpackChunk")) {
    // Inject a shim for webpack's self-executing bundle pattern.
    source = `var __webpack_require__=function(id){return require(id)};__webpack_require__.m={};__webpack_require__.c={};__webpack_require__.d=function(e,n,g){if(!Object.prototype.hasOwnProperty.call(e,n)){Object.defineProperty(e,n,{enumerable:true,get:g})}};__webpack_require__.r=function(){};__webpack_require__.n=function(m){return m&&m.__esModule?m:function(){return m}};__webpack_require__.o=function(o,p){return Object.prototype.hasOwnProperty.call(o,p)};__webpack_require__.p="";
` + source;
  }

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("require", "module", "exports", "__dirname", "__filename", source);
    fn(require, module, exports, "/extension", "/extension/main.js");
  } catch (e) {
    throw new Error(`[vscode-shim] CJS bundle eval failed: ${e.message}`);
  }

  return module.exports;
}

// ── ESM web extension loading ─────────────────────────────────────────────────

async function _loadEsmExtension(source, vscode) {
  // Prepend a helper that makes the module's `import from 'vscode'` work even
  // if the import map isn't set up (e.g., loaded from a data URL).
  const preamble = `
// vscode-shim injected preamble
const __vscode__ = globalThis.__vscode_shim__ ?? {};
`;

  // Replace bare `from 'vscode'` with `from 'vscode'` — handled by import map.
  // If the import map isn't present, fall back to a data URL import of the shim.
  const patched = preamble + source;

  const blob = new Blob([patched], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ blobUrl);
    return mod;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

// ── Activation events ─────────────────────────────────────────────────────────

function _scheduleActivation(extensionId, manifest, activateFn) {
  const events = manifest.activationEvents ?? [];

  // Immediate activation.
  if (events.includes("*") || events.length === 0) {
    setTimeout(activateFn, 0);
    return;
  }

  for (const event of events) {
    if (event.startsWith("onLanguage:")) {
      const langId = event.slice("onLanguage:".length);
      _watchForLanguage(langId, activateFn);
    } else if (event.startsWith("onCommand:")) {
      const cmdId = event.slice("onCommand:".length);
      _wrapCommandForActivation(cmdId, activateFn);
    } else if (event === "onStartupFinished") {
      setTimeout(activateFn, 100);
    }
  }
}

function _watchForLanguage(langId, activateFn) {
  let activated = false;
  import("../stores/tabStore.js").then(({ useTabStore }) => {
    const unsubscribe = useTabStore.subscribe((state) => {
      if (activated) { unsubscribe(); return; }
      const active = state.activeTab?.();
      if (active?.meta?.language === langId || active?.filePath?.endsWith(`.${langId}`)) {
        activated = true;
        unsubscribe();
        activateFn();
      }
    });
  });
}

function _wrapCommandForActivation(cmdId, activateFn) {
  let activated = false;
  import("./vscode-shim/commands.js").then(({ createCommandsNamespace }) => {
    import("../shell/commands.js").then(({ registerCommand }) => {
      if (!registerCommand) return;
      registerCommand(cmdId, async (...args) => {
        if (!activated) {
          activated = true;
          await activateFn();
        }
      });
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load a .vsix file from a Uint8Array of its bytes.
 * Returns the extension descriptor added to extensionStore.
 */
export async function loadVsix(bytes) {
  const files = await _unpackVsix(bytes);
  const manifestBytes = files["extension.vsixmanifest"] ?? files["extension/.vsixmanifest"];
  if (!manifestBytes) throw new Error("Invalid VSIX: missing extension.vsixmanifest");

  const meta = _parseManifestXml(manifestBytes);
  const pkgBytes = files["extension/package.json"];
  if (!pkgBytes) throw new Error("Invalid VSIX: missing extension/package.json");
  const manifest = _parsePackageJson(pkgBytes);

  const extensionId = manifest.publisher
    ? `${manifest.publisher}.${manifest.name}`
    : meta.fullId;

  console.info(`[vscode-shim] Loading extension: ${extensionId} v${manifest.version ?? meta.version}`);

  const vscodeShim = (await import("./vscode-shim/index.js")).default;
  const nodeStubs = await _getNodeStubs();
  const context = makeExtensionContext(extensionId);

  // Determine entry point.
  const isWebExt = !!manifest.browser;
  const entryPath = isWebExt
    ? `extension/${manifest.browser}`
    : `extension/${manifest.main ?? "out/extension.js"}`;

  const entryBytes = files[entryPath] ?? files[entryPath.replace(/\\/g, "/")];
  if (!entryBytes) throw new Error(`VSIX entry not found: ${entryPath}`);

  const source = new TextDecoder().decode(entryBytes);

  let api;
  let activateExports;

  if (isWebExt) {
    activateExports = await _loadEsmExtension(source, vscodeShim);
  } else {
    activateExports = _evalCjsBundle(source, vscodeShim, nodeStubs);
  }

  const descriptor = { id: extensionId, manifest, context, api: null, files };

  // Register VSIX asset Blob URLs so asWebviewUri can serve them from iframes.
  registerExtensionAssets(extensionId, files);

  const activateFn = async () => {
    // Capture unhandled rejections from this extension during its activation
    // window so they don't bubble up as unhandled errors in the host app.
    const _rejectionHandler = (e) => {
      e.preventDefault();
      console.error(`[vscode-shim] Unhandled rejection in ${extensionId}:`, e.reason);
    };
    window.addEventListener("unhandledrejection", _rejectionHandler);
    try {
      if (typeof activateExports?.activate === "function") {
        api = await activateExports.activate(context);
        descriptor.api = api;
        console.info(`[vscode-shim] Extension activated: ${extensionId}`);
      }
    } catch (e) {
      console.error(`[vscode-shim] Extension ${extensionId} activation failed:`, e);
    } finally {
      window.removeEventListener("unhandledrejection", _rejectionHandler);
    }
  };

  useExtensionStore.getState().registerExtension(descriptor);
  _onDidChangeExtensionsEmitter.fire();

  _scheduleActivation(extensionId, manifest, activateFn);

  return descriptor;
}

/**
 * Load a .vsix from a URL (for development / testing).
 */
export async function loadFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return loadVsix(bytes);
}

/**
 * Load a .vsix from a File object (drag-and-drop or file picker).
 * Also saves to ~/.bio-pro/extensions/ for persistence across restarts.
 */
export async function loadFromFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const descriptor = await loadVsix(bytes);
  // Persist asynchronously — don't block the UI on disk write.
  saveVsixToDisk(descriptor.id, bytes).catch((e) =>
    console.warn(`[vscode-shim] Could not persist extension ${descriptor.id}:`, e)
  );
  return descriptor;
}
