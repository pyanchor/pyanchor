/**
 * In PR mode the host app is normal — pyanchor never touches the
 * running code. Edits land on a feature branch and open a PR for
 * human review. This layout is identical to nextjs-minimal except
 * for an explanatory data attribute.
 */

const devtoolsEnabled =
  process.env.NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED === "true";
const devtoolsToken = process.env.NEXT_PUBLIC_PYANCHOR_TOKEN ?? "";

export const metadata = {
  title: "pyanchor — PR mode example"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-pyanchor-output-mode="pr">
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
