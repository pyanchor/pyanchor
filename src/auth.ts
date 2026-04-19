import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { pyanchorConfig, REQUIRED_PLACEHOLDER } from "./config";
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
