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
        background: "var(--surface)",
        border: "1.5px solid var(--error)",
        borderRadius: 6,
        fontFamily: "var(--font-ui)",
        color: "var(--text)",
      }}>
        <div style={{ fontWeight: 600, color: "var(--error)", fontSize: "var(--text-sm)" }}>
          Panel crashed
        </div>
        <pre style={{
          margin: 0,
          padding: "10px 12px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          fontSize: 12,
          lineHeight: 1.6,
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "var(--error)",
        }}>
          {error.toString()}
          {error.stack ? `\n\n${error.stack}` : ""}
        </pre>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: "5px 14px",
              background: "var(--accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "var(--text-sm)",
            }}
          >
            Reload panel
          </button>
          <button
            onClick={this.handleCopy}
            style={{
              padding: "5px 14px",
              background: "var(--surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "var(--text-sm)",
            }}
          >
            Copy error
          </button>
        </div>
      </div>
    );
  }
}
