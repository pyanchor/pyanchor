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
    const cutoff = Date.now() - 60_000;
    for (const [key, bucket] of buckets) {
      if (bucket.updatedAt < cutoff) buckets.delete(key);
    }
  };

  return (request: Request, response: Response, next: NextFunction) => {
    const key =
      request.ip ??
      request.socket.remoteAddress ??
      (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      "unknown";

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
