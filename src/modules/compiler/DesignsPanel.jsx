// Save the current design (with version history), reload prior versions, and export
// the displayed result to standard formats (GenBank / FASTA / SBOL / JSON).

import { useEffect, useState } from "react";
import {
  addVersion,
  exportInline,
  listDesigns,
  loadVersion,
  saveDesign,
} from "../../shared/lib/api/client.js";

const FORMATS = ["genbank", "fasta", "sbol", "json"];

export default function DesignsPanel({ result, request, onLoad }) {
  const [designs, setDesigns] = useState([]);
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState(null); // design currently being edited
  const [status, setStatus] = useState(null);

  const refresh = () => listDesigns().then(setDesigns).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async () => {
    if (!result) return;
    try {
      if (activeId) {
        const v = await addVersion(activeId, request, result);
        setStatus(`Saved v${v.version_no}`);
      } else {
        const d = await saveDesign(name || "Untitled design", request, result);
        setActiveId(d.id);
        setStatus(`Saved "${d.name}" (v1)`);
      }
      refresh();
    } catch (e) {
      setStatus(e.message);
    }
  };

  const handleLoad = async (designId, versionNo) => {
    try {
      const v = await loadVersion(designId, versionNo);
      setActiveId(designId);
      onLoad(v.response, v.request);
      setStatus(`Loaded design ${designId} v${versionNo}`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  return (
    <div className="designs-panel">
      <h3>Designs</h3>

      <div className="designs-save">
        <input
          type="text"
          placeholder="Design name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!activeId}
        />
        <button onClick={handleSave} disabled={!result}>
          {activeId ? "Save new version" : "Save"}
        </button>
        {activeId && (
          <button className="link-btn" onClick={() => { setActiveId(null); setName(""); }}>
            new
          </button>
        )}
      </div>

      {result && (
        <div className="designs-export">
          <span className="muted">Export:</span>
          {FORMATS.map((fmt) => (
            <button key={fmt} className="link-btn" onClick={() => exportInline(result, fmt)}>
              {fmt}
            </button>
          ))}
        </div>
      )}

      {status && <p className="muted designs-status">{status}</p>}

      {designs.length > 0 && (
        <ul className="designs-list">
          {designs.map((d) => (
            <li key={d.id} className={d.id === activeId ? "active" : ""}>
              <span className="designs-name">{d.name}</span>
              <span className="designs-versions">
                {Array.from({ length: d.latest_version }, (_, i) => i + 1).map((v) => (
                  <button key={v} className="link-btn" onClick={() => handleLoad(d.id, v)}>
                    v{v}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
