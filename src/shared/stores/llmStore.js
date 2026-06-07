/**
 * LLM configuration + usage tracking store.
 *
 * Settings are persisted to .bioidee/settings.json via Tauri fs, or
 * localStorage in the browser.  API keys NEVER leave the local machine.
 */
import { create } from "zustand";
import { isTauri } from "../lib/tauriFs.js";

// ---- Provider catalogs --------------------------------------------------- //
export const PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "openai",    label: "OpenAI (GPT)" },
  { id: "google",    label: "Google (Gemini)" },
  { id: "mistral",   label: "Mistral" },
  { id: "ollama",    label: "Ollama (local)" },
];

export const MODELS = {
  anthropic: [
    { id: "claude-sonnet-4-5",  label: "Claude Sonnet 4.5 (default)" },
    { id: "claude-opus-4-5",    label: "Claude Opus 4.5 (complex)" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fast)" },
  ],
  openai: [
    { id: "gpt-4o",  label: "GPT-4o (default)" },
    { id: "o3",      label: "o3 (complex)" },
    { id: "gpt-4o-mini", label: "GPT-4o mini (fast)" },
  ],
  google: [
    { id: "gemini-2.0-flash",   label: "Gemini 2.0 Flash (default)" },
    { id: "gemini-2.0-pro",     label: "Gemini 2.0 Pro (complex)" },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large (default)" },
    { id: "mistral-small-latest", label: "Mistral Small (fast)" },
  ],
  ollama: [
    { id: "llama3.2",   label: "Llama 3.2 (default)" },
    { id: "mistral",    label: "Mistral" },
    { id: "deepseek-r1", label: "DeepSeek R1" },
  ],
};

// Cost per million tokens in USD (approximate public pricing)
const COST_PER_M = {
  "claude-sonnet-4-5":  { input: 3.00,  output: 15.00 },
  "claude-opus-4-5":    { input: 15.00, output: 75.00 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
  "gpt-4o":             { input: 2.50,  output: 10.00 },
  "o3":                 { input: 10.00, output: 40.00 },
  "gpt-4o-mini":        { input: 0.15,  output: 0.60 },
  "gemini-2.0-flash":   { input: 0.075, output: 0.30 },
  "gemini-2.0-pro":     { input: 1.25,  output: 5.00 },
  "mistral-large-latest": { input: 2.00, output: 6.00 },
  "mistral-small-latest": { input: 0.20, output: 0.60 },
};

const SETTINGS_KEY = "bioidee_llm_settings";

const DEFAULT_SETTINGS = {
  llm: {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    temperature: 0.2,
    fallback_to_rules: true,
    enabled: false,   // false until a key is saved
  },
  api_keys: {
    anthropic: "",
    openai: "",
    google: "",
    mistral: "",
    ollama_url: "http://localhost:11434",
  },
  usage: {
    session_requests: 0,
    session_input_tokens: 0,
    session_output_tokens: 0,
    total_requests: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
  },
};

function loadFromStorage() {
  try {
    if (!isTauri) {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) { /* ignore */ }
  return null;
}

function saveToStorage(data) {
  try {
    if (!isTauri) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    }
    // In Tauri the project store handles .bioidee/settings.json; we keep
    // LLM settings in localStorage there too for simplicity, since the
    // project folder may not be open when Settings is first viewed.
  } catch (_) { /* ignore */ }
}

function estimateCost(model, inputTokens, outputTokens) {
  const rates = COST_PER_M[model];
  if (!rates) return 0;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

export const useLlmStore = create((set, get) => {
  const persisted = loadFromStorage();
  const initial = persisted
    ? {
        llm: { ...DEFAULT_SETTINGS.llm, ...persisted.llm },
        api_keys: { ...DEFAULT_SETTINGS.api_keys, ...persisted.api_keys },
        usage: { ...DEFAULT_SETTINGS.usage, ...persisted.usage },
      }
    : { ...DEFAULT_SETTINGS };

  // Reset session counters on every store creation (page load)
  initial.usage = {
    ...initial.usage,
    session_requests: 0,
    session_input_tokens: 0,
    session_output_tokens: 0,
  };

  return {
    ...initial,

    // ---- Setters ---------------------------------------------------------- //
    setProvider: (provider) => {
      const defaultModel = MODELS[provider]?.[0]?.id ?? "";
      set((s) => {
        const updated = {
          llm: { ...s.llm, provider, model: defaultModel },
        };
        saveToStorage({ llm: updated.llm, api_keys: s.api_keys, usage: s.usage });
        return updated;
      });
    },

    setModel: (model) => set((s) => {
      const updated = { llm: { ...s.llm, model } };
      saveToStorage({ llm: updated.llm, api_keys: s.api_keys, usage: s.usage });
      return updated;
    }),

    setTemperature: (temperature) => set((s) => {
      const updated = { llm: { ...s.llm, temperature } };
      saveToStorage({ llm: updated.llm, api_keys: s.api_keys, usage: s.usage });
      return updated;
    }),

    setFallback: (fallback_to_rules) => set((s) => {
      const updated = { llm: { ...s.llm, fallback_to_rules } };
      saveToStorage({ llm: updated.llm, api_keys: s.api_keys, usage: s.usage });
      return updated;
    }),

    setApiKey: (provider, key) => set((s) => {
      const api_keys = { ...s.api_keys, [provider]: key };
      // Enable LLM if key is non-empty and current provider matches
      const enabled = provider === s.llm.provider
        ? key.trim().length > 0
        : s.llm.enabled;
      const llm = { ...s.llm, enabled };
      saveToStorage({ llm, api_keys, usage: s.usage });
      return { api_keys, llm };
    }),

    setOllamaUrl: (url) => set((s) => {
      const api_keys = { ...s.api_keys, ollama_url: url };
      const llm = { ...s.llm, enabled: s.llm.provider === "ollama" ? true : s.llm.enabled };
      saveToStorage({ llm, api_keys, usage: s.usage });
      return { api_keys, llm };
    }),

    enableForProvider: (provider) => set((s) => {
      const llm = { ...s.llm, provider, enabled: true };
      saveToStorage({ llm, api_keys: s.api_keys, usage: s.usage });
      return { llm };
    }),

    // ---- Build the llm_config to include in compile requests -------------- //
    getLlmConfig: () => {
      const { llm, api_keys } = get();
      if (!llm.enabled) return null;
      const cfg = {
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      };
      if (llm.provider === "ollama") {
        cfg.ollama_url = api_keys.ollama_url || "http://localhost:11434";
      } else {
        cfg.api_key = api_keys[llm.provider] || "";
        if (!cfg.api_key) return null;   // key not set
      }
      return cfg;
    },

    // ---- Usage tracking --------------------------------------------------- //
    recordUsage: (model, inputTokens = 0, outputTokens = 0) => set((s) => {
      const usage = {
        session_requests: s.usage.session_requests + 1,
        session_input_tokens: s.usage.session_input_tokens + inputTokens,
        session_output_tokens: s.usage.session_output_tokens + outputTokens,
        total_requests: s.usage.total_requests + 1,
        total_input_tokens: s.usage.total_input_tokens + inputTokens,
        total_output_tokens: s.usage.total_output_tokens + outputTokens,
      };
      saveToStorage({ llm: s.llm, api_keys: s.api_keys, usage });
      return { usage };
    }),

    resetUsage: () => set((s) => {
      const usage = { ...DEFAULT_SETTINGS.usage };
      saveToStorage({ llm: s.llm, api_keys: s.api_keys, usage });
      return { usage };
    }),

    getSessionCost: () => {
      const { llm, usage } = get();
      return estimateCost(llm.model, usage.session_input_tokens, usage.session_output_tokens);
    },

    getTotalCost: () => {
      const { llm, usage } = get();
      return estimateCost(llm.model, usage.total_input_tokens, usage.total_output_tokens);
    },
  };
});
