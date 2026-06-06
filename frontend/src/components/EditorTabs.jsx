export default function EditorTabs({ openFiles, activeIndex, onSelect, onClose }) {
  if (!openFiles || openFiles.length === 0) return null;

  return (
    <div className="editor-tabs">
      {openFiles.map((file, i) => (
        <div
          key={file.path}
          className={`editor-tab${i === activeIndex ? " active" : ""}${file.dirty ? " dirty" : ""}`}
          onClick={() => onSelect(i)}
          title={file.path}
        >
          <span className="editor-tab-name">{file.name}</span>
          {file.dirty && <span className="editor-tab-dot" title="Unsaved changes">&#9679;</span>}
          <button
            className="editor-tab-close"
            title="Close"
            onClick={e => { e.stopPropagation(); onClose(i); }}
          >
            &#215;
          </button>
        </div>
      ))}
    </div>
  );
}
