import { useRef } from "react";
import { useUiStore } from "../stores/uiStore.js";

// Modal input box triggered by vscode.window.showInputBox().
export default function InputBoxOverlay() {
  const inputBox = useUiStore((s) => s.inputBox);
  const resolveInputBox = useUiStore((s) => s.resolveInputBox);
  const cancelInputBox = useUiStore((s) => s.cancelInputBox);
  const inputRef = useRef(null);

  if (!inputBox) return null;

  const { options } = inputBox;

  const handleKeyDown = (e) => {
    if (e.key === "Enter") resolveInputBox(inputRef.current?.value ?? "");
    if (e.key === "Escape") cancelInputBox();
  };

  return (
    <div className="inputbox-overlay" onClick={cancelInputBox}>
      <div className="inputbox-dialog" onClick={(e) => e.stopPropagation()}>
        {options?.prompt && <div className="inputbox-prompt">{options.prompt}</div>}
        <input
          ref={inputRef}
          autoFocus
          className="inputbox-input"
          placeholder={options?.placeHolder ?? ""}
          defaultValue={options?.value ?? ""}
          type={options?.password ? "password" : "text"}
          onKeyDown={handleKeyDown}
        />
        {options?.validateInput && (
          <div className="inputbox-hint">{options.valueSelection ? "" : ""}</div>
        )}
      </div>
    </div>
  );
}
