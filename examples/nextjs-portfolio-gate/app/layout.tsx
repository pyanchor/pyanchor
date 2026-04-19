import { cookies } from "next/headers";

const COOKIE_NAME = "pyanchor_dev";
const devtoolsToken = process.env.PYANCHOR_TOKEN ?? "";

export const metadata = {
  title: "pyanchor — production gate example"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the gate cookie set by middleware.ts. This runs server-side
  // on every request, so the bootstrap script tag is omitted entirely
  // from anonymous responses — no token leak, no console noise, no
  // overlay flash.
  const isDev = cookies().get(COOKIE_NAME)?.value === "1";

  return (
    <html lang="en">
      <head>
        {isDev && devtoolsToken && (
          <script
            src="/_pyanchor/bootstrap.js"
            defer
            data-pyanchor-token={devtoolsToken}
            // v0.17.0 fail-safe: if you ever forget the {isDev &&}
            // wrapper above (or split this layout in two), the
            // bootstrap will still skip mount unless the cookie is set.
            data-pyanchor-require-gate-cookie={COOKIE_NAME}
            // Pin trusted hosts to your deployment so the sidecar
            // won't even ATTEMPT a session exchange from any other
            // origin — defensive against subdomain takeover etc.
            data-pyanchor-trusted-hosts="localhost,127.0.0.1,your-portfolio.com"
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
