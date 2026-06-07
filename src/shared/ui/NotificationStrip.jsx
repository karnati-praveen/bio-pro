import { useUiStore } from "../stores/uiStore.js";

// Renders above the status bar when an extension calls showInformationMessage
// with action buttons.
export default function NotificationStrip() {
  const notification = useUiStore((s) => s.notification);
  const resolve = useUiStore((s) => s.resolveNotification);

  if (!notification) return null;

  return (
    <div className="notification-strip">
      <span className="notification-message">{notification.message}</span>
      <div className="notification-actions">
        {notification.items.map((item) => {
          const label = typeof item === "string" ? item : item.label;
          return (
            <button
              key={label}
              className="notification-btn"
              onClick={() => resolve(item)}
            >
              {label}
            </button>
          );
        })}
        <button className="notification-btn notification-dismiss" onClick={() => resolve(undefined)}>
          ✕
        </button>
      </div>
    </div>
  );
}
