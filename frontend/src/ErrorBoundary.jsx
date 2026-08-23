import { Component } from "react";

// Catches any render-time crash anywhere in the app and shows a real message
// instead of leaving the page blank. Complements the specific env-var check in
// supabaseClient.js, which handles a crash that happens before React even starts
// (this boundary can only catch crashes that happen AFTER React has mounted).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("SEMAI crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F0C29", color: "white", fontFamily: "system-ui,sans-serif", textAlign: "center", padding: 24 }}>
          <div style={{ maxWidth: 480 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Something went wrong</h2>
            <p style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              SEMAI hit an unexpected error and couldn't continue. Reloading the page
              usually fixes transient issues.
            </p>
            <p style={{ color: "#4B5563", fontSize: 12, fontFamily: "monospace", background: "rgba(0,0,0,0.3)", padding: 10, borderRadius: 8, wordBreak: "break-word" }}>
              {String(this.state.error?.message || this.state.error)}
            </p>
            <button onClick={() => window.location.reload()}
              style={{ marginTop: 16, background: "linear-gradient(135deg,#7C3AED,#4F46E5)", border: "none", borderRadius: 10, padding: "10px 20px", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
