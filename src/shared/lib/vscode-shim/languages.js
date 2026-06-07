// vscode.languages namespace shim.
// Translates VS Code provider registrations into equivalent Monaco registrations.
// Key invariant: VS Code uses 0-based (line, character); Monaco uses 1-based
// (lineNumber, column). All conversions go through vsToMo / moToVs.

import { Disposable } from "./event-emitter.js";
import { DiagnosticCollection, onDidChangeDiagnosticsEmitter } from "./diagnostic-collection.js";
import { monacoModelToTextDocument } from "./text-document.js";
import { Position, Range, Hover, CompletionList } from "./types.js";
import { getMonaco } from "./boot.js";

// ── Coordinate helpers ────────────────────────────────────────────────────────

export function vsToMo(vsPos) {
  return { lineNumber: vsPos.line + 1, column: vsPos.character + 1 };
}

export function moToVs(moPos) {
  return new Position(moPos.lineNumber - 1, moPos.column - 1);
}

export function vsRangeToMo(range) {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

export function moRangeToVs(moRange) {
  return new Range(
    moRange.startLineNumber - 1, moRange.startColumn - 1,
    moRange.endLineNumber - 1, moRange.endColumn - 1,
  );
}

// ── Language selector helper ──────────────────────────────────────────────────

function selectorToLangId(selector) {
  if (typeof selector === "string") return selector;
  if (Array.isArray(selector)) return selector.map(selectorToLangId);
  if (selector && typeof selector === "object") return selector.language ?? "*";
  return "*";
}

// Register a Monaco provider that accepts an array of language IDs.
function registerForLanguages(langIds, registerFn) {
  const disposables = [];
  const ids = Array.isArray(langIds) ? langIds.flat() : [langIds];
  for (const id of ids) {
    if (id && id !== "*") disposables.push(registerFn(id));
  }
  return new Disposable(() => disposables.forEach((d) => d?.dispose()));
}

// ── CompletionItem translation ────────────────────────────────────────────────

function vscCompletionItemToMonaco(item, monaco, defaultRange) {
  const kind = item.kind ?? 1; // Text
  let insertText = typeof item.insertText === "string"
    ? item.insertText
    : item.insertText?.value ?? (typeof item.label === "string" ? item.label : item.label.label);

  const result = {
    label: typeof item.label === "string" ? item.label : item.label.label,
    kind,
    detail: item.detail,
    documentation: item.documentation instanceof Object ? { value: item.documentation.value ?? "" } : item.documentation,
    sortText: item.sortText,
    filterText: item.filterText,
    insertText,
    range: item.range ? vsRangeToMo(item.range instanceof Range ? item.range : item.range.inserting ?? item.range) : defaultRange,
    commitCharacters: item.commitCharacters,
    tags: item.tags,
    insertTextRules: item.insertText?.value
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
  };
  return result;
}

// ── vscode.languages implementation ──────────────────────────────────────────

export function createLanguagesNamespace() {
  return {
    // Completion providers
    registerCompletionItemProvider(selector, provider, ...triggerChars) {
      const monaco = getMonaco();
      if (!monaco) return new Disposable(() => {});
      const langIds = selectorToLangId(selector);
      return registerForLanguages(langIds, (langId) =>
        monaco.languages.registerCompletionItemProvider(langId, {
          triggerCharacters: triggerChars.length > 0 ? triggerChars : undefined,
          async provideCompletionItems(model, position, context) {
            const doc = monacoModelToTextDocument(model);
            const pos = moToVs(position);
            const ctx = {
              triggerKind: context.triggerKind,
              triggerCharacter: context.triggerCharacter,
            };
            const result = await provider.provideCompletionItems(doc, pos, ctx, { isCancellationRequested: false });
            if (!result) return { suggestions: [] };
            const items = result.items ?? result;
            const word = model.getWordUntilPosition(position);
            const defaultRange = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };
            return {
              suggestions: items.map((item) => vscCompletionItemToMonaco(item, monaco, defaultRange)),
              incomplete: result.isIncomplete ?? false,
            };
          },
        }),
      );
    },

    // Hover providers
    registerHoverProvider(selector, provider) {
      const monaco = getMonaco();
      if (!monaco) return new Disposable(() => {});
      const langIds = selectorToLangId(selector);
      return registerForLanguages(langIds, (langId) =>
        monaco.languages.registerHoverProvider(langId, {
          async provideHover(model, position) {
            const doc = monacoModelToTextDocument(model);
            const pos = moToVs(position);
            const result = await provider.provideHover(doc, pos, { isCancellationRequested: false });
            if (!result) return null;
            const contents = result.contents.map((c) =>
              typeof c === "string" ? { value: c } : { value: c.value ?? "" },
            );
            return {
              contents,
              range: result.range ? vsRangeToMo(result.range) : undefined,
            };
          },
        }),
      );
    },

    // Definition providers
    registerDefinitionProvider(selector, provider) {
      const monaco = getMonaco();
      if (!monaco) return new Disposable(() => {});
      const langIds = selectorToLangId(selector);
      return registerForLanguages(langIds, (langId) =>
        monaco.languages.registerDefinitionProvider(langId, {
          async provideDefinition(model, position) {
            const doc = monacoModelToTextDocument(model);
            const pos = moToVs(position);
            const result = await provider.provideDefinition(doc, pos, { isCancellationRequested: false });
            if (!result) return null;
            const arr = Array.isArray(result) ? result : [result];
            return arr.map((loc) => ({
              uri: monaco.Uri.parse(loc.uri.toString()),
              range: vsRangeToMo(loc.range),
            }));
          },
        }),
      );
    },

    // Document symbol providers
    registerDocumentSymbolProvider(selector, provider) {
      const monaco = getMonaco();
      if (!monaco) return new Disposable(() => {});
      const langIds = selectorToLangId(selector);
      return registerForLanguages(langIds, (langId) =>
        monaco.languages.registerDocumentSymbolProvider(langId, {
          async provideDocumentSymbols(model) {
            const doc = monacoModelToTextDocument(model);
            const result = await provider.provideDocumentSymbols(doc, { isCancellationRequested: false });
            if (!result) return [];
            return result.map((sym) => ({
              name: sym.name,
              detail: sym.detail ?? "",
              kind: sym.kind,
              range: vsRangeToMo(sym.range),
              selectionRange: vsRangeToMo(sym.selectionRange),
              tags: sym.tags,
              children: sym.children?.map?.((c) => ({
                name: c.name, detail: c.detail ?? "", kind: c.kind,
                range: vsRangeToMo(c.range), selectionRange: vsRangeToMo(c.selectionRange),
              })) ?? [],
            }));
          },
        }),
      );
    },

    // Signature help providers
    registerSignatureHelpProvider(selector, provider, metaOrTriggers) {
      const monaco = getMonaco();
      if (!monaco) return new Disposable(() => {});
      const langIds = selectorToLangId(selector);
      const meta = metaOrTriggers ?? {};
      return registerForLanguages(langIds, (langId) =>
        monaco.languages.registerSignatureHelpProvider(langId, {
          signatureHelpTriggerCharacters: meta.triggerCharacters ?? [],
          signatureHelpRetriggerCharacters: meta.retriggerCharacters ?? [],
          async provideSignatureHelp(model, position, token, context) {
            const doc = monacoModelToTextDocument(model);
            const pos = moToVs(position);
            const result = await provider.provideSignatureHelp(doc, pos, token, context);
            if (!result) return null;
            const sh = result.value ?? result;
            return {
              value: {
                signatures: sh.signatures.map((sig) => ({
                  label: sig.label,
                  documentation: sig.documentation ? { value: sig.documentation.value ?? sig.documentation } : undefined,
                  parameters: (sig.parameters ?? []).map((p) => ({
                    label: p.label,
                    documentation: p.documentation ? { value: p.documentation.value ?? p.documentation } : undefined,
                  })),
                  activeParameter: sig.activeParameter,
                })),
                activeSignature: sh.activeSignature,
                activeParameter: sh.activeParameter,
              },
              dispose() {},
            };
          },
        }),
      );
    },

    // Language configuration (bracket matching, indentation, etc.)
    setLanguageConfiguration(languageId, config) {
      const monaco = getMonaco();
      if (!monaco) return new Disposable(() => {});
      const d = monaco.languages.setLanguageConfiguration(languageId, config);
      return new Disposable(() => d?.dispose?.());
    },

    // Diagnostic collections
    createDiagnosticCollection(name) {
      return new DiagnosticCollection(name ?? "unnamed");
    },

    getDiagnostics(uri) {
      const monaco = getMonaco();
      if (!monaco) return uri ? [] : [];
      if (uri) {
        const markers = monaco.editor.getModelMarkers({});
        return markers
          .filter((m) => {
            const mp = m.resource?.path ?? "";
            const up = uri.path ?? uri.fsPath ?? "";
            return mp === up || mp.endsWith(up) || up.endsWith(mp);
          })
          .map(_markerToDiagnostic);
      }
      return monaco.editor.getModelMarkers({}).map(_markerToDiagnostic);
    },

    get onDidChangeDiagnostics() {
      return onDidChangeDiagnosticsEmitter.event;
    },

    match(selector, document) {
      const langId = selectorToLangId(selector);
      const ids = Array.isArray(langId) ? langId : [langId];
      return ids.includes(document.languageId) || ids.includes("*") ? 10 : 0;
    },

    // Language registration (for extensions that register new language IDs)
    getLanguages() {
      const monaco = getMonaco();
      return monaco ? monaco.languages.getLanguages().map((l) => l.id) : [];
    },
  };
}

function _markerToDiagnostic(marker) {
  const monaco = getMonaco();
  const { Diagnostic: D, Range: R, Position: P, DiagnosticSeverity: DS } = {
    Diagnostic: class { constructor(r, m, s) { this.range = r; this.message = m; this.severity = s; } },
    Range, Position,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  };
  let sev = DS.Error;
  if (monaco) {
    if (marker.severity === monaco.MarkerSeverity.Warning) sev = DS.Warning;
    else if (marker.severity === monaco.MarkerSeverity.Info) sev = DS.Information;
    else if (marker.severity === monaco.MarkerSeverity.Hint) sev = DS.Hint;
  }
  const range = new R(
    new P(marker.startLineNumber - 1, marker.startColumn - 1),
    new P(marker.endLineNumber - 1, marker.endColumn - 1),
  );
  const d = new D(range, marker.message, sev);
  d.source = marker.source;
  d.code = marker.code;
  return d;
}
