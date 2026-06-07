import { create } from "zustand";

// Registry of loaded VS Code extensions and their contributed UI elements.
export const useExtensionStore = create((set, get) => ({
  // Loaded extension descriptors: { id, manifest, api, context }
  extensions: [],

  // webviewViewProviders: { [viewId]: { provider, options } }
  webviewViewProviders: {},

  // webviewPanels: { [tabId]: WebviewPanel shim instance }
  webviewPanels: {},

  // Extension-contributed commands (id → handler) — separate from shell COMMANDS
  // so we can look them up without touching the shell command registry.
  extCommands: {},

  registerExtension(descriptor) {
    set((s) => ({ extensions: [...s.extensions, descriptor] }));
  },

  registerWebviewViewProvider(viewId, provider, options) {
    set((s) => ({
      webviewViewProviders: {
        ...s.webviewViewProviders,
        [viewId]: { provider, options },
      },
    }));
  },

  registerWebviewPanel(tabId, panel) {
    set((s) => ({
      webviewPanels: { ...s.webviewPanels, [tabId]: panel },
    }));
  },

  removeWebviewPanel(tabId) {
    set((s) => {
      const next = { ...s.webviewPanels };
      delete next[tabId];
      return { webviewPanels: next };
    });
  },

  registerExtCommand(id, handler) {
    set((s) => ({ extCommands: { ...s.extCommands, [id]: handler } }));
  },

  unregisterExtCommand(id) {
    set((s) => {
      const next = { ...s.extCommands };
      delete next[id];
      return { extCommands: next };
    });
  },

  getExtension(id) {
    return get().extensions.find((e) => e.id === id) ?? null;
  },
}));
