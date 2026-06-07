import { useRef } from "react";
import { useExtensionStore } from "../stores/extensionStore.js";
import { loadFromFile } from "../lib/extensionLoader.js";
import { useUiStore } from "../stores/uiStore.js";

// Drag-and-drop or file-picker panel for installing .vsix extensions.
export default function ExtensionManager() {
  const extensions = useExtensionStore((s) => s.extensions);
  const fileRef = useRef(null);
  const setStatus = useUiStore((s) => s.setStatus);

  const handleFiles = async (files) => {
    for (const file of files) {
      if (!file.name.endsWith(".vsix")) continue;
      setStatus(`Installing ${file.name}…`);
      try {
        const desc = await loadFromFile(file);
        setStatus(`Installed ${desc.id}`);
      } catch (e) {
        setStatus(`Failed to install ${file.name}: ${e.message}`);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFiles([...e.dataTransfer.files]);
  };

  const handleDragOver = (e) => e.preventDefault();

  return (
    <div className="extension-manager">
      <div
        className="ext-drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileRef.current?.click()}
      >
        Drop a .vsix file here or click to browse
        <input
          ref={fileRef}
          type="file"
          accept=".vsix"
          style={{ display: "none" }}
          multiple
          onChange={(e) => handleFiles([...e.target.files])}
        />
      </div>

      <div className="ext-list">
        {extensions.length === 0 ? (
          <div className="ext-empty">No extensions installed</div>
        ) : (
          extensions.map((ext) => (
            <div key={ext.id} className="ext-item">
              <div className="ext-item-id">{ext.id}</div>
              <div className="ext-item-version">v{ext.manifest?.version ?? "?"}</div>
              <span className="ext-item-badge">active</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
