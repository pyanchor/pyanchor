import Link from "next/link";

export default function Page() {
  return (
    <main style={{ textAlign: "center", padding: 32, maxWidth: 560 }}>
      <h1 style={{ fontSize: "2.4rem", margin: 0 }}>NextAuth-gated pyanchor</h1>
      <p style={{ opacity: 0.75, lineHeight: 1.6, marginTop: 16 }}>
        Sign in with GitHub. If your email is in <code>PYANCHOR_DEV_EMAILS</code>,
        you'll get the pyanchor cookie via{" "}
        <Link href="/api/pyanchor-gate" style={{ color: "#9bb4ff" }}>
          /api/pyanchor-gate
        </Link>{" "}
        and the overlay will mount on subsequent page loads.
      </p>
      <p style={{ marginTop: 32 }}>
        <Link
          href="/api/auth/signin"
          style={{
            background: "#5d7cff",
            color: "white",
            padding: "10px 18px",
            borderRadius: 8,
            textDecoration: "none"
          }}
        >
          Sign in with GitHub →
        </Link>
      </p>
    </main>
  );
}
