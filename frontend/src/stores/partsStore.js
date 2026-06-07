import { create } from "zustand";
import { fetchParts, createPart, importParts, fetchCrossReactivity } from "../api/client.js";

// Cached parts catalogue + browser filters/selection for the Parts Library view.
const emptyFilters = { type: "", host: "", query: "" };

export const usePartsStore = create((set, get) => ({
  parts: null,            // { parts:[], reporters:[], inducers:[] }
  loading: false,
  error: null,
  filters: { ...emptyFilters },
  selectedPartId: null,
  crossReactivity: null,  // { regulators:[], matrix:{} }

  fetch: async () => {
    if (get().parts || get().loading) return;
    set({ loading: true, error: null });
    try {
      const data = await fetchParts();
      set({ parts: data, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  reload: async () => {
    try {
      set({ parts: await fetchParts() });
    } catch (e) {
      set({ error: e.message });
    }
  },

  addCustom: async (part) => {
    await createPart(part);
    await get().reload();
  },

  importFile: async (filename, content) => {
    const res = await importParts(filename, content);
    await get().reload();
    return res;
  },

  loadCrossReactivity: async () => {
    if (get().crossReactivity) return;
    try {
      set({ crossReactivity: await fetchCrossReactivity() });
    } catch { /* ignore */ }
  },

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  clearFilters: () => set({ filters: { ...emptyFilters } }),

  select: (selectedPartId) => set({ selectedPartId }),

  // Derived: parts after applying the current filters.
  filtered: () => {
    const { parts, filters } = get();
    const list = parts?.parts ?? [];
    const q = filters.query.trim().toLowerCase();
    return list.filter((p) => {
      if (filters.type && p.type !== filters.type) return false;
      if (filters.host && !(p.host_compatibility || []).includes(filters.host)) return false;
      if (q) {
        const hay = `${p.id} ${p.name} ${p.type} ${p.role || ""} ${p.description || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },
}));
