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

function extractToken(request: Request): string {
  const header = request.header("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }

  const queryToken = request.query.token;
  if (typeof queryToken === "string") {
    return queryToken.trim();
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
