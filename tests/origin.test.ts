import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const baseEnv = {
  PYANCHOR_APP_DIR: "/tmp/pyanchor-app",
  PYANCHOR_RESTART_SCRIPT: "/tmp/pyanchor-restart.sh",
  PYANCHOR_HEALTHCHECK_URL: "http://localhost:3000",
  PYANCHOR_WORKSPACE_DIR: "/tmp/pyanchor-workspace",
  PYANCHOR_TOKEN: "supersecret-token-value-12345678"
};

const originalEnv = { ...process.env };

function applyBaseEnv(): void {
  for (const [key, value] of Object.entries(baseEnv)) {
    process.env[key] = value;
  }
}

interface MockResponse extends Response {
  statusCode: number;
  jsonBody: unknown;
  headers: Record<string, string>;
}

function makeRequest(opts: { origin?: string; referer?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.origin !== undefined) headers.origin = opts.origin;
  if (opts.referer !== undefined) headers.referer = opts.referer;

  return {
    header(name: string): string | undefined {
      return headers[name.toLowerCase()];
    }
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
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v as string;
  }
  applyBaseEnv();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v as string;
  }
});

describe("requireAllowedOrigin", () => {
  it("is a no-op (calls next) when PYANCHOR_ALLOWED_ORIGINS is empty", async () => {
    delete process.env.PYANCHOR_ALLOWED_ORIGINS;
    const { requireAllowedOrigin } = await import("../src/origin");

    const req = makeRequest({ origin: "https://evil.example.com" });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireAllowedOrigin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("returns 403 when Origin header is missing and allowlist is non-empty", async () => {
    process.env.PYANCHOR_ALLOWED_ORIGINS = "https://app.example.com";
    const { requireAllowedOrigin } = await import("../src/origin");

    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireAllowedOrigin(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(res.jsonBody).toMatchObject({ error: "Origin not allowed", origin: null });
  });

  it("returns 403 when Origin header doesn't match allowlist", async () => {
    process.env.PYANCHOR_ALLOWED_ORIGINS = "https://app.example.com";
    const { requireAllowedOrigin } = await import("../src/origin");

    const req = makeRequest({ origin: "https://evil.example.com" });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireAllowedOrigin(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(res.jsonBody).toMatchObject({ origin: "https://evil.example.com" });
  });

  it("calls next when Origin matches (case-insensitive)", async () => {
    process.env.PYANCHOR_ALLOWED_ORIGINS = "https://app.example.com";
    const { requireAllowedOrigin } = await import("../src/origin");

    const req = makeRequest({ origin: "HTTPS://APP.EXAMPLE.COM" });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireAllowedOrigin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("falls back to Referer when Origin header is missing", async () => {
    process.env.PYANCHOR_ALLOWED_ORIGINS = "https://app.example.com";
    const { requireAllowedOrigin } = await import("../src/origin");

    const req = makeRequest({ referer: "https://app.example.com/some/path?x=1" });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireAllowedOrigin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });
});
