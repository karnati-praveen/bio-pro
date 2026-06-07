import { VscNewFile, VscFolderOpened, VscRefresh } from "react-icons/vsc";
import { useProjectStore } from "../stores/projectStore.js";
import { useTabStore } from "../stores/tabStore.js";
import { useCircuitStore } from "../stores/circuitStore.js";
import { iconForFile, editorTypeForFile } from "../lib/fileTypes.js";

// Primary-sidebar Explorer: opens a project folder and lists its design files,
// opening each in the correct editor. Ported from the original FileTree.jsx,
// now backed by projectStore + tabStore.
export default function ExplorerView() {
  const { label, entries, error, openProject, refresh, readFile, newFileEntry } =
    useProjectStore();
  const openTab = useTabStore((s) => s.openTab);
  const ensureCircuit = useCircuitStore((s) => s.ensure);

  const openEntry = async (entry) => {
    try {
      const content = entry.isNew ? "" : await readFile(entry);
      const type = editorTypeForFile(entry.path);
      const id = openTab({ type, title: entry.name, filePath: entry.path, content, meta: { _handle: entry._handle } });
      if (type === "circuit") {
        ensureCircuit(id, content);
        useCircuitStore.getState().setDsl(id, content);
      }
    } catch (e) {
      useProjectStore.setState({ error: e.message });
    }
  };

  const onNew = () => {
    const raw = window.prompt("New file name (e.g. my_circuit.biopro):");
    if (!raw) return;
    const entry = newFileEntry(raw);
    openEntry(entry);
  };

  return (
    <div className="explorer">
      <div className="explorer-toolbar">
        <button className="icon-btn" title="Open folder" onClick={openProject}><VscFolderOpened /></button>
        <button className="icon-btn" title="New file" onClick={onNew}><VscNewFile /></button>
        <button className="icon-btn" title="Refresh" onClick={refresh}><VscRefresh /></button>
      </div>

      {error && <div className="explorer-error">{error}</div>}

      {label ? (
        <>
          <div className="explorer-folder">{label}</div>
          <ul className="explorer-list">
            {entries.map((entry) => (
              <li key={entry.path} className="explorer-item" onClick={() => openEntry(entry)} title={entry.path}>
                <span className="explorer-icon">{iconForFile(entry.path)}</span>
                <span className="explorer-name">{entry.name}{entry.isNew ? " *" : ""}</span>
              </li>
            ))}
            {entries.length === 0 && <li className="explorer-empty">No design files</li>}
          </ul>
        </>
      ) : (
        <div className="explorer-empty-state">
          <p>No folder opened.</p>
          <button className="btn" onClick={openProject}>Open Folder</button>
        </div>
      )}
    </div>
  );
}
