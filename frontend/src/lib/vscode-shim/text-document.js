// TextDocument shim — wraps a Monaco ITextModel to look like vscode.TextDocument.
// VS Code positions are 0-based; Monaco positions are 1-based. All conversions
// happen here so provider code sees the expected coordinate system.

import { Uri } from "./uri.js";
import { Position, Range } from "./types.js";

export function monacoModelToTextDocument(model) {
  return new TextDocument(model);
}

export class TextDocument {
  constructor(model) {
    this._model = model;
    const moUri = model.uri;
    this.uri = moUri.scheme === "file"
      ? Uri.file(moUri.path)
      : Uri.parse(moUri.toString());
    this.fileName = this.uri.fsPath;
    this.isUntitled = !this.uri.path || this.uri.scheme !== "file";
    this.isDirty = false; // updated externally by tabStore subscription if needed
    this.isClosed = false;
    this.eol = 1; // EndOfLine.LF
  }

  get languageId() { return this._model.getLanguageId(); }
  get version() { return this._model.getVersionId(); }
  get lineCount() { return this._model.getLineCount(); }

  getText(range) {
    if (!range) return this._model.getValue();
    return this._model.getValueInRange({
      startLineNumber: range.start.line + 1,
      startColumn: range.start.character + 1,
      endLineNumber: range.end.line + 1,
      endColumn: range.end.character + 1,
    });
  }

  lineAt(lineOrPosition) {
    const lineNumber = typeof lineOrPosition === "number"
      ? lineOrPosition + 1
      : lineOrPosition.line + 1;
    const text = this._model.getLineContent(lineNumber);
    const firstNonWS = text.search(/\S/);
    const range = new Range(lineNumber - 1, 0, lineNumber - 1, text.length);
    const rangeIncludingLineBreak = lineNumber < this._model.getLineCount()
      ? new Range(lineNumber - 1, 0, lineNumber, 0)
      : range;
    return {
      lineNumber: lineNumber - 1,
      text,
      range,
      rangeIncludingLineBreak,
      firstNonWhitespaceCharacterIndex: firstNonWS < 0 ? text.length : firstNonWS,
      isEmptyOrWhitespace: firstNonWS < 0,
    };
  }

  offsetAt(position) {
    return this._model.getOffsetAt({
      lineNumber: position.line + 1,
      column: position.character + 1,
    });
  }

  positionAt(offset) {
    const pos = this._model.getPositionAt(offset);
    return new Position(pos.lineNumber - 1, pos.column - 1);
  }

  getWordRangeAtPosition(position, regex) {
    const word = this._model.getWordAtPosition({
      lineNumber: position.line + 1,
      column: position.character + 1,
    });
    if (!word) return undefined;
    return new Range(
      position.line, word.startColumn - 1,
      position.line, word.endColumn - 1,
    );
  }

  validatePosition(position) {
    const lineCount = this._model.getLineCount();
    const line = Math.max(0, Math.min(position.line, lineCount - 1));
    const lineLen = this._model.getLineLength(line + 1);
    const char = Math.max(0, Math.min(position.character, lineLen));
    return new Position(line, char);
  }

  validateRange(range) {
    return new Range(
      this.validatePosition(range.start),
      this.validatePosition(range.end),
    );
  }

  save() { return Promise.resolve(true); }
}
