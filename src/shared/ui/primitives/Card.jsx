export default function Card({ accent, children, className = "", style, ...props }) {
  return (
    <div
      className={`bio-card-prim${className ? " " + className : ""}`}
      data-accent={accent || undefined}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}
