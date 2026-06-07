import { create } from "zustand";
import {
  isTauri,
  tauriOpenFolder,
  tauriListFiles,
  tauriReadFile,
  tauriWriteFile,
  browserListFiles,
  browserReadFile,
  browserWriteFile,
} from "../lib/tauriFs.js";

const DEFAULT_SETTINGS = {
  theme: "dark",
  fontSize: 13,
  defaultOrganism: "ecoli",
  defaultSimDuration: 200,
  preferredAssembly: "gibson",
};

// Open project folder, its file listing, and project settings. Reads/writes go
// through the shared tauriFs helpers so the same store works in the browser.
export const useProjectStore = create((set, get) => ({
  rootPath: null,
  label: null,
  entries: [],
  settings: { ...DEFAULT_SETTINGS },
  dirHandle: null,      // browser File System Access handle
  error: null,

  openProject: async () => {
    set({ error: null });
    try {
      if (isTauri) {
        const dir = await tauriOpenFolder();
        if (!dir) return;
        const entries = await tauriListFiles(dir);
        set({ rootPath: dir, label: dir.split(/[\\/]/).pop(), entries });
      } else if ("showDirectoryPicker" in window) {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        const entries = await browserListFiles(handle);
        set({ rootPath: handle.name, label: handle.name, entries, dirHandle: handle });
      } else {
        set({ error: "File system access not available in this browser." });
      }
    } catch (e) {
      if (e.name !== "AbortError") set({ error: e.message });
    }
  },

  refresh: async () => {
    const { rootPath, dirHandle } = get();
    if (isTauri && rootPath) {
      set({ entries: await tauriListFiles(rootPath) });
    } else if (dirHandle) {
      set({ entries: await browserListFiles(dirHandle) });
    }
  },

  readFile: async (entry) => {
    const { dirHandle } = get();
    return isTauri ? tauriReadFile(entry.path) : browserReadFile(entry, dirHandle);
  },

  writeFile: async (entry, content) => {
    if (isTauri) return tauriWriteFile(entry.path, content);
    const handle = entry._handle ?? (await get().dirHandle?.getFileHandle(entry.name));
    if (!handle) throw new Error("No file handle to write to.");
    return browserWriteFile(handle, content);
  },

  newFileEntry: (name) => {
    const { rootPath, entries } = get();
    const fname = name.includes(".") ? name : `${name}.biopro`;
    const path = rootPath ? `${rootPath}/${fname}` : fname;
    const entry = { name: fname, path, _handle: null, isNew: true };
    set({ entries: [...entries, entry] });
    return entry;
  },

  updateSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),
}));
