import { create } from "zustand";
import { listSimRuns, saveSimRun } from "../api/client.js";

// Persistent simulation-run history (Module 4). Each run records mode, params, and
// a results summary; the workbench can reload any prior run's configuration.
export const useSimulationStore = create((set, get) => ({
  history: [],
  loading: false,

  fetchHistory: async () => {
    set({ loading: true });
    try {
      set({ history: await listSimRuns(), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  record: async ({ label, mode, organism, params, summary }) => {
    try {
      const saved = await saveSimRun({ label, mode, organism, params: params || {}, summary: summary || {} });
      set((s) => ({ history: [saved, ...s.history] }));
      return saved;
    } catch {
      return null;
    }
  },
}));
