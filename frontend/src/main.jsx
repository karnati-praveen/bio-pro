import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// ── Monaco offline worker setup ───────────────────────────────────────────────
// Import workers via Vite's ?worker suffix so they are bundled as local assets.
// The Tauri WebView cannot load scripts from external CDNs, so every worker
// must be available as a same-origin asset at runtime.
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = {
  getWorker(_workerId, _label) {
    return new EditorWorker();
  },
};

// Point @monaco-editor/react away from its jsDelivr CDN loader so it uses
// the monaco-editor package that Vite has already resolved and bundled locally.
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
loader.config({ monaco });
// ─────────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
