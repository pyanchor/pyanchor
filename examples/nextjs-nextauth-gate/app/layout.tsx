import { cookies } from "next/headers";

const COOKIE_NAME = "pyanchor_dev";
const devtoolsToken = process.env.PYANCHOR_TOKEN ?? "";

export const metadata = {
  title: "pyanchor — NextAuth gate example"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Two-layer check: cookie must be set by /api/pyanchor-gate (which
  // verifies NextAuth session + allowlist), AND the bootstrap script
  // adds its own require-gate-cookie attribute as a fail-safe.
  const isDev = cookies().get(COOKIE_NAME)?.value === "1";

  return (
    <html lang="en">
      <head>
        {isDev && devtoolsToken && (
          <script
            src="/_pyanchor/bootstrap.js"
            defer
            data-pyanchor-token={devtoolsToken}
            data-pyanchor-require-gate-cookie={COOKIE_NAME}
            data-pyanchor-trusted-hosts="localhost,127.0.0.1,your-app.com"
          />
        )}
      </head>
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#0b1020",
          color: "#edf1ff",
          minHeight: "100vh",
          display: "grid",
          placeItems: "center"
        }}
      >
        {children}
      </body>
    </html>
  );
}
