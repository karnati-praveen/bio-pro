import { useUiStore } from "../stores/uiStore.js";

const ICONS = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };

export default function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);

  if (!toasts.length) return null;

  return (
    <div className="bio-toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`bio-toast ${t.type || "info"}`} role="alert">
          <span className="bio-toast-msg">
            {ICONS[t.type] && <strong style={{ marginRight: 6 }}>{ICONS[t.type]}</strong>}
            {t.message}
          </span>
          <button className="bio-toast-dismiss" onClick={() => removeToast(t.id)} title="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
