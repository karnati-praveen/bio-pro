// Filesystem helpers that work in both the Tauri WebView (native fs plugin)
// and a plain browser (File System Access API). Extracted from the original
// FileTree.jsx so stores and views can share one implementation.

export const isTauri = typeof window !== "undefined" && !!window.__TAURI__;

const PROJECT_EXTS = [
  ".biopro", ".sbol", ".gb", ".gbk", ".fasta", ".fa",
  ".mol", ".sdf", ".smiles", ".protocol", ".sim", ".pathway", ".notebook",
];

const isProjectFile = (name) =>
  PROJECT_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

export async function tauriOpenFolder() {
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({ directory: true, multiple: false, title: "Open project folder" });
}

export async function tauriListFiles(dirPath) {
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const entries = await readDir(dirPath);
  return entries
    .filter((e) => !e.children && e.name && isProjectFile(e.name))
    .map((e) => ({ name: e.name, path: `${dirPath}/${e.name}` }));
}

export async function tauriReadFile(filePath) {
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return readTextFile(filePath);
}

export async function tauriWriteFile(filePath, content) {
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  return writeTextFile(filePath, content);
}

// Browser fallback: enumerate a chosen directory handle.
export async function browserListFiles(dirHandle) {
  const files = [];
  for await (const [name, fh] of dirHandle.entries()) {
    if (fh.kind === "file" && isProjectFile(name)) {
      files.push({ name, path: name, _handle: fh });
    }
  }
  return files;
}

export async function browserReadFile(entry, dirHandle) {
  const fh = entry._handle ?? (await dirHandle?.getFileHandle(entry.name));
  if (!fh) throw new Error("Cannot read file — no directory handle.");
  const file = await fh.getFile();
  return file.text();
}

export async function browserWriteFile(handle, content) {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

// ── Binary file I/O (Tauri only) ──────────────────────────────────────────────

export async function tauriReadBinaryFile(filePath) {
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return readFile(filePath); // returns Uint8Array
}

export async function tauriWriteBinaryFile(filePath, bytes) {
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  return writeFile(filePath, bytes);
}

export async function tauriEnsureDir(dirPath) {
  const { mkdir } = await import("@tauri-apps/plugin-fs");
  try {
    await mkdir(dirPath, { recursive: true });
  } catch { /* already exists */ }
}

export async function tauriListAllFiles(dirPath) {
  const { readDir } = await import("@tauri-apps/plugin-fs");
  try {
    const entries = await readDir(dirPath);
    return entries
      .filter((e) => !e.children && e.name)
      .map((e) => ({ name: e.name, path: `${dirPath}/${e.name}` }));
  } catch {
    return [];
  }
}
