/**
 * The host doesn't care which agent is running underneath. The
 * bootstrap script tag is identical regardless of PYANCHOR_AGENT;
 * the agent choice lives entirely in the sidecar's env.
 *
 * That's the point of this example: prove the host integration is
 * truly agent-agnostic. Swap PYANCHOR_AGENT={openclaw,claude-code,
 * codex,aider,gemini} on the sidecar, restart the sidecar, and the
 * host code below stays unchanged.
 */

const devtoolsEnabled =
  process.env.NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED === "true";
const devtoolsToken = process.env.NEXT_PUBLIC_PYANCHOR_TOKEN ?? "";

// Surface which agent the sidecar is configured to use. Purely
// cosmetic — the page reads it from a public env var so we can
// label the running adapter in the UI.
const activeAgent = process.env.NEXT_PUBLIC_PYANCHOR_AGENT_LABEL ?? "unknown";

export const metadata = {
  title: "pyanchor — multi-agent example"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-active-agent={activeAgent}>
      <head>
        {devtoolsEnabled && devtoolsToken && (
          <script
            src="/_pyanchor/bootstrap.js"
            defer
            data-pyanchor-token={devtoolsToken}
            data-pyanchor-trusted-hosts="localhost,127.0.0.1"
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
