import { useState, useCallback } from "react";
import { codonOptimize } from "../../shared/lib/api/client.js";
import { useTabStore } from "../../shared/stores/tabStore.js";
import { useUiStore } from "../../shared/stores/uiStore.js";

// ── Constants ────────────────────────────────────────────────── //
const HOSTS = [
  { value: "ecoli",  label: "E. coli K-12" },
  { value: "yeast",  label: "S. cerevisiae" },
  { value: "human",  label: "H. sapiens" },
];

const ENZYME_GROUPS = [
  { label: "Common cloning", enzymes: ["EcoRI", "BamHI", "HindIII", "NheI", "XhoI", "NotI"] },
  { label: "BioBrick",       enzymes: ["EcoRI", "XbaI", "SpeI", "PstI"] },
  { label: "Golden Gate",    enzymes: ["BsaI"] },
  { label: "Other",          enzymes: ["KpnI", "SacI", "SmaI", "NcoI", "NdeI", "BglII", "SalI"] },
];

const ALL_ENZYMES = [...new Set(ENZYME_GROUPS.flatMap((g) => g.enzymes))];

// ── Helpers ──────────────────────────────────────────────────── //
function wColor(w) {
  // green (high w) → yellow → red (low w)
  if (w >= 0.8)  return "var(--success)";
  if (w >= 0.5)  return "var(--warning)";
  return "var(--error)";
}

function wBg(w) {
  if (w >= 0.8)  return "var(--success-bg)";
  if (w >= 0.5)  return "var(--warning-bg)";
  return "var(--error-bg)";
}

function CaiBar({ label, value, dim = false }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div className={`codon-cai-row${dim ? " codon-cai-dim" : ""}`}>
      <span className="codon-cai-label">{label}</span>
      <div className="codon-cai-track">
        <div className="codon-cai-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="codon-cai-value">{value != null ? value.toFixed(3) : "—"}</span>
    </div>
  );
}

function CodonHeatmap({ heatmap }) {
  if (!heatmap?.length) return null;
  return (
    <div className="codon-heatmap">
      {heatmap.map((cell, i) => (
        <span
          key={i}
          className="codon-heatmap-cell"
          title={`${cell.amino_acid} · ${cell.codon} · w=${cell.w.toFixed(2)}`}
          style={{ background: wBg(cell.w), color: wColor(cell.w) }}
        >
          {cell.codon}
        </span>
      ))}
    </div>
  );
}

function CodonDiff({ changes }) {
  if (!changes?.length) return (
    <div className="codon-diff-empty">No codon changes — sequence already optimal for this host.</div>
  );
  return (
    <div className="codon-diff">
      <div className="codon-diff-header">
        <span>#</span><span>AA</span><span>Original</span><span>→</span><span>Optimized</span>
      </div>
      {changes.map((c, i) => (
        <div key={i} className="codon-diff-row">
          <span className="codon-diff-pos">{c.position + 1}</span>
          <span className="codon-diff-aa">{c.amino_acid}</span>
          <span className="codon-diff-orig">{c.original_codon}</span>
          <span className="codon-diff-arrow">→</span>
          <span className="codon-diff-new">{c.new_codon}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────── //
export default function CodonOptimizer() {
  const [sequence, setSequence] = useState("");
  const [host, setHost] = useState("ecoli");
  const [avoidEnzymes, setAvoidEnzymes] = useState(new Set(["EcoRI", "BamHI", "HindIII"]));
  const [runAvoidSites, setRunAvoidSites] = useState(true);
  const [gcEnabled, setGcEnabled] = useState(false);
  const [gcTarget, setGcTarget] = useState(0.50);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addToast = useUiStore((s) => s.addToast);
  const openTab  = useTabStore((s) => s.openTab);

  const toggleEnzyme = useCallback((name) => {
    setAvoidEnzymes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const selectAll   = () => setAvoidEnzymes(new Set(ALL_ENZYMES));
  const clearAll    = () => setAvoidEnzymes(new Set());

  const run = async () => {
    const seq = sequence.trim();
    if (!seq) { setError("Paste a protein or CDS sequence first."); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await codonOptimize({
        sequence: seq,
        host,
        avoid_enzymes: runAvoidSites ? [...avoidEnzymes] : [],
        run_avoid_sites: runAvoidSites,
        gc_target: gcEnabled ? gcTarget : null,
      });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copySeq = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.optimized_seq).catch(() => {});
    addToast("Optimized sequence copied", "success");
  };

  const sendToEditor = () => {
    if (!result) return;
    openTab({ type: "sequence", title: `optimized_${host}.fasta`,
              content: `>optimized_${host}\n${result.optimized_seq}` });
    addToast("Opened in sequence editor", "success");
  };

  const seqLen = result?.optimized_seq?.length ?? 0;

  return (
    <div className="codon-editor">
      {/* ── Left: form pane ─────────────────────────────────── */}
      <div className="codon-form-pane">
        <div className="codon-form-title">Codon Optimizer</div>

        <label className="codon-label">Input sequence</label>
        <textarea
          className="codon-seq-input bio-textarea"
          rows={7}
          placeholder={"Protein (amino acids) or CDS (DNA)\nExamples:\n  MSKGEELFTG…  (protein)\n  ATGAGCAAAG…  (CDS)"}
          value={sequence}
          onChange={(e) => setSequence(e.target.value)}
          spellCheck={false}
        />

        <label className="codon-label">Target host</label>
        <div className="codon-host-group">
          {HOSTS.map((h) => (
            <label key={h.value} className={`codon-host-option${host === h.value ? " selected" : ""}`}>
              <input type="radio" name="host" value={h.value}
                checked={host === h.value} onChange={() => setHost(h.value)} />
              {h.label}
            </label>
          ))}
        </div>

        <div className="codon-section-header">
          <label className="codon-label" style={{ margin: 0 }}>Restriction sites to avoid</label>
          <label className="codon-toggle-label">
            <input type="checkbox" checked={runAvoidSites}
              onChange={(e) => setRunAvoidSites(e.target.checked)} />
            Enabled
          </label>
        </div>
        {runAvoidSites && (
          <>
            <div className="codon-enzyme-actions">
              <button className="bio-btn xs" onClick={selectAll}>All</button>
              <button className="bio-btn xs" onClick={clearAll}>None</button>
            </div>
            {ENZYME_GROUPS.map((g) => (
              <div key={g.label} className="codon-enzyme-group">
                <span className="codon-enzyme-group-label">{g.label}</span>
                <div className="codon-enzyme-chips">
                  {g.enzymes.map((name) => (
                    <label key={name}
                      className={`codon-enzyme-chip${avoidEnzymes.has(name) ? " active" : ""}`}>
                      <input type="checkbox" checked={avoidEnzymes.has(name)}
                        onChange={() => toggleEnzyme(name)} />
                      {name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <div className="codon-section-header" style={{ marginTop: 12 }}>
          <label className="codon-label" style={{ margin: 0 }}>GC window balancing</label>
          <label className="codon-toggle-label">
            <input type="checkbox" checked={gcEnabled}
              onChange={(e) => setGcEnabled(e.target.checked)} />
            Enabled
          </label>
        </div>
        {gcEnabled && (
          <div className="codon-gc-row">
            <span className="codon-gc-pct">30%</span>
            <input type="range" min={0.30} max={0.70} step={0.01}
              value={gcTarget}
              onChange={(e) => setGcTarget(Number(e.target.value))}
              className="codon-gc-slider"
            />
            <span className="codon-gc-pct">70%</span>
            <span className="codon-gc-value">{Math.round(gcTarget * 100)}%</span>
          </div>
        )}

        <button className="bio-btn primary" disabled={loading} onClick={run}
          style={{ marginTop: 14, width: "100%" }}>
          {loading ? "Optimizing…" : "Optimize ▶"}
        </button>
        {error && <div className="codon-error">{error}</div>}

        <div className="codon-hint">
          CAI (Codon Adaptation Index) measures how well a sequence uses the
          host's preferred codons. 1.0 = fully adapted.
        </div>
      </div>

      {/* ── Right: results pane ─────────────────────────────── */}
      <div className="codon-results-pane">
        {!result && !loading && (
          <div className="codon-empty">
            Optimize a sequence to see results here.
          </div>
        )}

        {result && (
          <>
            {/* CAI comparison */}
            <div className="codon-card">
              <div className="codon-card-title">Codon Adaptation Index</div>
              <CaiBar label="Before" value={result.cai_before} dim={result.cai_before === 0} />
              <CaiBar label="After"  value={result.cai_after} />
              <div className="codon-stats-row">
                <span className="codon-stat">
                  <span className="codon-stat-label">Changes</span>
                  <span className="codon-stat-value">{result.changes?.length ?? 0}</span>
                </span>
                <span className="codon-stat">
                  <span className="codon-stat-label">Removed sites</span>
                  <span className="codon-stat-value">{result.removed_sites?.length ?? 0}</span>
                </span>
                <span className="codon-stat">
                  <span className="codon-stat-label">Length</span>
                  <span className="codon-stat-value">{seqLen} nt</span>
                </span>
              </div>
              {result.removed_sites?.length > 0 && (
                <div className="codon-removed-sites">
                  {result.removed_sites.map((s) => (
                    <span key={s} className="bio-badge">{s}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Codon heatmap */}
            <div className="codon-card">
              <div className="codon-card-title">
                Codon heatmap
                <span className="codon-card-subtitle"> — green = well-adapted, red = rare</span>
              </div>
              <CodonHeatmap heatmap={result.codon_heatmap} />
            </div>

            {/* Diff */}
            <div className="codon-card">
              <div className="codon-card-title">Changed codons</div>
              <CodonDiff changes={result.changes} />
            </div>

            {/* Output sequence */}
            <div className="codon-card">
              <div className="codon-card-title-row">
                <span className="codon-card-title">Optimized sequence</span>
                <div className="codon-output-actions">
                  <button className="bio-btn xs" onClick={copySeq}>Copy</button>
                  <button className="bio-btn xs primary" onClick={sendToEditor}>
                    Open in sequence editor
                  </button>
                </div>
              </div>
              <div className="codon-output-seq">{result.optimized_seq}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
