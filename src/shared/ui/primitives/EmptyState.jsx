export default function EmptyState({ icon, title, hint, children, className = "" }) {
  return (
    <div className={`bio-empty${className ? " " + className : ""}`}>
      {icon && <div className="bio-empty-icon" aria-hidden="true">{icon}</div>}
      {title && <p className="bio-empty-title">{title}</p>}
      {hint && <p className="bio-empty-hint">{hint}</p>}
      {children}
    </div>
  );
}
