"use client";

/**
 * Last-resort boundary for errors thrown in the root layout itself. Replaces the
 * entire document, so it must render its own <html>/<body>. Kept dependency-free
 * and inline-styled because the app chrome (and possibly globals.css) may not be
 * available at this point.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0A0A0A", color: "#E6E6E6", fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 480, width: "100%", border: "1px solid rgba(255,59,59,0.4)", background: "#0F0F10" }}>
            <div style={{ borderBottom: "1px solid #26262B", background: "#141416", padding: "8px 12px", color: "#FF3B3B", fontWeight: 700, fontSize: 13 }}>
              SFX · FATAL
            </div>
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: 12, color: "#9A9AA3", marginTop: 0 }}>
                The terminal shell failed to load. This is unexpected — try reloading the session.
              </p>
              <pre style={{ fontSize: 9, color: "#5E5E66", background: "#0A0A0A", border: "1px solid #26262B", padding: "6px 8px", whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 160 }}>
                {error.message || "Unknown error"}
              </pre>
              <button
                onClick={reset}
                style={{ marginTop: 16, border: "1px solid #FF8C00", background: "#FF8C00", color: "#000", padding: "6px 12px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer" }}
              >
                Reload session
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
