const activeAgent = process.env.NEXT_PUBLIC_PYANCHOR_AGENT_LABEL ?? "unknown";

const ADAPTER_PROFILES: Record<string, { color: string; tagline: string }> = {
  openclaw: { color: "#5d7cff", tagline: "Anthropic Claude Code via openclaw" },
  "claude-code": { color: "#9b6dff", tagline: "Anthropic Claude Code (direct CLI)" },
  codex: { color: "#1bbf6a", tagline: "OpenAI Codex CLI" },
  aider: { color: "#ff8a3d", tagline: "Aider (any provider via litellm)" },
  gemini: { color: "#f4b400", tagline: "Google Gemini CLI" }
};

export default function HomePage() {
  const profile = ADAPTER_PROFILES[activeAgent] ?? {
    color: "#8f9bbb",
    tagline: "Set NEXT_PUBLIC_PYANCHOR_AGENT_LABEL on the host to match the sidecar"
  };

  return (
    <main style={{ textAlign: "center", padding: 32, maxWidth: 640 }}>
      <h1 style={{ fontSize: "2.4rem", margin: 0 }}>Multi-agent pyanchor</h1>
      <p style={{ opacity: 0.75, lineHeight: 1.6, marginTop: 16 }}>
        The same host code, the same overlay, five interchangeable backends.
        Switch the sidecar's <code>PYANCHOR_AGENT</code> env var, restart, and
        you'll see the badge below change without touching the app.
      </p>

      <section
        style={{
          marginTop: 32,
          padding: 24,
          borderRadius: 12,
          background: "#141a30",
          border: `2px solid ${profile.color}`
        }}
      >
        <div style={{ fontSize: "0.85rem", opacity: 0.6 }}>active adapter</div>
        <div
          style={{
            fontSize: "1.8rem",
            fontWeight: 700,
            color: profile.color,
            marginTop: 4
          }}
        >
          {activeAgent}
        </div>
        <div style={{ fontSize: "0.95rem", opacity: 0.8, marginTop: 8 }}>
          {profile.tagline}
        </div>
      </section>

      <p style={{ marginTop: 32, fontSize: "0.9rem", opacity: 0.6 }}>
        Click the floating button (bottom-right) to ask{" "}
        <strong style={{ color: profile.color }}>{activeAgent}</strong> to
        change this page.
      </p>
    </main>
  );
}
