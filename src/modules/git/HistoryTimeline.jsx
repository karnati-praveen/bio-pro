import { useEffect, useState } from "react";
import { gitFileLog, gitRestore } from "../../shared/lib/api/client.js";
import { useProjectStore } from "../../shared/stores/projectStore.js";
import DiffView from "./DiffView.jsx";

// Shows the commit timeline for a single file + allows compare/restore.
export default function HistoryTimeline({ filepath, onClose }) {
  const root = useProjectStore((s) => s.rootPath);
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);   // up to 2 hashes for compare
  const [comparing, setComparing] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [restoreMsg, setRestoreMsg] = useState(null);

  useEffect(() => {
    if (!root || !filepath) return;
    setLoading(true);
    gitFileLog(root, filepath)
      .then((d) => setCommits(d.commits ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [root, filepath]);

  const toggleSelect = (hash) => {
    setSelected((prev) => {
      if (prev.includes(hash)) return prev.filter((h) => h !== hash);
      if (prev.length >= 2) return [prev[1], hash];
      return [...prev, hash];
    });
    setComparing(false);
  };

  const handleRestore = async (hash) => {
    if (!window.confirm(`Restore "${filepath}" to commit ${hash.slice(0, 7)}? This overwrites the working-tree file.`)) return;
    setRestoring(hash);
    try {
      await gitRestore(root, filepath, hash);
      setRestoreMsg(`Restored to ${hash.slice(0, 7)}`);
      setTimeout(() => setRestoreMsg(null), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="history-timeline">
      <div className="history-header">
        <span className="history-title">History — {filepath.split(/[\\/]/).pop()}</span>
        {onClose && <button className="diff-close" onClick={onClose}>✕</button>}
      </div>

      {loading && <div className="diff-loading">Loading history…</div>}
      {error && <div className="dsl-error">{error}</div>}
      {restoreMsg && <div className="history-restore-msg">{restoreMsg}</div>}

      {selected.length === 2 && (
        <div className="history-actions">
          <button className="btn" onClick={() => setComparing(true)}>
            Compare {selected[0].slice(0, 7)} ↔ {selected[1].slice(0, 7)}
          </button>
          <button className="btn-ghost" onClick={() => { setSelected([]); setComparing(false); }}>
            Clear
          </button>
        </div>
      )}

      {comparing && selected.length === 2 && (
        <DiffView
          filepath={filepath}
          refA={selected[0]}
          refB={selected[1]}
          onClose={() => setComparing(false)}
        />
      )}

      <ul className="history-list">
        {commits.map((c) => (
          <li key={c.hash} className={`history-item ${selected.includes(c.hash) ? "history-selected" : ""}`}>
            <label className="history-check">
              <input
                type="checkbox"
                checked={selected.includes(c.hash)}
                onChange={() => toggleSelect(c.hash)}
              />
            </label>
            <div className="history-meta">
              <span className="history-short">{c.short}</span>
              <span className="history-msg">{c.message}</span>
              <span className="history-author">{c.author} · {fmtDate(c.date)}</span>
            </div>
            <div className="history-item-actions">
              <button
                className="btn-ghost history-btn"
                title="Compare this commit with working tree"
                onClick={() => { setSelected([c.hash]); setComparing(true); }}
              >
                Diff
              </button>
              <button
                className="btn-ghost history-btn"
                title="Restore file to this commit"
                disabled={restoring === c.hash}
                onClick={() => handleRestore(c.hash)}
              >
                {restoring === c.hash ? "…" : "Restore"}
              </button>
            </div>
          </li>
        ))}
        {!loading && commits.length === 0 && (
          <li className="diff-empty">No commits yet for this file.</li>
        )}
      </ul>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}
