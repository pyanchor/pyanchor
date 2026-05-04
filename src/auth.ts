import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { pyanchorConfig, REQUIRED_PLACEHOLDER } from "./config";
import { GateJwtError, verifyGateJwt } from "./gate-jwt";
import { validateSession } from "./sessions";

const tokenBytes = (() => {
  const value = pyanchorConfig.token;
  if (!value || value === REQUIRED_PLACEHOLDER) {
    return null;
  }
  return Buffer.from(value, "utf8");
})();

export const isAuthConfigured = tokenBytes !== null;

function safeEqual(provided: string): boolean {
  if (!tokenBytes) return false;
  const providedBuf = Buffer.from(provided, "utf8");
  if (providedBuf.length !== tokenBytes.length) return false;
  return cryptoTimingSafeEqual(providedBuf, tokenBytes);
}

/** Cookie name set by `POST /api/session` and read by requireToken. */
export const SESSION_COOKIE = "pyanchor_session";

/**
 * Express middleware that enforces the production gate cookie when
 * `PYANCHOR_REQUIRE_GATE_COOKIE=true`. Host apps set the named cookie
 * (default `pyanchor_dev`) via their own middleware after some
 * human-gated step (magic-word URL, OAuth, etc.); the sidecar refuses
 * to serve any asset or API until that cookie is present.
 *
 * When `requireGateCookie` is false (the default for loopback dev),
 * this is a no-op pass-through.
 *
 * The check fires BEFORE `requireToken` so anonymous traffic gets a
 * 403 without leaking whether the token was even configured.
 *
 * v0.37.0 — two verification modes:
 *   - **Presence-only** (default; pre-v0.37 behavior): cookie just
 *     needs to be present and non-empty. Accepts any value, including
 *     a forged `=1` from devtools console. This mode is a
 *     discoverability gate, not a real privilege boundary.
 *   - **HMAC** (when `PYANCHOR_GATE_COOKIE_HMAC_SECRET` is set): the
 *     cookie value is verified as an HS256 JWT — see src/gate-jwt.ts.
 *     A forged cookie is rejected with 403; expired cookies are
 *     rejected with 403 + a hint header.
 *
 * Both modes still require the cookie to be present, so the layer-6
 * bootstrap fail-safe (`data-pyanchor-require-gate-cookie`) keeps
 * working unchanged.
 */
export function requireGateCookie(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  if (!pyanchorConfig.requireGateCookie) {
    next();
    return;
  }
  const cookies = (request as Request & { cookies?: Record<string, unknown> }).cookies;
  const value = cookies?.[pyanchorConfig.gateCookieName];
  if (typeof value !== "string" || value.length === 0) {
    response
      .status(403)
      .json({
        error:
          "Production gate cookie missing. The host app must set this cookie before requests reach pyanchor."
      });
    return;
  }

  // HMAC mode: verify JWT signature + expiry. Forged or expired
  // cookies are rejected; presence alone is no longer sufficient.
  const secret = pyanchorConfig.gateCookieHmacSecret;
  if (secret) {
    try {
      verifyGateJwt(value, secret);
    } catch (err) {
      const code = err instanceof GateJwtError ? err.code : "malformed";
      // Don't return the underlying message to the client — it can
      // leak signal about the secret length / canonical-form check.
      // The X-Pyanchor-Gate-Status header is for legit operators
      // tailing logs; avoid relying on it programmatically.
      response.setHeader("X-Pyanchor-Gate-Status", code);
      response.status(403).json({
        error:
          "Production gate cookie invalid. Reissue the cookie via your host app middleware or the sidecar unlock endpoint."
      });
      return;
    }
  }

  next();
}

function extractCookieSessionId(request: Request): string {
  const cookies = (request as Request & { cookies?: Record<string, unknown> }).cookies;
  const cookieValue = cookies?.[SESSION_COOKIE];
  return typeof cookieValue === "string" ? cookieValue.trim() : "";
}

function extractBearerOrQueryToken(request: Request): string {
  const header = request.header("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }

  // Query-string tokens are accepted only when explicitly opted in.
  // They leak via proxy logs / browser history; the header or cookie
  // path is always preferable.
  if (pyanchorConfig.allowQueryToken) {
    const queryToken = request.query.token;
    if (typeof queryToken === "string") {
      return queryToken.trim();
    }
  }

  return "";
}

/**
 * Express middleware that gates a route behind PYANCHOR_TOKEN.
 *
 * Two parallel paths, in priority order:
 *   1. cookie session (since v0.2.7) — cookie holds an opaque session
 *      id minted by POST /api/session, looked up server-side. Cookie
 *      theft does NOT yield the master bearer; revocation is a single
 *      Map.delete.
 *   2. Bearer header / query token — direct timing-safe compare against
 *      PYANCHOR_TOKEN. Same shape as v0.1.0+.
 *
 * Returns 503 if the server was started without a token configured,
 * 401 if neither path validates.
 */
export function requireToken(request: Request, response: Response, next: NextFunction): void {
  if (!isAuthConfigured) {
    response.status(503).json({
      error: "PYANCHOR_TOKEN is not configured. Set the env var and restart pyanchor."
    });
    return;
  }

  // Path 1: cookie session.
  const sessionId = extractCookieSessionId(request);
  if (sessionId && validateSession(sessionId)) {
    next();
    return;
  }

  // Path 2: bearer header / query token.
  const provided = extractBearerOrQueryToken(request);
  if (provided && safeEqual(provided)) {
    next();
    return;
  }

  response.setHeader("WWW-Authenticate", 'Bearer realm="pyanchor"');
  response.status(401).json({ error: "Unauthorized" });
}
