import { useEffect, useState } from "react";
import { VscProject, VscAdd, VscCheck, VscClose } from "react-icons/vsc";
import { useBioProjectStore } from "../stores/bioProjectStore.js";

// Modal that lets the user pick or create a BioIDE project. Rendered inside
// StatusBar; show/hide is controlled by the parent via the `onClose` prop.
export default function ProjectPickerModal({ onClose }) {
  const { projects, activeProjectId, fetchProjects, setActiveProject, createAndActivate } =
    useBioProjectStore();

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { fetchProjects(); }, []);

  const handleSelect = (p) => {
    setActiveProject(p);
    onClose();
  };

  const handleClearProject = () => {
    setActiveProject(null);
    onClose();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createAndActivate(newName.trim(), newDesc.trim());
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="project-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="project-picker-header">
          <VscProject size={14} />
          <span>Switch Project</span>
          <button className="icon-btn" onClick={onClose} title="Close"><VscClose size={14} /></button>
        </div>

        <ul className="project-picker-list">
          <li
            className={`project-picker-item ${!activeProjectId ? "active" : ""}`}
            onClick={handleClearProject}
          >
            <span className="project-picker-name muted">No project</span>
            {!activeProjectId && <VscCheck size={12} />}
          </li>
          {projects.map((p) => (
            <li
              key={p.id}
              className={`project-picker-item ${p.id === activeProjectId ? "active" : ""}`}
              onClick={() => handleSelect(p)}
            >
              <div className="project-picker-info">
                <span className="project-picker-name">{p.name}</span>
                {p.description && <span className="project-picker-desc muted">{p.description}</span>}
              </div>
              {p.id === activeProjectId && <VscCheck size={12} />}
            </li>
          ))}
          {projects.length === 0 && (
            <li className="project-picker-item muted">No projects yet</li>
          )}
        </ul>

        <div className="project-picker-create">
          {!creating ? (
            <button className="btn micro" onClick={() => setCreating(true)}>
              <VscAdd size={11} /> New project
            </button>
          ) : (
            <div className="project-picker-form">
              <input
                className="nb-input"
                placeholder="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <input
                className="nb-input"
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              {error && <span className="nb-status error">{error}</span>}
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn primary micro" onClick={handleCreate} disabled={busy || !newName.trim()}>
                  {busy ? "Creating…" : "Create"}
                </button>
                <button className="btn micro" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
