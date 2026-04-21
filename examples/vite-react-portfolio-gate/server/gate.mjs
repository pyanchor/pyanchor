/**
 * Vite has no first-party middleware concept like Next.js, so the
 * production-gate-cookie pattern needs a small standalone server.
 *
 * In dev: this runs on port 5174 alongside `vite` on 5173. Point
 * your browser at 5174 — that flow gives you the cookie, then sends
 * you back to 5173 with the cookie set.
 *
 * In prod: replace this with nginx (see comments below). The
 * cookie name + secret read pattern stays the same.
 */

import http from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

const COOKIE_NAME = "pyanchor_dev";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days
const PORT = Number(process.env.PYANCHOR_GATE_PORT ?? 5174);
const VITE_TARGET = process.env.PYANCHOR_VITE_TARGET ?? "http://127.0.0.1:5173";
const SIDECAR_TARGET = process.env.PYANCHOR_SIDECAR_TARGET ?? "http://127.0.0.1:3010";
const SECRET = process.env.PYANCHOR_GATE_SECRET ?? "";

if (!SECRET) {
  console.warn(
    "[gate] PYANCHOR_GATE_SECRET is empty — magic-word URL is disabled. Set it to a long random string."
  );
}

const parseCookies = (header = "") =>
  Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((kv) => {
        const eq = kv.indexOf("=");
        return eq < 0 ? [kv, ""] : [kv.slice(0, eq), kv.slice(eq + 1)];
      })
  );

const proxyTo = (req, res, target) => {
  const url = new URL(req.url ?? "/", target);
  const isHttps = url.protocol === "https:";
  const proxyReq = (isHttps ? httpsRequest : httpRequest)(
    {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: req.method,
      headers: { ...req.headers, host: url.host }
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`upstream unreachable: ${err.message}\n`);
  });
  req.pipe(proxyReq);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const requested = url.searchParams.get("_pyanchor");

  // Magic-word URL handling — set / clear cookie + 302 to the same path.
  // v0.31.2 — round-19 follow-on: cookies are NOT HttpOnly so the
  // bootstrap script tag's `data-pyanchor-require-gate-cookie` fail-safe
  // can read `document.cookie` and confirm the gate before mounting
  // the overlay. The cookie value is just a marker ("1"); the sidecar
  // token (visible in HTML) is the actual privilege boundary, so
  // HttpOnly here adds no security and breaks the layered defense.
  if (requested !== null) {
    url.searchParams.delete("_pyanchor");
    const redirectTo = url.pathname + url.search;
    if (requested === "logout") {
      res.writeHead(302, {
        location: redirectTo,
        "set-cookie": `${COOKIE_NAME}=; Path=/; SameSite=Strict; Max-Age=0`
      });
      res.end();
      return;
    }
    if (SECRET && requested === SECRET) {
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      res.writeHead(302, {
        location: redirectTo,
        "set-cookie":
          `${COOKIE_NAME}=1; Path=/; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_S}${secure}`
      });
      res.end();
      return;
    }
    // Wrong secret → don't hint; just redirect with no cookie change.
    res.writeHead(302, { location: redirectTo });
    res.end();
    return;
  }

  // Pyanchor sidecar passthrough — anonymous traffic falls through
  // to the sidecar's own gate-cookie middleware (when
  // PYANCHOR_REQUIRE_GATE_COOKIE=true), so this proxy doesn't have
  // to enforce auth itself.
  if (url.pathname.startsWith("/_pyanchor/")) {
    proxyTo(req, res, SIDECAR_TARGET);
    return;
  }

  // Everything else → vite dev server (in prod, your built static files).
  proxyTo(req, res, VITE_TARGET);
});

server.listen(PORT, () => {
  console.log(`[gate] listening on http://127.0.0.1:${PORT}`);
  console.log(`[gate] vite target: ${VITE_TARGET}`);
  console.log(`[gate] sidecar target: ${SIDECAR_TARGET}`);
  console.log(`[gate] unlock URL: http://127.0.0.1:${PORT}/?_pyanchor=<your-secret>`);
});

/**
 * Production deployment notes
 * ===========================
 *
 * Replace this script with nginx config:
 *
 * ```nginx
 * server {
 *   listen 443 ssl;
 *   server_name your-portfolio.com;
 *
 *   # Magic-word URL → set HttpOnly cookie + redirect
 *   location ~ ^/(.*)$ {
 *     if ($arg__pyanchor = "<your-secret>") {
 *       add_header Set-Cookie "pyanchor_dev=1; Path=/; SameSite=Strict; Max-Age=2592000; Secure";
 *       return 302 $1;
 *     }
 *     if ($arg__pyanchor = "logout") {
 *       add_header Set-Cookie "pyanchor_dev=; Path=/; SameSite=Strict; Max-Age=0; Secure";
 *       return 302 $1;
 *     }
 *     try_files $uri $uri/ /index.html;
 *   }
 *
 *   location /_pyanchor/ {
 *     proxy_pass http://127.0.0.1:3010;
 *   }
 * }
 * ```
 *
 * The pyanchor sidecar itself enforces the cookie when started
 * with PYANCHOR_REQUIRE_GATE_COOKIE=true (defense in depth).
 */
