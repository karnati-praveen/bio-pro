import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
  }

  handleCopy = () => {
    const { error } = this.state;
    const text = `${error?.toString()}\n\n${error?.stack ?? ""}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 20,
        margin: 12,
        background: "var(--bg-surface, #1e1e1e)",
        border: "1.5px solid #c0392b",
        borderRadius: 6,
        fontFamily: "var(--font-ui, sans-serif)",
        color: "var(--text-normal, #ccc)",
      }}>
        <div style={{ fontWeight: 600, color: "#e74c3c", fontSize: "var(--text-sm, 13px)" }}>
          Panel crashed
        </div>
        <pre style={{
          margin: 0,
          padding: "10px 12px",
          background: "var(--bg-base, #141414)",
          border: "1px solid var(--border-subtle, #333)",
          borderRadius: 4,
          fontSize: 12,
          lineHeight: 1.6,
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "#e57373",
        }}>
          {error.toString()}
          {error.stack ? `\n\n${error.stack}` : ""}
        </pre>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: "5px 14px",
              background: "var(--accent, #3d9970)",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "var(--text-sm, 13px)",
            }}
          >
            Reload panel
          </button>
          <button
            onClick={this.handleCopy}
            style={{
              padding: "5px 14px",
              background: "var(--bg-elevated, #2a2a2a)",
              color: "var(--text-normal, #ccc)",
              border: "1px solid var(--border-subtle, #444)",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "var(--text-sm, 13px)",
            }}
          >
            Copy error
          </button>
        </div>
      </div>
    );
  }
}
