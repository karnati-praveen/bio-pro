import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import { queryClient } from "./api/queryClient.js";
import "allotment/dist/style.css";
import "./styles.css";

// ── Monaco offline worker setup ───────────────────────────────────────────────
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = {
  getWorker(_workerId, _label) {
    return new EditorWorker();
  },
};

import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
loader.config({ monaco });

// ── vscode-shim boot ──────────────────────────────────────────────────────────
// Boot the shim before React renders so any extension activated at startup
// can register language providers before the first editor mounts.
import { boot } from "./lib/vscode-shim/boot.js";
boot(monaco);
// ─────────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
