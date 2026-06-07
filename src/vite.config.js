import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  base: "./",

  resolve: {
    alias: {
      // Allow static `import from 'vscode'` in app code to resolve to the shim.
      // Runtime Blob-URL imports are handled by the import map in index.html.
      vscode: path.resolve("./shared/lib/vscode-shim/index.js"),
    },
  },

  build: {
    target: ["es2021", "chrome102"],
  },

  envPrefix: ["VITE_", "TAURI_"],

  optimizeDeps: {
    exclude: ["monaco-editor", "fflate"],
  },

  worker: {
    format: "es",
  },

  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
