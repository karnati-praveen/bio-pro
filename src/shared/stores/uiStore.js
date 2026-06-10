import { create } from "zustand";

let _toastSeq = 0;

export const useUiStore = create((set, get) => ({
  theme: "dark",
  colorBlind: false,
  sidebarVisible: true,
  panelVisible: true,
  secondaryVisible: false,
  panelHeight: 200,
  activeActivity: "explorer",
  bottomTab: "problems",
  paletteOpen: false,
  modal: null,
  status: "Ready",

  // ── Toast notifications ────────────────────────────────────────────────────
  toasts: [],

  // ── Extension-contributed dynamic lists ────────────────────────────────────
  // Activity bar items added by extensions: [{ id, title, iconId? }]
  activityItems: [],
  // Bottom panel tabs added by extensions: [{ id, label }]
  bottomTabs: [],

  // ── vscode.window.showQuickPick state ─────────────────────────────────────
  quickPickItems: null,    // QuickPickItem[] | null
  quickPickOptions: null,
  quickPickResolve: null,  // (item) => void

  // ── vscode.window.showInputBox state ──────────────────────────────────────
  inputBox: null,   // { options, resolve } | null

  // ── vscode.window.showInformationMessage with actions ─────────────────────
  notification: null, // { message, items, resolve } | null

  // ── vscode.window.withProgress spinner ────────────────────────────────────
  progress: null, // { title, message } | null

  // ── Standard setters ──────────────────────────────────────────────────────
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  toggleColorBlind: () => set((s) => ({ colorBlind: !s.colorBlind })),

  addToast(message, type = "info", duration = 3500) {
    const id = ++_toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    if (duration > 0) {
      setTimeout(() => get().removeToast(id), duration);
    }
  },
  removeToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  setActivity: (activeActivity) =>
    set((s) =>
      s.activeActivity === activeActivity && s.sidebarVisible
        ? { sidebarVisible: false }
        : { activeActivity, sidebarVisible: true }
    ),

  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),
  toggleSecondary: () => set((s) => ({ secondaryVisible: !s.secondaryVisible })),
  setBottomTab: (bottomTab) => set({ bottomTab, panelVisible: true }),
  setPanelHeight: (panelHeight) => set({ panelHeight }),

  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),

  openModal: (id) => set({ modal: id }),
  closeModal: () => set({ modal: null }),

  setStatus: (status) => set({ status }),

  // ── Extension dynamic items ────────────────────────────────────────────────
  addActivityItem(item) {
    set((s) => {
      if (s.activityItems.some((i) => i.id === item.id)) return s;
      return { activityItems: [...s.activityItems, item] };
    });
  },
  removeActivityItem(id) {
    set((s) => ({ activityItems: s.activityItems.filter((i) => i.id !== id) }));
  },
  addBottomTab(tab) {
    set((s) => {
      if (s.bottomTabs.some((t) => t.id === tab.id)) return s;
      return { bottomTabs: [...s.bottomTabs, tab] };
    });
  },
  removeBottomTab(id) {
    set((s) => ({ bottomTabs: s.bottomTabs.filter((t) => t.id !== id) }));
  },

  // ── showQuickPick ──────────────────────────────────────────────────────────
  showQuickPick(items, options, resolve) {
    set({ quickPickItems: items, quickPickOptions: options, quickPickResolve: resolve, paletteOpen: true });
  },
  resolveQuickPick(item) {
    const resolve = get().quickPickResolve;
    set({ quickPickItems: null, quickPickOptions: null, quickPickResolve: null, paletteOpen: false });
    resolve?.(item);
  },
  cancelQuickPick() {
    const resolve = get().quickPickResolve;
    set({ quickPickItems: null, quickPickOptions: null, quickPickResolve: null, paletteOpen: false });
    resolve?.(undefined);
  },

  // ── showInputBox ───────────────────────────────────────────────────────────
  showInputBox(options, resolve) {
    set({ inputBox: { options, resolve } });
  },
  resolveInputBox(value) {
    const resolve = get().inputBox?.resolve;
    set({ inputBox: null });
    resolve?.(value);
  },
  cancelInputBox() {
    const resolve = get().inputBox?.resolve;
    set({ inputBox: null });
    resolve?.(undefined);
  },

  // ── showInformationMessage with action buttons ─────────────────────────────
  showNotification(message, items, resolve) {
    set({ notification: { message, items, resolve } });
  },
  resolveNotification(item) {
    const resolve = get().notification?.resolve;
    set({ notification: null });
    resolve?.(item);
  },

  // ── withProgress ───────────────────────────────────────────────────────────
  startProgress(title) {
    set({ progress: { title, message: "" } });
  },
  reportProgress(message) {
    set((s) => ({ progress: s.progress ? { ...s.progress, message } : null }));
  },
  endProgress() {
    set({ progress: null });
  },
}));
