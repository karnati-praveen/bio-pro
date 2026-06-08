import { create } from "zustand";

export const useGitStore = create((set, get) => ({
  // current repo status
  branch: null,
  staged: [],
  unstaged: [],
  untracked: [],
  remotes: [],
  ahead: 0,
  behind: 0,

  // ui state
  commitMessage: "",
  loading: false,
  error: null,
  lastOutput: null,

  // history panel
  fileHistory: [],       // commits for the currently focused file
  historyFile: null,

  // diff panel
  diffResult: null,
  diffFile: null,

  setStatus: (status) => set({
    branch: status.branch,
    staged: status.staged ?? [],
    unstaged: status.unstaged ?? [],
    untracked: status.untracked ?? [],
    remotes: status.remotes ?? [],
    ahead: status.ahead ?? 0,
    behind: status.behind ?? 0,
  }),

  setCommitMessage: (msg) => set({ commitMessage: msg }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  setLastOutput: (o) => set({ lastOutput: o }),
  setDiff: (file, result) => set({ diffFile: file, diffResult: result }),
  setFileHistory: (file, commits) => set({ historyFile: file, fileHistory: commits }),
}));
