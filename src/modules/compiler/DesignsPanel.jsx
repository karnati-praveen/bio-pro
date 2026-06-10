// Save the current design (with version history), reload prior versions, and export
// the displayed result to standard formats (GenBank / FASTA / SBOL / JSON).

import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import {
  addVersion,
  attachDesignToProject,
  diffVersions,
  exportInline,
  listDesigns,
  loadVersion,
  saveDesign,
} from "../../shared/lib/api/client.js";
import { useBioProjectStore } from "../../shared/stores/bioProjectStore.js";

const FORMATS = ["genbank", "fasta", "sbol", "json"];

export default function DesignsPanel({ result, request, onLoad }) {
  const [designs, setDesigns] = useState([]);
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [status, setStatus] = useState(null);

  const activeProjectId = useBioProjectStore((s) => s.activeProjectId);
  const refreshActive = useBioProjectStore((s) => s.refreshActive);

  // { designId: number, versions: number[] } — at most 2 versions from the same design
  const [diffSel, setDiffSel] = useState({ designId: null, versions: [] });
  const [diffData, setDiffData] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const refresh = () => listDesigns().then(setDesigns).catch(() => {});
  useEffect(() => { refresh(); }, []);

  // Fetch diff whenever two versions are selected for the same design
  useEffect(() => {
    if (diffSel.versions.length !== 2) { setDiffData(null); return; }
    const [a, b] = [...diffSel.versions].sort((x, y) => x - y);
    setDiffLoading(true);
    setDiffData(null);
    diffVersions(diffSel.designId, a, b)
      .then(setDiffData)
      .catch((e) => setStatus(e.message))
      .finally(() => setDiffLoading(false));
  }, [diffSel]);

  const handleToggleVersion = (designId, versionNo) => {
    setDiffSel((prev) => {
      if (prev.designId !== designId) {
        // Different design — start fresh
        return { designId, versions: [versionNo] };
      }
      const already = prev.versions.includes(versionNo);
      if (already) {
        return { ...prev, versions: prev.versions.filter((v) => v !== versionNo) };
      }
      // Keep at most 2; drop the oldest when adding a third
      const next = [...prev.versions, versionNo].slice(-2);
      return { ...prev, versions: next };
    });
  };

  const handleCompareWithPrev = (designId, versionNo) => {
    setDiffSel({ designId, versions: [versionNo - 1, versionNo] });
  };

  const closeDiff = () => {
    setDiffSel({ designId: null, versions: [] });
    setDiffData(null);
  };

  const isChecked = (designId, versionNo) =>
    diffSel.designId === designId && diffSel.versions.includes(versionNo);

  const handleSave = async () => {
    if (!result) return;
    try {
      if (activeId) {
        const v = await addVersion(activeId, request, result);
        setStatus(`Saved v${v.version_no}${activeProjectId ? ` · project ${activeProjectId}` : ""}`);
        if (activeProjectId) {
          await attachDesignToProject(activeProjectId, activeId).catch(() => {});
          refreshActive();
        }
      } else {
        const d = await saveDesign(name || "Untitled design", request, result, activeProjectId);
        setActiveId(d.id);
        setStatus(`Saved "${d.name}" (v1)${activeProjectId ? ` · project ${activeProjectId}` : ""}`);
        refreshActive();
      }
      refresh();
    } catch (e) {
      setStatus(e.message);
    }
  };

  const handleLoad = async (designId, versionNo) => {
    try {
      const v = await loadVersion(designId, versionNo);
      setActiveId(designId);
      onLoad(v.response, v.request);
      setStatus(`Loaded design ${designId} v${versionNo}`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const showDiff = diffData || diffLoading;
  const [olderV, newerV] = [...diffSel.versions].sort((x, y) => x - y);
  const nd = diffData?.node_diff;
  const diffSummary = nd
    ? `${nd.added.length} node${nd.added.length !== 1 ? "s" : ""} added, ${nd.removed.length} removed, ${nd.changed.length} changed`
    : null;

  return (
    <div className="designs-panel">
      <h3>Designs</h3>

      <div className="designs-save">
        <input
          type="text"
          placeholder="Design name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!activeId}
        />
        <button onClick={handleSave} disabled={!result}>
          {activeId ? "Save new version" : "Save"}
        </button>
        {activeId && (
          <button className="link-btn" onClick={() => { setActiveId(null); setName(""); }}>
            new
          </button>
        )}
      </div>

      {result && (
        <div className="designs-export">
          <span className="muted">Export:</span>
          {FORMATS.map((fmt) => (
            <button key={fmt} className="link-btn" onClick={() => exportInline(result, fmt)}>
              {fmt}
            </button>
          ))}
        </div>
      )}

      {status && <p className="muted designs-status">{status}</p>}

      {designs.length > 0 && (
        <ul className="designs-list">
          {designs.map((d) => (
            <li key={d.id} className={d.id === activeId ? "active" : ""}>
              <span className="designs-name">{d.name}</span>
              <span className="designs-versions">
                {Array.from({ length: d.latest_version }, (_, i) => i + 1).map((v) => (
                  <span key={v} className="designs-version-item">
                    <input
                      type="checkbox"
                      className="version-check"
                      checked={isChecked(d.id, v)}
                      onChange={() => handleToggleVersion(d.id, v)}
                      title={`Select v${v} for comparison`}
                    />
                    <button className="link-btn" onClick={() => handleLoad(d.id, v)}>
                      v{v}
                    </button>
                    {v > 1 && (
                      <button
                        className="link-btn version-diff-link"
                        onClick={() => handleCompareWithPrev(d.id, v)}
                        title={`Compare v${v - 1} → v${v}`}
                      >
                        ↔
                      </button>
                    )}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showDiff && (
        <div className="version-diff">
          <div className="version-diff-header">
            <span className="version-diff-title">
              {diffSel.versions.length === 2 ? `v${olderV} → v${newerV}` : "Diff"}
            </span>
            {diffLoading && <span className="muted">Loading…</span>}
            {diffSummary && <span className="version-diff-summary muted">{diffSummary}</span>}
            <button className="link-btn" onClick={closeDiff} title="Close diff">✕</button>
          </div>
          {diffData && (
            <DiffEditor
              original={diffData.older_dsl}
              modified={diffData.newer_dsl}
              language="plaintext"
              height="280px"
              theme="vs-dark"
              options={{
                readOnly: true,
                renderSideBySide: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
