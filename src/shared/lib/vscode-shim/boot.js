// boot(monaco) — called once in main.jsx before React renders.
// Stores the Monaco instance and wires cross-cutting store subscriptions so that
// events like onDidChangeActiveTextEditor fire correctly.

let _monaco = null;

export function getMonaco() { return _monaco; }

export function boot(monaco) {
  _monaco = monaco;

  // Expose the shim on the window so ESM Blob-URL extensions can reach it via
  // the import map fallback (window.__vscode_shim__).
  import("./index.js").then((mod) => {
    window.__vscode_shim__ = mod.default;
  });

  // Wire Monaco onDidChangeModel to fire onDidOpenTextDocument /
  // onDidCloseTextDocument for newly created / disposed models.
  _wireMonacoModelEvents(monaco);

  // Wire tabStore active-tab changes to onDidChangeActiveTextEditor.
  _wireTabStoreEvents();

  // Mirror Monaco markers into markersStore for the multi-source Problems panel.
  _wireMarkerEvents(monaco);

  console.info("[vscode-shim] Booted with Monaco", monaco.version);
}

function _wireMonacoModelEvents(monaco) {
  import("./workspace.js").then(({
    _onDidOpenTextDocumentEmitter,
    _onDidCloseTextDocumentEmitter,
    _onDidChangeTextDocumentEmitter,
  }) => {
    import("./text-document.js").then(({ monacoModelToTextDocument }) => {
      monaco.editor.onDidCreateModel((model) => {
        _onDidOpenTextDocumentEmitter.fire(monacoModelToTextDocument(model));
      });

      monaco.editor.onWillDisposeModel?.((model) => {
        _onDidCloseTextDocumentEmitter.fire(monacoModelToTextDocument(model));
      });

      // Wire content changes for already-open models.
      function wireModel(model) {
        model.onDidChangeContent((e) => {
          const doc = monacoModelToTextDocument(model);
          _onDidChangeTextDocumentEmitter.fire({
            document: doc,
            contentChanges: e.changes.map((c) => ({
              range: {
                start: { line: c.range.startLineNumber - 1, character: c.range.startColumn - 1 },
                end:   { line: c.range.endLineNumber - 1,   character: c.range.endColumn - 1 },
              },
              rangeOffset: c.rangeOffset,
              rangeLength: c.rangeLength,
              text: c.text,
            })),
            reason: undefined,
          });
        });
      }

      monaco.editor.getModels().forEach(wireModel);
      monaco.editor.onDidCreateModel(wireModel);
    });
  });
}

function _wireMarkerEvents(monaco) {
  import("../../stores/markersStore.js").then(({ useMarkersStore }) => {
    monaco.editor.onDidChangeMarkers((resources) => {
      const { setMarkers, clearMarkers } = useMarkersStore.getState();
      for (const uri of resources) {
        const markers = monaco.editor.getModelMarkers({ resource: uri });
        const path = uri.path;
        if (markers.length === 0) {
          clearMarkers(path);
        } else {
          setMarkers(path, markers);
        }
      }
    });
  });
}

function _wireTabStoreEvents() {
  import("../../stores/tabStore.js").then(({ useTabStore }) => {
    import("./window.js").then(({
      _onDidChangeActiveTextEditorEmitter,
    }) => {
      import("./text-editor.js").then(({ TextEditor }) => {
        let prevActiveTabId = null;
        useTabStore.subscribe((state) => {
          const activeTab = state.activeTab?.();
          const currentId = activeTab?.id ?? null;
          if (currentId !== prevActiveTabId) {
            prevActiveTabId = currentId;
            // Find the Monaco editor for the new active tab.
            const monaco = getMonaco();
            if (monaco) {
              const editors = monaco.editor.getEditors();
              const activeEditor = editors[0] ?? null;
              _onDidChangeActiveTextEditorEmitter.fire(
                activeEditor ? new TextEditor(activeEditor) : undefined
              );
            }
          }
        });
      });
    });
  });
}
