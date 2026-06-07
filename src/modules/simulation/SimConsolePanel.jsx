import { useState } from "react";
import { useTabStore } from "../../shared/stores/tabStore.js";
import { useCircuitStore } from "../../shared/stores/circuitStore.js";

// Shows the compiler trace + LLM metadata for the active circuit tab.
export default function SimConsolePanel() {
  const activeTab = useTabStore((s) => s.activeTab());
  const byTab = useCircuitStore((s) => s.byTab);
  const session = activeTab ? byTab[activeTab.id] : null;
  const result = session?.result;
  const trace = result?.trace || [];
  const [showRaw, setShowRaw] = useState(false);

  if (!session) return <div className="panel-empty">No active circuit.</div>;
  if (session.loading) return <div className="panel-empty">Compiling…</div>;
  if (trace.length === 0 && !result) return <div className="panel-empty">No trace — compile to populate.</div>;

  const usedLlm = result?.compiler_used && result.compiler_used !== "rule_based";

  return (
    <div className="sim-console">
      {/* LLM metadata banner */}
      {result?.compiler_used && (
        <div className={`console-meta${usedLlm ? " llm" : ""}`}>
          {result.compiler_used === "llm" && (
            <>
              <span className="meta-badge llm">LLM</span>
              <span>{result.llm_provider} / {result.llm_model}</span>
              {result.llm_tokens && (
                <span>{result.llm_tokens.input}↑ {result.llm_tokens.output}↓ tokens</span>
              )}
              {result.llm_latency_ms != null && (
                <span>{result.llm_latency_ms} ms</span>
              )}
            </>
          )}
          {result.compiler_used === "llm_fallback" && (
            <>
              <span className="meta-badge fallback">LLM→Rules</span>
              <span>{result.llm_provider} failed — rule-based used</span>
            </>
          )}
          {result.compiler_used === "rule_based" && (
            <span className="meta-badge rules">Rule-based</span>
          )}
          {result.llm_raw_response && (
            <button
              className="btn micro"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? "Hide" : "View"} Raw LLM Response
            </button>
          )}
        </div>
      )}

      {/* Raw LLM response (collapsible) */}
      {showRaw && result?.llm_raw_response && (
        <pre className="console-raw">{result.llm_raw_response}</pre>
      )}

      {/* Compiler trace lines */}
      {trace.map((line, i) => (
        <div key={i} className="console-line">
          <span className="console-gutter">{String(i + 1).padStart(2, "0")}</span>
          {line}
        </div>
      ))}
    </div>
  );
}
