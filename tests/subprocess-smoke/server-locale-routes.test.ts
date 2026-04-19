/**
 * Subprocess smoke for the production Express server's locale routes.
 *
 * Codex round-11 #1 caught that the bootstrap auto-injection of
 * `/_pyanchor/locales/{locale}.js` 404'd in production because the
 * Express server only served bootstrap.js + overlay.js — the e2e
 * fixture had its own route, masking the gap. v0.12.1 added the
 * production route with a `BUILT_IN_LOCALES` whitelist + path
 * regex; this test boots the actual built `dist/server.cjs` and
 * curls the routes to lock the contract.
 *
 * Why subprocess instead of `supertest`-style import:
 *   - `src/server.ts` validates env + auto-listens at import time.
 *     Refactoring it to export the app is a non-trivial change.
 *   - The subprocess approach mirrors `runner-subprocess.test.ts`
 *     and exercises the actual ship artifact (CJS bundle, runtime
 *     env validation, the whole boot pipeline).
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

const PORT = 18901;
const BASE_URL = `http://127.0.0.1:${PORT}/_pyanchor`;
const WORKSPACE = "/tmp/pyanchor-server-smoke";

mkdirSync(WORKSPACE, { recursive: true });

let serverProcess: ChildProcess | null = null;

const waitForReady = async (timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (response.ok) return;
    } catch {
      // Server still starting — back off briefly.
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`server did not become ready on port ${PORT} within ${timeoutMs}ms`);
};

beforeEach(async () => {
  serverProcess = spawn("node", [serverScript], {
    env: {
      ...process.env,
      PYANCHOR_TOKEN: "subprocess-smoke-token-32-chars-1234567890",
      PYANCHOR_PORT: String(PORT),
      PYANCHOR_WORKSPACE_DIR: WORKSPACE,
      PYANCHOR_APP_DIR: WORKSPACE,
      PYANCHOR_AGENT: "openclaw",
      PYANCHOR_RESTART_SCRIPT: "/bin/true",
      PYANCHOR_HEALTHCHECK_URL: `http://127.0.0.1:${PORT}/healthz`
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

describe("server locale routes (round-11 #1 regression guard)", () => {
  // Keep this list in sync with `BUILT_IN_LOCALES` in src/server.ts.
  // The server-side whitelist is the source of truth; mismatches
  // would cause production 404s like the round-11 incident.
  const BUILT_INS = [
    "ko",
    "ja",
    "zh-cn",
    "es",
    "de",
    "fr",
    "pt-br",
    "vi",
    "id",
    "ru",
    "hi",
    "th",
    "tr",
    "nl",
    "pl",
    "sv",
    "it",
    "ar"
  ];

  it.each(BUILT_INS)("serves /locales/%s.js with 200 + JS content type", async (locale) => {
    const response = await fetch(`${BASE_URL}/locales/${locale}.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/javascript/);
    const body = await response.text();
    // The IIFE bundle should at minimum contain the locale code in
    // its self-registration call.
    expect(body.length).toBeGreaterThan(500);
  });

  it("404s an unknown locale (whitelist enforced)", async () => {
    const response = await fetch(`${BASE_URL}/locales/klingon.js`);
    expect(response.status).toBe(404);
  });

  it("404s a path-traversal-shaped locale (regex guard)", async () => {
    // Single-encoded ../etc/passwd.js — Express decodes the path
    // before matching :locale.js, so the value flowing into the
    // handler is `..%2F...` style. The regex guard rejects
    // anything outside [a-z][a-z-]*[a-z].
    const response = await fetch(
      `${BASE_URL}/locales/${encodeURIComponent("../etc/passwd")}.js`
    );
    expect(response.status).toBe(404);
  });

  it("404s a single-letter locale (regex requires >= 2 chars)", async () => {
    // `^[a-z][a-z-]*[a-z]$` requires the first AND last char be
    // a letter, so a single-char value can't satisfy the bookends.
    const response = await fetch(`${BASE_URL}/locales/a.js`);
    expect(response.status).toBe(404);
  });

  it("404s a locale with consecutive dots (regex rejects '..js')", async () => {
    const response = await fetch(`${BASE_URL}/locales/..js`);
    expect(response.status).toBe(404);
  });

  it("still serves /bootstrap.js + /overlay.js (no regression to the existing routes)", async () => {
    const bootstrap = await fetch(`${BASE_URL}/bootstrap.js`);
    const overlay = await fetch(`${BASE_URL}/overlay.js`);
    expect(bootstrap.status).toBe(200);
    expect(overlay.status).toBe(200);
  });
});
