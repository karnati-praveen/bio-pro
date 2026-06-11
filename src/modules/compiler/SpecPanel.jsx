// Shows the parsed spec, design-rule findings (with Feature 6 failure warnings),
// the compiler trace as a readable "how this was built" walkthrough,
// and literature citations (Feature 8).

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

const PATTERN_DESCRIPTIONS = {
  inducible_expression: "Reporter turns ON when the inducer is applied",
  repressible_expression: "Reporter turns OFF when the inducer is applied",
  constitutive_expression: "Reporter is always active — no external trigger required",
  logic_and: "Reporter activates only when BOTH inputs are simultaneously present",
  logic_or: "Reporter activates when EITHER (or both) inputs are present",
  not_gate: "Inverts the input: high inducer → low reporter output",
  toggle_switch: "Bistable memory: once flipped, holds state until switched again",
  negative_feedback: "Reduces noise and stabilises output by dampening its own production",
  positive_feedback: "Amplifies signal, creating a switch-like bistable response",
  feed_forward_loop: "Filters transient inputs; generates a pulse then settles to steady state",
  band_pass_filter: "Reporter is active only at intermediate inducer concentrations",
  oscillator: "Three mutually repressing genes form a ring that drives sustained oscillations",
};

// Map a raw compiler trace line to a plain-English sentence
function humanizeLine(raw) {
  const line = raw.trim();

  // --- Parser messages ---
  const freeText = line.match(/^parsing free text:\s*"(.+)"$/);
  if (freeText) return `Read your goal: "${freeText[1]}"`;
  if (line === "parsing structured form input") return "Built from structured form input";

  const hostMatch = line.match(/^host organism:\s*(.+)$/);
  if (hostMatch) {
    const org = hostMatch[1];
    return `Target host: ${HOST_LABELS[org] || org}`;
  }

  const matchedReporter = line.match(/^matched reporter '(.+)'$/);
  if (matchedReporter) return `Identified output reporter: ${matchedReporter[1]}`;

  const reporterFor = line.match(/^reporter(?:\s+for .+)?:\s*(.+)$/);
  if (reporterFor) return `Output reporter: ${reporterFor[1]}`;

  const outputReporterQuoted = line.match(/^output reporter '(.+)'$/);
  if (outputReporterQuoted) return `Confirmed output reporter: ${outputReporterQuoted[1]}`;

  const selectedPattern = line.match(/^selected pattern:\s*(.+)$/);
  if (selectedPattern) {
    const p = selectedPattern[1];
    const label = PATTERN_LABELS[p] || p;
    const desc = PATTERN_DESCRIPTIONS[p];
    return desc ? `Circuit pattern: ${label} — ${desc}` : `Circuit pattern: ${label}`;
  }

  const matchedInducer = line.match(/^matched inducer '(.+)' \((.+)\)$/);
  if (matchedInducer) return `Input signal: ${matchedInducer[1]} (active when ${matchedInducer[2]})`;

  const inducer = line.match(/^inducer '(.+)' \((.+)\)$/);
  if (inducer) return `Input signal: ${inducer[1]} (${inducer[2]})`;

  const inputsMatch = line.match(/^inputs:\s*(.+)$/);
  if (inputsMatch) return `Multiple inputs wired: ${inputsMatch[1]}`;

  const gateMatch = line.match(/^matched '(.+)' (AND|OR) '(.+)'$/);
  if (gateMatch) return `Two-input ${gateMatch[2]} gate: ${gateMatch[1]} and ${gateMatch[3]}`;

  if (line === "no inducer found; defaulting to constitutive_expression")
    return "No inducer detected — defaulting to constitutive expression";

  if (line.startsWith("[LLM fallback]")) return `Compiler note: ${line.replace("[LLM fallback] ", "")}`;

  // --- Assembler messages ---
  const assemblerReporter = line.match(/^output reporter:\s*(.+)$/);
  if (assemblerReporter) return `Placed reporter gene: ${assemblerReporter[1]}`;

  if (line.startsWith("repressilator:"))
    return "Ring topology: LacI, TetR, and cI each repress the next in a cycle, creating oscillations";

  if (line.includes("oscillates with the ring")) {
    const m = line.match(/reporter (.+) driven from/);
    return m
      ? `Reporter ${m[1]} is linked to pLac and oscillates with the repressilator ring`
      : "Reporter tracks the oscillation via pLac promoter";
  }

  if (line.includes("generates sustained oscillations"))
    return "The circuit generates sustained oscillations; period is governed by protein degradation rates";

  const drivesMatch = line.match(/^(.+) drives (.+) expression$/);
  if (drivesMatch) return `Promoter ${drivesMatch[1]} drives transcription of ${drivesMatch[2]}`;

  const constitutiveMatch = line.match(/^constitutive expression:\s*(.+)$/);
  if (constitutiveMatch) return `Constitutive wiring: ${constitutiveMatch[1]}`;

  const derepressMatch = line.match(/^(.+): (.+) represses (.+); .+ relieves repression$/);
  if (derepressMatch)
    return `Induction mechanism: ${derepressMatch[2]} represses ${derepressMatch[3]}; ${derepressMatch[1]} blocks the repressor, switching expression ON`;

  const activationMatch = line.match(/^(.+): (.+)-bound (.+) activates (.+)$/);
  if (activationMatch)
    return `Activation: ${activationMatch[1]}-bound ${activationMatch[3]} activates promoter ${activationMatch[4]}`;

  const negAutoReg = line.match(/negative autoregulation:\s*(.+)/);
  if (negAutoReg) return `Negative autoregulation: ${negAutoReg[1]}`;

  const posAutoReg = line.match(/positive autoregulation:\s*(.+)/);
  if (posAutoReg) return `Positive autoregulation: ${posAutoReg[1]}`;

  // Fallback: return the raw line as-is
  return line;
}

function BuildSteps({ trace }) {
  const lines = (trace || []).filter(l => l.trim());
  if (lines.length === 0) return <p className="muted">No trace available.</p>;
  return (
    <ol className="build-steps">
      {lines.map((line, i) => (
        <li key={i} className="build-step">
          <span className="build-step-num">{i + 1}</span>
          <span className="build-step-text">{humanizeLine(line)}</span>
        </li>
      ))}
    </ol>
  );
}

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
              {PATTERN_DESCRIPTIONS[spec.pattern] && (
                <div className="pattern-desc">{PATTERN_DESCRIPTIONS[spec.pattern]}</div>
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

      <h3>How this circuit was built</h3>
      <BuildSteps trace={trace} />

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
