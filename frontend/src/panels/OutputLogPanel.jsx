import { useOutputStore } from "../stores/outputStore.js";

export default function OutputLogPanel() {
  const channels = useOutputStore((s) => s.channels);
  const activeChannel = useOutputStore((s) => s.activeChannel);
  const setActiveChannel = useOutputStore((s) => s.setActiveChannel);

  const names = Object.keys(channels);
  const lines = activeChannel ? (channels[activeChannel] ?? []) : [];

  return (
    <div className="output-log">
      {names.length > 0 && (
        <div className="output-channel-bar">
          {names.map((name) => (
            <button
              key={name}
              className={`output-channel-tab${activeChannel === name ? " active" : ""}`}
              onClick={() => setActiveChannel(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="output-lines">
        {lines.length === 0 ? (
          <div className="console-line output-empty">No output</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="console-line">{line}</div>
          ))
        )}
      </div>
    </div>
  );
}
