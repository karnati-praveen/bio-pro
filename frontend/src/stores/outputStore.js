import { create } from "zustand";

// Stores named output channels contributed by the vscode shim's createOutputChannel().
// Each channel is an array of log lines. BottomPanel's Output tab reads this store.
export const useOutputStore = create((set, get) => ({
  channels: {},        // { [name]: string[] }
  activeChannel: null, // string | null — the channel shown in the Output tab

  addLine(name, text) {
    set((s) => ({
      channels: {
        ...s.channels,
        [name]: [...(s.channels[name] ?? []), text],
      },
      // Auto-activate the first channel that produces output.
      activeChannel: s.activeChannel ?? name,
    }));
  },

  clearChannel(name) {
    set((s) => ({
      channels: { ...s.channels, [name]: [] },
    }));
  },

  removeChannel(name) {
    set((s) => {
      const next = { ...s.channels };
      delete next[name];
      const active = s.activeChannel === name
        ? (Object.keys(next)[0] ?? null)
        : s.activeChannel;
      return { channels: next, activeChannel: active };
    });
  },

  setActiveChannel(name) {
    set({ activeChannel: name });
  },

  ensureChannel(name) {
    const { channels } = get();
    if (!channels[name]) {
      set((s) => ({ channels: { ...s.channels, [name]: [] } }));
    }
  },
}));
