export default function Badge({ tone = "accent", children, className = "", ...props }) {
  const cls = ["bio-badge", tone !== "accent" ? tone : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...props}>
      {children}
    </span>
  );
}
