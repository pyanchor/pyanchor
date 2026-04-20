export default function App() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32 }}>
      <div style={{ textAlign: "center", maxWidth: 560 }}>
        <h1 style={{ fontSize: "2.4rem", margin: 0 }}>Production-gated Vite</h1>
        <p style={{ opacity: 0.75, lineHeight: 1.6 }}>
          Visit{" "}
          <code style={{ background: "rgba(255,255,255,.08)", padding: "2px 6px", borderRadius: 4 }}>
            ?_pyanchor=&lt;your-secret&gt;
          </code>{" "}
          on this gate server to unlock the devtools. Anonymous visitors
          never get the overlay even if you forget to conditionally render
          the bootstrap script.
        </p>
      </div>
    </main>
  );
}
