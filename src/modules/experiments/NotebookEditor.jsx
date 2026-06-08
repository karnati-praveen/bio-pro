import { useEffect, useState } from "react";
import {
  listExperiments, createExperiment, updateExperiment, deleteExperiment,
} from "../../shared/lib/api/client.js";

const EXP_TYPES = ["transformation", "expression", "purification", "assay", "sequencing"];
const blank = () => ({
  title: "Untitled experiment", exp_type: "expression", date: new Date().toISOString().slice(0, 10),
  protocol_ref: "", columns: ["Colony", "GFP signal", "OD600"], rows: [["", "", ""]], notes_md: "",
});

// Module 10 — Experiment Notebook. Records wet-lab results (user-defined results
// table + markdown notes) and links them to designs. Persisted via /api/experiments.
export default function NotebookEditor() {
  const [list, setList] = useState([]);
  const [entry, setEntry] = useState(blank());
  const [status, setStatus] = useState(null);

  const refresh = () => listExperiments().then(setList).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const save = async () => {
    try {
      const saved = entry.id ? await updateExperiment(entry.id, entry) : await createExperiment(entry);
      setEntry(saved);
      setStatus(`Saved “${saved.title}”`);
      refresh();
    } catch (e) { setStatus(e.message); }
  };

  const remove = async () => {
    if (!entry.id) { setEntry(blank()); return; }
    await deleteExperiment(entry.id);
    setEntry(blank()); refresh();
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

  return (
    <div className="notebook-editor">
      <div className="notebook-list">
        <div className="notebook-list-head">
          <span>Experiments</span>
          <button className="btn micro" onClick={() => setEntry(blank())}>+ New</button>
        </div>
        <ul>
          {list.map((e) => (
            <li key={e.id} className={entry.id === e.id ? "active" : ""} onClick={() => setEntry({ ...blank(), ...e })}>
              <div className="nb-title">{e.title}</div>
              <div className="nb-meta">{e.exp_type} · {e.date || "—"}</div>
            </li>
          ))}
          {list.length === 0 && <li className="explorer-empty">No experiments yet</li>}
        </ul>
      </div>

      <div className="notebook-form">
        <div className="nb-row">
          <input className="nb-input title" value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} />
          <select value={entry.exp_type} onChange={(e) => setEntry({ ...entry, exp_type: e.target.value })}>
            {EXP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" value={entry.date || ""} onChange={(e) => setEntry({ ...entry, date: e.target.value })} />
        </div>
        <input className="nb-input" placeholder="Protocol reference (e.g. assembly_v1)"
          value={entry.protocol_ref || ""} onChange={(e) => setEntry({ ...entry, protocol_ref: e.target.value })} />

        <div className="nb-section-title">Results <button className="btn micro" onClick={addColumn}>+ col</button> <button className="btn micro" onClick={addRow}>+ row</button></div>
        <table className="nb-table">
          <thead>
            <tr>
              {entry.columns.map((c, ci) => (
                <th key={ci}>
                  <div className="nb-col-header">
                    <input value={c} onChange={(e) => setColumn(ci, e.target.value)} />
                    {entry.columns.length > 1 && (
                      <button
                        className="nb-delete-col"
                        title="Delete column"
                        onClick={() => deleteColumn(ci)}
                      >×</button>
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
                    <button
                      className="nb-delete-row"
                      title="Delete row"
                      onClick={() => deleteRow(ri)}
                    >×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="nb-section-title">Notes (markdown)</div>
        <textarea className="nb-notes" rows={5} value={entry.notes_md}
          onChange={(e) => setEntry({ ...entry, notes_md: e.target.value })} placeholder="Observations, conditions, conclusions…" />

        <div className="nb-actions">
          <button className="btn primary" onClick={save}>Save</button>
          <button className="btn" onClick={remove}>{entry.id ? "Delete" : "Clear"}</button>
          {status && <span className="nb-status">{status}</span>}
        </div>
      </div>
    </div>
  );
}
