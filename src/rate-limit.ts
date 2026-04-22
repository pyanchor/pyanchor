import type { NextFunction, Request, Response } from "express";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

interface TokenBucketOptions {
  /** Max tokens in the bucket. */
  capacity: number;
  /** Tokens added per second (refill rate). */
  refillPerSecond: number;
  /** Maximum number of distinct keys tracked before pruning. */
  maxKeys?: number;
}

/**
 * Returns an Express middleware that enforces a per-IP token-bucket rate
 * limit. State lives in-memory; restart resets the limiter.
 */
export function tokenBucketMiddleware(options: TokenBucketOptions) {
  const { capacity, refillPerSecond, maxKeys = 4096 } = options;
  const buckets = new Map<string, Bucket>();

  const pruneIfFull = () => {
    if (buckets.size <= maxKeys) return;
    // First sweep: remove anything older than 60s.
    const cutoff = Date.now() - 60_000;
    for (const [key, bucket] of buckets) {
      if (bucket.updatedAt < cutoff) buckets.delete(key);
    }
    // v0.33.0 — hard cap. Pre-fix the 60s sweep could leave the
    // map above maxKeys when every bucket was fresh (e.g. an
    // attacker churning forwarded-IP values faster than 60s).
    // Memory pressure could grow unbounded under that pattern.
    // After the time-based sweep, if we're still over, drop the
    // oldest entries until we're back under the cap. Caught by
    // codex static audit.
    if (buckets.size > maxKeys) {
      const sorted = Array.from(buckets.entries()).sort(
        (a, b) => a[1].updatedAt - b[1].updatedAt
      );
      const toDrop = sorted.length - maxKeys;
      for (let i = 0; i < toDrop; i++) {
        const entry = sorted[i];
        if (entry) buckets.delete(entry[0]);
      }
    }
  };

  return (request: Request, response: Response, next: NextFunction) => {
    // Express's req.ip already honours X-Forwarded-For when
    // `app.set('trust proxy', true)` is on (the sidecar sets that in
    // server.ts). Falls back to the raw socket remoteAddress otherwise.
    // We only need an "unknown" sentinel for the rare case both are
    // missing (e.g. unit tests that don't pass a real Request).
    const key = request.ip || request.socket?.remoteAddress || "unknown";

    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };

    const elapsedSeconds = (now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      const retryAfterSeconds = Math.ceil((1 - bucket.tokens) / refillPerSecond);
      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        error: "Too many requests",
        retryAfterSeconds
      });
      buckets.set(key, bucket);
      return;
    }

    bucket.tokens -= 1;
    buckets.set(key, bucket);
    pruneIfFull();
    next();
  };
}
