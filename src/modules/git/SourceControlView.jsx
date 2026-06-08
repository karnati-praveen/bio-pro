import { useEffect, useState, useCallback } from "react";
import {
  gitStatus, gitStage, gitCommit, gitLog,
  gitBranches, gitCreateBranch, gitCheckout, gitMerge,
  gitPush, gitPull, gitInit, gitSuggestMessage,
} from "../../shared/lib/api/client.js";
import { useProjectStore } from "../../shared/stores/projectStore.js";
import { useGitStore } from "./gitStore.js";
import DiffView from "./DiffView.jsx";
import HistoryTimeline from "./HistoryTimeline.jsx";

export default function SourceControlView() {
  const root = useProjectStore((s) => s.rootPath);
  const store = useGitStore();
  const {
    branch, staged, unstaged, untracked,
    remotes, ahead, behind,
    commitMessage, loading, error, lastOutput,
    setStatus, setCommitMessage, setLoading, setError, setLastOutput,
  } = store;

  const [branches, setBranches] = useState([]);
  const [newBranch, setNewBranch] = useState("");
  const [showBranches, setShowBranches] = useState(false);
  const [diffFile, setDiffFile] = useState(null);
  const [historyFile, setHistoryFile] = useState(null);
  const [remote, setRemote] = useState("origin");
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(async () => {
    if (!root) return;
    setLoading(true);
    setError(null);
    try {
      const s = await gitStatus(root);
      setStatus(s);
      setInitialized(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [root, setStatus, setLoading, setError]);

  useEffect(() => { refresh(); }, [refresh]);

  const loadBranches = async () => {
    if (!root) return;
    try {
      const b = await gitBranches(root);
      setBranches(b.branches ?? []);
    } catch { /* not fatal */ }
  };

  if (!root) {
    return (
      <div className="sidebar-placeholder">
        <p className="hint">Open a project folder first to use version control.</p>
      </div>
    );
  }

  if (!initialized && !loading) {
    return (
      <div className="sidebar-placeholder">
        <p className="hint">No git repository detected in this project.</p>
        <button className="btn" onClick={async () => {
          try { await gitInit(root); await refresh(); }
          catch (e) { setError(e.message); }
        }}>
          Initialize Repository
        </button>
        {error && <div className="dsl-error" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    );
  }

  const allUnstaged = [
    ...unstaged,
    ...untracked.filter((u) => !staged.some((s) => s.path === u.path)),
  ];

  const handleStage = async (path, stage) => {
    try { await gitStage(root, [path], stage); await refresh(); }
    catch (e) { setError(e.message); }
  };

  const handleStageAll = async () => {
    const paths = allUnstaged.map((f) => f.path);
    if (!paths.length) return;
    try { await gitStage(root, paths, true); await refresh(); }
    catch (e) { setError(e.message); }
  };

  const handleSuggest = async () => {
    const files = staged.map((f) => f.path);
    if (!files.length) return;
    try {
      const { message } = await gitSuggestMessage(root, files);
      setCommitMessage(message);
    } catch { /* not fatal */ }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) { setError("Commit message is required."); return; }
    setLoading(true); setError(null);
    try {
      const res = await gitCommit(root, commitMessage.trim());
      setLastOutput(res.output);
      setCommitMessage("");
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handlePush = async () => {
    setLoading(true); setError(null);
    try {
      const res = await gitPush(root, remote);
      setLastOutput(res.output || "Pushed.");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handlePull = async () => {
    setLoading(true); setError(null);
    try {
      const res = await gitPull(root, remote);
      setLastOutput(res.output || "Pulled.");
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreateBranch = async () => {
    if (!newBranch.trim()) return;
    try {
      await gitCreateBranch(root, newBranch.trim());
      setNewBranch("");
      await loadBranches();
      await refresh();
    } catch (e) { setError(e.message); }
  };

  const handleCheckout = async (b) => {
    try { await gitCheckout(root, b); await refresh(); setShowBranches(false); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="source-control-view">
      {/* Branch bar */}
      <div className="sc-branch-bar">
        <button
          className="sc-branch-btn"
          onClick={() => { setShowBranches((v) => !v); loadBranches(); }}
          title="Switch branch"
        >
          ⎇ {branch ?? "—"}
        </button>
        {ahead > 0 && <span className="sc-badge sc-ahead" title={`${ahead} ahead`}>↑{ahead}</span>}
        {behind > 0 && <span className="sc-badge sc-behind" title={`${behind} behind`}>↓{behind}</span>}
        <div className="sc-branch-actions">
          {remotes.length > 0 && (
            <>
              <button className="btn-icon" title="Pull" onClick={handlePull} disabled={loading}>↓</button>
              <button className="btn-icon" title="Push" onClick={handlePush} disabled={loading}>↑</button>
            </>
          )}
          <button className="btn-icon" title="Refresh" onClick={refresh} disabled={loading}>↻</button>
        </div>
      </div>

      {/* Branch switcher dropdown */}
      {showBranches && (
        <div className="sc-branch-list">
          <div className="sc-section-header">BRANCHES</div>
          {branches.map((b) => (
            <div
              key={b.name}
              className={`sc-branch-item ${b.current ? "sc-branch-current" : ""}`}
              onClick={() => !b.current && handleCheckout(b.name)}
            >
              {b.current ? "✓ " : ""}{b.name}
            </div>
          ))}
          <div className="sc-new-branch">
            <input
              className="sc-input"
              placeholder="New branch name…"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateBranch()}
            />
            <button className="btn" onClick={handleCreateBranch}>Create</button>
          </div>
        </div>
      )}

      {loading && <div className="sc-loading">Working…</div>}
      {error && <div className="dsl-error sc-error">{error}</div>}
      {lastOutput && (
        <div className="sc-output">
          <span>{lastOutput}</span>
          <button className="diff-close" onClick={() => setLastOutput(null)}>✕</button>
        </div>
      )}

      {/* Diff panel */}
      {diffFile && (
        <DiffView filepath={diffFile} onClose={() => setDiffFile(null)} />
      )}
      {historyFile && (
        <HistoryTimeline filepath={historyFile} onClose={() => setHistoryFile(null)} />
      )}

      {/* Staged changes */}
      <FileGroup
        title={`STAGED CHANGES (${staged.length})`}
        files={staged}
        onToggle={(p) => handleStage(p, false)}
        toggleLabel="−"
        toggleTitle="Unstage"
        onDiff={setDiffFile}
        onHistory={setHistoryFile}
        checkboxStaged={true}
      />

      {/* Unstaged / untracked changes */}
      <FileGroup
        title={`CHANGES (${allUnstaged.length})`}
        files={allUnstaged}
        onToggle={(p) => handleStage(p, true)}
        toggleLabel="+"
        toggleTitle="Stage"
        onDiff={setDiffFile}
        onHistory={setHistoryFile}
        checkboxStaged={false}
        onStageAll={handleStageAll}
      />

      {/* Commit box */}
      <div className="sc-commit-box">
        <div className="sc-commit-row">
          <textarea
            className="sc-commit-input"
            placeholder="Commit message…"
            rows={3}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
          />
        </div>
        <div className="sc-commit-actions">
          <button
            className="btn-ghost sc-suggest-btn"
            onClick={handleSuggest}
            title="Auto-generate message from staged bio files"
            disabled={staged.length === 0}
          >
            ✨ Suggest
          </button>
          <button
            className="btn sc-commit-btn"
            onClick={handleCommit}
            disabled={loading || !commitMessage.trim()}
          >
            {loading ? "…" : "Commit"}
          </button>
        </div>
        {remotes.length > 0 && (
          <div className="sc-remote-row">
            <label className="sc-remote-label">Remote</label>
            <input
              className="sc-input sc-remote-input"
              value={remote}
              onChange={(e) => setRemote(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FileGroup({ title, files, onToggle, toggleLabel, toggleTitle, onDiff, onHistory, checkboxStaged, onStageAll }) {
  if (!files.length) return null;
  return (
    <div className="sc-group">
      <div className="sc-section-header">
        {title}
        {!checkboxStaged && onStageAll && files.length > 1 && (
          <button className="btn-ghost sc-stage-all" onClick={onStageAll} title="Stage all">+ All</button>
        )}
      </div>
      <ul className="sc-file-list">
        {files.map((f) => (
          <li key={f.path} className="sc-file-item">
            <button
              className="sc-toggle-btn"
              title={toggleTitle}
              onClick={() => onToggle(f.path)}
            >
              {toggleLabel}
            </button>
            <span className="sc-file-status">{f.status}</span>
            <span className="sc-file-name" title={f.path}>
              {f.path.split(/[\\/]/).pop()}
            </span>
            <div className="sc-file-actions">
              <button
                className="btn-ghost sc-file-btn"
                title="View diff"
                onClick={() => onDiff(f.path)}
              >
                ~
              </button>
              <button
                className="btn-ghost sc-file-btn"
                title="File history"
                onClick={() => onHistory(f.path)}
              >
                ⏱
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
