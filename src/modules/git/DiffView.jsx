import { useEffect, useState } from "react";
import { gitDiff } from "../../shared/lib/api/client.js";
import { useProjectStore } from "../../shared/stores/projectStore.js";

// Renders a bio-aware diff for a single file.
// diff kinds: "sequence" | "circuit" | "text"
export default function DiffView({ filepath, refA, refB, onClose }) {
  const root = useProjectStore((s) => s.rootPath);
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!root || !filepath) return;
    setLoading(true);
    setError(null);
    gitDiff(root, filepath, refA ?? null, refB ?? null)
      .then((d) => setDiff(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [root, filepath, refA, refB]);

  return (
    <div className="diff-view">
      <div className="diff-header">
        <span className="diff-title">{filepath}</span>
        {refA && <span className="diff-ref">{refA?.slice(0, 7)}</span>}
        {refA && <span className="diff-ref-arrow">→</span>}
        {refB && <span className="diff-ref">{refB?.slice(0, 7)}</span>}
        {!refB && refA && <span className="diff-ref">working tree</span>}
        {!refA && <span className="diff-ref">HEAD → working tree</span>}
        {onClose && (
          <button className="diff-close" onClick={onClose}>✕</button>
        )}
      </div>

      {loading && <div className="diff-loading">Computing diff…</div>}
      {error && <div className="dsl-error">{error}</div>}

      {diff && !loading && (
        diff.kind === "sequence" ? (
          <SequenceDiff diff={diff} />
        ) : diff.kind === "circuit" ? (
          <CircuitDiff diff={diff} />
        ) : (
          <TextDiff diff={diff} />
        )
      )}
    </div>
  );
}

function SequenceDiff({ diff }) {
  const { old_len, new_len, net, hunks } = diff;
  return (
    <div className="diff-section">
      <p className="diff-summary">
        Sequence length: {old_len} bp → {new_len} bp
        {" "}<span className={net > 0 ? "diff-ins" : net < 0 ? "diff-del" : ""}>
          ({net > 0 ? "+" : ""}{net} bp)
        </span>
      </p>
      {hunks.length === 0 && <p className="diff-empty">No sequence changes.</p>}
      <div className="diff-hunks">
        {hunks.map((h, i) => (
          <span
            key={i}
            className={h.type === "ins" ? "diff-ins-hunk" : "diff-del-hunk"}
            title={`@${h.pos} ${h.type === "ins" ? "+" : "-"}${h.bases.length} bp`}
          >
            {h.type === "ins" ? "+" : "−"}{h.bases.length > 20 ? h.bases.slice(0, 20) + "…" : h.bases}
          </span>
        ))}
      </div>
    </div>
  );
}

function CircuitDiff({ diff }) {
  const { added, removed, unchanged } = diff;
  return (
    <div className="diff-section">
      {added.length === 0 && removed.length === 0 && (
        <p className="diff-empty">No part changes.</p>
      )}
      {added.length > 0 && (
        <div className="diff-part-group">
          <span className="diff-group-label diff-ins">+ Added parts</span>
          <ul className="diff-part-list diff-ins-list">
            {added.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
      {removed.length > 0 && (
        <div className="diff-part-group">
          <span className="diff-group-label diff-del">− Removed parts</span>
          <ul className="diff-part-list diff-del-list">
            {removed.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
      {unchanged.length > 0 && (
        <div className="diff-part-group">
          <span className="diff-group-label diff-unchanged">= Unchanged</span>
          <span className="diff-unchanged-count">{unchanged.length} parts</span>
        </div>
      )}
    </div>
  );
}

function TextDiff({ diff }) {
  const { hunks } = diff;
  if (!hunks?.length) return <p className="diff-empty">No changes.</p>;
  return (
    <pre className="diff-text">
      {hunks.map((line, i) => {
        const cls = line.startsWith("+") && !line.startsWith("+++")
          ? "diff-ins-line"
          : line.startsWith("-") && !line.startsWith("---")
          ? "diff-del-line"
          : line.startsWith("@@")
          ? "diff-hunk-header"
          : "";
        return <span key={i} className={cls}>{line}{"\n"}</span>;
      })}
    </pre>
  );
}
