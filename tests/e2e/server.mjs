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

// Fast-path fixture: loads overlay.js directly with __PyanchorConfig
// inlined. Skips the bootstrap → session → token-blanking flow so
// mount / polling / templates can be smoke-tested in isolation.
const overlayDirectHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Pyanchor e2e fixture (overlay-direct)</title>
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

// Bootstrap-full-path fixture: loads bootstrap.js the way a real
// host page would. The bootstrap script reads data-pyanchor-token,
// runs the trusted-host check, calls /api/session, blanks the
// in-memory token on a 2xx, and lazy-loads overlay.js. Used by the
// v0.7.4 token-surface e2e test to verify the cookie-only path
// engages end-to-end in a real browser.
const bootstrapHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Pyanchor e2e fixture (bootstrap)</title>
  </head>
  <body>
    <h1 id="page-heading">Pyanchor e2e fixture (bootstrap path)</h1>
    <script
      src="/_pyanchor/bootstrap.js"
      defer
      data-pyanchor-token="e2e-test-token-32-chars-1234567890"
      data-pyanchor-trusted-hosts="127.0.0.1,localhost"
    ></script>
  </body>
</html>`;

// Korean-locale fixture: same as the overlay-direct fixture but
// pre-seeds __PyanchorConfig.locale = "ko" so the built-in Korean
// bundle (v0.9.4) activates. Used by the i18n e2e test to prove
// the bundle resolves end-to-end in a real browser, not just unit.
const koLocaleHtml = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>Pyanchor e2e fixture (ko locale)</title>
    <script>
      window.__PyanchorConfig = {
        baseUrl: "/_pyanchor",
        token: "e2e-test-token-32-chars-1234567890",
        locale: "ko"
      };
    </script>
  </head>
  <body>
    <h1 id="page-heading">Korean locale fixture</h1>
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
    res.end(overlayDirectHtml);
    return;
  }

  if (req.url === "/bootstrap.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(bootstrapHtml);
    return;
  }

  if (req.url === "/ko.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(koLocaleHtml);
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
