// Feature 7: Cloning strategy generation — Gibson and Golden Gate protocols.

import { useState } from "react";
import { generateAssembly, downloadAssemblyPdf } from "../api/client.js";

export default function AssemblyPanel({ result }) {
  const [method, setMethod] = useState("gibson");
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState(null);
  const [protocol, setProtocol] = useState(null);

  if (!result) return null;

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateAssembly(result, method);
      setProtocol(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      await downloadAssemblyPdf(result, method);
    } catch (e) {
      setError(e.message);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="card assembly-panel">
      <h2>Cloning strategy</h2>

      <div className="assembly-controls">
        <label>
          Assembly method
          <select value={method} onChange={e => { setMethod(e.target.value); setProtocol(null); }}>
            <option value="gibson">Gibson Assembly</option>
            <option value="golden_gate">Golden Gate (BsaI)</option>
          </select>
        </label>
        <button className="compile-btn small" onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate protocol ▶"}
        </button>
        {protocol && (
          <button className="compile-btn small secondary" onClick={downloadPdf} disabled={pdfLoading}>
            {pdfLoading ? "Generating PDF…" : "⬇ Download PDF"}
          </button>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      {protocol && (
        <div className="protocol-body">
          <h3>
            {protocol.method === "gibson" ? "Gibson Assembly" : "Golden Gate"} Protocol
          </h3>

          <h4>Fragments to order ({protocol.fragments?.length})</h4>
          <div className="fragments-list">
            {protocol.fragments?.map((frag, i) => (
              <div key={i} className="fragment-item">
                <div className="fragment-header">
                  <strong>{frag.name}</strong>
                  <span className="badge">{frag.length} bp</span>
                </div>
                {frag.order_sequence && (
                  <details>
                    <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>
                      Order sequence
                    </summary>
                    <code className="seq-block">
                      {frag.order_sequence.length > 200
                        ? frag.order_sequence.slice(0, 200) + "…"
                        : frag.order_sequence}
                    </code>
                  </details>
                )}
              </div>
            ))}
          </div>

          <h4>Protocol steps</h4>
          <ol className="protocol-steps">
            {protocol.steps?.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          {protocol.notes?.length > 0 && (
            <>
              <h4>Notes</h4>
              <ul className="protocol-notes">
                {protocol.notes.map((note, i) => (
                  <li key={i}
                    className={note.startsWith("WARNING") ? "drc-warning" : ""}
                  >
                    {note}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
