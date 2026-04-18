export default function App() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: "2rem"
      }}
    >
      <div>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>Hello, pyanchor</h1>
        <p style={{ color: "#8f9bbb" }}>
          Click the floating button (bottom-right) to ask the agent to change this page.
        </p>
      </div>
    </main>
  );
}
