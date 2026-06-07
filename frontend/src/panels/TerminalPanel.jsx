// Placeholder terminal surface. A real PTY-backed terminal (xterm.js + a Tauri
// shell command) is out of Phase-1 scope; this keeps the panel tab functional.
export default function TerminalPanel() {
  return (
    <div className="terminal-panel">
      <div className="console-line">BioIDE terminal — integrated shell coming in a later phase.</div>
      <div className="console-line">$ <span className="terminal-cursor">▌</span></div>
    </div>
  );
}
