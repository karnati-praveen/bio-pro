import { create } from "zustand";
import {
  listProjects, createBioProject, getBioProject,
} from "../lib/api/client.js";

const STORAGE_KEY = "bio-active-project-id";

function loadStoredId() {
  try { return parseInt(localStorage.getItem(STORAGE_KEY)) || null; }
  catch { return null; }
}

// Zustand store for the "active BioIDE project" — the DB-backed Project record
// that groups designs, simulations, experiments, and orders together.
// This is distinct from projectStore (which manages the filesystem folder).
export const useBioProjectStore = create((set, get) => ({
  activeProjectId: loadStoredId(),
  activeProject: null,
  projects: [],

  fetchProjects: async () => {
    try {
      const projects = await listProjects();
      const { activeProjectId } = get();
      const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
      set({ projects, activeProject });
    } catch {
      set({ projects: [] });
    }
  },

  setActiveProject: (project) => {
    const id = project?.id ?? null;
    try { localStorage.setItem(STORAGE_KEY, id ?? ""); } catch {}
    set({ activeProjectId: id, activeProject: project ?? null });
  },

  createAndActivate: async (name, description = "") => {
    const project = await createBioProject(name, description);
    await get().fetchProjects();
    get().setActiveProject(project);
    return project;
  },

  refreshActive: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      const p = await getBioProject(activeProjectId);
      set({ activeProject: p });
    } catch {}
  },
}));
