import { useEffect, useRef, useState } from "react";
import { usePartsStore } from "../stores/partsStore.js";
import { useUiStore } from "../stores/uiStore.js";

const TYPES = ["promoter", "cds", "rbs", "terminator", "inducer", "operator"];
const HOSTS = ["ecoli", "yeast", "mammalian"];
const REACT_COLOR = { self: "#2a9d8f", weak: "#f0883e", none: "#e9eef2" };

// Module 3 — searchable/filterable parts browser with custom-part creation,
// GenBank import, and a cross-reactivity compatibility grid.
export default function PartsLibraryView() {
  const {
    parts, loading, error, filters, fetch, setFilter, select, filtered,
    selectedPartId, addCustom, importFile, crossReactivity, loadCrossReactivity,
  } = usePartsStore();
  const toggleSecondary = useUiStore((s) => s.toggleSecondary);
  const secondaryVisible = useUiStore((s) => s.secondaryVisible);
  const setStatus = useUiStore((s) => s.setStatus);

  const [showForm, setShowForm] = useState(false);
  const [showCross, setShowCross] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", type: "promoter", seq: "" });
  const fileRef = useRef(null);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { if (showCross) loadCrossReactivity(); }, [showCross, loadCrossReactivity]);

  const onSelect = (id) => { select(id); if (!secondaryVisible) toggleSecondary(); };
  const results = parts ? filtered() : [];

  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.id || !form.type) return;
    try {
      await addCustom(form);
      setStatus(`Added custom part ${form.id}`);
      setForm({ id: "", name: "", type: "promoter", seq: "" });
      setShowForm(false);
    } catch (err) { setStatus(`Add failed: ${err.message}`); }
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    try {
      const res = await importFile(file.name, content);
      setStatus(`Imported ${res.count} parts from ${res.source}`);
    } catch (err) { setStatus(`Import failed: ${err.message}`); }
    e.target.value = "";
  };

  return (
    <div className="parts-library">
      <input className="parts-search" placeholder="Search parts…"
        value={filters.query} onChange={(e) => setFilter("query", e.target.value)} />
      <div className="parts-filters">
        <select value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filters.host} onChange={(e) => setFilter("host", e.target.value)}>
          <option value="">All hosts</option>
          {HOSTS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>

      <div className="parts-actions">
        <button className="btn" onClick={() => setShowForm((v) => !v)}>+ Custom</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import GenBank</button>
        <button className="btn" onClick={() => setShowCross((v) => !v)}>Compatibility</button>
        <input ref={fileRef} type="file" accept=".gb,.gbk,.fasta,.fa" hidden onChange={onImport} />
      </div>

      {showForm && (
        <form className="custom-part-form" onSubmit={submitForm}>
          <input placeholder="id (e.g. pMyProm)" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required />
          <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <textarea placeholder="sequence (ATGC…)" rows={2} value={form.seq} onChange={(e) => setForm({ ...form, seq: e.target.value })} />
          <button className="btn primary" type="submit">Save part</button>
        </form>
      )}

      {showCross && crossReactivity && (
        <div className="cross-grid">
          <div className="cross-title">Regulator cross-reactivity</div>
          <table>
            <thead><tr><th></th>{crossReactivity.regulators.map((r) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>
              {crossReactivity.regulators.map((r) => (
                <tr key={r}>
                  <th>{r}</th>
                  {crossReactivity.regulators.map((c) => {
                    const v = crossReactivity.matrix[r]?.[c] || "none";
                    return <td key={c} title={v} style={{ background: REACT_COLOR[v] }} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cross-legend">
            <span><i style={{ background: REACT_COLOR.self }} /> cognate</span>
            <span><i style={{ background: REACT_COLOR.weak }} /> weak cross-talk</span>
            <span><i style={{ background: REACT_COLOR.none }} /> orthogonal</span>
          </div>
        </div>
      )}

      {loading && <div className="panel-empty">Loading parts…</div>}
      {error && <div className="explorer-error">{error}</div>}

      <ul className="parts-list">
        {results.map((p) => (
          <li key={p.id} className={`part-item${selectedPartId === p.id ? " selected" : ""}`}
            onClick={() => onSelect(p.id)}>
            <div className="part-name">{p.name}</div>
            <div className="part-tags">
              <span className="part-tag">{p.type}</span>
              {p.role && <span className="part-tag role">{p.role}</span>}
              {(p.host_compatibility || []).slice(0, 1).map((h) => <span key={h} className="part-tag host">{h}</span>)}
            </div>
          </li>
        ))}
        {parts && results.length === 0 && <li className="explorer-empty">No matching parts</li>}
      </ul>
    </div>
  );
}
