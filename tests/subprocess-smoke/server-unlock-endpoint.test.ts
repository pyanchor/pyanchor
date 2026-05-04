/**
 * Subprocess smoke for the v0.37.0 sidecar unlock endpoint.
 *
 * Boots dist/server.cjs with PYANCHOR_UNLOCK_SECRET +
 * PYANCHOR_GATE_COOKIE_HMAC_SECRET set and asserts:
 *
 *   - Wrong / missing secret → 404 (don't leak existence)
 *   - Right secret → 302 to "/" + Set-Cookie containing a valid
 *     HS256 JWT (3-part dot-encoded)
 *   - Issued cookie passes the requireGateCookie HMAC check on a
 *     subsequent request
 *   - Endpoint is NOT registered when either secret env is unset
 *     (returns 404 — falls through to express's default handler)
 *   - PYANCHOR_UNLOCK_PATH override is honored
 *
 * Same spawn pattern as server-readyz.test.ts. Sequential PORT
 * counter prevents EADDRINUSE races.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const serverScript = path.resolve(process.cwd(), "dist", "server.cjs");

if (!existsSync(serverScript)) {
  throw new Error(
    `[subprocess-smoke] dist/server.cjs missing at ${serverScript}. ` +
      `Run \`pnpm build\` first.`
  );
}

let __portCounter = 19200;
const allocPort = () => __portCounter++;
let PORT = allocPort();
let BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "unlock-smoke-token-32-chars-1234567890";
const HMAC_SECRET = "unlock-smoke-hmac-secret-deadbeef-deadbeef-deadbeef-deadbeef";
const UNLOCK_SECRET = "unlock-smoke-magic-word-cafebabe-cafebabe-cafebabe-cafe";
const GATE_COOKIE_NAME = "pyanchor_dev";
const WORKSPACE = "/tmp/pyanchor-unlock-smoke-workspace";
const APP_DIR = "/tmp/pyanchor-unlock-smoke-app";
const RESTART_SCRIPT = "/tmp/pyanchor-unlock-smoke-restart.sh";

mkdirSync(WORKSPACE, { recursive: true });
mkdirSync(APP_DIR, { recursive: true });
writeFileSync(RESTART_SCRIPT, "#!/usr/bin/env bash\nexit 0\n", "utf8");
chmodSync(RESTART_SCRIPT, 0o755);

let serverProcess: ChildProcess | null = null;

const waitForLive = async (timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return;
    } catch {
      // booting
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`server did not boot within ${timeoutMs}ms`);
};

const startServer = async (extraEnv: Record<string, string> = {}) => {
  PORT = allocPort();
  BASE = `http://127.0.0.1:${PORT}`;
  serverProcess = spawn("node", [serverScript], {
    env: {
      ...process.env,
      PYANCHOR_TOKEN: TOKEN,
      PYANCHOR_PORT: String(PORT),
      PYANCHOR_WORKSPACE_DIR: WORKSPACE,
      PYANCHOR_APP_DIR: APP_DIR,
      PYANCHOR_AGENT: "claude-code",
      PYANCHOR_RESTART_SCRIPT: RESTART_SCRIPT,
      PYANCHOR_HEALTHCHECK_URL: `${BASE}/healthz`,
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForLive();
};

afterEach(async () => {
  if (serverProcess && !serverProcess.killed) {
    const exited = new Promise<void>((resolve) => {
      serverProcess!.once("exit", () => resolve());
      setTimeout(() => resolve(), 2000);
    });
    serverProcess.kill("SIGTERM");
    await exited;
  }
  serverProcess = null;
});

describe("/_pyanchor/unlock — endpoint registration gating (v0.37.0)", () => {
  it("returns 404 when PYANCHOR_UNLOCK_SECRET is unset (endpoint not registered)", async () => {
    await startServer({
      PYANCHOR_GATE_COOKIE_HMAC_SECRET: HMAC_SECRET
      // PYANCHOR_UNLOCK_SECRET intentionally unset
    });
    const r = await fetch(`${BASE}/_pyanchor/unlock?secret=${UNLOCK_SECRET}`, {
      redirect: "manual"
    });
    expect(r.status).toBe(404);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("returns 404 when PYANCHOR_GATE_COOKIE_HMAC_SECRET is unset (refuses to issue unsigned cookies)", async () => {
    await startServer({
      PYANCHOR_UNLOCK_SECRET: UNLOCK_SECRET
      // PYANCHOR_GATE_COOKIE_HMAC_SECRET intentionally unset
    });
    const r = await fetch(`${BASE}/_pyanchor/unlock?secret=${UNLOCK_SECRET}`, {
      redirect: "manual"
    });
    expect(r.status).toBe(404);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
});

describe("/_pyanchor/unlock — input validation (v0.37.0)", () => {
  it("returns 404 with no `secret` query param", async () => {
    await startServer({
      PYANCHOR_UNLOCK_SECRET: UNLOCK_SECRET,
      PYANCHOR_GATE_COOKIE_HMAC_SECRET: HMAC_SECRET
    });
    const r = await fetch(`${BASE}/_pyanchor/unlock`, { redirect: "manual" });
    expect(r.status).toBe(404);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("returns 404 with empty `secret` query param", async () => {
    await startServer({
      PYANCHOR_UNLOCK_SECRET: UNLOCK_SECRET,
      PYANCHOR_GATE_COOKIE_HMAC_SECRET: HMAC_SECRET
    });
    const r = await fetch(`${BASE}/_pyanchor/unlock?secret=`, { redirect: "manual" });
    expect(r.status).toBe(404);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("returns 404 with wrong `secret` (don't leak existence)", async () => {
    await startServer({
      PYANCHOR_UNLOCK_SECRET: UNLOCK_SECRET,
      PYANCHOR_GATE_COOKIE_HMAC_SECRET: HMAC_SECRET
    });
    const r = await fetch(`${BASE}/_pyanchor/unlock?secret=wrongvalue`, {
      redirect: "manual"
    });
    expect(r.status).toBe(404);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
});

describe("/_pyanchor/unlock — happy path (v0.37.0)", () => {
  it("issues a 302 + JWT Set-Cookie when the secret matches", async () => {
    await startServer({
      PYANCHOR_UNLOCK_SECRET: UNLOCK_SECRET,
      PYANCHOR_GATE_COOKIE_HMAC_SECRET: HMAC_SECRET
    });
    const r = await fetch(`${BASE}/_pyanchor/unlock?secret=${UNLOCK_SECRET}`, {
      redirect: "manual"
    });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/");

    const setCookie = r.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    // Cookie shape: <name>=<3-part-jwt>; Path=/; SameSite=Strict; Max-Age=...
    expect(setCookie).toMatch(new RegExp(`^${GATE_COOKIE_NAME}=`));
    const valuePart = setCookie!.split(";")[0].split("=").slice(1).join("=");
    expect(valuePart.split(".")).toHaveLength(3);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Max-Age=\d+/);
  });

  it("the issued cookie subsequently passes requireGateCookie", async () => {
    await startServer({
      PYANCHOR_UNLOCK_SECRET: UNLOCK_SECRET,
      PYANCHOR_GATE_COOKIE_HMAC_SECRET: HMAC_SECRET,
      PYANCHOR_REQUIRE_GATE_COOKIE: "true"
    });

    // Step 1: hit unlock, capture the cookie value.
    const unlockResp = await fetch(`${BASE}/_pyanchor/unlock?secret=${UNLOCK_SECRET}`, {
      redirect: "manual"
    });
    expect(unlockResp.status).toBe(302);
    const setCookie = unlockResp.headers.get("set-cookie")!;
    const jwtCookie = setCookie.split(";")[0]; // "<name>=<jwt>"

    // Step 2: hit a gated endpoint with that cookie. /_pyanchor/bootstrap.js
    // is the simplest gate-cookie-protected GET — no token check, just gate.
    const bootstrapResp = await fetch(`${BASE}/_pyanchor/bootstrap.js`, {
      headers: { cookie: jwtCookie }
    });
    expect(bootstrapResp.status).toBe(200);

    // Step 3: confirm the same path WITHOUT the cookie returns 403,
    // i.e. the cookie was the thing that gated us in.
    const bootstrapNoCookie = await fetch(`${BASE}/_pyanchor/bootstrap.js`);
    expect(bootstrapNoCookie.status).toBe(403);

    // Step 4: confirm a forged "=1" cookie still returns 403 (HMAC
    // mode doesn't accept the legacy presence-only marker).
    const bootstrapForged = await fetch(`${BASE}/_pyanchor/bootstrap.js`, {
      headers: { cookie: `${GATE_COOKIE_NAME}=1` }
    });
    expect(bootstrapForged.status).toBe(403);
  });

  it("honors PYANCHOR_UNLOCK_PATH override", async () => {
    await startServer({
      PYANCHOR_UNLOCK_SECRET: UNLOCK_SECRET,
      PYANCHOR_GATE_COOKIE_HMAC_SECRET: HMAC_SECRET,
      PYANCHOR_UNLOCK_PATH: "/_pyanchor/custom-magic-path"
    });

    // Default path should NOT be registered when overridden.
    const defaultResp = await fetch(
      `${BASE}/_pyanchor/unlock?secret=${UNLOCK_SECRET}`,
      { redirect: "manual" }
    );
    expect(defaultResp.status).toBe(404);

    // Custom path responds correctly.
    const customResp = await fetch(
      `${BASE}/_pyanchor/custom-magic-path?secret=${UNLOCK_SECRET}`,
      { redirect: "manual" }
    );
    expect(customResp.status).toBe(302);
    expect(customResp.headers.get("set-cookie")).toBeTruthy();
  });
});
