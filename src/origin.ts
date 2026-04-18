import type { NextFunction, Request, Response } from "express";

import { pyanchorConfig } from "./config";

const allowed = new Set(pyanchorConfig.allowedOrigins.map((value) => value.toLowerCase()));
const enforced = allowed.size > 0;

const extractOrigin = (request: Request): string => {
  const origin = request.header("origin")?.trim();
  if (origin) return origin.toLowerCase();

  const referer = request.header("referer")?.trim();
  if (!referer) return "";
  try {
    return new URL(referer).origin.toLowerCase();
  } catch {
    return "";
  }
};

/**
 * Express middleware that, when PYANCHOR_ALLOWED_ORIGINS is configured,
 * rejects requests whose Origin (or Referer) header is not in the allowlist.
 * No-op when the env var is unset, so existing v0.1.0 deployments keep working.
 */
export function requireAllowedOrigin(request: Request, response: Response, next: NextFunction): void {
  if (!enforced) {
    next();
    return;
  }

  const origin = extractOrigin(request);
  if (!origin || !allowed.has(origin)) {
    response.status(403).json({
      error: "Origin not allowed",
      origin: origin || null
    });
    return;
  }

  next();
}
