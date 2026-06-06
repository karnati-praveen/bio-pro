// Shows the parsed spec, design-rule findings (with Feature 6 failure warnings),
// the compiler trace, and literature citations (Feature 8).

const SEVERITY_ICON = { error: "⛔", warning: "⚠️", info: "ℹ️" };
const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

function sortedFindings(findings) {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}

const HOST_LABELS = {
  ecoli: "E. coli",
  yeast: "S. cerevisiae",
  mammalian: "Mammalian / HEK293",
};

const PATTERN_LABELS = {
  inducible_expression: "Inducible expression",
  repressible_expression: "Repressible expression",
  constitutive_expression: "Constitutive expression",
  logic_and: "AND gate",
  logic_or: "OR gate",
  not_gate: "NOT gate",
  toggle_switch: "Toggle switch",
  negative_feedback: "Negative feedback",
  positive_feedback: "Positive feedback",
  feed_forward_loop: "Feed-forward loop",
  band_pass_filter: "Band-pass filter",
  oscillator: "Oscillator (repressilator)",
};

export default function SpecPanel({ spec, validation, trace, citations }) {
  if (!spec) return null;

  const triggers = spec.triggers || [];
  const findings = validation?.findings || [];
  const sorted = sortedFindings(findings);
  const errors = sorted.filter(f => f.severity === "error");
  const warnings = sorted.filter(f => f.severity === "warning");
  const infos = sorted.filter(f => f.severity === "info");

  return (
    <div className="spec-panel">
      <h3>Formal specification</h3>
      <table className="spec-table">
        <tbody>
          <tr>
            <td>output</td>
            <td><code>{spec.output}</code></td>
          </tr>
          <tr>
            <td>pattern</td>
            <td>
              <code>{spec.pattern}</code>
              {PATTERN_LABELS[spec.pattern] && (
                <span className="muted"> — {PATTERN_LABELS[spec.pattern]}</span>
              )}
            </td>
          </tr>
          {spec.organism && (
            <tr>
              <td>host</td>
              <td><code>{HOST_LABELS[spec.organism] || spec.organism}</code></td>
            </tr>
          )}
          {triggers.map((t, i) => (
            <tr key={i}>
              <td>{triggers.length > 1 ? `input ${i + 1}` : "inducer"}</td>
              <td>
                <code>{t.inducer}</code>{" "}
                <span className="muted">({t.presence})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {validation && (
        <>
          <h3>
            Design-rule checks{" "}
            <span className={validation.ok ? "drc-ok" : "drc-fail"}>
              {validation.ok ? "passed" : "errors"}
            </span>
          </h3>
          {findings.length === 0 ? (
            <p className="muted">No issues found.</p>
          ) : (
            <ul className="drc-list">
              {errors.length > 0 && (
                <>
                  <li className="drc-section-label">Errors (block export)</li>
                  {errors.map((f, i) => (
                    <li key={`e${i}`} className="drc-error">
                      <span className="drc-icon">{SEVERITY_ICON.error}</span>
                      <span>{f.message}</span>
                      {f.target && <span className="drc-target"> [{f.target}]</span>}
                    </li>
                  ))}
                </>
              )}
              {warnings.length > 0 && (
                <>
                  <li className="drc-section-label">Warnings</li>
                  {warnings.map((f, i) => (
                    <li key={`w${i}`} className="drc-warning">
                      <span className="drc-icon">{SEVERITY_ICON.warning}</span>
                      <span>{f.message}</span>
                      {f.target && <span className="drc-target"> [{f.target}]</span>}
                    </li>
                  ))}
                </>
              )}
              {infos.length > 0 && (
                <>
                  <li className="drc-section-label">Info</li>
                  {infos.map((f, i) => (
                    <li key={`i${i}`} className="drc-info">
                      <span className="drc-icon">{SEVERITY_ICON.info}</span>
                      <span>{f.message}</span>
                    </li>
                  ))}
                </>
              )}
            </ul>
          )}
        </>
      )}

      <h3>Compiler trace</h3>
      <ol className="trace-list">
        {(trace || []).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>

      {citations && citations.length > 0 && (
        <>
          <h3>Literature citations</h3>
          <ul className="citations-list">
            {citations.map((c, i) => (
              <li key={i} className="citation-item">
                {c.authors && <span className="citation-authors">{c.authors}. </span>}
                {c.year && <span className="citation-year">({c.year}). </span>}
                {c.title && <span className="citation-title">{c.title}. </span>}
                {c.journal && <span className="citation-journal">{c.journal}. </span>}
                {c.url && (
                  <a href={c.url} target="_blank" rel="noreferrer" className="citation-doi">
                    {c.doi}
                  </a>
                )}
                {c.context && (
                  <span className="citation-context"> — used for: {c.context}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
