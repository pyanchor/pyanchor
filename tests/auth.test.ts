import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

// Required env vars for config validation; auth.ts itself only reads token,
// but importing config triggers its module-level computations.
const baseEnv = {
  PYANCHOR_APP_DIR: "/tmp/pyanchor-app",
  PYANCHOR_RESTART_SCRIPT: "/tmp/pyanchor-restart.sh",
  PYANCHOR_HEALTHCHECK_URL: "http://localhost:3000",
  PYANCHOR_WORKSPACE_DIR: "/tmp/pyanchor-workspace"
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

function makeRequest(opts: {
  authorization?: string;
  queryToken?: string;
  cookies?: Record<string, string>;
} = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.authorization !== undefined) headers.authorization = opts.authorization;

  const req = {
    header(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },
    query: opts.queryToken !== undefined ? { token: opts.queryToken } : {},
    cookies: opts.cookies
  } as unknown as Request;

  return req;
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
  // Restore baseline env so each test starts clean.
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

describe("requireToken", () => {
  it("returns 503 when PYANCHOR_TOKEN is the placeholder (unset)", async () => {
    delete process.env.PYANCHOR_TOKEN;
    const { requireToken } = await import("../src/auth");

    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireToken(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
    expect(res.jsonBody).toMatchObject({ error: expect.stringContaining("PYANCHOR_TOKEN") });
  });

  it("returns 401 when no token is provided", async () => {
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireToken } = await import("../src/auth");

    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(res.headers["WWW-Authenticate"]).toBe('Bearer realm="pyanchor"');
  });

  it("returns 401 when wrong token is provided (header AND query)", async () => {
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireToken } = await import("../src/auth");

    // Wrong header.
    const reqHeader = makeRequest({ authorization: "Bearer wrong-token-value-1234567890ab" });
    const resHeader = makeResponse();
    const nextHeader = vi.fn() as NextFunction;
    requireToken(reqHeader, resHeader, nextHeader);
    expect(resHeader.statusCode).toBe(401);
    expect(nextHeader).not.toHaveBeenCalled();

    // Wrong query string.
    const reqQuery = makeRequest({ queryToken: "wrong-token-value-1234567890ab" });
    const resQuery = makeResponse();
    const nextQuery = vi.fn() as NextFunction;
    requireToken(reqQuery, resQuery, nextQuery);
    expect(resQuery.statusCode).toBe(401);
    expect(nextQuery).not.toHaveBeenCalled();
  });

  it("calls next() when correct token is supplied via Bearer header", async () => {
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireToken } = await import("../src/auth");

    const req = makeRequest({ authorization: "Bearer supersecret-token-value-12345678" });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200); // unchanged
  });

  it("rejects ?token= by default (v0.2.6+; query tokens deprecated)", async () => {
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    delete process.env.PYANCHOR_ALLOW_QUERY_TOKEN;
    const { requireToken } = await import("../src/auth");

    const req = makeRequest({ queryToken: "supersecret-token-value-12345678" });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts ?token= when PYANCHOR_ALLOW_QUERY_TOKEN=true (legacy opt-in)", async () => {
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    process.env.PYANCHOR_ALLOW_QUERY_TOKEN = "true";
    const { requireToken } = await import("../src/auth");

    const req = makeRequest({ queryToken: "supersecret-token-value-12345678" });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() when cookie holds a valid opaque session id (v0.2.7+)", async () => {
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireToken, SESSION_COOKIE } = await import("../src/auth");
    const { createSession } = await import("../src/sessions");

    const { id } = createSession(60_000);

    const req = makeRequest({ cookies: { [SESSION_COOKIE]: id } });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("rejects bearer-shaped value in cookie (v0.2.7 — cookies must be opaque session ids)", async () => {
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireToken, SESSION_COOKIE } = await import("../src/auth");

    // Pre-v0.2.7 the cookie WAS the bearer; v0.2.7 makes that invalid.
    const req = makeRequest({
      cookies: { [SESSION_COOKIE]: "supersecret-token-value-12345678" }
    });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when cookie holds an unknown / made-up id", async () => {
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireToken, SESSION_COOKIE } = await import("../src/auth");

    const req = makeRequest({
      cookies: { [SESSION_COOKIE]: "deadbeef".repeat(8) }
    });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a session that has been revoked", async () => {
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireToken, SESSION_COOKIE } = await import("../src/auth");
    const { createSession, revokeSession } = await import("../src/sessions");

    const { id } = createSession(60_000);
    revokeSession(id);

    const req = makeRequest({ cookies: { [SESSION_COOKIE]: id } });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a wrong-length token (timing-safe compare requires equal lengths)", async () => {
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireToken } = await import("../src/auth");

    // Provide a shorter token. timingSafeEqual would throw on length mismatch
    // if not pre-checked, so this also verifies the length guard.
    const req = makeRequest({ authorization: "Bearer short" });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    expect(() => requireToken(req, res, next)).not.toThrow();
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireGateCookie (v0.17.0 production gating)", () => {
  it("is a no-op pass-through when PYANCHOR_REQUIRE_GATE_COOKIE is unset", async () => {
    delete process.env.PYANCHOR_REQUIRE_GATE_COOKIE;
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireGateCookie } = await import("../src/auth");

    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireGateCookie(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("returns 403 when the gate cookie is enabled but absent", async () => {
    process.env.PYANCHOR_REQUIRE_GATE_COOKIE = "true";
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireGateCookie } = await import("../src/auth");

    const req = makeRequest({ cookies: {} });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireGateCookie(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(res.jsonBody).toMatchObject({ error: expect.stringContaining("gate cookie") });
  });

  it("returns 403 when the cookie value is the empty string", async () => {
    process.env.PYANCHOR_REQUIRE_GATE_COOKIE = "true";
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireGateCookie } = await import("../src/auth");

    const req = makeRequest({ cookies: { pyanchor_dev: "" } });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireGateCookie(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when the named cookie has any non-empty value", async () => {
    process.env.PYANCHOR_REQUIRE_GATE_COOKIE = "true";
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireGateCookie } = await import("../src/auth");

    const req = makeRequest({ cookies: { pyanchor_dev: "1" } });
    const res = makeResponse();
    const next = vi.fn() as NextFunction;

    requireGateCookie(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("respects PYANCHOR_GATE_COOKIE_NAME override", async () => {
    process.env.PYANCHOR_REQUIRE_GATE_COOKIE = "true";
    process.env.PYANCHOR_GATE_COOKIE_NAME = "my_custom_gate";
    process.env.PYANCHOR_TOKEN = "supersecret-token-value-12345678";
    const { requireGateCookie } = await import("../src/auth");

    // Wrong cookie name → still 403.
    const reqWrong = makeRequest({ cookies: { pyanchor_dev: "1" } });
    const resWrong = makeResponse();
    const nextWrong = vi.fn() as NextFunction;
    requireGateCookie(reqWrong, resWrong, nextWrong);
    expect(resWrong.statusCode).toBe(403);
    expect(nextWrong).not.toHaveBeenCalled();

    // Correct custom name → pass.
    const reqRight = makeRequest({ cookies: { my_custom_gate: "1" } });
    const resRight = makeResponse();
    const nextRight = vi.fn() as NextFunction;
    requireGateCookie(reqRight, resRight, nextRight);
    expect(nextRight).toHaveBeenCalledOnce();
  });
});
