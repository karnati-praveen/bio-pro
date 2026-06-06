import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // Tauri serves from a custom protocol URI (tauri://localhost or http://tauri.localhost
  // on Windows). Absolute asset paths like /assets/x.js break under these origins,
  // so all asset references must be relative.
  base: "./",

  build: {
    // Target WebView2 (Chromium 102+) capabilities on Windows.
    target: ["es2021", "chrome102"],
  },

  // Expose TAURI_* env vars to frontend code alongside the standard VITE_ prefix.
  envPrefix: ["VITE_", "TAURI_"],

  // Monaco ships its own web workers. Exclude it from Vite's dep pre-bundler
  // (which can't handle the 4 MB package) so the ?worker imports resolve correctly.
  optimizeDeps: {
    exclude: ["monaco-editor"],
  },

  // Bundle workers as ES modules to match the es2021 build target and satisfy
  // WebView2's same-origin worker requirement when running from tauri:// URLs.
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
