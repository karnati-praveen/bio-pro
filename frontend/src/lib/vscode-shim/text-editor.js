// TextEditor shim — wraps a Monaco IStandaloneCodeEditor + ITextModel.

import { Position, Range, Selection } from "./types.js";
import { monacoModelToTextDocument } from "./text-document.js";

function moSelToVs(mSel) {
  if (!mSel) return new Selection(0, 0, 0, 0);
  return new Selection(
    mSel.startLineNumber - 1, mSel.startColumn - 1,
    mSel.endLineNumber - 1, mSel.endColumn - 1,
  );
}

function vsRangeToMo(range) {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

export class TextEditor {
  constructor(editor) {
    this._editor = editor;
  }

  get document() { return monacoModelToTextDocument(this._editor.getModel()); }

  get selection() { return moSelToVs(this._editor.getSelection()); }

  get selections() {
    return (this._editor.getSelections() ?? []).map(moSelToVs);
  }

  get visibleRanges() {
    return (this._editor.getVisibleRanges() ?? []).map(
      (r) => new Range(r.startLineNumber - 1, r.startColumn - 1, r.endLineNumber - 1, r.endColumn - 1),
    );
  }

  get viewColumn() { return 1; }

  edit(callback) {
    return new Promise((resolve) => {
      const model = this._editor.getModel();
      const edits = [];
      const builder = {
        replace(rangeOrPos, newText) {
          const range = rangeOrPos instanceof Range ? rangeOrPos : new Range(rangeOrPos, rangeOrPos);
          edits.push({ range: vsRangeToMo(range), text: newText });
        },
        insert(pos, newText) {
          const r = vsRangeToMo(new Range(pos, pos));
          edits.push({ range: r, text: newText });
        },
        delete(range) {
          edits.push({ range: vsRangeToMo(range), text: "" });
        },
        setEndOfLine() {},
      };
      callback(builder);
      if (edits.length > 0) {
        model.pushEditOperations([], edits.map((e) => ({ range: e.range, text: e.text })), () => null);
      }
      resolve(edits.length > 0);
    });
  }

  insertSnippet(snippet, location) {
    return Promise.resolve(true);
  }

  setDecorations(decorationType, rangesOrOptions) {
    const ranges = rangesOrOptions.map((r) => {
      if (r.range) {
        return { range: vsRangeToMo(r.range), options: {} };
      }
      return { range: vsRangeToMo(r), options: {} };
    });
    this._editor.deltaDecorations(decorationType._ids ?? [], ranges);
    return;
  }

  revealRange(range, revealType) {
    this._editor.revealRange(vsRangeToMo(range));
  }

  revealRangeInCenter(range) { this._editor.revealRangeInCenter(vsRangeToMo(range)); }
  revealRangeAtTop(range) { this._editor.revealRangeAtTop?.(vsRangeToMo(range)); }

  show() {}
  hide() {}
}
