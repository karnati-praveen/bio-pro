import { useState, useCallback } from "react";

const isTauri = typeof window !== "undefined" && !!window.__TAURI__;

async function tauriOpenFolder() {
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({ directory: true, multiple: false, title: "Open project folder" });
}

async function tauriListBiopro(dirPath) {
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const entries = await readDir(dirPath);
  return entries
    .filter(e => !e.children && e.name?.endsWith(".biopro"))
    .map(e => ({ name: e.name, path: `${dirPath}/${e.name}` }));
}

async function tauriReadFile(filePath) {
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return readTextFile(filePath);
}

export async function tauriWriteFile(filePath, content) {
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  return writeTextFile(filePath, content);
}

export default function FileTree({ onOpenFile, onNewFile }) {
  const [folderLabel, setFolderLabel] = useState(null);
  const [folderPath, setFolderPath]   = useState(null);
  const [entries, setEntries]         = useState([]);
  const [fsaDirHandle, setFsaDirHandle] = useState(null);
  const [error, setError]             = useState(null);

  const openFolder = useCallback(async () => {
    setError(null);
    try {
      if (isTauri) {
        const dir = await tauriOpenFolder();
        if (!dir) return;
        const files = await tauriListBiopro(dir);
        setFolderPath(dir);
        setFolderLabel(dir.split(/[\\/]/).pop());
        setEntries(files);
      } else if ("showDirectoryPicker" in window) {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        setFsaDirHandle(handle);
        setFolderPath(handle.name);
        setFolderLabel(handle.name);
        const files = [];
        for await (const [name, fh] of handle.entries()) {
          if (fh.kind === "file" && name.endsWith(".biopro")) {
            files.push({ name, path: name, _handle: fh });
          }
        }
        setEntries(files);
      } else {
        setError("File system access not available in this browser.");
      }
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    }
  }, []);

  const clickFile = useCallback(async (entry) => {
    setError(null);
    try {
      let content;
      if (isTauri) {
        content = await tauriReadFile(entry.path);
      } else {
        const fh = entry._handle ?? await fsaDirHandle?.getFileHandle(entry.name);
        if (!fh) throw new Error("Cannot read file — no directory handle.");
        const file = await fh.getFile();
        content = await file.text();
      }
      onOpenFile({ name: entry.name, path: entry.path, content, dirty: false, _handle: entry._handle ?? null });
    } catch (e) {
      setError(e.message);
    }
  }, [isTauri, fsaDirHandle, onOpenFile]);

  const newFile = useCallback(() => {
    const raw = window.prompt("New file name:");
    if (!raw) return;
    const name = raw.endsWith(".biopro") ? raw : `${raw}.biopro`;
    const path = folderPath ? `${folderPath}/${name}` : name;
    onNewFile({ name, path, content: "", dirty: true, _handle: null });
  }, [folderPath, onNewFile]);

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title">Explorer</span>
        <div className="file-tree-actions">
          <button className="icon-btn" title="Open folder" onClick={openFolder}>&#128193;</button>
          <button className="icon-btn" title="New .biopro file" onClick={newFile}>&#43;</button>
        </div>
      </div>

      {error && <div className="file-tree-error">{error}</div>}

      {folderLabel && (
        <div className="file-tree-folder-name" title={folderPath}>{folderLabel}</div>
      )}

      <ul className="file-tree-list">
        {entries.map(entry => (
          <li key={entry.path} className="file-tree-item" onClick={() => clickFile(entry)}>
            <span className="file-tree-icon">&#128196;</span>
            <span className="file-tree-name" title={entry.name}>{entry.name}</span>
          </li>
        ))}
        {folderLabel && entries.length === 0 && (
          <li className="file-tree-empty">No .biopro files</li>
        )}
      </ul>
    </div>
  );
}
