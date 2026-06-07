// Mirrors Monaco editor markers (extension-contributed diagnostics) into a
// Zustand store so React components can subscribe reactively.
// boot.js wires monaco.editor.onDidChangeMarkers → this store.

import { create } from "zustand";

export const useMarkersStore = create((set) => ({
  // { [resourcePath]: MonacoMarker[] }
  byPath: {},

  setMarkers(resourcePath, markers) {
    set((s) => ({ byPath: { ...s.byPath, [resourcePath]: markers } }));
  },

  clearMarkers(resourcePath) {
    set((s) => {
      const next = { ...s.byPath };
      delete next[resourcePath];
      return { byPath: next };
    });
  },

  allMarkers() {
    return Object.values(useMarkersStore.getState().byPath).flat();
  },
}));
