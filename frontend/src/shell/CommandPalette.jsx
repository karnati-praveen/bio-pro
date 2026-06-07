import { Command } from "cmdk";
import { useUiStore } from "../stores/uiStore.js";
import { COMMANDS } from "./commands.js";

export default function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const close = useUiStore((s) => s.closePalette);
  const quickPickItems = useUiStore((s) => s.quickPickItems);
  const quickPickOptions = useUiStore((s) => s.quickPickOptions);
  const resolveQuickPick = useUiStore((s) => s.resolveQuickPick);
  const cancelQuickPick = useUiStore((s) => s.cancelQuickPick);

  if (!open) return null;

  // ── Extension showQuickPick mode ───────────────────────────────────────────
  if (quickPickItems) {
    const handlePick = (item) => resolveQuickPick(item);
    const handleClose = () => cancelQuickPick();

    return (
      <div className="palette-overlay" onClick={handleClose}>
        <Command
          className="palette"
          label={quickPickOptions?.placeHolder ?? "Select an item"}
          onClick={(e) => e.stopPropagation()}
        >
          <Command.Input
            autoFocus
            placeholder={quickPickOptions?.placeHolder ?? "Select an item…"}
            className="palette-input"
          />
          <Command.List className="palette-list">
            <Command.Empty className="palette-empty">No items match</Command.Empty>
            {quickPickItems.map((item, idx) => {
              const label = typeof item === "string" ? item : item.label;
              const detail = typeof item === "object" ? item.detail : undefined;
              const description = typeof item === "object" ? item.description : undefined;
              return (
                <Command.Item
                  key={idx}
                  value={label}
                  onSelect={() => handlePick(item)}
                  className="palette-item"
                >
                  <span>{label}</span>
                  {description && <span className="palette-item-desc">{description}</span>}
                  {detail && <span className="palette-item-detail">{detail}</span>}
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
      </div>
    );
  }

  // ── Normal command palette mode ────────────────────────────────────────────
  const groups = COMMANDS.reduce((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  const handleRun = (cmd) => {
    close();
    requestAnimationFrame(() => cmd.run());
  };

  return (
    <div className="palette-overlay" onClick={close}>
      <Command
        className="palette"
        label="Command Palette"
        onClick={(e) => e.stopPropagation()}
      >
        <Command.Input autoFocus placeholder="Type a command…" className="palette-input" />
        <Command.List className="palette-list">
          <Command.Empty className="palette-empty">No matching commands</Command.Empty>
          {Object.entries(groups).map(([category, cmds]) => (
            <Command.Group key={category} heading={category} className="palette-group">
              {cmds.map((cmd) => (
                <Command.Item
                  key={cmd.id}
                  value={`${cmd.category} ${cmd.title}`}
                  onSelect={() => handleRun(cmd)}
                  className="palette-item"
                >
                  <span>{cmd.title}</span>
                  {cmd.keybinding && <kbd className="palette-kbd">{cmd.keybinding}</kbd>}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
