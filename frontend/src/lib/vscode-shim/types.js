// VS Code API enum values — mirrors the official vscode.d.ts constants.
// Numeric values match the LSP specification where applicable so they can be
// passed through to Monaco (which also follows LSP).

export const CompletionItemKind = Object.freeze({
  Text: 1, Method: 2, Function: 3, Constructor: 4, Field: 5,
  Variable: 6, Class: 7, Interface: 8, Module: 9, Property: 10,
  Unit: 11, Value: 12, Enum: 13, Keyword: 14, Snippet: 15,
  Color: 16, File: 17, Reference: 18, Folder: 19, EnumMember: 20,
  Constant: 21, Struct: 22, Event: 23, Operator: 24, TypeParameter: 25,
});

export const CompletionItemTag = Object.freeze({ Deprecated: 1 });

export const CompletionTriggerKind = Object.freeze({
  Invoke: 1, TriggerCharacter: 2, TriggerForIncompleteCompletions: 3,
});

export const DiagnosticSeverity = Object.freeze({
  Error: 0, Warning: 1, Information: 2, Hint: 3,
});

export const DiagnosticTag = Object.freeze({ Unnecessary: 1, Deprecated: 2 });

export const SymbolKind = Object.freeze({
  File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4, Method: 5,
  Property: 6, Field: 7, Constructor: 8, Enum: 9, Interface: 10,
  Function: 11, Variable: 12, Constant: 13, String: 14, Number: 15,
  Boolean: 16, Array: 17, Object: 18, Key: 19, Null: 20, EnumMember: 21,
  Struct: 22, Event: 23, Operator: 24, TypeParameter: 25,
});

export const ViewColumn = Object.freeze({
  Active: -1, Beside: -2,
  One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9,
});

export const EndOfLine = Object.freeze({ LF: 1, CRLF: 2 });

export const TextEditorRevealType = Object.freeze({
  Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3,
});

export const TextEditorSelectionChangeKind = Object.freeze({
  Keyboard: 1, Mouse: 2, Command: 3,
});

export const OverviewRulerLane = Object.freeze({
  Left: 1, Center: 2, Right: 4, Full: 7,
});

export const DecorationRangeBehavior = Object.freeze({
  OpenOpen: 0, ClosedClosed: 1, OpenClosed: 2, ClosedOpen: 3,
});

export const DocumentHighlightKind = Object.freeze({
  Text: 0, Read: 1, Write: 2,
});

export const CodeActionKind = Object.freeze({
  Empty: "", QuickFix: "quickfix", Refactor: "refactor",
  RefactorExtract: "refactor.extract", RefactorInline: "refactor.inline",
  RefactorMove: "refactor.move", RefactorRewrite: "refactor.rewrite",
  Source: "source", SourceOrganizeImports: "source.organizeImports",
  SourceFixAll: "source.fixAll",
});

export const FileType = Object.freeze({
  Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64,
});

export const ExtensionMode = Object.freeze({
  Production: 1, Development: 2, Test: 3,
});

export const ConfigurationTarget = Object.freeze({
  Global: 1, Workspace: 2, WorkspaceFolder: 3,
});

export const StatusBarAlignment = Object.freeze({ Left: 1, Right: 2 });

export const ProgressLocation = Object.freeze({
  SourceControl: 1, Window: 10, Notification: 15,
});

export const TreeItemCollapsibleState = Object.freeze({
  None: 0, Collapsed: 1, Expanded: 2,
});

export const SignatureHelpTriggerKind = Object.freeze({
  Invoke: 1, TriggerCharacter: 2, ContentChange: 3,
});

export const InlayHintKind = Object.freeze({ Type: 1, Parameter: 2 });

export const FoldingRangeKind = Object.freeze({
  Comment: "comment", Imports: "imports", Region: "region",
});

export const Position = class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
  isEqual(other) { return this.line === other.line && this.character === other.character; }
  isBefore(other) {
    return this.line < other.line || (this.line === other.line && this.character < other.character);
  }
  isAfter(other) { return other.isBefore(this); }
  isBeforeOrEqual(other) { return !this.isAfter(other); }
  isAfterOrEqual(other) { return !this.isBefore(other); }
  translate(lineDelta = 0, characterDelta = 0) {
    return new Position(this.line + lineDelta, this.character + characterDelta);
  }
  with(line = this.line, character = this.character) { return new Position(line, character); }
  compareTo(other) {
    if (this.line !== other.line) return this.line - other.line;
    return this.character - other.character;
  }
};

export const Range = class Range {
  constructor(startOrLine, startCharOrEnd, endLine, endCharacter) {
    if (startOrLine instanceof Position) {
      this.start = startOrLine;
      this.end = startCharOrEnd;
    } else {
      this.start = new Position(startOrLine, startCharOrEnd);
      this.end = new Position(endLine, endCharacter);
    }
  }
  get isEmpty() { return this.start.isEqual(this.end); }
  get isSingleLine() { return this.start.line === this.end.line; }
  contains(posOrRange) {
    if (posOrRange instanceof Range) {
      return this.contains(posOrRange.start) && this.contains(posOrRange.end);
    }
    return posOrRange.isAfterOrEqual(this.start) && posOrRange.isBeforeOrEqual(this.end);
  }
  isEqual(other) {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }
  intersection(other) {
    const start = this.start.isAfter(other.start) ? this.start : other.start;
    const end = this.end.isBefore(other.end) ? this.end : other.end;
    if (start.isAfter(end)) return undefined;
    return new Range(start, end);
  }
  union(other) {
    const start = this.start.isBefore(other.start) ? this.start : other.start;
    const end = this.end.isAfter(other.end) ? this.end : other.end;
    return new Range(start, end);
  }
  with(start = this.start, end = this.end) { return new Range(start, end); }
};

export const Selection = class Selection extends Range {
  constructor(anchorLine, anchorChar, activeLine, activeChar) {
    if (anchorLine instanceof Position) {
      super(anchorLine, anchorChar);
      this.anchor = anchorLine;
      this.active = anchorChar;
    } else {
      super(anchorLine, anchorChar, activeLine, activeChar);
      this.anchor = new Position(anchorLine, anchorChar);
      this.active = new Position(activeLine, activeChar);
    }
  }
  get isReversed() { return this.anchor.isAfter(this.active); }
};

export const Location = class Location {
  constructor(uri, rangeOrPosition) {
    this.uri = uri;
    this.range = rangeOrPosition instanceof Range
      ? rangeOrPosition
      : new Range(rangeOrPosition, rangeOrPosition);
  }
};

export const Diagnostic = class Diagnostic {
  constructor(range, message, severity = DiagnosticSeverity.Error) {
    this.range = range;
    this.message = message;
    this.severity = severity;
    this.source = undefined;
    this.code = undefined;
    this.tags = undefined;
    this.relatedInformation = undefined;
  }
};

export const MarkdownString = class MarkdownString {
  constructor(value = "", supportThemeIcons = false) {
    this.value = value;
    this.supportThemeIcons = supportThemeIcons;
    this.isTrusted = false;
  }
  appendText(value) { this.value += value; return this; }
  appendMarkdown(value) { this.value += value; return this; }
  appendCodeblock(value, language = "") {
    this.value += `\n\`\`\`${language}\n${value}\n\`\`\`\n`;
    return this;
  }
};

export const Hover = class Hover {
  constructor(contents, range) {
    this.contents = Array.isArray(contents) ? contents : [contents];
    this.range = range;
  }
};

export const CompletionItem = class CompletionItem {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind;
    this.detail = undefined;
    this.documentation = undefined;
    this.sortText = undefined;
    this.filterText = undefined;
    this.insertText = undefined;
    this.range = undefined;
    this.commitCharacters = undefined;
    this.additionalTextEdits = undefined;
    this.command = undefined;
    this.tags = undefined;
  }
};

export const CompletionList = class CompletionList {
  constructor(items = [], isIncomplete = false) {
    this.items = items;
    this.isIncomplete = isIncomplete;
  }
};

export const SignatureHelp = class SignatureHelp {
  constructor() {
    this.signatures = [];
    this.activeSignature = 0;
    this.activeParameter = 0;
  }
};

export const SignatureInformation = class SignatureInformation {
  constructor(label, documentation) {
    this.label = label;
    this.documentation = documentation;
    this.parameters = [];
  }
};

export const ParameterInformation = class ParameterInformation {
  constructor(label, documentation) {
    this.label = label;
    this.documentation = documentation;
  }
};

export const DocumentSymbol = class DocumentSymbol {
  constructor(name, detail, kind, range, selectionRange) {
    this.name = name;
    this.detail = detail;
    this.kind = kind;
    this.range = range;
    this.selectionRange = selectionRange;
    this.children = [];
  }
};

export const SnippetString = class SnippetString {
  constructor(value = "") { this.value = value; }
  appendText(string) { this.value += string.replace(/\$/g, "\\$"); return this; }
  appendTabstop(number) { this.value += number ? `$${number}` : "$0"; return this; }
  appendPlaceholder(value, number) {
    this.value += number ? `\${${number}:${value}}` : `\${0:${value}}`;
    return this;
  }
  appendVariable(name, defaultValue) {
    this.value += defaultValue ? `\${${name}:${defaultValue}}` : `\${${name}}`;
    return this;
  }
  appendChoice(values, number) {
    this.value += number ? `\${${number}|${values.join(",")}|}` : `\${0|${values.join(",")}|}`;
    return this;
  }
};

export const ThemeColor = class ThemeColor {
  constructor(id) { this.id = id; }
};

export const ThemeIcon = class ThemeIcon {
  constructor(id, color) { this.id = id; this.color = color; }
};
ThemeIcon.File = new ThemeIcon("file");
ThemeIcon.Folder = new ThemeIcon("folder");

export const RelativePattern = class RelativePattern {
  constructor(base, pattern) {
    this.base = typeof base === "string" ? base : base.fsPath ?? base.path ?? String(base);
    this.pattern = pattern;
  }
};
