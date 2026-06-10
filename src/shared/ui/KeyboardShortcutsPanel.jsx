import { useEffect } from "react";
import { useUiStore } from "../stores/uiStore.js";
import { COMMANDS } from "../../shell/commands.js";

export default function KeyboardShortcutsPanel() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);

  useEffect(() => {
    if (modal !== "keyboard-shortcuts") return;
    const handler = (e) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal, closeModal]);

  if (modal !== "keyboard-shortcuts") return null;

  const groups = COMMANDS.reduce((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  const shortcutCommands = Object.fromEntries(
    Object.entries(groups).map(([cat, cmds]) => [cat, cmds.filter((c) => c.keybinding)])
  );
  const allGroups = Object.entries(shortcutCommands).filter(([, cmds]) => cmds.length > 0);

  return (
    <div className="palette-overlay kbd-panel-overlay" onClick={closeModal}>
      <div className="kbd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="kbd-panel-header">
          <span>Keyboard Shortcuts</span>
          <button className="modal-close" onClick={closeModal}>✕</button>
        </div>
        <div className="kbd-panel-body">
          {allGroups.map(([category, cmds]) => (
            <div key={category} className="kbd-panel-group">
              <div className="kbd-panel-group-heading">{category}</div>
              <table className="kbd-table">
                <tbody>
                  {cmds.map((cmd) => (
                    <tr key={cmd.id} className="kbd-row">
                      <td className="kbd-action">{cmd.title}</td>
                      <td className="kbd-cell">
                        <kbd className="palette-kbd">{cmd.keybinding}</kbd>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
