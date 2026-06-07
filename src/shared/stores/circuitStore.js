import { create } from "zustand";
import { compile as apiCompile, stochasticSimulate } from "../lib/api/client.js";
import { useLlmStore } from "./llmStore.js";

// Per-tab circuit + simulation session state. Each .biopro tab owns one entry.
// Holds the DSL text, target organism, the last compile response (which itself
// contains spec/circuit/validation/simulation/citations), transient stochastic
// results, validation findings, and a bounded undo/redo stack of DSL snapshots.
const HISTORY_LIMIT = 50;

function blank() {
  return {
    dsl: "",
    organism: "",
    request: null,
    result: null,        // CompileResponse
    stochastic: null,
    findings: [],
    loading: false,
    stochLoading: false,
    error: null,
    history: [],         // past dsl snapshots
    future: [],          // redo stack
  };
}

export const useCircuitStore = create((set, get) => ({
  byTab: {},

  get: (tabId) => get().byTab[tabId] ?? blank(),

  ensure: (tabId, initialDsl = "") => {
    const { byTab } = get();
    if (byTab[tabId]) return;
    set({ byTab: { ...byTab, [tabId]: { ...blank(), dsl: initialDsl } } });
  },

  _patch: (tabId, patch) => {
    const { byTab } = get();
    const cur = byTab[tabId] ?? blank();
    set({ byTab: { ...byTab, [tabId]: { ...cur, ...patch } } });
  },

  setDsl: (tabId, dsl, { pushHistory = false } = {}) => {
    const cur = get().byTab[tabId] ?? blank();
    const patch = { dsl, future: [] };
    if (pushHistory && cur.dsl !== dsl) {
      patch.history = [...cur.history, cur.dsl].slice(-HISTORY_LIMIT);
    }
    get()._patch(tabId, patch);
  },

  setOrganism: (tabId, organism) => get()._patch(tabId, { organism }),

  applyFindings: (tabId, findings) => get()._patch(tabId, { findings: findings || [] }),

  compile: async (tabId, payload) => {
    const cur = get().byTab[tabId] ?? blank();
    const org = cur.organism || undefined;
    // Attach llm_config from the LLM store when a key is configured
    const llmConfig = useLlmStore.getState().getLlmConfig();
    const request = payload ?? {
      text: cur.dsl,
      organism: org,
      ...(llmConfig ? { llm_config: llmConfig } : {}),
    };
    get()._patch(tabId, { loading: true, error: null, stochastic: null });
    try {
      const result = await apiCompile(request);
      // Track usage if LLM was used
      if (result.llm_tokens && result.compiler_used !== "rule_based") {
        useLlmStore.getState().recordUsage(
          result.llm_model || llmConfig?.model || "",
          result.llm_tokens.input ?? 0,
          result.llm_tokens.output ?? 0,
        );
      }
      get()._patch(tabId, {
        result,
        request,
        findings: result.validation?.findings ?? [],
        loading: false,
      });
      return result;
    } catch (e) {
      get()._patch(tabId, { loading: false, error: e.message, result: null });
      throw e;
    }
  },

  runStochastic: async (tabId, threshold = null) => {
    const cur = get().byTab[tabId];
    if (!cur?.result) return;
    get()._patch(tabId, { stochLoading: true });
    try {
      const data = await stochasticSimulate(cur.result, 50, threshold);
      get()._patch(tabId, { stochastic: data, stochLoading: false });
    } catch (e) {
      get()._patch(tabId, { stochLoading: false, error: e.message });
    }
  },

  loadResult: (tabId, result, request) =>
    get()._patch(tabId, {
      result,
      request,
      findings: result.validation?.findings ?? [],
      stochastic: null,
      error: null,
    }),

  undo: (tabId) => {
    const cur = get().byTab[tabId];
    if (!cur || cur.history.length === 0) return null;
    const prev = cur.history[cur.history.length - 1];
    get()._patch(tabId, {
      dsl: prev,
      history: cur.history.slice(0, -1),
      future: [cur.dsl, ...cur.future].slice(0, HISTORY_LIMIT),
    });
    return prev;
  },

  redo: (tabId) => {
    const cur = get().byTab[tabId];
    if (!cur || cur.future.length === 0) return null;
    const next = cur.future[0];
    get()._patch(tabId, {
      dsl: next,
      history: [...cur.history, cur.dsl].slice(-HISTORY_LIMIT),
      future: cur.future.slice(1),
    });
    return next;
  },

  dispose: (tabId) => {
    const { [tabId]: _gone, ...rest } = get().byTab;
    set({ byTab: rest });
  },
}));
