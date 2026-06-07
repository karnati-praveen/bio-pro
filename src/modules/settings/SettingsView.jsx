import { useState } from "react";
import { useProjectStore } from "../../shared/stores/projectStore.js";
import { useUiStore } from "../../shared/stores/uiStore.js";
import { useLlmStore, PROVIDERS, MODELS } from "../../shared/stores/llmStore.js";
import { useExtensionStore } from "../../shared/stores/extensionStore.js";
import { testLlmConnection } from "../../shared/lib/api/client.js";

const ORGANISMS = [
  { value: "ecoli", label: "E. coli" },
  { value: "yeast", label: "S. cerevisiae" },
  { value: "mammalian", label: "Mammalian / HEK293" },
];

const SETTINGS_TABS = [
  { id: "appearance",  label: "Appearance" },
  { id: "biology",     label: "Biology" },
  { id: "ai",          label: "AI Compiler" },
  { id: "usage",       label: "Usage & Cost" },
  { id: "extensions",  label: "Extensions" },
];

// ---- Eye icon toggle ------------------------------------------------------- //
function KeyInput({ value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="key-input-row">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="key-input"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        className="eye-btn"
        type="button"
        title={visible ? "Hide key" : "Show key"}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? "🙈" : "👁"}
      </button>
    </div>
  );
}

// ---- Per-provider test button --------------------------------------------- //
function TestButton({ provider, model, apiKey, ollamaUrl }) {
  const [state, setState] = useState(null); // null | "testing" | {ok, latency_ms, error}

  async function run() {
    setState("testing");
    const cfg = {
      provider,
      model,
      temperature: 0.0,
      ...(provider === "ollama"
        ? { ollama_url: ollamaUrl || "http://localhost:11434" }
        : { api_key: apiKey }),
    };
    const result = await testLlmConnection(cfg);
    setState(result);
  }

  if (state === "testing") return <span className="test-badge testing">Testing…</span>;
  if (state && state.ok) return (
    <span className="test-badge ok">✓ {state.latency_ms} ms</span>
  );
  if (state && !state.ok) return (
    <span className="test-badge fail" title={state.error}>✗ Failed</span>
  );
  return (
    <button className="btn small" type="button" onClick={run}>
      Test Connection
    </button>
  );
}

// ---- Appearance section --------------------------------------------------- //
function AppearanceSection({ settings, updateSettings, theme, setTheme, colorBlind, toggleColorBlind }) {
  return (
    <section>
      <h4>Appearance</h4>
      <label className="setting-row">
        Theme
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label className="setting-row checkbox">
        <input type="checkbox" checked={colorBlind} onChange={toggleColorBlind} />
        Color-blind-accessible palette
      </label>
      <label className="setting-row">
        Font size
        <input
          type="number" min="10" max="20"
          value={settings.fontSize}
          onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
        />
      </label>
    </section>
  );
}

// ---- Biology section ------------------------------------------------------ //
function BiologySection({ settings, updateSettings }) {
  return (
    <section>
      <h4>Biology</h4>
      <label className="setting-row">
        Default host organism
        <select value={settings.defaultOrganism} onChange={(e) => updateSettings({ defaultOrganism: e.target.value })}>
          {ORGANISMS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="setting-row">
        Default simulation duration (min)
        <input
          type="number" min="10" max="1000"
          value={settings.defaultSimDuration}
          onChange={(e) => updateSettings({ defaultSimDuration: Number(e.target.value) })}
        />
      </label>
      <label className="setting-row">
        Preferred assembly
        <select value={settings.preferredAssembly} onChange={(e) => updateSettings({ preferredAssembly: e.target.value })}>
          <option value="gibson">Gibson</option>
          <option value="golden_gate">Golden Gate</option>
        </select>
      </label>
    </section>
  );
}

// ---- AI Compiler section -------------------------------------------------- //
function AISection() {
  const {
    llm, api_keys,
    setProvider, setModel, setTemperature, setFallback, setApiKey, setOllamaUrl,
  } = useLlmStore();

  const activeProvider = llm.provider;
  const activeModel = llm.model;
  const models = MODELS[activeProvider] || [];
  const isOllama = activeProvider === "ollama";

  return (
    <section>
      <h4>AI Compiler</h4>
      <p className="setting-hint">
        API keys are stored locally only — never sent to any BioIDE server.
        Keys travel only over localhost to the local backend.
      </p>

      <label className="setting-row">
        Active provider
        <select value={activeProvider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>

      <label className="setting-row">
        Model
        <select value={activeModel} onChange={(e) => setModel(e.target.value)}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>

      {isOllama ? (
        <label className="setting-row">
          Ollama URL
          <input
            type="text"
            value={api_keys.ollama_url}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className="key-input"
          />
        </label>
      ) : (
        <>
          {PROVIDERS.filter((p) => p.id !== "ollama").map((p) => (
            <div key={p.id} className="provider-key-row">
              <span className="provider-key-label">{p.label} key</span>
              <KeyInput
                value={api_keys[p.id] || ""}
                onChange={(v) => setApiKey(p.id, v)}
                placeholder={p.id === "anthropic" ? "sk-ant-..." : p.id === "openai" ? "sk-..." : p.id === "google" ? "AIza..." : "..."}
              />
              <TestButton
                provider={p.id}
                model={MODELS[p.id]?.[0]?.id || ""}
                apiKey={api_keys[p.id] || ""}
                ollamaUrl={api_keys.ollama_url}
              />
            </div>
          ))}
        </>
      )}

      {isOllama && (
        <div className="provider-key-row">
          <span className="provider-key-label" />
          <TestButton
            provider="ollama"
            model={activeModel}
            apiKey=""
            ollamaUrl={api_keys.ollama_url}
          />
        </div>
      )}

      <label className="setting-row">
        Temperature
        <div className="slider-row">
          <input
            type="range" min="0" max="1" step="0.05"
            value={llm.temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
          />
          <span className="slider-val">{llm.temperature.toFixed(2)}</span>
        </div>
      </label>

      <label className="setting-row checkbox">
        <input
          type="checkbox"
          checked={llm.fallback_to_rules}
          onChange={(e) => setFallback(e.target.checked)}
        />
        Fallback to rule-based compiler if LLM fails
      </label>
    </section>
  );
}

// ---- Usage & Cost section ------------------------------------------------- //
function UsageSection() {
  const { usage, llm, resetUsage, getSessionCost, getTotalCost } = useLlmStore();
  const sessionCost = getSessionCost();
  const totalCost = getTotalCost();

  return (
    <section>
      <h4>Usage &amp; Cost Estimate</h4>
      <p className="setting-hint">
        Based on public pricing. Actual charges may differ. Ollama is free.
      </p>
      <table className="usage-table">
        <thead>
          <tr>
            <th />
            <th>Requests</th>
            <th>Input tokens</th>
            <th>Output tokens</th>
            <th>Est. cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>This session</td>
            <td>{usage.session_requests}</td>
            <td>{usage.session_input_tokens.toLocaleString()}</td>
            <td>{usage.session_output_tokens.toLocaleString()}</td>
            <td>${sessionCost.toFixed(4)}</td>
          </tr>
          <tr>
            <td>All time</td>
            <td>{usage.total_requests}</td>
            <td>{usage.total_input_tokens.toLocaleString()}</td>
            <td>{usage.total_output_tokens.toLocaleString()}</td>
            <td>${totalCost.toFixed(4)}</td>
          </tr>
        </tbody>
      </table>
      <button className="btn small danger" onClick={resetUsage}>Reset usage stats</button>
    </section>
  );
}

// ---- Extensions section -------------------------------------------------- //
function ExtensionsSection() {
  const extensions = useExtensionStore((s) => s.extensions);

  if (extensions.length === 0) {
    return (
      <section>
        <h4>Installed Extensions</h4>
        <p className="setting-hint">
          No extensions loaded. Drag a <code>.vsix</code> file onto the Extension Manager to install one.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h4>Installed Extensions</h4>
      <p className="setting-hint">
        {extensions.length} extension{extensions.length !== 1 ? "s" : ""} loaded. Extensions are reloaded automatically on next startup.
      </p>
      <ul className="ext-list">
        {extensions.map((ext) => {
          const m = ext.manifest ?? {};
          const contributes = m.contributes ?? {};
          const configProps = contributes.configuration?.properties ?? {};
          const configKeys = Object.keys(configProps);
          return (
            <li key={ext.id} className="ext-item">
              <div className="ext-item-header">
                <span className="ext-item-name">{m.displayName ?? m.name ?? ext.id}</span>
                <span className="ext-item-version">v{m.version ?? "?"}</span>
              </div>
              {m.description && <div className="ext-item-desc">{m.description}</div>}
              <div className="ext-item-id">{ext.id}</div>
              {configKeys.length > 0 && (
                <details className="ext-config-details">
                  <summary>{configKeys.length} configuration option{configKeys.length !== 1 ? "s" : ""}</summary>
                  <ul className="ext-config-list">
                    {configKeys.map((key) => {
                      const prop = configProps[key];
                      return (
                        <li key={key} className="ext-config-item">
                          <span className="ext-config-key">{key}</span>
                          {prop.description && <span className="ext-config-desc">{prop.description}</span>}
                          {prop.default !== undefined && (
                            <span className="ext-config-default">default: {JSON.stringify(prop.default)}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- Root ----------------------------------------------------------------- //
export default function SettingsView() {
  const { settings, updateSettings } = useProjectStore();
  const { theme, setTheme, colorBlind, toggleColorBlind } = useUiStore();
  const [tab, setTab] = useState("appearance");

  return (
    <div className="settings-view">
      <div className="settings-tabs">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            className={`settings-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "appearance" && (
        <AppearanceSection
          settings={settings} updateSettings={updateSettings}
          theme={theme} setTheme={setTheme}
          colorBlind={colorBlind} toggleColorBlind={toggleColorBlind}
        />
      )}
      {tab === "biology" && <BiologySection settings={settings} updateSettings={updateSettings} />}
      {tab === "ai" && <AISection />}
      {tab === "usage" && <UsageSection />}
      {tab === "extensions" && <ExtensionsSection />}
    </div>
  );
}
