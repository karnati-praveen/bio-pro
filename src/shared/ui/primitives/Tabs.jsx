import { createContext, useContext } from "react";

const TabsCtx = createContext(null);

export function Tabs({ value, onChange, children, className = "" }) {
  return (
    <TabsCtx.Provider value={{ value, onChange }}>
      <div className={className || undefined}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabList({ children, className = "" }) {
  return (
    <div role="tablist" className={`bio-tab-list${className ? " " + className : ""}`}>
      {children}
    </div>
  );
}

export function Tab({ value, accent, disabled = false, children, className = "" }) {
  const ctx = useContext(TabsCtx);
  const isActive = ctx?.value === value;
  const cls = ["bio-tab", isActive ? "active" : "", className].filter(Boolean).join(" ");
  return (
    <button
      role="tab"
      aria-selected={isActive}
      className={cls}
      data-accent={accent || undefined}
      disabled={disabled}
      onClick={() => !disabled && ctx?.onChange?.(value)}
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, children, className = "" }) {
  const ctx = useContext(TabsCtx);
  if (ctx?.value !== value) return null;
  return (
    <div role="tabpanel" className={className || undefined}>
      {children}
    </div>
  );
}

// ── SegmentedControl ──────────────────────────────────────────────────────────
export function SegmentedControl({ value, onChange, options = [], className = "" }) {
  return (
    <div className={`bio-segmented${className ? " " + className : ""}`} role="group">
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            className={`bio-seg${isActive ? " active" : ""}`}
            aria-pressed={isActive}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange?.(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
