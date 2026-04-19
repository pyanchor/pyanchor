/**
 * Subprocess smoke for the v0.17.0 production gate cookie.
 *
 * Boots the actual built `dist/server.cjs` with
 * `PYANCHOR_REQUIRE_GATE_COOKIE=true` and verifies:
 *   - All static + API routes 403 when the cookie is absent.
 *   - The same routes pass the gate (and proceed to the next
 *     middleware, which may then 401 / 200 depending on auth) when
 *     the cookie is present.
 *
 * Locks the contract documented in `docs/SECURITY.md` "Deployment
 * recipe B" so a future server-side change can't accidentally
 * remove the gate from one route while leaving it on others.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const serverScript = path.resolve(process.cwd(), "dist", "server.cjs");

if (!existsSync(serverScript)) {
  throw new Error(
    `[subprocess-smoke] dist/server.cjs missing at ${serverScript}. ` +
      `Run \`pnpm build\` first (or invoke \`pnpm test\` which builds + tests).`
  );
}

const PORT = 18902;
const BASE_URL = `http://127.0.0.1:${PORT}/_pyanchor`;
const WORKSPACE = "/tmp/pyanchor-gate-smoke";

mkdirSync(WORKSPACE, { recursive: true });

let serverProcess: ChildProcess | null = null;

const waitForReady = async (timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (response.ok) return;
    } catch {
      // Server still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`server did not become ready on port ${PORT} within ${timeoutMs}ms`);
};

beforeEach(async () => {
  serverProcess = spawn("node", [serverScript], {
    env: {
      ...process.env,
      PYANCHOR_TOKEN: "gate-smoke-token-32-chars-1234567890",
      PYANCHOR_PORT: String(PORT),
      PYANCHOR_WORKSPACE_DIR: WORKSPACE,
      PYANCHOR_APP_DIR: WORKSPACE,
      PYANCHOR_AGENT: "openclaw",
      PYANCHOR_RESTART_SCRIPT: "/bin/true",
      PYANCHOR_HEALTHCHECK_URL: `http://127.0.0.1:${PORT}/healthz`,
      // The actual feature under test:
      PYANCHOR_REQUIRE_GATE_COOKIE: "true",
      PYANCHOR_GATE_COOKIE_NAME: "pyanchor_dev"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForReady();
});

afterEach(() => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }
  serverProcess = null;
});

describe("PYANCHOR_REQUIRE_GATE_COOKIE end-to-end (v0.17.0)", () => {
  // Routes that should return 403 to anonymous traffic when the gate
  // is on. Static routes return 403 directly; API routes get the same
  // 403 *before* token check runs (so anonymous traffic can't even
  // probe whether the token is configured).
  const GATED_ROUTES = [
    "/bootstrap.js",
    "/overlay.js",
    "/locales/ko.js",
    "/locales/en.js", // even unknown locale codes — gate fires first
    "/api/status"
  ];

  it.each(GATED_ROUTES)("rejects anonymous %s with 403", async (suffix) => {
    const response = await fetch(`${BASE_URL}${suffix}`);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain("gate cookie");
  });

  it("allows /bootstrap.js with the gate cookie present", async () => {
    const response = await fetch(`${BASE_URL}/bootstrap.js`, {
      headers: { cookie: "pyanchor_dev=1" }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/javascript/);
  });

  it("allows /locales/ko.js with the gate cookie present", async () => {
    const response = await fetch(`${BASE_URL}/locales/ko.js`, {
      headers: { cookie: "pyanchor_dev=1" }
    });
    expect(response.status).toBe(200);
  });

  it("with cookie present, unknown locale falls through to its 404 (not 403)", async () => {
    // After the gate passes, the locale whitelist takes over. Unknown
    // locale → 404, NOT a generic 403 — verifies the two checks are
    // wired in the correct order.
    const response = await fetch(`${BASE_URL}/locales/klingon.js`, {
      headers: { cookie: "pyanchor_dev=1" }
    });
    expect(response.status).toBe(404);
  });

  it("with cookie present but no auth, /api/status → 401 (not 403)", async () => {
    // Verifies requireGateCookie runs BEFORE requireToken: gate passes,
    // then requireToken fires and returns 401. If the order were
    // reversed, we'd see a 401 either way, masking the gate's effect.
    const response = await fetch(`${BASE_URL}/api/status`, {
      headers: { cookie: "pyanchor_dev=1" }
    });
    expect(response.status).toBe(401);
  });

  it("/healthz remains open even with the gate enabled (monitoring)", async () => {
    // Operators usually point external monitoring at /healthz. Gating
    // it would force every monitor to inject the cookie. Document
    // this carve-out by locking it in a test.
    const response = await fetch(`http://127.0.0.1:${PORT}/healthz`);
    expect(response.status).toBe(200);
  });

  it("empty cookie value still returns 403 (no false-positive on cookie=)", async () => {
    const response = await fetch(`${BASE_URL}/bootstrap.js`, {
      headers: { cookie: "pyanchor_dev=" }
    });
    expect(response.status).toBe(403);
  });
});
