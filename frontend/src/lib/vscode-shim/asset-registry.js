// Standalone asset Blob URL registry — imported by both extensionLoader.js
// (writes) and window.js (reads) without creating circular dependencies.

const _cache = new Map(); // "<extensionId>/<relativePath>" → blobUrl

export function registerExtensionAssets(extensionId, files) {
  const ASSET_EXTS = /\.(png|gif|jpg|jpeg|svg|ico|css|woff|woff2|ttf|html|json)$/i;
  const mimeMap = {
    png: "image/png", gif: "image/gif", jpg: "image/jpeg", jpeg: "image/jpeg",
    svg: "image/svg+xml", ico: "image/x-icon", css: "text/css",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
    html: "text/html", json: "application/json",
  };
  for (const [filePath, bytes] of Object.entries(files)) {
    if (!ASSET_EXTS.test(filePath)) continue;
    const relative = filePath.replace(/^extension\//, "");
    const ext = filePath.split(".").pop().toLowerCase();
    const mime = mimeMap[ext] ?? "application/octet-stream";
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    _cache.set(`${extensionId}/${relative}`, url);
  }
}

export function resolveExtensionAsset(extensionId, relativePath) {
  return _cache.get(`${extensionId}/${relativePath.replace(/\\/g, "/")}`) ?? null;
}

export function revokeExtensionAssets(extensionId) {
  for (const [key, url] of _cache.entries()) {
    if (key.startsWith(`${extensionId}/`)) {
      URL.revokeObjectURL(url);
      _cache.delete(key);
    }
  }
}
