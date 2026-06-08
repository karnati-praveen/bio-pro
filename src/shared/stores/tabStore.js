import { create } from "zustand";
import { iconForFile, editorTypeForFile } from "../lib/fileTypes.js";

let _seq = 1;
const nextId = () => `tab-${_seq++}`;

// Editor area model: one or two editor groups (Phase 1 supports a single
// horizontal split). Each group owns an ordered list of tab ids + its active tab.
// Tab payloads live in `tabsById` so a tab can be referenced from either group.
export const useTabStore = create((set, get) => ({
  tabsById: {},
  groups: [{ id: "group-0", tabIds: [], activeTabId: null }],
  activeGroupId: "group-0",

  activeTab: () => {
    const { groups, activeGroupId, tabsById } = get();
    const g = groups.find((x) => x.id === activeGroupId);
    return g?.activeTabId ? tabsById[g.activeTabId] : null;
  },

  // Open (or focus, if already open by filePath) a tab in the active group.
  openTab: ({ type, title, filePath = null, content = "", meta = {} }) => {
    const { tabsById, groups, activeGroupId } = get();
    if (filePath) {
      const existing = Object.values(tabsById).find((t) => t.filePath === filePath);
      if (existing) {
        get().setActiveTab(existing.id);
        return existing.id;
      }
    }
    const id = nextId();
    const resolvedType = type || editorTypeForFile(filePath);
    const tab = {
      id,
      type: resolvedType,
      title: title || filePath?.split(/[\\/]/).pop() || "Untitled",
      filePath,
      icon: iconForFile(filePath, resolvedType),
      content,
      dirty: false,
      pinned: false,
      meta,
    };
    set({
      tabsById: { ...tabsById, [id]: tab },
      groups: groups.map((g) =>
        g.id === activeGroupId
          ? { ...g, tabIds: [...g.tabIds, id], activeTabId: id }
          : g
      ),
    });
    return id;
  },

  setActiveTab: (id) => {
    const { groups, tabsById } = get();
    const owner = groups.find((g) => g.tabIds.includes(id));
    if (!owner) return;
    set({
      activeGroupId: owner.id,
      groups: groups.map((g) =>
        g.id === owner.id ? { ...g, activeTabId: id } : g
      ),
      tabsById,
    });
  },

  setActiveGroup: (groupId) => set({ activeGroupId: groupId }),

  closeTab: (id) => {
    const { groups, tabsById } = get();
    const newGroups = groups.map((g) => {
      if (!g.tabIds.includes(id)) return g;
      const tabIds = g.tabIds.filter((t) => t !== id);
      let activeTabId = g.activeTabId;
      if (activeTabId === id) {
        const idx = g.tabIds.indexOf(id);
        activeTabId = tabIds[Math.max(0, idx - 1)] ?? tabIds[0] ?? null;
      }
      return { ...g, tabIds, activeTabId };
    });
    const { [id]: _removed, ...rest } = tabsById;
    // Drop empty extra groups (never drop the first group).
    const pruned = newGroups.filter((g, i) => i === 0 || g.tabIds.length > 0);
    const activeGroupId = pruned.find((g) => g.id === get().activeGroupId)
      ? get().activeGroupId
      : pruned[0].id;
    set({ groups: pruned, tabsById: rest, activeGroupId });
  },

  markDirty: (id, dirty = true) => {
    const { tabsById } = get();
    if (!tabsById[id] || tabsById[id].dirty === dirty) return;
    set({ tabsById: { ...tabsById, [id]: { ...tabsById[id], dirty } } });
  },

  setContent: (id, content) => {
    const { tabsById } = get();
    if (!tabsById[id]) return;
    set({ tabsById: { ...tabsById, [id]: { ...tabsById[id], content } } });
  },

  pinTab: (id) => {
    const { tabsById } = get();
    if (!tabsById[id]) return;
    set({ tabsById: { ...tabsById, [id]: { ...tabsById[id], pinned: !tabsById[id].pinned } } });
  },

  // Reorder within a group (drag to reposition).
  moveTab: (groupId, fromIndex, toIndex) => {
    set((state) => ({
      groups: state.groups.map((g) => {
        if (g.id !== groupId) return g;
        const tabIds = [...g.tabIds];
        const [moved] = tabIds.splice(fromIndex, 1);
        tabIds.splice(toIndex, 0, moved);
        return { ...g, tabIds };
      }),
    }));
  },

  // Create the second group and move a tab into it (drag-to-split-right).
  splitRight: (tabId) => {
    const { groups } = get();
    if (groups.length > 1) {
      // already split: just move the tab there
      get().moveTabToGroup(tabId, groups[1].id);
      return;
    }
    const newGroup = { id: "group-1", tabIds: [tabId], activeTabId: tabId };
    set({
      groups: [
        { ...groups[0], tabIds: groups[0].tabIds.filter((t) => t !== tabId),
          activeTabId: groups[0].tabIds.filter((t) => t !== tabId).slice(-1)[0] ?? null },
        newGroup,
      ],
      activeGroupId: newGroup.id,
    });
  },

  moveTabToGroup: (tabId, groupId) => {
    set((state) => {
      const groups = state.groups.map((g) => ({
        ...g,
        tabIds: g.tabIds.filter((t) => t !== tabId),
      }));
      const target = groups.find((g) => g.id === groupId);
      if (target) {
        target.tabIds = [...target.tabIds, tabId];
        target.activeTabId = tabId;
      }
      groups.forEach((g) => {
        if (g.activeTabId === tabId && g.id !== groupId) {
          g.activeTabId = g.tabIds.slice(-1)[0] ?? null;
        }
      });
      const pruned = groups.filter((g, i) => i === 0 || g.tabIds.length > 0);
      const keptIds = new Set(pruned.flatMap((g) => g.tabIds));
      const tabsById = Object.fromEntries(
        Object.entries(state.tabsById).filter(([id]) => keptIds.has(id))
      );
      return { groups: pruned, tabsById, activeGroupId: groupId };
    });
  },
}));
