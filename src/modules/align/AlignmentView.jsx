import { useState, useCallback, useRef, useEffect } from "react";
import { Grid } from "react-window";
import { alignSequences } from "../../shared/lib/api/client.js";
import { useUiStore } from "../../shared/stores/uiStore.js";

// ── Residue color palettes ───────────────────────────────────────────────── //

const NT_COLORS = {
  A: { bg: "var(--align-basic)", fg: "var(--on-accent)" },
  T: { bg: "var(--align-acidic)", fg: "var(--on-accent)" },
  U: { bg: "var(--align-acidic)", fg: "var(--on-accent)" },
  G: { bg: "var(--align-gly)", fg: "var(--text-on-color)" },
  C: { bg: "var(--align-polar)", fg: "var(--on-accent)" },
  "-": { bg: "transparent", fg: "var(--fg-muted)" },
};

const AA_COLORS = {
  // Hydrophobic
  A: { bg: "var(--align-nonpolar)", fg: "var(--text-on-color)" }, V: { bg: "var(--align-nonpolar)", fg: "var(--text-on-color)" },
  I: { bg: "var(--align-nonpolar)", fg: "var(--text-on-color)" }, L: { bg: "var(--align-nonpolar)", fg: "var(--text-on-color)" },
  M: { bg: "var(--align-nonpolar)", fg: "var(--text-on-color)" }, F: { bg: "var(--align-nonpolar)", fg: "var(--text-on-color)" },
  W: { bg: "var(--align-nonpolar)", fg: "var(--text-on-color)" }, P: { bg: "var(--align-nonpolar)", fg: "var(--text-on-color)" },
  // Polar uncharged
  S: { bg: "var(--align-polar)", fg: "var(--on-accent)" }, T: { bg: "var(--align-polar)", fg: "var(--on-accent)" },
  C: { bg: "var(--align-cys-aa)", fg: "var(--text-on-color)" }, Y: { bg: "var(--align-polar)", fg: "var(--on-accent)" },
  N: { bg: "var(--align-polar)", fg: "var(--on-accent)" }, Q: { bg: "var(--align-polar)", fg: "var(--on-accent)" },
  // Charged positive
  K: { bg: "var(--align-basic)", fg: "var(--on-accent)" }, R: { bg: "var(--align-basic)", fg: "var(--on-accent)" },
  H: { bg: "var(--align-his)", fg: "var(--on-accent)" },
  // Charged negative
  D: { bg: "var(--align-acidic)", fg: "var(--on-accent)" }, E: { bg: "var(--align-acidic)", fg: "var(--on-accent)" },
  // Special
  G: { bg: "var(--align-gly)", fg: "var(--text-on-color)" },
  "-": { bg: "transparent", fg: "var(--fg-muted)" },
};

function residueColor(char, isNt) {
  const palette = isNt ? NT_COLORS : AA_COLORS;
  return palette[char] ?? { bg: "var(--align-unk)", fg: "var(--on-accent)" };
}

// ── Sequence type detection ──────────────────────────────────────────────── //

function looksLikeNucleotide(seq) {
  const clean = seq.replace(/-/g, "").toUpperCase();
  const ntSet = new Set([..."ACGTUN"]);
  return clean.length > 0 && [...clean].every((c) => ntSet.has(c));
}

// ── Zoom ────────────────────────────────────────────────────────────────── //

const CELL_SIZES = [
  { label: "XS", w: 10, h: 14, fontSize: 7 },
  { label: "S",  w: 14, h: 18, fontSize: 9 },
  { label: "M",  w: 18, h: 22, fontSize: 11 },
  { label: "L",  w: 24, h: 28, fontSize: 14 },
];

// ── Sub-components ───────────────────────────────────────────────────────── //

function ResidueCell({ char, isNt, cellW, cellH, fontSize }) {
  const { bg, fg } = residueColor(char, isNt);
  return (
    <div
      style={{
        width: cellW, height: cellH, lineHeight: `${cellH}px`,
        fontSize, textAlign: "center", fontFamily: "monospace",
        background: bg, color: fg, userSelect: "none",
        border: "1px solid var(--border)",
        boxSizing: "border-box",
      }}
    >
      {char}
    </div>
  );
}

function ConservationBar({ conservation, colWidth, barHeight = 40 }) {
  if (!conservation?.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", height: barHeight, borderTop: "1px solid var(--border)" }}>
      {conservation.map((v, i) => (
        <div
          key={i}
          style={{
            width: colWidth, flexShrink: 0,
            height: `${Math.round(v * (barHeight - 4))}px`,
            background: v >= 0.8 ? "var(--success)" : v >= 0.5 ? "var(--warning)" : "var(--error)",
            boxSizing: "border-box",
          }}
          title={`Col ${i + 1}: ${(v * 100).toFixed(0)}% conserved`}
        />
      ))}
    </div>
  );
}

function IdentityMatrix({ names, matrix }) {
  if (!matrix?.length) return null;
  const n = matrix.length;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="align-id-matrix">
        <thead>
          <tr>
            <th />
            {names.map((nm, j) => <th key={j} title={nm}>{nm.slice(0, 10)}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <th title={names[i]}>{names[i].slice(0, 10)}</th>
              {row.map((v, j) => {
                const pct = (v * 100).toFixed(1);
                const bg =
                  i === j ? "var(--bg-active)" :
                  v >= 0.9 ? "var(--success-bg)" :
                  v >= 0.7 ? "var(--warning-bg)" : "var(--error-bg)";
                return (
                  <td key={j} style={{ background: bg, textAlign: "center" }}>
                    {pct}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Virtualized alignment grid ───────────────────────────────────────────── //

function AlignmentGrid({ rows, consensus, conservation, zoomIdx }) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const { w: cellW, h: cellH, fontSize } = CELL_SIZES[zoomIdx];

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setContainerWidth(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!rows?.length) return null;

  const nCols = rows[0].aligned.length;
  const nRows = rows.length + 2; // +consensus +conservation

  // Label column width
  const maxLabelLen = Math.max(...rows.map((r) => r.name.length), 9);
  const labelW = Math.min(maxLabelLen * 7 + 8, 140);

  const isNt = looksLikeNucleotide(rows[0].aligned);

  // One extra synthetic row: consensus, then a conservation bar (rendered outside grid)
  const allRows = [...rows, { name: "Consensus", aligned: consensus ?? "" }];
  const gridH = Math.min(allRows.length * cellH + 40, 480);

  const Cell = useCallback(({ columnIndex, rowIndex, style }) => {
    const row = allRows[rowIndex];
    const char = row.aligned[columnIndex] ?? " ";
    const isConsensus = rowIndex === allRows.length - 1;
    return (
      <div style={{ ...style, display: "flex" }}>
        <ResidueCell
          char={char.toUpperCase()}
          isNt={isNt}
          cellW={cellW} cellH={cellH} fontSize={fontSize}
          style={{ opacity: isConsensus ? 0.7 : 1 }}
        />
      </div>
    );
  }, [allRows, isNt, cellW, cellH, fontSize]);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <div style={{ display: "flex" }}>
        {/* Label column */}
        <div style={{ flexShrink: 0, width: labelW }}>
          {allRows.map((row, i) => (
            <div
              key={i}
              style={{
                height: cellH, lineHeight: `${cellH}px`,
                fontSize: 11, fontFamily: "monospace",
                paddingRight: 6, textAlign: "right",
                color: i === allRows.length - 1 ? "var(--fg-muted)" : "var(--fg)",
                overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                borderBottom: "1px solid var(--border)",
              }}
              title={row.name}
            >
              {row.name}
            </div>
          ))}
          <div style={{ height: 40, lineHeight: "40px", fontSize: 10, color: "var(--fg-muted)", textAlign: "right", paddingRight: 6 }}>
            conservation
          </div>
        </div>

        {/* Scrollable grid */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Grid
            columnCount={nCols}
            columnWidth={cellW}
            rowCount={allRows.length}
            rowHeight={cellH}
            style={{ height: gridH, width: Math.max(containerWidth - labelW, 100) }}
            cellComponent={Cell}
          />
          <ConservationBar conservation={conservation} colWidth={cellW} />
        </div>
      </div>
    </div>
  );
}

// ── Input panel ──────────────────────────────────────────────────────────── //

const EXAMPLE_SEQS = [
  { name: "seq1", seq: "ACGTACGTACGT" },
  { name: "seq2", seq: "ACGTTCGTACGT" },
  { name: "seq3", seq: "ACGT-CGTACGG" },
];

function parseInput(raw) {
  const lines = raw.split("\n");
  const seqs = [];
  let name = null;
  let buf = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(">")) {
      if (name !== null && buf.length) seqs.push({ name, seq: buf.join("") });
      name = trimmed.slice(1).split(/\s+/)[0] || `seq${seqs.length + 1}`;
      buf = [];
    } else if (trimmed) {
      if (name === null) {
        // plain sequences separated by blank lines — not FASTA
        seqs.push({ name: `seq${seqs.length + 1}`, seq: trimmed.replace(/\s+/g, "") });
      } else {
        buf.push(trimmed.replace(/\s+/g, ""));
      }
    }
  }
  if (name !== null && buf.length) seqs.push({ name, seq: buf.join("") });
  return seqs;
}

// ── Main component ───────────────────────────────────────────────────────── //

export default function AlignmentView() {
  const toast = useUiStore((s) => s.addToast);

  const [inputText, setInputText] = useState(
    EXAMPLE_SEQS.map((s) => `>${s.name}\n${s.seq}`).join("\n\n")
  );
  const [mode, setMode] = useState("global");
  const [matchScore, setMatchScore] = useState(1);
  const [mismatchScore, setMismatchScore] = useState(-1);
  const [gapScore, setGapScore] = useState(-2);
  const [zoomIdx, setZoomIdx] = useState(2);  // default "M"

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("alignment");

  const seqs = parseInput(inputText);
  const validCount = seqs.filter((s) => s.seq.length > 0).length;

  async function runAlign() {
    if (validCount < 2) {
      toast("Enter at least 2 sequences (FASTA format or one per line)", "warning");
      return;
    }
    const effectiveMode = validCount > 2 ? "msa" : mode;
    setLoading(true);
    try {
      const data = await alignSequences({
        mode: effectiveMode,
        sequences: seqs,
        match: Number(matchScore),
        mismatch: Number(mismatchScore),
        gap: Number(gapScore),
      });
      setResult(data);
      setActiveTab("alignment");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  const names = result?.sequences?.map((s) => s.name) ?? [];

  return (
    <div className="align-root">
      {/* ── Toolbar ── */}
      <div className="align-toolbar">
        <span className="align-title">Sequence Alignment</span>

        <label className="align-label">Mode</label>
        <select
          className="align-select"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          disabled={validCount > 2}
          title={validCount > 2 ? "MSA auto-selected for >2 sequences" : undefined}
        >
          <option value="global">Global (Needleman-Wunsch)</option>
          <option value="local">Local (Smith-Waterman)</option>
          {validCount > 2 && <option value="msa">MSA (Center-Star)</option>}
        </select>

        <label className="align-label">Match</label>
        <input className="align-score-input" type="number" value={matchScore} onChange={(e) => setMatchScore(e.target.value)} />
        <label className="align-label">Mismatch</label>
        <input className="align-score-input" type="number" value={mismatchScore} onChange={(e) => setMismatchScore(e.target.value)} />
        <label className="align-label">Gap</label>
        <input className="align-score-input" type="number" value={gapScore} onChange={(e) => setGapScore(e.target.value)} />

        <label className="align-label">Zoom</label>
        <div className="align-zoom-group">
          {CELL_SIZES.map((sz, i) => (
            <button
              key={sz.label}
              className={`align-zoom-btn${zoomIdx === i ? " active" : ""}`}
              onClick={() => setZoomIdx(i)}
            >
              {sz.label}
            </button>
          ))}
        </div>

        <button className="align-run-btn" onClick={runAlign} disabled={loading || validCount < 2}>
          {loading ? "Aligning…" : "Align"}
        </button>
      </div>

      <div className="align-body">
        {/* ── Input panel ── */}
        <div className="align-input-panel">
          <div className="align-panel-header">
            Sequences
            <span className="align-seq-count">{validCount} sequence{validCount !== 1 ? "s" : ""}</span>
          </div>
          <textarea
            className="align-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={"> seq1\nACGTACGT\n\n> seq2\nACGTTCGT"}
            spellCheck={false}
          />
        </div>

        {/* ── Results panel ── */}
        <div className="align-results-panel">
          {!result && !loading && (
            <div className="align-empty">Enter sequences and click Align</div>
          )}

          {result && (
            <>
              {/* Summary bar */}
              <div className="align-summary-bar">
                {result.score !== undefined && (
                  <span className="align-stat"><b>Score:</b> {result.score}</span>
                )}
                {result.identity !== undefined && (
                  <span className="align-stat"><b>Identity:</b> {(result.identity * 100).toFixed(1)}%</span>
                )}
                <span className="align-stat"><b>Length:</b> {result.sequences?.[0]?.aligned?.length ?? 0} cols</span>
                <span className="align-stat"><b>Sequences:</b> {result.sequences?.length ?? 0}</span>
              </div>

              {/* Tab bar */}
              <div className="align-tabs">
                {["alignment", "identity"].map((tab) => (
                  <button
                    key={tab}
                    className={`align-tab${activeTab === tab ? " active" : ""}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === "alignment" ? "Alignment" : "Identity Matrix"}
                  </button>
                ))}
              </div>

              {activeTab === "alignment" && (
                <div className="align-grid-wrapper">
                  <AlignmentGrid
                    rows={result.sequences}
                    consensus={result.consensus}
                    conservation={result.conservation}
                    zoomIdx={zoomIdx}
                  />
                </div>
              )}

              {activeTab === "identity" && (
                <div className="align-matrix-wrapper">
                  <IdentityMatrix names={names} matrix={result.identity_matrix} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
