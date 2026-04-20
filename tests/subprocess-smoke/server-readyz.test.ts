/**
 * Subprocess smoke for the v0.27.0 /readyz endpoint.
 *
 * Boots the actual built dist/server.cjs and asserts:
 *   - /healthz always 200 (liveness)
 *   - /readyz returns 200 when isPyanchorConfigured() passes
 *     (workspace dir + app dir + restart script + agent CLI all
 *     resolvable for openclaw fallback case where bin missing →
 *     503 OR claude-code agent → always 200 since no bin check)
 *   - /readyz JSON shape: { ok, ready }
 *   - both endpoints unauthenticated (no token, no gate cookie)
 *
 * Uses the claude-code agent specifically because its readiness
 * check is "always pass" (no binary to verify), so the test is
 * deterministic regardless of what's installed on the CI runner.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const serverScript = path.resolve(process.cwd(), "dist", "server.cjs");

if (!existsSync(serverScript)) {
  throw new Error(
    `[subprocess-smoke] dist/server.cjs missing at ${serverScript}. ` +
      `Run \`pnpm build\` first.`
  );
}

const PORT = 18904;
const TOKEN = "readyz-smoke-token-32-chars-1234567890";
const BASE = `http://127.0.0.1:${PORT}`;
const WORKSPACE = "/tmp/pyanchor-readyz-smoke-workspace";
const APP_DIR = "/tmp/pyanchor-readyz-smoke-app";
const RESTART_SCRIPT = "/tmp/pyanchor-readyz-smoke-restart.sh";

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

afterEach(() => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }
  serverProcess = null;
});

describe("/healthz (liveness, v0.0+)", () => {
  beforeEach(() => startServer());

  it("returns 200 with no auth", async () => {
    const r = await fetch(`${BASE}/healthz`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("ignores any auth headers (truly public)", async () => {
    const r = await fetch(`${BASE}/healthz`, {
      headers: { authorization: "Bearer wrong-token-on-purpose" }
    });
    expect(r.status).toBe(200);
  });
});

describe("/readyz (readiness, v0.27.0+)", () => {
  beforeEach(() => startServer());

  it("returns 200 with no auth when fully configured", async () => {
    const r = await fetch(`${BASE}/readyz`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean; ready: boolean };
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(true);
  });

  it("returns documented JSON shape", async () => {
    const r = await fetch(`${BASE}/readyz`);
    const body = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["ok", "ready"]);
    expect(typeof body.ok).toBe("boolean");
    expect(typeof body.ready).toBe("boolean");
  });
});

describe("/readyz returns 503 when misconfigured", () => {
  beforeEach(() =>
    startServer({
      // Point at a path that definitely doesn't exist so
      // isPyanchorConfigured() returns false.
      PYANCHOR_APP_DIR: "/tmp/pyanchor-readyz-this-dir-does-not-exist-xyz"
    })
  );

  it("returns 503 with ready: false", async () => {
    const r = await fetch(`${BASE}/readyz`);
    expect(r.status).toBe(503);
    const body = (await r.json()) as { ok: boolean; ready: boolean };
    expect(body.ok).toBe(false);
    expect(body.ready).toBe(false);
  });

  it("does NOT affect /healthz (process is still alive)", async () => {
    const r = await fetch(`${BASE}/healthz`);
    expect(r.status).toBe(200);
  });
});

// v0.28.1 — round 18 P1 regression coverage. The pre-v0.28.1
// /readyz silently ignored workspace presence and accepted a non-
// executable restart script. These tests lock the corrected
// contract so future refactors of isPyanchorConfigured() don't
// re-introduce the false-positive cases.
describe("/readyz contract (v0.28.1+)", () => {
  it("503 when PYANCHOR_WORKSPACE_DIR doesn't exist", async () => {
    await startServer({
      PYANCHOR_WORKSPACE_DIR: "/tmp/pyanchor-readyz-no-such-workspace-xyz"
    });
    const r = await fetch(`${BASE}/readyz`);
    expect(r.status).toBe(503);
  });

  it("503 when restart script exists but is not executable", async () => {
    const NON_EXEC = "/tmp/pyanchor-readyz-non-exec-restart.sh";
    writeFileSync(NON_EXEC, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    chmodSync(NON_EXEC, 0o644);
    await startServer({ PYANCHOR_RESTART_SCRIPT: NON_EXEC });
    const r = await fetch(`${BASE}/readyz`);
    expect(r.status).toBe(503);
  });

  it("200 when bare agent binary name resolves via PATH (codex case)", async () => {
    // Use `sh` as a stand-in for an agent binary — guaranteed to
    // exist on PATH in any Unix-like CI runner. The pre-v0.28.1
    // bug was that pathExists("sh") returned false because there's
    // no file literally named "sh" in the cwd; commandExists("sh")
    // returns true via `command -v sh`.
    await startServer({
      PYANCHOR_AGENT: "codex",
      PYANCHOR_CODEX_BIN: "sh"
    });
    const r = await fetch(`${BASE}/readyz`);
    expect(r.status).toBe(200);
  });
});
