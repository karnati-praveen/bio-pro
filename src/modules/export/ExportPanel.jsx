import { useState } from "react";
import { exportInline } from "../../shared/lib/api/client.js";

const FORMAT_META = {
  genbank: {
    label: "GenBank",
    ext: ".gb",
    desc: "Annotated DNA sequence — open in Benchling, Geneious, or SnapGene.",
    icon: "🧬",
  },
  fasta: {
    label: "FASTA",
    ext: ".fasta",
    desc: "Raw DNA sequence — universal input for BLAST, primers, and online tools.",
    icon: "📄",
  },
  sbol: {
    label: "SBOL 3",
    ext: ".xml",
    desc: "Structured design standard — import into SynBioHub or iGEM tools.",
    icon: "🔗",
  },
  json: {
    label: "JSON Bundle",
    ext: ".json",
    desc: "Self-contained archive of spec, circuit, validation, and simulation data.",
    icon: "📦",
  },
};

export default function ExportPanel({ result }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!result) {
    return (
      <div className="export-panel empty">
        <p className="muted">Compile a circuit first to enable export.</p>
      </div>
    );
  }

  const handleExport = async (fmt) => {
    setBusy(fmt);
    setError(null);
    try {
      await exportInline(result, fmt);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard unavailable");
    }
  };

  const spec = result.spec ?? {};
  const partCount = spec.parts?.length ?? 0;

  return (
    <div className="export-panel">
      {spec.output && (
        <div className="export-summary">
          <span className="export-summary-label">Design</span>
          <span className="export-summary-value">{spec.output}</span>
          {partCount > 0 && (
            <span className="export-summary-parts">
              {partCount} part{partCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      <div className="export-grid">
        {Object.entries(FORMAT_META).map(([fmt, meta]) => (
          <div key={fmt} className="export-card">
            <div className="export-card-header">
              <span className="export-card-icon">{meta.icon}</span>
              <span className="export-card-label">{meta.label}</span>
              <span className="export-card-ext">{meta.ext}</span>
            </div>
            <p className="export-card-desc">{meta.desc}</p>
            <button
              className="btn export-btn"
              disabled={busy === fmt}
              onClick={() => handleExport(fmt)}
            >
              {busy === fmt ? "Exporting…" : `Download ${meta.label}`}
            </button>
          </div>
        ))}
      </div>

      <div className="export-actions">
        <button className="link-btn" onClick={handleCopy}>
          {copied ? "✓ Copied!" : "Copy JSON to clipboard"}
        </button>
      </div>

      {error && <p className="muted export-error">{error}</p>}
    </div>
  );
}
