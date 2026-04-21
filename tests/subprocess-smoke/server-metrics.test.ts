/**
 * Subprocess smoke for the v0.23.1 /api/admin/metrics endpoint.
 *
 * Boots the actual built `dist/server.cjs` and asserts the metrics
 * shape matches the contract documented in `docs/API-STABILITY.md`
 * "Pre-1.0" admin block. If we want to graduate this to Stable @ 1.0
 * later, the shape this test enforces becomes the public contract.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const serverScript = path.resolve(process.cwd(), "dist", "server.cjs");

if (!existsSync(serverScript)) {
  throw new Error(
    `[subprocess-smoke] dist/server.cjs missing at ${serverScript}. ` +
      `Run \`pnpm build\` first.`
  );
}

// v0.32.4 — counter-based PORT (see server-readyz.test.ts comment).
let __portCounter = 18903;
const allocPort = () => __portCounter++;
let PORT = allocPort();
let BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "metrics-smoke-token-32-chars-1234567890";
const WORKSPACE = "/tmp/pyanchor-metrics-smoke";
// v0.32.3 — point PYANCHOR_STATE_DIR at a per-test scratch dir so
// the host's `~/.pyanchor/state.json` (left behind by other runs of
// pyanchor on the dev box) doesn't leak `recentMessages` into the
// "fresh boot" assertions below. Without this, every developer who
// has ever run pyanchor against a real edit job sees this test fail
// locally while CI passes (CI's HOME is empty).
const STATE_DIR = "/tmp/pyanchor-metrics-smoke-state";

mkdirSync(WORKSPACE, { recursive: true });

let serverProcess: ChildProcess | null = null;

const waitForReady = async (timeoutMs = 5000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return;
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`server did not boot within ${timeoutMs}ms`);
};

beforeEach(async () => {
  // v0.32.3 — wipe state dir BEFORE each spawn so a prior test (or
  // a prior local run) can't leak messages/queue into a "fresh boot"
  // assertion. mkdirSync handles the create; rmSync wipes the file.
  const { rmSync } = await import("node:fs");
  rmSync(STATE_DIR, { recursive: true, force: true });
  mkdirSync(STATE_DIR, { recursive: true });
  // v0.32.4 — fresh PORT per spawn.
  PORT = allocPort();
  BASE = `http://127.0.0.1:${PORT}`;
  serverProcess = spawn("node", [serverScript], {
    env: {
      ...process.env,
      PYANCHOR_TOKEN: TOKEN,
      PYANCHOR_PORT: String(PORT),
      PYANCHOR_WORKSPACE_DIR: WORKSPACE,
      PYANCHOR_APP_DIR: WORKSPACE,
      PYANCHOR_AGENT: "openclaw",
      PYANCHOR_RESTART_SCRIPT: "/bin/true",
      PYANCHOR_HEALTHCHECK_URL: `${BASE}/healthz`,
      PYANCHOR_STATE_DIR: STATE_DIR
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForReady();
});

afterEach(async () => {
  // v0.32.4 — same race as server-readyz.test.ts: wait for actual
  // exit so the next spawn doesn't EADDRINUSE-race into the prior
  // sidecar's still-alive port. See that file's afterEach comment
  // for the full backstory.
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

describe("/api/admin/metrics (v0.23.1)", () => {
  it("requires auth — 401 without bearer", async () => {
    const r = await fetch(`${BASE}/api/admin/metrics`);
    expect(r.status).toBe(401);
  });

  it("returns the documented shape with bearer", async () => {
    const r = await fetch(`${BASE}/api/admin/metrics`, {
      headers: { authorization: `Bearer ${TOKEN}` }
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;

    // Top-level shape
    expect(body).toMatchObject({
      ts: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      serverStartedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      queue: expect.any(Object),
      currentJob: expect.any(Object),
      sessions: expect.any(Object),
      recentMessages: expect.any(Object)
    });

    // queue
    const queue = body.queue as { depth: number; oldestEnqueuedAt: string | null };
    expect(typeof queue.depth).toBe("number");
    expect(queue.depth).toBeGreaterThanOrEqual(0);
    // No queued items on a fresh boot
    expect(queue.oldestEnqueuedAt).toBeNull();

    // sessions — fresh boot has 0 active sessions
    const sessions = body.sessions as { activeCount: number };
    expect(sessions.activeCount).toBe(0);

    // recentMessages — fresh boot has empty messages array
    const recent = body.recentMessages as {
      sampleSize: number;
      byStatus: Record<string, number>;
    };
    expect(recent.sampleSize).toBe(0);
    expect(recent.byStatus).toEqual({});

    // v0.29.0 — actorRejections counter (round 18 recommendation 4).
    // Fresh boot: empty object (no rejections yet, signing also off
    // by default). Documented in API-STABILITY.
    expect(body.actorRejections).toEqual({});
  });

  it("returns the same value when polled twice in quick succession (idempotent)", async () => {
    const headers = { authorization: `Bearer ${TOKEN}` };
    const a = await fetch(`${BASE}/api/admin/metrics`, { headers }).then((r) => r.json());
    const b = await fetch(`${BASE}/api/admin/metrics`, { headers }).then((r) => r.json());
    // Top-level snapshot fields stay identical between the two reads
    // (queue depth, session count, message counts) — only `ts` differs.
    expect(b.serverStartedAt).toBe(a.serverStartedAt);
    expect(b.queue).toEqual(a.queue);
    expect(b.sessions).toEqual(a.sessions);
    expect(b.recentMessages).toEqual(a.recentMessages);
  });

  it("activeSessionCount reflects POST /api/session", async () => {
    // Need allowed origin set so the session POST passes — fall back
    // to the bearer path which has no origin requirement other than
    // the request having a valid token.
    const session = await fetch(`${BASE}/_pyanchor/api/session`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        // No Origin header → allowed because allowedOrigins is empty,
        // which means "every origin presenting a valid token is OK"
        // (loopback dev contract)
        "content-type": "application/json"
      }
    });
    expect(session.status).toBe(200);

    const m = await fetch(`${BASE}/api/admin/metrics`, {
      headers: { authorization: `Bearer ${TOKEN}` }
    }).then((r) => r.json());
    expect((m.sessions as { activeCount: number }).activeCount).toBe(1);
  });
});
