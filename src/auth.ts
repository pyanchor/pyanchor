import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { pyanchorConfig, REQUIRED_PLACEHOLDER } from "./config";

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

function extractToken(request: Request): string {
  const header = request.header("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }

  // cookie-parser augments req.cookies; tolerate its absence in raw tests
  const cookies = (request as Request & { cookies?: Record<string, unknown> }).cookies;
  const cookieValue = cookies?.[SESSION_COOKIE];
  if (typeof cookieValue === "string" && cookieValue.trim()) {
    return cookieValue.trim();
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
 * Returns 503 if the server was started without a token configured,
 * 401 if the request omits or mismatches the token.
 */
export function requireToken(request: Request, response: Response, next: NextFunction): void {
  if (!isAuthConfigured) {
    response.status(503).json({
      error: "PYANCHOR_TOKEN is not configured. Set the env var and restart pyanchor."
    });
    return;
  }

  const provided = extractToken(request);
  if (!provided || !safeEqual(provided)) {
    response.setHeader("WWW-Authenticate", 'Bearer realm="pyanchor"');
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
