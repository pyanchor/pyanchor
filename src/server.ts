import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";

import { renderAdminHtml } from "./admin";
import { pyanchorConfig, validateConfig } from "./config";
import { SESSION_COOKIE, requireGateCookie, requireToken } from "./auth";
import { requireAllowedOrigin } from "./origin";
import { tokenBucketMiddleware } from "./rate-limit";
import { createSession, revokeSession } from "./sessions";
import { cancelAiEdit, getAdminHealth, readAiEditState, startAiEdit } from "./state";
import { BUILT_IN_LOCALE_SET } from "./shared/locales";
import type { AiEditCancelInput, AiEditStartInput } from "./shared/types";

validateConfig();

if (pyanchorConfig.fastReload) {
  console.warn(
    "[pyanchor] PYANCHOR_FAST_RELOAD is on — workspace install, build, and " +
      "frontend restart are SKIPPED. This is for `next dev`-served pages only. " +
      "Do NOT enable in production."
  );
}

// Cookie-auth path (POST /api/session) makes /api/edit and /api/cancel
// CSRF-prone from any origin presenting a valid token. SameSite=Strict
// blocks most browser-driven cross-site requests, but defense in depth
// requires the explicit allowlist. Warn loudly so operators don't ship
// the default-empty config alongside the cookie path.
if (pyanchorConfig.allowedOrigins.length === 0) {
  console.warn(
    "[pyanchor] PYANCHOR_ALLOWED_ORIGINS is empty. The cookie session path " +
      "(POST /api/session, used by the in-page bootstrap) accepts /api/edit " +
      "and /api/cancel from any origin presenting a valid token or session " +
      "cookie. Set PYANCHOR_ALLOWED_ORIGINS to a CSV of trusted origins " +
      "(e.g. https://app.example.com,https://stage.example.com) for CSRF " +
      "defense in depth. SameSite=Strict on the cookie blocks the common " +
      "browser cases, but the allowlist is the recommended setup."
  );
}

const app = express();

// Apply the configured trust-proxy preset. Express accepts:
//   "loopback" / "linklocal" / "uniquelocal" — preset CIDRs
//   "true" / "false"                          — all-or-none
//   numeric string                            — hop count
//   CSV of IPs/CIDRs                          — explicit allowlist
const trustProxyValue = pyanchorConfig.trustProxy.toLowerCase();
if (trustProxyValue === "true") {
  app.set("trust proxy", true);
} else if (trustProxyValue === "false") {
  app.set("trust proxy", false);
} else if (/^\d+$/.test(trustProxyValue)) {
  app.set("trust proxy", Number(trustProxyValue));
} else {
  app.set("trust proxy", pyanchorConfig.trustProxy);
}

const runtimeBases = Array.from(new Set([pyanchorConfig.runtimeBasePath, pyanchorConfig.runtimeAliasPath]));

const setNoStore = (response: Response) => {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
};

const handleError = (response: Response, error: unknown, status = 500) => {
  const message = error instanceof Error ? error.message : "Request failed.";
  setNoStore(response);
  response.status(status).json({ error: message });
};

const serveRuntimeAsset = (fileName: string) => (_request: Request, response: Response) => {
  setNoStore(response);
  response.type("application/javascript");
  response.sendFile(path.join(pyanchorConfig.staticDir, fileName));
};

const asyncRoute =
  (handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };

// Per-IP token bucket for write-side endpoints.
// edit: 6/min — bounded since each call kicks off an agent run.
// cancel: 30/min — looser; cancel is cheap but can spam the
// activity log if unbounded.
const editLimiter = tokenBucketMiddleware({ capacity: 6, refillPerSecond: 6 / 60 });
const cancelLimiter = tokenBucketMiddleware({ capacity: 30, refillPerSecond: 30 / 60 });

app.disable("x-powered-by");
app.use(cookieParser());
app.use(express.json({ limit: "128kb" }));

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ─── public: liveness + static runtime bundles ─────────────────────────
app.get("/healthz", (_request, response) => {
  setNoStore(response);
  response.json({ ok: true });
});

// v0.16.0: BUILT_IN_LOCALE_SET imported from `src/shared/locales.ts`
// so this whitelist and the bootstrap auto-inject list can never
// drift (round-11 #1 root cause was the manual duplication; this
// collapses it).

for (const basePath of runtimeBases) {
  // v0.17.0: requireGateCookie sits in front of every static asset
  // too, not just the API. Public anonymous traffic on a gated
  // deployment can't even fetch bootstrap.js — they get a 403 before
  // any sidecar code path runs. No-op when PYANCHOR_REQUIRE_GATE_COOKIE
  // is unset (loopback dev default).
  app.get(`${basePath}/bootstrap.js`, requireGateCookie, serveRuntimeAsset("bootstrap.js"));
  app.get(`${basePath}/overlay.js`, requireGateCookie, serveRuntimeAsset("overlay.js"));
  app.get(`${basePath}/locales/:locale.js`, requireGateCookie, (request: Request, response: Response) => {
    // Whitelist — never sendFile a path component derived from user
    // input without explicit allowlisting. The regex check below is a
    // belt-and-suspenders guard in case the set ever grows to include
    // a value with unsafe characters.
    const raw = request.params.locale;
    const locale = (typeof raw === "string" ? raw : "").toLowerCase();
    if (!BUILT_IN_LOCALE_SET.has(locale) || !/^[a-z][a-z-]*[a-z]$/.test(locale)) {
      response.status(404).end();
      return;
    }
    setNoStore(response);
    response.type("application/javascript");
    response.sendFile(path.join(pyanchorConfig.staticDir, "locales", `${locale}.js`));
  });
}

// ─── authed: runtime + admin API ───────────────────────────────────────
for (const basePath of runtimeBases) {
  // Exchange a Bearer header for an HttpOnly opaque-session cookie.
  //
  // The cookie value is a server-issued random id — NOT the bearer
  // token. validateSession() looks it up in an in-memory map. Cookie
  // theft no longer hands an attacker the master token; revocation is
  // a single Map.delete on the server side.
  //
  // Cookie inherits the request's secure flag (true behind a TLS proxy
  // when `trust proxy` is on, false on plain http://localhost dev).
  app.post(
    `${basePath}/api/session`,
    requireGateCookie,
    requireAllowedOrigin,
    requireToken,
    (request: Request, response: Response) => {
      setNoStore(response);
      const { id, ttlMs } = createSession(SESSION_TTL_MS);
      response.cookie(SESSION_COOKIE, id, {
        httpOnly: true,
        sameSite: "strict",
        secure: request.secure,
        maxAge: ttlMs,
        path: "/"
      });
      response.json({ ok: true, ttlMs });
    }
  );

  // Explicit logout: clear the cookie and drop the server-side session.
  // Idempotent — calling without a cookie is fine.
  app.delete(
    `${basePath}/api/session`,
    requireAllowedOrigin,
    (request: Request, response: Response) => {
      setNoStore(response);
      const cookies = (request as Request & { cookies?: Record<string, unknown> }).cookies;
      const id = cookies?.[SESSION_COOKIE];
      if (typeof id === "string" && id) revokeSession(id);
      response.clearCookie(SESSION_COOKIE, { path: "/" });
      response.json({ ok: true });
    }
  );

  app.get(
    `${basePath}/api/status`,
    requireGateCookie,
    requireToken,
    asyncRoute(async (_request, response) => {
      setNoStore(response);
      response.json(await readAiEditState());
    })
  );

  app.post(
    `${basePath}/api/edit`,
    requireGateCookie,
    requireAllowedOrigin,
    requireToken,
    editLimiter,
    asyncRoute(async (request, response) => {
      setNoStore(response);
      response.json(await startAiEdit(request.body as AiEditStartInput));
    })
  );

  app.post(
    `${basePath}/api/cancel`,
    requireGateCookie,
    requireAllowedOrigin,
    requireToken,
    cancelLimiter,
    asyncRoute(async (request, response) => {
      setNoStore(response);
      response.json(await cancelAiEdit(request.body as AiEditCancelInput));
    })
  );
}

app.get(
  "/api/admin/health",
  requireGateCookie,
  requireToken,
  asyncRoute(async (_request, response) => {
    setNoStore(response);
    response.json(await getAdminHealth());
  })
);

app.get(
  "/api/admin/state",
  requireGateCookie,
  requireToken,
  asyncRoute(async (_request, response) => {
    setNoStore(response);
    response.json(await readAiEditState());
  })
);

app.get(
  "/",
  requireGateCookie,
  requireToken,
  asyncRoute(async (_request, response) => {
    setNoStore(response);
    response.type("html").send(renderAdminHtml(await getAdminHealth(), await readAiEditState()));
  })
);

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  handleError(response, error, 500);
});

app.listen(pyanchorConfig.port, pyanchorConfig.host, () => {
  console.log(`pyanchor sidecar listening on http://${pyanchorConfig.host}:${pyanchorConfig.port}`);
});
