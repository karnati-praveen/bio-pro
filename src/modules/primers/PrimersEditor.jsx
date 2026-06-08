import { useState } from "react";
import { designPrimers } from "../../shared/lib/api/client.js";
import { useUiStore } from "../../shared/stores/uiStore.js";

const DEFAULTS = {
  sequence: "",
  target_tm: 60.0,
  min_len: 18,
  max_len: 25,
  primer_nM: 500,
  na_mM: 50,
};

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function PrimerCard({ primer, onCopy }) {
  const hasWarnings = primer.warnings?.length > 0;
  return (
    <div className={`primer-card${hasWarnings ? " primer-card-warn" : ""}`}>
      <div className="primer-card-header">
        <span className="primer-card-name">{primer.name}</span>
        <span className="primer-card-purpose">{primer.purpose}</span>
        <button className="btn micro primer-copy-btn" onClick={() => onCopy(primer.sequence)}>
          Copy
        </button>
      </div>

      <div className="primer-seq">{primer.sequence}</div>

      <div className="primer-stats">
        <span className="primer-stat">
          <span className="primer-stat-label">Length</span>
          <span className="primer-stat-value">{primer.length} nt</span>
        </span>
        <span className="primer-stat">
          <span className="primer-stat-label">Tm</span>
          <span className="primer-stat-value">{primer.tm} °C</span>
        </span>
        <span className="primer-stat">
          <span className="primer-stat-label">GC%</span>
          <span className="primer-stat-value">{primer.gc}%</span>
        </span>
        <span className="primer-stat">
          <span className="primer-stat-label">GC clamp</span>
          <span className="primer-stat-value">{primer.gc_clamp ? "Yes" : "No"}</span>
        </span>
        <span className="primer-stat">
          <span className="primer-stat-label">Self-comp</span>
          <span className="primer-stat-value">{primer.self_complementarity}</span>
        </span>
        <span className="primer-stat">
          <span className="primer-stat-label">Amplicon</span>
          <span className="primer-stat-value">{primer.amplicon_size} bp</span>
        </span>
      </div>

      {hasWarnings && (
        <div className="primer-warnings">
          {primer.warnings.map((w, i) => (
            <span key={i} className="primer-warning-tag">{w}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PrimersEditor() {
  const [form, setForm] = useState(DEFAULTS);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const addToast = useUiStore((s) => s.addToast);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const run = async () => {
    const seq = form.sequence.replace(/\s/g, "").toUpperCase();
    if (!seq) { setError("Paste a DNA sequence first."); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await designPrimers(seq, {
        target_tm: Number(form.target_tm),
        min_len: Number(form.min_len),
        max_len: Number(form.max_len),
        primer_nM: Number(form.primer_nM),
        na_mM: Number(form.na_mM),
      });
      setResult(data.primers);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyBoth = () => {
    if (!result) return;
    const text = result.map((p) => `>${p.name}\n${p.sequence}`).join("\n");
    copyText(text);
    addToast("Both primers copied as FASTA", "success");
  };

  return (
    <div className="primers-editor">
      <div className="primers-form-pane">
        <div className="primers-form-title">Primer Design</div>

        <label className="primers-label">Target sequence (5′→3′)</label>
        <textarea
          className="primers-seq-input"
          rows={6}
          placeholder="Paste your DNA template sequence here…"
          value={form.sequence}
          onChange={(e) => set("sequence", e.target.value)}
          spellCheck={false}
        />

        <div className="primers-params-grid">
          <label className="primers-label">
            Target Tm (°C)
            <input type="number" step="0.5" min="45" max="75"
              value={form.target_tm} onChange={(e) => set("target_tm", e.target.value)} />
          </label>
          <label className="primers-label">
            Min length
            <input type="number" step="1" min="10" max="40"
              value={form.min_len} onChange={(e) => set("min_len", e.target.value)} />
          </label>
          <label className="primers-label">
            Max length
            <input type="number" step="1" min="10" max="40"
              value={form.max_len} onChange={(e) => set("max_len", e.target.value)} />
          </label>
          <label className="primers-label">
            [Primer] (nM)
            <input type="number" step="50" min="50" max="2000"
              value={form.primer_nM} onChange={(e) => set("primer_nM", e.target.value)} />
          </label>
          <label className="primers-label">
            [Na⁺] (mM)
            <input type="number" step="5" min="10" max="500"
              value={form.na_mM} onChange={(e) => set("na_mM", e.target.value)} />
          </label>
        </div>

        <button className="btn primary" disabled={loading} onClick={run} style={{ marginTop: 8 }}>
          {loading ? "Designing…" : "Design Primers ▶"}
        </button>
        {error && <div className="dsl-error" style={{ marginTop: 8 }}>{error}</div>}

        <div className="primers-hint">
          Uses SantaLucia (1998) nearest-neighbor thermodynamics with salt correction.
          Self-complementarity ≥ 4 or missing 3′ GC clamp will trigger a warning.
        </div>
      </div>

      <div className="primers-results-pane">
        {!result && !loading && (
          <div className="primers-empty">
            Design a primer pair to see results here.
          </div>
        )}

        {result && (
          <>
            <div className="primers-results-header">
              <span>Primer pair</span>
              <button className="btn micro" onClick={copyBoth}>Copy both (FASTA)</button>
            </div>
            {result.map((p, i) => (
              <PrimerCard
                key={i}
                primer={p}
                onCopy={(seq) => {
                  copyText(seq);
                  addToast(`${p.name} primer copied`, "success");
                }}
              />
            ))}

            <div className="primer-order-hint">
              <strong>Ordering tip:</strong> Submit the Forward primer 5′→3′ and the Reverse
              primer 5′→3′ (already in the antisense orientation above) to your oligo vendor.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
