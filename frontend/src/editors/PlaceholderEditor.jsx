// Stand-in for editors that land in later phases. Keeps the tab system fully
// functional (open/close/split) before each module's editor exists.
export default function PlaceholderEditor({ tab, label, phase }) {
  return (
    <div className="placeholder-editor">
      <div className="placeholder-icon">{tab?.icon || "🧪"}</div>
      <h2>{label}</h2>
      {phase && <p className="placeholder-phase">Arriving in {phase}</p>}
      {tab?.filePath && <p className="placeholder-path">{tab.filePath}</p>}
    </div>
  );
}
