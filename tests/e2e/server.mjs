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
const localeBundles = {
  ko: readFileSync(path.join(repoRoot, "dist", "public", "locales", "ko.js")),
  ja: readFileSync(path.join(repoRoot, "dist", "public", "locales", "ja.js")),
  "zh-cn": readFileSync(path.join(repoRoot, "dist", "public", "locales", "zh-cn.js")),
  es: readFileSync(path.join(repoRoot, "dist", "public", "locales", "es.js")),
  de: readFileSync(path.join(repoRoot, "dist", "public", "locales", "de.js")),
  fr: readFileSync(path.join(repoRoot, "dist", "public", "locales", "fr.js")),
  "pt-br": readFileSync(path.join(repoRoot, "dist", "public", "locales", "pt-br.js")),
  vi: readFileSync(path.join(repoRoot, "dist", "public", "locales", "vi.js")),
  id: readFileSync(path.join(repoRoot, "dist", "public", "locales", "id.js")),
  ru: readFileSync(path.join(repoRoot, "dist", "public", "locales", "ru.js")),
  hi: readFileSync(path.join(repoRoot, "dist", "public", "locales", "hi.js")),
  th: readFileSync(path.join(repoRoot, "dist", "public", "locales", "th.js"))
};

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

// v0.11.0 — locale bundles ship as separate IIFE files. Fixtures
// that bypass bootstrap need to load the locale script BEFORE the
// overlay script (both deferred so the queue gets populated in time).
const buildLocaleFixture = (locale, label) => `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <title>Pyanchor e2e fixture (${locale} locale)</title>
    <script>
      window.__PyanchorConfig = {
        baseUrl: "/_pyanchor",
        token: "e2e-test-token-32-chars-1234567890",
        locale: "${locale}"
      };
    </script>
    <script src="/_pyanchor/locales/${locale}.js" defer></script>
    <script src="/_pyanchor/overlay.js" defer></script>
  </head>
  <body>
    <h1 id="page-heading">${label} locale fixture</h1>
  </body>
</html>`;

const koLocaleHtml = buildLocaleFixture("ko", "Korean");
const jaLocaleHtml = buildLocaleFixture("ja", "Japanese");
const zhLocaleHtml = buildLocaleFixture("zh-cn", "Simplified Chinese");
const esLocaleHtml = buildLocaleFixture("es", "Spanish");
const deLocaleHtml = buildLocaleFixture("de", "German");
const frLocaleHtml = buildLocaleFixture("fr", "French");
const ptBRLocaleHtml = buildLocaleFixture("pt-br", "Brazilian Portuguese");
const viLocaleHtml = buildLocaleFixture("vi", "Vietnamese");
const idLocaleHtml = buildLocaleFixture("id", "Indonesian");
const ruLocaleHtml = buildLocaleFixture("ru", "Russian");
const hiLocaleHtml = buildLocaleFixture("hi", "Hindi");
const thLocaleHtml = buildLocaleFixture("th", "Thai");

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

  if (req.url === "/ja.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(jaLocaleHtml);
    return;
  }

  if (req.url === "/zh.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(zhLocaleHtml);
    return;
  }

  // v0.12.0 — additional Latin/SE-Asian locales
  if (req.url === "/es.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(esLocaleHtml);
    return;
  }

  if (req.url === "/de.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(deLocaleHtml);
    return;
  }

  if (req.url === "/fr.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(frLocaleHtml);
    return;
  }

  if (req.url === "/pt.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(ptBRLocaleHtml);
    return;
  }

  if (req.url === "/vi.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(viLocaleHtml);
    return;
  }

  if (req.url === "/id.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(idLocaleHtml);
    return;
  }

  // v0.13.0 — Slavic / Indic / SE-Asian additions
  if (req.url === "/ru.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(ruLocaleHtml);
    return;
  }

  if (req.url === "/hi.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(hiLocaleHtml);
    return;
  }

  if (req.url === "/th.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(thLocaleHtml);
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

  // v0.11.0 — locale bundles (ko, ja, zh-cn)
  const localeMatch = req.url.match(/^\/_pyanchor\/locales\/([a-z\-]+)\.js$/);
  if (localeMatch) {
    const bundle = localeBundles[localeMatch[1]];
    if (bundle) {
      res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
      res.end(bundle);
      return;
    }
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
