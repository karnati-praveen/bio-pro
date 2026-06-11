import { useEffect, useState } from "react";
import { VscLink, VscLinkExternal } from "react-icons/vsc";
import { Button } from "../../shared/ui/primitives/index.js";
import {
  listExperiments, createExperiment, updateExperiment, deleteExperiment,
  getBioProject,
} from "../../shared/lib/api/client.js";
import { useBioProjectStore } from "../../shared/stores/bioProjectStore.js";

const EXP_TYPES = ["transformation", "expression", "purification", "assay", "sequencing"];

const blank = (projectId = null) => ({
  title: "Untitled experiment",
  project_id: projectId,
  design_id: null,
  design_version_no: null,
  exp_type: "expression",
  date: new Date().toISOString().slice(0, 10),
  protocol_ref: "",
  columns: ["Colony", "GFP signal", "OD600"],
  rows: [["", "", ""]],
  notes_md: "",
});

// Module 10 — Experiment Notebook. Records wet-lab results (user-defined results
// table + markdown notes) and links them to projects, designs, and design versions.
export default function NotebookEditor() {
  const activeProjectId = useBioProjectStore((s) => s.activeProjectId);
  const activeProject   = useBioProjectStore((s) => s.activeProject);
  const refreshActive   = useBioProjectStore((s) => s.refreshActive);

  const [list, setList] = useState([]);
  const [entry, setEntry] = useState(blank(activeProjectId));
  const [status, setStatus] = useState(null);
  const [projectArtifacts, setProjectArtifacts] = useState(null);

  // Load experiments filtered to active project when possible
  const refresh = () =>
    listExperiments().then((all) => {
      const filtered = activeProjectId
        ? all.filter((e) => e.project_id === activeProjectId || e.project_id == null)
        : all;
      setList(filtered);
    }).catch(() => {});

  // Load project artifact context (designs, simulations, orders)
  const refreshProjectArtifacts = async () => {
    if (!activeProjectId) { setProjectArtifacts(null); return; }
    try {
      const p = await getBioProject(activeProjectId);
      setProjectArtifacts(p);
    } catch { setProjectArtifacts(null); }
  };

  useEffect(() => { refresh(); refreshProjectArtifacts(); }, [activeProjectId]);

  // When active project changes, reset new entry to inherit project
  const handleNew = () => setEntry(blank(activeProjectId));

  const save = async () => {
    try {
      const payload = { ...entry };
      // Always carry the active project id forward
      if (!payload.project_id && activeProjectId) payload.project_id = activeProjectId;
      const saved = payload.id
        ? await updateExperiment(payload.id, payload)
        : await createExperiment(payload);
      setEntry(saved);
      setStatus(`Saved "${saved.title}"`);
      refresh();
      refreshActive();
      refreshProjectArtifacts();
    } catch (e) { setStatus(e.message); }
  };

  const remove = async () => {
    if (!entry.id) { handleNew(); return; }
    await deleteExperiment(entry.id);
    handleNew();
    refresh();
    refreshActive();
  };

  // Results-table editing
  const setCell = (r, c, v) =>
    setEntry((e) => ({ ...e, rows: e.rows.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? v : cell) : row) }));
  const setColumn = (c, v) => setEntry((e) => ({ ...e, columns: e.columns.map((col, ci) => ci === c ? v : col) }));
  const addRow = () => setEntry((e) => ({ ...e, rows: [...e.rows, e.columns.map(() => "")] }));
  const addColumn = () => setEntry((e) => ({ ...e, columns: [...e.columns, "Column"], rows: e.rows.map((r) => [...r, ""]) }));
  const deleteRow = (ri) => setEntry((e) => {
    if (e.rows.length <= 1) return e;
    return { ...e, rows: e.rows.filter((_, i) => i !== ri) };
  });
  const deleteColumn = (ci) => setEntry((e) => {
    if (e.columns.length <= 1) return e;
    return { ...e, columns: e.columns.filter((_, i) => i !== ci), rows: e.rows.map((r) => r.filter((_, i) => i !== ci)) };
  });

  // Compute available design versions for the chosen design
  const selectedDesign = projectArtifacts?.designs?.find((d) => d.id === entry.design_id);
  const versionCount = selectedDesign?.latest_version ?? 0;

  return (
    <div className="notebook-editor">
      {/* ── Left: experiment list ── */}
      <div className="notebook-list">
        <div className="notebook-list-head">
          <span>
            Experiments
            {activeProject && <span className="muted" style={{ marginLeft: 4, fontSize: 11 }}>· {activeProject.name}</span>}
          </span>
          <Button size="sm" onClick={handleNew}>+ New</Button>
        </div>
        <ul>
          {list.map((e) => (
            <li
              key={e.id}
              className={entry.id === e.id ? "active" : ""}
              onClick={() => setEntry({ ...blank(activeProjectId), ...e })}
            >
              <div className="nb-title">{e.title}</div>
              <div className="nb-meta">
                {e.exp_type} · {e.date || "—"}
                {e.design_id && <VscLink size={10} style={{ marginLeft: 4, opacity: 0.6 }} title={`Linked to design ${e.design_id}`} />}
              </div>
            </li>
          ))}
          {list.length === 0 && <li className="explorer-empty">No experiments yet</li>}
        </ul>

        {/* ── Project artifacts sidebar ── */}
        {projectArtifacts && (
          <div className="nb-project-panel">
            <div className="nb-section-title" style={{ marginTop: 8 }}>Project artifacts</div>

            {projectArtifacts.designs?.length > 0 && (
              <>
                <div className="nb-artifact-group">Designs ({projectArtifacts.designs.length})</div>
                {projectArtifacts.designs.map((d) => (
                  <div
                    key={d.id}
                    className={`nb-artifact-item${entry.design_id === d.id ? " active" : ""}`}
                    onClick={() => setEntry((e) => ({ ...e, design_id: d.id, design_version_no: d.latest_version || null }))}
                    title={`Link experiment to design "${d.name}"`}
                  >
                    <VscLinkExternal size={10} />
                    <span>{d.name}</span>
                    <span className="muted" style={{ fontSize: 10 }}>v{d.latest_version}</span>
                  </div>
                ))}
              </>
            )}

            {projectArtifacts.simulations?.length > 0 && (
              <>
                <div className="nb-artifact-group">Simulations ({projectArtifacts.simulations.length})</div>
                {projectArtifacts.simulations.slice(0, 5).map((s) => (
                  <div key={s.id} className="nb-artifact-item muted" title={`${s.mode} · ${s.organism || ""}`}>
                    <span>{s.label || `Run #${s.id}`}</span>
                    <span style={{ fontSize: 10 }}>{s.mode}</span>
                  </div>
                ))}
              </>
            )}

            {projectArtifacts.orders?.length > 0 && (
              <>
                <div className="nb-artifact-group">Orders ({projectArtifacts.orders.length})</div>
                {projectArtifacts.orders.slice(0, 3).map((o) => (
                  <div key={o.id} className="nb-artifact-item muted" title={`${o.vendor} · ${o.fragment_count} fragments`}>
                    <span>{o.vendor || "Order"} #{o.id}</span>
                    <span style={{ fontSize: 10 }}>${o.estimated_cost_usd?.toFixed(0)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Right: experiment form ── */}
      <div className="notebook-form">
        <div className="nb-row">
          <input
            className="nb-input title"
            value={entry.title}
            onChange={(e) => setEntry({ ...entry, title: e.target.value })}
          />
          <select value={entry.exp_type} onChange={(e) => setEntry({ ...entry, exp_type: e.target.value })}>
            {EXP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" value={entry.date || ""} onChange={(e) => setEntry({ ...entry, date: e.target.value })} />
        </div>

        <input
          className="nb-input"
          placeholder="Protocol reference (e.g. assembly_v1)"
          value={entry.protocol_ref || ""}
          onChange={(e) => setEntry({ ...entry, protocol_ref: e.target.value })}
        />

        {/* Design version link */}
        <div className="nb-row" style={{ alignItems: "center", gap: 8, marginTop: 2 }}>
          <VscLink size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
          {projectArtifacts?.designs?.length > 0 ? (
            <>
              <select
                style={{ flex: 1 }}
                value={entry.design_id ?? ""}
                onChange={(e) => setEntry({
                  ...entry,
                  design_id: e.target.value ? parseInt(e.target.value) : null,
                  design_version_no: null,
                })}
              >
                <option value="">— Link to design —</option>
                {projectArtifacts.designs.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {entry.design_id && versionCount > 0 && (
                <select
                  value={entry.design_version_no ?? ""}
                  onChange={(e) => setEntry({ ...entry, design_version_no: e.target.value ? parseInt(e.target.value) : null })}
                  title="Which design version does this experiment test?"
                >
                  <option value="">any version</option>
                  {Array.from({ length: versionCount }, (_, i) => i + 1).map((v) => (
                    <option key={v} value={v}>v{v}</option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <input
              className="nb-input"
              style={{ flex: 1 }}
              type="number"
              placeholder="Design ID (optional)"
              value={entry.design_id ?? ""}
              onChange={(e) => setEntry({ ...entry, design_id: e.target.value ? parseInt(e.target.value) : null })}
            />
          )}
        </div>

        <div className="nb-section-title">
          Results
          <Button size="sm" onClick={addColumn}>+ col</Button>
          <Button size="sm" onClick={addRow}>+ row</Button>
        </div>
        <table className="nb-table">
          <thead>
            <tr>
              {entry.columns.map((c, ci) => (
                <th key={ci}>
                  <div className="nb-col-header">
                    <input value={c} onChange={(e) => setColumn(ci, e.target.value)} />
                    {entry.columns.length > 1 && (
                      <button className="nb-delete-col" title="Delete column" onClick={() => deleteColumn(ci)}>×</button>
                    )}
                  </div>
                </th>
              ))}
              <th className="nb-row-ctrl-th" />
            </tr>
          </thead>
          <tbody>
            {entry.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}><input value={cell} onChange={(e) => setCell(ri, ci, e.target.value)} /></td>
                ))}
                <td className="nb-row-ctrl">
                  {entry.rows.length > 1 && (
                    <button className="nb-delete-row" title="Delete row" onClick={() => deleteRow(ri)}>×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="nb-section-title">Notes (markdown)</div>
        <textarea
          className="nb-notes"
          rows={5}
          value={entry.notes_md}
          onChange={(e) => setEntry({ ...entry, notes_md: e.target.value })}
          placeholder="Observations, conditions, conclusions…"
        />

        <div className="nb-actions">
          <Button variant="primary" onClick={save}>Save</Button>
          <Button onClick={remove}>{entry.id ? "Delete" : "Clear"}</Button>
          {status && <span className="nb-status">{status}</span>}
        </div>
      </div>
    </div>
  );
}
