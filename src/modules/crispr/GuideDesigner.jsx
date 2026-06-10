import { useState } from "react";
import { designGuides } from "../../shared/lib/api/client.js";
import { useUiStore } from "../../shared/stores/uiStore.js";
import { useTabStore } from "../../shared/stores/tabStore.js";

const ENZYME_DESCRIPTIONS = {
  SpCas9: "NGG (3') — 20 nt guide — blunt cut",
  SaCas9: "NNGRRT (3') — 21 nt guide — compact",
  Cas12a: "TTTV (5') — 23 nt guide — staggered cut",
};

// Position within the guide (0-indexed) after which the cut marker appears.
// For 3' PAM enzymes: guide_len - cut_offset; for Cas12a 5' PAM: cut_offset.
const CUT_IN_GUIDE = { SpCas9: 17, SaCas9: 18, Cas12a: 18 };

function ScoreBar({ score }) {
  const color = score >= 70 ? "#2a9d8f" : score >= 40 ? "#e9c46a" : "#e63946";
  return (
    <div className="crispr-score-bar">
      <div className="crispr-score-fill" style={{ width: `${score}%`, background: color }} />
      <span className="crispr-score-num">{score}</span>
    </div>
  );
}

function GuideStrip({ guide, pam, enzyme }) {
  const cutPos = CUT_IN_GUIDE[enzyme] ?? 17;
  const before = guide.slice(0, cutPos);
  const after = guide.slice(cutPos);
  const is5prime = enzyme === "Cas12a";

  return (
    <div className="crispr-strip">
      <span className="crispr-strip-dir">5′–</span>
      {is5prime && <span className="crispr-pam">{pam}</span>}
      {is5prime && <span className="crispr-strip-sep">–</span>}
      <span className="crispr-guide-a">{before}</span>
      <span className="crispr-cut-mark" title="Predicted cut site">↓</span>
      <span className="crispr-guide-b">{after}</span>
      {!is5prime && <span className="crispr-strip-sep">–</span>}
      {!is5prime && <span className="crispr-pam">{pam}</span>}
      <span className="crispr-strip-dir">–3′</span>
    </div>
  );
}

function GuideRow({ guide, enzyme, onCopy, onOrderAsPrimer }) {
  const hasWarns = guide.warnings.length > 0;
  return (
    <tr className={hasWarns ? "crispr-row-warn" : ""}>
      <td className="crispr-rank-cell">
        <span className="crispr-rank">#{guide.rank}</span>
      </td>
      <td className="crispr-score-cell">
        <ScoreBar score={guide.on_target_score} />
      </td>
      <td className="crispr-guide-cell">
        <GuideStrip guide={guide.guide} pam={guide.pam} enzyme={enzyme} />
        {hasWarns && (
          <div className="crispr-warn-tags">
            {guide.warnings.map((w, i) => (
              <span key={i} className="crispr-warn-tag">{w}</span>
            ))}
          </div>
        )}
      </td>
      <td>
        <span className={`crispr-strand-badge crispr-strand-${guide.strand === "+" ? "plus" : "minus"}`}>
          {guide.strand}
        </span>
      </td>
      <td className="crispr-num-cell">{guide.gc_content}%</td>
      <td className="crispr-num-cell">{guide.cut_site}</td>
      <td className="crispr-num-cell">{guide.guide_start}</td>
      <td className="crispr-actions-cell">
        <button className="btn micro" onClick={() => onCopy(guide.guide)} title="Copy guide RNA sequence">
          Copy
        </button>
        <button className="btn micro" onClick={() => onOrderAsPrimer(guide.guide)}
          title="Copy guide sequence and open Primer Design">
          → Primers
        </button>
      </td>
    </tr>
  );
}

function useActiveSequence() {
  return () => {
    const t = useTabStore.getState().activeTab();
    if (!t || !t.content) return null;
    const lines = t.content.split("\n").filter((l) => !l.startsWith(">") && !l.startsWith(";"));
    const seq = lines.join("").replace(/\s/g, "").toUpperCase().replace(/[^ACGTN]/g, "");
    return seq || null;
  };
}

export default function GuideDesigner() {
  const [sequence, setSequence] = useState("");
  const [enzyme, setEnzyme] = useState("SpCas9");
  const [strand, setStrand] = useState("both");
  const [maxGuides, setMaxGuides] = useState(20);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addToast = useUiStore((s) => s.addToast);
  const getActiveSeq = useActiveSequence();

  const loadActiveTab = () => {
    const seq = getActiveSeq();
    if (seq) {
      setSequence(seq);
      addToast(`Loaded ${seq.length} nt from active tab`, "info");
    } else {
      addToast("No sequence content in the active tab", "warning");
    }
  };

  const run = async () => {
    const seq = sequence.replace(/\s/g, "").toUpperCase();
    if (!seq) { setError("Paste a DNA sequence first."); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await designGuides(seq, enzyme, strand, Number(maxGuides));
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyGuide = (seq) => {
    navigator.clipboard.writeText(seq).catch(() => {});
    addToast("Guide RNA sequence copied", "success");
  };

  const orderAsPrimer = (guideSeq) => {
    navigator.clipboard.writeText(guideSeq).catch(() => {});
    useTabStore.getState().openTab({ type: "primers", title: "Primer Design", icon: "🧬" });
    addToast("Guide copied to clipboard — paste it as the sequence in Primer Design", "info");
  };

  return (
    <div className="crispr-editor">
      {/* ── Form pane ────────────────────────────────────── */}
      <div className="crispr-form-pane">
        <div className="primers-form-title">CRISPR Guide Design</div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <label className="primers-label" style={{ flex: 1 }}>
            Target sequence (5′→3′)
          </label>
          <button className="btn micro" onClick={loadActiveTab} title="Pull sequence from the active editor tab">
            Use active tab
          </button>
        </div>
        <textarea
          className="primers-seq-input"
          rows={7}
          placeholder="Paste a DNA sequence (or press 'Use active tab')…"
          value={sequence}
          onChange={(e) => setSequence(e.target.value)}
          spellCheck={false}
        />

        <label className="primers-label">
          Enzyme
          <select
            style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 5,
              background: "var(--card)", color: "var(--ink)", fontSize: 13 }}
            value={enzyme}
            onChange={(e) => setEnzyme(e.target.value)}
          >
            {Object.keys(ENZYME_DESCRIPTIONS).map((e) => (
              <option key={e} value={e}>{e} — {ENZYME_DESCRIPTIONS[e]}</option>
            ))}
          </select>
        </label>

        <label className="primers-label">
          Strand
          <select
            style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 5,
              background: "var(--card)", color: "var(--ink)", fontSize: 13 }}
            value={strand}
            onChange={(e) => setStrand(e.target.value)}
          >
            <option value="both">Both strands</option>
            <option value="+">Sense (+) only</option>
            <option value="-">Antisense (−) only</option>
          </select>
        </label>

        <label className="primers-label">
          Max guides returned
          <input
            type="number" min={1} max={100} step={5}
            value={maxGuides}
            onChange={(e) => setMaxGuides(e.target.value)}
            style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 5,
              background: "var(--card)", color: "var(--ink)", fontSize: 13 }}
          />
        </label>

        <button className="btn primary" disabled={loading} onClick={run} style={{ marginTop: 8 }}>
          {loading ? "Searching…" : "Find Guides ▶"}
        </button>

        {error && <div className="dsl-error" style={{ marginTop: 8 }}>{error}</div>}

        <div className="primers-hint">
          Score 0–100 based on GC content (40–70% ideal), poly-T termination,
          homopolymer runs, and PAM-proximal seed off-target matches.
          The ↓ marker shows the predicted cut site within the guide strip.
        </div>
      </div>

      {/* ── Results pane ─────────────────────────────────── */}
      <div className="crispr-results-pane">
        {!result && !loading && (
          <div className="primers-empty">Find guides to see ranked results here.</div>
        )}

        {result && (
          <>
            <div className="crispr-results-header">
              <span>
                {result.guides.length} guide{result.guides.length !== 1 ? "s" : ""} found
                &nbsp;·&nbsp;{result.enzyme}&nbsp;·&nbsp;{result.sequence_length} nt
              </span>
            </div>

            <div className="crispr-table-wrap">
              <table className="crispr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Score</th>
                    <th>Guide (5′→3′) with cut ↓</th>
                    <th>Strand</th>
                    <th>GC%</th>
                    <th>Cut site</th>
                    <th>Start</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.guides.map((g) => (
                    <GuideRow
                      key={`${g.guide}-${g.strand}-${g.guide_start}`}
                      guide={g}
                      enzyme={enzyme}
                      onCopy={copyGuide}
                      onOrderAsPrimer={orderAsPrimer}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
