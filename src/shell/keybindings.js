import { useEffect } from "react";
import { COMMANDS, runCommand } from "./commands.js";

// Build a lookup of normalized chord -> command id from the command registry.
function normalize(binding) {
  return binding
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .sort()
    .join("+");
}

const CHORD_MAP = {};
for (const cmd of COMMANDS) {
  if (cmd.keybinding) CHORD_MAP[normalize(cmd.keybinding)] = cmd.id;
}

function chordFromEvent(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  let key = e.key;
  if (key === " ") key = "space";
  else if (key.length === 1) key = key.toLowerCase();
  // normalize a few names to match the registry strings
  if (key === "Enter") key = "enter";
  parts.push(key.toLowerCase());
  return parts.sort().join("+");
}

// Installs a single window-level keydown listener that dispatches to commands.
export function useGlobalKeybindings() {
  useEffect(() => {
    const handler = (e) => {
      // Let plain typing through; only act on modified chords or function keys.
      const isChord = e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key);
      if (!isChord) return;
      const id = CHORD_MAP[chordFromEvent(e)];
      if (id) {
        e.preventDefault();
        e.stopPropagation();
        runCommand(id);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);
}
