// Find-across-project. Full implementation (Fuse.js over open files + folder
// contents) lands with the file-tree work in Phase 2; this keeps the view present.
export default function SearchView() {
  return (
    <div className="sidebar-placeholder">
      <input className="parts-search" placeholder="Search across project…" disabled />
      <p className="hint">Project-wide search arrives in Phase 2.</p>
    </div>
  );
}
