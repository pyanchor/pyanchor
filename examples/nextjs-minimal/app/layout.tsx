const devtoolsEnabled = process.env.NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED === "true";
const devtoolsToken = process.env.NEXT_PUBLIC_PYANCHOR_TOKEN ?? "";

export const metadata = {
  title: "pyanchor minimal example"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {devtoolsEnabled && (
          <script
            src="/_pyanchor/bootstrap.js"
            defer
            data-pyanchor-token={devtoolsToken}
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
