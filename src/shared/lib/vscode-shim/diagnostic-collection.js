// DiagnosticCollection backed by Monaco editor markers.
// Extensions call collection.set(uri, diagnostics) and we translate to
// monaco.editor.setModelMarkers so squiggles appear in the correct editor.

import { EventEmitter } from "./event-emitter.js";
import { DiagnosticSeverity } from "./types.js";
import { getMonaco } from "./boot.js";

// Shared event emitted whenever any collection changes.
export const onDidChangeDiagnosticsEmitter = new EventEmitter();

// Convert a VS Code Diagnostic to a Monaco IMarkerData.
// VS Code is 0-based; Monaco is 1-based.
function diagnosticToMarker(diag) {
  const sev = _vsToMonacoSeverity(diag.severity ?? DiagnosticSeverity.Error);
  const start = diag.range.start;
  const end = diag.range.end;
  return {
    severity: sev,
    message: diag.message,
    source: diag.source,
    code: diag.code != null ? String(diag.code) : undefined,
    startLineNumber: start.line + 1,
    startColumn: start.character + 1,
    endLineNumber: end.line + 1,
    endColumn: end.character + 1,
  };
}

function _vsToMonacoSeverity(vsSeverity) {
  const monaco = getMonaco();
  if (!monaco) return 8; // MarkerSeverity.Error fallback
  switch (vsSeverity) {
    case DiagnosticSeverity.Error:       return monaco.MarkerSeverity.Error;
    case DiagnosticSeverity.Warning:     return monaco.MarkerSeverity.Warning;
    case DiagnosticSeverity.Information: return monaco.MarkerSeverity.Info;
    case DiagnosticSeverity.Hint:        return monaco.MarkerSeverity.Hint;
    default:                             return monaco.MarkerSeverity.Error;
  }
}

// Find the Monaco model whose URI path matches a VS Code Uri.
function modelForUri(uri) {
  const monaco = getMonaco();
  if (!monaco) return null;
  const models = monaco.editor.getModels();
  const target = uri.path || uri.fsPath || "";
  return models.find((m) => {
    const mp = m.uri.path;
    return mp === target || mp.endsWith(target) || target.endsWith(mp);
  }) ?? null;
}

export class DiagnosticCollection {
  constructor(name) {
    this.name = name;
    // Map from uri.toString() → Diagnostic[]
    this._map = new Map();
  }

  set(uri, diagnostics) {
    if (!diagnostics || diagnostics.length === 0) {
      this._map.delete(uri.toString());
    } else {
      this._map.set(uri.toString(), diagnostics);
    }
    this._applyToMonaco(uri, diagnostics ?? []);
    onDidChangeDiagnosticsEmitter.fire({ uris: [uri] });
  }

  delete(uri) {
    this._map.delete(uri.toString());
    this._applyToMonaco(uri, []);
    onDidChangeDiagnosticsEmitter.fire({ uris: [uri] });
  }

  clear() {
    const uris = [...this._map.keys()];
    this._map.clear();
    const monaco = getMonaco();
    if (monaco) {
      for (const model of monaco.editor.getModels()) {
        monaco.editor.setModelMarkers(model, this.name, []);
      }
    }
    if (uris.length > 0) onDidChangeDiagnosticsEmitter.fire({ uris });
  }

  get(uri) {
    return this._map.get(uri.toString()) ?? [];
  }

  has(uri) {
    return this._map.has(uri.toString());
  }

  forEach(callback, thisArg) {
    this._map.forEach((diags, uriStr) => {
      callback.call(thisArg, uriStr, diags, this);
    });
  }

  dispose() {
    this.clear();
  }

  _applyToMonaco(uri, diagnostics) {
    const monaco = getMonaco();
    if (!monaco) return;
    const model = modelForUri(uri);
    if (!model) return;
    const markers = diagnostics.map(diagnosticToMarker);
    monaco.editor.setModelMarkers(model, this.name, markers);
  }
}
