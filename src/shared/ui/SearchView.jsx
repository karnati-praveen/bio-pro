import { useState, useEffect, useRef } from "react";
import { useProjectStore } from "../stores/projectStore.js";
import { useTabStore } from "../stores/tabStore.js";
import { useCircuitStore } from "../stores/circuitStore.js";
import { iconForFile, editorTypeForFile } from "../lib/fileTypes.js";

// Truncate a line to show [matchStart … matchEnd] in context
function snippet(text, query) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 50);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

export default function SearchView() {
  const [query, setQuery] = useState("");
  const [contentMatches, setContentMatches] = useState([]); // {entry, lineNo, line}
  const [searching, setSearching] = useState(false);
  const entries = useProjectStore((s) => s.entries);
  const readFile = useProjectStore((s) => s.readFile);
  const tabsById = useTabStore((s) => s.tabsById);
  const openTab = useTabStore((s) => s.openTab);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const ensureCircuit = useCircuitStore((s) => s.ensure);
  const abortRef = useRef(null);

  const q = query.trim().toLowerCase();

  const fileMatches = q
    ? entries.filter((e) => e.name.toLowerCase().includes(q))
    : [];

  const tabMatches = q
    ? Object.values(tabsById).filter(
        (t) => t.title.toLowerCase().includes(q) ||
               (t.content && t.content.toLowerCase().includes(q))
      )
    : [];

  // Async file-content search across project files, debounced 400ms
  useEffect(() => {
    if (!q || entries.length === 0) { setContentMatches([]); return; }

    const timer = setTimeout(async () => {
      if (abortRef.current) abortRef.current.aborted = true;
      const abort = { aborted: false };
      abortRef.current = abort;
      setSearching(true);

      const hits = [];
      const TEXT_EXTS = [".biopro", ".fasta", ".fa", ".gb", ".gbk", ".txt", ".md", ".json", ".pathway", ".notebook"];
      const candidates = entries.filter((e) => {
        const name = (e.name || "").toLowerCase();
        return TEXT_EXTS.some((ext) => name.endsWith(ext));
      });

      for (const entry of candidates) {
        if (abort.aborted) break;
        // Skip files already matched by name (already shown in FILE section)
        if (entry.name.toLowerCase().includes(q)) continue;
        try {
          const content = await readFile(entry);
          if (abort.aborted) break;
          if (!content) continue;
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(q)) {
              hits.push({ entry, lineNo: i + 1, line: lines[i].trim() });
              if (hits.length >= 50) break; // cap total results
            }
          }
          if (hits.length >= 50) break;
        } catch (_) {
          // unreadable file — skip silently
        }
      }

      if (!abort.aborted) {
        setContentMatches(hits);
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [q, entries, readFile]);

  const openEntry = async (entry) => {
    try {
      const content = entry.isNew ? "" : await readFile(entry);
      const type = editorTypeForFile(entry.path);
      const id = openTab({ type, title: entry.name, filePath: entry.path, content, meta: { _handle: entry._handle } });
      if (type === "circuit") ensureCircuit(id, content);
    } catch (e) {
      console.error("SearchView open:", e);
    }
  };

  return (
    <div className="search-view">
      <input
        className="parts-search"
        placeholder="Search files and content…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {!q && (
        <p className="hint" style={{ padding: "12px 8px" }}>
          Type to search file names, open tabs, and file content on disk.
        </p>
      )}

      {q && fileMatches.length === 0 && tabMatches.length === 0 && contentMatches.length === 0 && !searching && (
        <p className="hint" style={{ padding: "12px 8px" }}>No results for "{q}"</p>
      )}

      {q && fileMatches.length > 0 && (
        <div>
          <div className="sc-section-header">FILES ({fileMatches.length})</div>
          <ul className="explorer-list">
            {fileMatches.map((e) => (
              <li key={e.path} className="explorer-item" onClick={() => openEntry(e)} title={e.path}>
                <span className="explorer-icon">{iconForFile(e.path)}</span>
                <span className="explorer-name">{e.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q && tabMatches.length > 0 && (
        <div>
          <div className="sc-section-header">OPEN TABS ({tabMatches.length})</div>
          <ul className="explorer-list">
            {tabMatches.map((t) => (
              <li key={t.id} className="explorer-item" onClick={() => setActiveTab(t.id)} title={t.filePath || t.title}>
                <span className="explorer-icon">{iconForFile(t.filePath)}</span>
                <span className="explorer-name">{t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q && (contentMatches.length > 0 || searching) && (
        <div>
          <div className="sc-section-header">
            FILE CONTENT {searching ? "(searching…)" : `(${contentMatches.length})`}
          </div>
          <ul className="explorer-list">
            {contentMatches.map((hit, i) => {
              const snip = snippet(hit.line, q);
              return (
                <li
                  key={i}
                  className="explorer-item search-content-hit"
                  onClick={() => openEntry(hit.entry)}
                  title={`${hit.entry.path}:${hit.lineNo}`}
                >
                  <span className="explorer-icon">{iconForFile(hit.entry.path)}</span>
                  <span className="search-hit-body">
                    <span className="explorer-name">{hit.entry.name}</span>
                    <span className="search-hit-line">
                      <span className="search-hit-lineno">:{hit.lineNo}</span>
                      {snip && <span className="search-hit-snippet">{snip}</span>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
