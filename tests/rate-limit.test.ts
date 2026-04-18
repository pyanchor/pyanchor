import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { tokenBucketMiddleware } from "../src/rate-limit";

interface MockResponse extends Response {
  statusCode: number;
  jsonBody: unknown;
  headers: Record<string, string>;
}

function makeRequest(ip: string): Request {
  return {
    ip,
    socket: { remoteAddress: ip } as unknown as Request["socket"],
    headers: {} as Record<string, string>
  } as unknown as Request;
}

function makeResponse(): MockResponse {
  const state = {
    statusCode: 200,
    jsonBody: undefined as unknown,
    headers: {} as Record<string, string>
  };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get jsonBody() {
      return state.jsonBody;
    },
    get headers() {
      return state.headers;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
      return res;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.jsonBody = body;
      return res;
    }
  } as unknown as MockResponse;
  return res;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tokenBucketMiddleware", () => {
  it("allows the first N requests within capacity", () => {
    const middleware = tokenBucketMiddleware({ capacity: 3, refillPerSecond: 1 });
    const req = makeRequest("10.0.0.1");

    for (let i = 0; i < 3; i++) {
      const res = makeResponse();
      const next = vi.fn() as NextFunction;
      middleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(200);
    }
  });

  it("returns 429 with Retry-After header beyond capacity", () => {
    const middleware = tokenBucketMiddleware({ capacity: 2, refillPerSecond: 1 });
    const req = makeRequest("10.0.0.2");

    // First two requests succeed.
    for (let i = 0; i < 2; i++) {
      const res = makeResponse();
      const next = vi.fn() as NextFunction;
      middleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    }

    // Third request should fail.
    const res = makeResponse();
    const next = vi.fn() as NextFunction;
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBeDefined();
    expect(Number(res.headers["Retry-After"])).toBeGreaterThanOrEqual(1);
    expect(res.jsonBody).toMatchObject({
      error: "Too many requests",
      retryAfterSeconds: expect.any(Number)
    });
  });

  it("refills the bucket over time", () => {
    const middleware = tokenBucketMiddleware({ capacity: 2, refillPerSecond: 1 });
    const req = makeRequest("10.0.0.3");

    // Drain the bucket.
    for (let i = 0; i < 2; i++) {
      const res = makeResponse();
      const next = vi.fn() as NextFunction;
      middleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    }

    // Confirm exhaustion.
    const exhausted = makeResponse();
    const exhaustedNext = vi.fn() as NextFunction;
    middleware(req, exhausted, exhaustedNext);
    expect(exhausted.statusCode).toBe(429);
    expect(exhaustedNext).not.toHaveBeenCalled();

    // Advance time enough to refill at least one token.
    vi.advanceTimersByTime(1500);

    const res = makeResponse();
    const next = vi.fn() as NextFunction;
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("tracks separate buckets per IP", () => {
    const middleware = tokenBucketMiddleware({ capacity: 1, refillPerSecond: 0.1 });
    const reqA = makeRequest("10.0.0.10");
    const reqB = makeRequest("10.0.0.11");

    // IP A consumes its only token.
    const resA1 = makeResponse();
    const nextA1 = vi.fn() as NextFunction;
    middleware(reqA, resA1, nextA1);
    expect(nextA1).toHaveBeenCalledOnce();

    // IP A is now exhausted.
    const resA2 = makeResponse();
    const nextA2 = vi.fn() as NextFunction;
    middleware(reqA, resA2, nextA2);
    expect(resA2.statusCode).toBe(429);
    expect(nextA2).not.toHaveBeenCalled();

    // IP B is unaffected.
    const resB = makeResponse();
    const nextB = vi.fn() as NextFunction;
    middleware(reqB, resB, nextB);
    expect(nextB).toHaveBeenCalledOnce();
    expect(resB.statusCode).toBe(200);
  });
});
