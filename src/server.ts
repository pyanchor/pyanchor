import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";

import { renderAdminHtml } from "./admin";
import { verifyActorHeader } from "./actor";
import { isPyanchorConfigured, pyanchorConfig, validateConfig } from "./config";
import { SESSION_COOKIE, requireGateCookie, requireToken } from "./auth";
import { requireAllowedOrigin } from "./origin";
import { tokenBucketMiddleware } from "./rate-limit";
import { activeSessionCount, createSession, revokeSession } from "./sessions";
import { cancelAiEdit, getAdminHealth, readAiEditState, startAiEdit } from "./state";
import { BUILT_IN_LOCALE_SET } from "./shared/locales";
import type { AiEditCancelInput, AiEditStartInput } from "./shared/types";
import {
  FetchWebhookSink,
  NoopWebhookSink,
  type WebhookFormat,
  type WebhookSink
} from "./webhooks";

// v0.32.7 — clean exit on missing required env. Pre-v0.32.7 the
// throw bubbled to Node's default unhandled-exception printer,
// which wrapped our message in a 10-line stack trace. First-time
// users saw the trace before the actual list of missing vars and
// often assumed pyanchor itself crashed. Now: print just our
// message to stderr and exit(1).
try {
  validateConfig();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

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

// v0.20.0 — webhook sink configured at boot. The worker emits its
// own events via a separate sink; this one only fires on
// `edit_requested` (the API's POV — agent hasn't run yet).
const serverWebhookSink: WebhookSink = pyanchorConfig.webhookEditRequestedUrl
  ? new FetchWebhookSink({
      urls: { edit_requested: pyanchorConfig.webhookEditRequestedUrl },
      formats: {
        edit_requested: pyanchorConfig.webhookEditRequestedFormat as WebhookFormat
      }
    })
  : new NoopWebhookSink();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// v0.29.0 — operator visibility for HMAC actor rejections (round 18
// recommendation 4). Without this, bad signed actor headers were
// silently dropped — fail-soft is right for the request flow, but
// operators lost the signal that "someone is trying to spoof actor
// identities". Now: a per-process counter (surfaced via
// /api/admin/metrics) plus a rate-limited stderr warning so the
// rejection shows up in normal log shipping without flooding under
// a misconfigured client storm.
const actorRejectionCounter: Record<string, number> = Object.create(null);
let lastActorWarnTs = 0;
const ACTOR_WARN_INTERVAL_MS = 60_000; // ≤1 stderr line per minute per process

const recordActorRejection = (reason: string, ip: string | undefined) => {
  actorRejectionCounter[reason] = (actorRejectionCounter[reason] ?? 0) + 1;
  const now = Date.now();
  if (now - lastActorWarnTs >= ACTOR_WARN_INTERVAL_MS) {
    lastActorWarnTs = now;
    console.warn(
      `[pyanchor] X-Pyanchor-Actor signature rejected — reason=${reason} from=${ip ?? "unknown"} ` +
        `total_rejected_since_boot=${JSON.stringify(actorRejectionCounter)}`
    );
  }
};

export const __getActorRejectionCounts = (): Record<string, number> => ({
  ...actorRejectionCounter
});

// ─── public: liveness + readiness + static runtime bundles ────────────
//
// /healthz — liveness. Always 200 if the process is running and able
// to handle a request. Used by container orchestrators to decide when
// to restart the pod / process.
//
// /readyz — readiness. Returns 200 only when isPyanchorConfigured()
// passes (workspace dir + app dir + restart script + agent binary all
// resolvable). 503 otherwise. Used by orchestrators to decide when to
// route traffic to this instance — a sidecar that fails readyz is
// alive but can't actually run an edit yet (e.g. agent CLI install
// in progress, workspace dir not mounted yet).
//
// Both endpoints are intentionally unauthenticated. They expose only
// boolean status and a `ready` flag — no config, no state, no audit.
app.get("/healthz", (_request, response) => {
  setNoStore(response);
  response.json({ ok: true });
});

app.get("/readyz", (_request, response) => {
  setNoStore(response);
  const ready = isPyanchorConfigured();
  response.status(ready ? 200 : 503).json({ ok: ready, ready });
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
      // v0.19.0: passthrough X-Pyanchor-Actor → AiEditStartInput.actor.
      // Caps at 256 chars defensively (large headers waste audit log
      // bytes; agents that want to encode IDs should use short ones).
      //
      // v0.27.0: If PYANCHOR_ACTOR_SIGNING_SECRET is set, the header
      // is treated as `<actor>.<hex-sha256-hmac>` and rejected on
      // mismatch. When unset (default), behavior is unchanged
      // ("unsigned" pass-through). Pyanchor does NOT verify actor
      // identity in either path — the HMAC just binds the audit trail
      // to a key only the host knows, so a leaked pyanchor token
      // can't fabricate audit lines for arbitrary users.
      const rawActor = request.header("x-pyanchor-actor");
      const actorVerification = verifyActorHeader(
        typeof rawActor === "string" ? rawActor : null,
        pyanchorConfig.actorSigningSecret || null
      );
      // v0.29.0: surface rejected signed-actor headers via counter +
      // rate-limited stderr (the edit still proceeds — fail-soft).
      // Empty headers are not rejections; only "rejected" with a
      // non-trivial reason counts as suspicious.
      if (
        actorVerification.kind === "rejected" &&
        actorVerification.reason !== "empty"
      ) {
        recordActorRejection(actorVerification.reason, request.ip);
      }
      const actor =
        actorVerification.kind === "ok" || actorVerification.kind === "unsigned"
          ? actorVerification.actor
          : undefined;
      // v0.32.7 — validate the request body shape BEFORE dispatch.
      // Pre-fix, a missing/non-string `prompt` reached startAiEdit
      // and threw "Cannot read properties of undefined (reading
      // 'trim')" inside an async path → the global error handler
      // turned it into a 500. Caught by codex audit (C11). Now we
      // fail fast with a 400 + a message the caller can act on.
      const body = (request.body ?? {}) as AiEditStartInput;
      if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
        handleError(response, new Error("Field `prompt` is required and must be a non-empty string."), 400);
        return;
      }
      if (body.targetPath !== undefined && typeof body.targetPath !== "string") {
        handleError(response, new Error("Field `targetPath`, if provided, must be a string."), 400);
        return;
      }
      if (body.mode !== undefined && body.mode !== "edit" && body.mode !== "chat") {
        handleError(response, new Error('Field `mode`, if provided, must be "edit" or "chat".'), 400);
        return;
      }
      const result = await startAiEdit({
        ...body,
        ...(actor !== undefined ? { actor } : {})
      });
      // v0.20.0: notify the configured edit_requested webhook. Fire
      // and forget — never block the API response on the dispatch.
      void serverWebhookSink.emit("edit_requested", {
        event: "edit_requested",
        ts: new Date().toISOString(),
        run_id: result.jobId ?? "",
        ...(actor ? { actor } : {}),
        target_path: body.targetPath,
        mode: body.mode === "chat" ? "chat" : "edit",
        agent: pyanchorConfig.agent,
        origin: request.header("origin") ?? undefined
      });
      response.json(result);
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

// v0.23.1 — operator visibility. Cheap in-process aggregations only;
// historical aggregations from audit log come in a future minor as
// an opt-in `?include=audit` query (parsing JSONL on every request
// is expensive). Adoption-window value: operator can see queue
// pressure + active sessions + recent outcome counts at a glance
// without grepping state.json.
const SERVER_STARTED_AT = new Date().toISOString();
app.get(
  "/api/admin/metrics",
  requireGateCookie,
  requireToken,
  asyncRoute(async (_request, response) => {
    setNoStore(response);
    const state = await readAiEditState();
    // Tally outcomes from recent messages (last 50 of state.messages).
    // Bounded so the endpoint stays cheap regardless of history size.
    const recent = state.messages.slice(-50);
    const outcomeCounts = recent.reduce<Record<string, number>>((acc, msg) => {
      const key = msg.status ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    response.json({
      ts: new Date().toISOString(),
      serverStartedAt: SERVER_STARTED_AT,
      version: process.env.npm_package_version ?? null,
      queue: {
        depth: state.queue.length,
        // Position of the oldest queued item's enqueue timestamp,
        // useful to spot a stuck queue.
        oldestEnqueuedAt: state.queue[0]?.enqueuedAt ?? null
      },
      currentJob: {
        status: state.status,
        jobId: state.jobId,
        mode: state.mode,
        targetPath: state.targetPath || null,
        startedAt: state.startedAt
      },
      sessions: {
        activeCount: activeSessionCount()
      },
      recentMessages: {
        sampleSize: recent.length,
        byStatus: outcomeCounts
      },
      // v0.29.0 — HMAC actor signing rejections since process boot.
      // Empty object when signing is off or no rejections seen.
      actorRejections: { ...actorRejectionCounter }
    });
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

// v0.32.4 — keep the event loop reffed via an explicit no-op
// interval. Pre-v0.32.4, when this file was spawned directly by
// systemd (ExecStart=/usr/bin/node .../server.cjs) — i.e. NOT as
// a cli.cjs child — the process exited code=0/SUCCESS within ~1s
// of "listening", with no errors and no SIGTERM. systemd reported
// "Deactivated successfully" and Restart=on-failure was a no-op
// (the exit code was 0). Direct `npx pyanchor` (cli.cjs spawning
// server.cjs with stdio "inherit") never showed the bug because
// the inherited stdio kept enough refs alive that the GC didn't
// race the boot path.
//
// Empirically: capturing `app.listen()` into a module-level const
// (or even an `export const`) was NOT enough to keep the listening
// socket reffed under Node v20 + Express 5 + the v0.32.0 module
// import set. The setInterval below is the only thing that reliably
// holds the loop open — costs ~negligible, runs nothing, never
// fires user code.
//
// If we ever figure out *why* `app.listen` doesn't keep its own
// socket reffed in this configuration we can drop this.
const __pyanchorHttpServer = app.listen(pyanchorConfig.port, pyanchorConfig.host, () => {
  console.log(`pyanchor sidecar listening on http://${pyanchorConfig.host}:${pyanchorConfig.port}`);
});
const __pyanchorEventLoopAnchor = setInterval(() => {
  /* deliberately empty — the timer existing is the point */
}, 60_000);
// v0.32.4 graceful shutdown — handle SIGTERM (systemctl stop) and
// SIGINT (Ctrl+C) by closing the listening socket and clearing the
// loop anchor, then exiting. Critically: registering ANY listener for
// SIGTERM disables Node's default action (exit), so this listener
// MUST call process.exit itself — otherwise the sidecar hangs after
// `systemctl stop` (caught when test isolation between sequential
// spawns failed because the prior sidecar wasn't actually dying).
const __shutdown = (signal: NodeJS.Signals) => {
  clearInterval(__pyanchorEventLoopAnchor);
  // close() is async — but we don't wait. The OS will reclaim the
  // socket when process.exit fires. close() just stops accepting
  // new connections in the meantime.
  __pyanchorHttpServer.close();
  // 128 + signal number is the conventional exit code for signal-
  // initiated termination, but systemd is happy with 0 here too
  // since the listener fired (treated as graceful, not "failed").
  process.exit(signal === "SIGTERM" ? 0 : 130);
};
process.once("SIGTERM", __shutdown);
process.once("SIGINT", __shutdown);
