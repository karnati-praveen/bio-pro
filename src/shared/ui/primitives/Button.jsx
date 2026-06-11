import { forwardRef } from "react";

const Button = forwardRef(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    disabled = false,
    children,
    className = "",
    ...props
  },
  ref
) {
  const cls = [
    "bio-btn",
    variant,
    size === "sm" ? "sm" : "",
    loading ? "loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} className={cls} disabled={disabled || loading} {...props}>
      {loading && <span className="bio-btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});

export default Button;
