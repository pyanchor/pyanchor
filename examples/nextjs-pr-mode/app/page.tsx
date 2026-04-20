export default function HomePage() {
  return (
    <main style={{ textAlign: "center", padding: 32, maxWidth: 580 }}>
      <h1 style={{ fontSize: "2.4rem", margin: 0 }}>PR-mode pyanchor</h1>
      <p style={{ opacity: 0.75, lineHeight: 1.6, marginTop: 16 }}>
        Edits made via the overlay land as a <strong>reviewable GitHub PR</strong>{" "}
        instead of being applied to the running app. Use this for shared dev
        environments, demos, or any time the live app must stay frozen.
      </p>
      <p style={{ opacity: 0.6, fontSize: "0.9rem", marginTop: 32 }}>
        Click the floating button (bottom-right). When the agent finishes you'll
        see a PR URL in the overlay's status panel — open it in GitHub.
      </p>
    </main>
  );
}
