import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";

import { renderAdminHtml } from "./admin";
import { pyanchorConfig, validateConfig } from "./config";
import { SESSION_COOKIE, requireToken } from "./auth";
import { requireAllowedOrigin } from "./origin";
import { tokenBucketMiddleware } from "./rate-limit";
import { cancelAiEdit, getAdminHealth, readAiEditState, startAiEdit } from "./state";
import type { AiEditCancelInput, AiEditStartInput } from "./shared/types";

validateConfig();

if (pyanchorConfig.fastReload) {
  console.warn(
    "[pyanchor] PYANCHOR_FAST_RELOAD is on — workspace install, build, and " +
      "frontend restart are SKIPPED. This is for `next dev`-served pages only. " +
      "Do NOT enable in production."
  );
}

const app = express();
app.set("trust proxy", true);

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

// Per-IP token bucket for write-side endpoints (edit/cancel).
// 6 requests per minute, burst up to 6.
const editLimiter = tokenBucketMiddleware({ capacity: 6, refillPerSecond: 6 / 60 });

app.disable("x-powered-by");
app.use(cookieParser());
app.use(express.json({ limit: "128kb" }));

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ─── public: liveness + static runtime bundles ─────────────────────────
app.get("/healthz", (_request, response) => {
  setNoStore(response);
  response.json({ ok: true });
});

for (const basePath of runtimeBases) {
  app.get(`${basePath}/bootstrap.js`, serveRuntimeAsset("bootstrap.js"));
  app.get(`${basePath}/overlay.js`, serveRuntimeAsset("overlay.js"));
}

// ─── authed: runtime + admin API ───────────────────────────────────────
for (const basePath of runtimeBases) {
  // Exchange a Bearer header for an HttpOnly session cookie.
  // Cookie inherits the request's secure flag (true behind a TLS proxy
  // when `trust proxy` is on, false on plain http://localhost dev).
  app.post(
    `${basePath}/api/session`,
    requireAllowedOrigin,
    requireToken,
    (request: Request, response: Response) => {
      setNoStore(response);
      response.cookie(SESSION_COOKIE, pyanchorConfig.token, {
        httpOnly: true,
        sameSite: "strict",
        secure: request.secure,
        maxAge: SESSION_TTL_MS,
        path: "/"
      });
      response.json({ ok: true, ttlMs: SESSION_TTL_MS });
    }
  );

  app.get(
    `${basePath}/api/status`,
    requireToken,
    asyncRoute(async (_request, response) => {
      setNoStore(response);
      response.json(await readAiEditState());
    })
  );

  app.post(
    `${basePath}/api/edit`,
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
    requireAllowedOrigin,
    requireToken,
    asyncRoute(async (request, response) => {
      setNoStore(response);
      response.json(await cancelAiEdit(request.body as AiEditCancelInput));
    })
  );
}

app.get(
  "/api/admin/health",
  requireToken,
  asyncRoute(async (_request, response) => {
    setNoStore(response);
    response.json(await getAdminHealth());
  })
);

app.get(
  "/api/admin/state",
  requireToken,
  asyncRoute(async (_request, response) => {
    setNoStore(response);
    response.json(await readAiEditState());
  })
);

app.get(
  "/",
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
