export function Panel({ children, className = "", style }) {
  return (
    <div className={`bio-panel${className ? " " + className : ""}`} style={style}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, actions, className = "" }) {
  return (
    <div className={`bio-panel-header${className ? " " + className : ""}`}>
      <h2 className="bio-panel-title">{title}</h2>
      {actions && <div className="bio-panel-actions">{actions}</div>}
    </div>
  );
}
