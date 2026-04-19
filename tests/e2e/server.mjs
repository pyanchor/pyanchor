// Minimal static server for Playwright e2e tests.
// Serves the built overlay bundle + a fixture HTML page with the
// Pyanchor config inlined. API routes (/api/*) are NOT served here —
// each test mocks them via Playwright's page.route() so the suite
// doesn't need a real sidecar.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const overlayBundle = readFileSync(path.join(repoRoot, "dist", "public", "overlay.js"));
const bootstrapBundle = readFileSync(path.join(repoRoot, "dist", "public", "bootstrap.js"));

const fixtureHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Pyanchor e2e fixture</title>
    <script>
      window.__PyanchorConfig = {
        baseUrl: "/_pyanchor",
        token: "e2e-test-token-32-chars-1234567890"
      };
    </script>
  </head>
  <body>
    <h1 id="page-heading">Pyanchor e2e fixture</h1>
    <p>The overlay should mount in a Shadow DOM under #pyanchor-overlay-root.</p>
    <script src="/_pyanchor/overlay.js"></script>
  </body>
</html>`;

const server = createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400).end();
    return;
  }

  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fixtureHtml);
    return;
  }

  if (req.url === "/_pyanchor/overlay.js") {
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    res.end(overlayBundle);
    return;
  }

  if (req.url === "/_pyanchor/bootstrap.js") {
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    res.end(bootstrapBundle);
    return;
  }

  // /_pyanchor/api/* lands here when a test forgot to install a route mock —
  // return 500 so the test failure is visible rather than hanging on a poll.
  res.writeHead(500, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: `e2e fixture missing mock for ${req.url}` }));
});

const port = Number(process.env.PYANCHOR_E2E_PORT ?? 4173);
server.listen(port, () => {
  console.log(`[e2e] fixture server listening on http://127.0.0.1:${port}`);
});
