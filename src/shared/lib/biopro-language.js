import * as monaco from "monaco-editor";

const KEYWORDS = [
  "express", "with", "in", "when", "unless", "and", "or", "not",
  "constitutive", "always", "positive", "negative", "feedback",
  "bistable", "repressilator", "bandpass", "switch", "toggle", "oscillator",
  "output", "reporter", "present", "absent",
];

const REPORTERS = [
  "GFP", "RFP", "YFP", "mCherry", "mTurquoise2", "iRFP713", "luciferase", "LacZ",
];

const INDUCERS = [
  "IPTG", "aTc", "arabinose", "AHL", "rhamnose", "doxycycline", "galactose",
];

// Build alternation patterns once — exact word boundaries, case-sensitive for
// part names, case-insensitive handled by Monarch's tokenizer option below.
const reporterPattern = `\\b(${REPORTERS.join("|")})\\b`;
const inducerPattern  = `\\b(${INDUCERS.join("|")})\\b`;
const keywordPattern  = `\\b(${KEYWORDS.join("|")})\\b`;

export function registerBioproLanguage() {
  if (monaco.languages.getLanguages().some(l => l.id === "biopro")) return;

  monaco.languages.register({ id: "biopro", extensions: [".biopro"] });

  monaco.languages.setMonarchTokensProvider("biopro", {
    ignoreCase: true,
    tokenizer: {
      root: [
        // Reporters — teal (checked before the generic identifier rule)
        [new RegExp(reporterPattern), "type.biopro"],
        // Inducers — orange
        [new RegExp(inducerPattern), "variable.biopro"],
        // Keywords — blue (case-insensitive via ignoreCase: true above)
        [new RegExp(keywordPattern), "keyword.biopro"],
        // Numbers
        [/\d+(\.\d+)?/, "number"],
        // Strings
        [/"[^"]*"/, "string"],
        // Comments: # to end of line
        [/#.*$/, "comment"],
        // Whitespace
        [/\s+/, "white"],
        // Everything else
        [/[^\s]+/, "identifier"],
      ],
    },
  });

  monaco.editor.defineTheme("biopro-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword.biopro",  foreground: "569CD6", fontStyle: "bold" },
      { token: "type.biopro",     foreground: "4EC9B0" },
      { token: "variable.biopro", foreground: "CE9178" },
      { token: "comment",         foreground: "6A9955", fontStyle: "italic" },
      { token: "string",          foreground: "CE9178" },
      { token: "number",          foreground: "B5CEA8" },
    ],
    colors: {
      "editor.background": "var(--editor-bg)",
    },
  });

  monaco.languages.registerCompletionItemProvider("biopro", {
    triggerCharacters: [" "],
    provideCompletionItems(model, position) {
      const word  = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       word.endColumn,
      };

      return {
        suggestions: [
          ...KEYWORDS.map(kw => ({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
          })),
          ...REPORTERS.map(r => ({
            label: r,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: "Reporter protein",
            insertText: r,
            range,
          })),
          ...INDUCERS.map(i => ({
            label: i,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: "Inducer / small molecule",
            insertText: i,
            range,
          })),
        ],
      };
    },
  });
}

/**
 * Convert ValidationFinding[] from the compile/lint API into Monaco IMarkerData[].
 * Uses model.findMatches to locate target strings in the document; falls back to
 * annotating the entire first line when no match is found.
 */
export function findingsToMarkers(model, findings) {
  return findings.flatMap(finding => {
    const sev =
      finding.severity === "error"
        ? monaco.MarkerSeverity.Error
        : finding.severity === "warning"
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info;

    const base = {
      severity: sev,
      message: `[${finding.code}] ${finding.message}`,
      source: "bio-compiler",
    };

    if (!finding.target) {
      return [{
        ...base,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: model.getLineMaxColumn(1),
      }];
    }

    const matches = model.findMatches(
      finding.target,
      false,   // searchOnlyEditableRange
      false,   // isRegex
      true,    // matchCase
      null,    // wordSeparators
      false,   // captureMatches
    );

    if (matches.length === 0) {
      return [{
        ...base,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: model.getLineMaxColumn(1),
      }];
    }

    return matches.map(m => ({
      ...base,
      startLineNumber: m.range.startLineNumber,
      startColumn:     m.range.startColumn,
      endLineNumber:   m.range.endLineNumber,
      endColumn:       m.range.endColumn,
    }));
  });
}
