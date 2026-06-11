const ICONS = { info: "ℹ", warning: "⚠", error: "✖", success: "✔" };

export default function Callout({ tone = "info", title, icon, children, className = "" }) {
  const cls = ["bio-callout", tone, className].filter(Boolean).join(" ");
  const displayIcon = icon ?? ICONS[tone];
  return (
    <div className={cls} role={tone === "error" ? "alert" : "note"}>
      {displayIcon && <span className="bio-callout-icon" aria-hidden="true">{displayIcon}</span>}
      <div className="bio-callout-body">
        {title && <div className="bio-callout-title">{title}</div>}
        {children && <div className="bio-callout-msg">{children}</div>}
      </div>
    </div>
  );
}
