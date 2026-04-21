// v0.32.4 regression — when dist/server.cjs is spawned directly
// (the systemd ExecStart pattern, NOT cli.cjs spawning it), the
// process used to exit code=0 within ~1s of "listening" because
// the http.Server returned by app.listen() was discarded as an
// expression statement. Under sufficient module import pressure
// (which v0.32.0 added), V8 GC'd the unreferenced server, the
// listening socket finalized, the event loop drained, and Node
// exited cleanly. systemd reported "Deactivated successfully"
// and Restart=on-failure was a no-op (status was 0).
//
// The fix: a top-level setInterval anchor in src/server.ts that
// keeps the loop reffed regardless of whether anything else holds
// the server alive. Cleared on SIGTERM / SIGINT so graceful
// shutdown still works.
//
// This test boots the actual built dist/server.cjs as a child
// process the same way systemd does, and asserts it's still alive
// 4 seconds later. If a future refactor drops the anchor, this
// test fails fast.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const serverScript = path.resolve(process.cwd(), "dist", "server.cjs");

if (!existsSync(serverScript)) {
  throw new Error(
    `[listen-ref] dist/server.cjs missing at ${serverScript}. ` +
      `Run \`pnpm build\` first.`
  );
}

let child: ChildProcess | null = null;

afterEach(() => {
  if (child && !child.killed) {
    child.kill("SIGTERM");
  }
  child = null;
});

describe("dist/server.cjs — listening socket holds the event loop", () => {
  it("stays alive for 4 seconds after 'listening'", async () => {
    const PORT = 19103;
    const STATE_DIR = `/tmp/pyanchor-listen-ref-${process.pid}-state`;
    const WORKSPACE = `/tmp/pyanchor-listen-ref-${process.pid}-ws`;
    child = spawn("node", [serverScript], {
      env: {
        ...process.env,
        PYANCHOR_TOKEN: "listen-ref-smoke-token-32-chars-1234567",
        PYANCHOR_PORT: String(PORT),
        PYANCHOR_WORKSPACE_DIR: WORKSPACE,
        PYANCHOR_APP_DIR: WORKSPACE,
        PYANCHOR_AGENT: "openclaw",
        PYANCHOR_RESTART_SCRIPT: "/bin/true",
        PYANCHOR_HEALTHCHECK_URL: `http://127.0.0.1:${PORT}/healthz`,
        PYANCHOR_STATE_DIR: STATE_DIR
      },
      // No stdio inherit — replicate the systemd ExecStart spawn
      // shape. The pre-fix bug was MASKED when stdio was inherited
      // from a parent CLI; only the systemd-style spawn exposed it.
      stdio: "pipe",
      detached: false
    });

    // Wait for "listening" to appear, then sit on it for 4s and
    // confirm the process is still alive.
    const sawListening = await new Promise<boolean>((resolve) => {
      const onData = (buf: Buffer) => {
        if (buf.toString().includes("listening")) resolve(true);
      };
      child!.stdout?.on("data", onData);
      child!.stderr?.on("data", onData);
      setTimeout(() => resolve(false), 5000);
    });
    expect(sawListening).toBe(true);

    await new Promise((r) => setTimeout(r, 4000));

    // Pre-v0.32.4: child.exitCode would be 0 here (clean drain).
    // Post-v0.32.4: should still be null (alive).
    expect(child.exitCode).toBeNull();
    expect(child.killed).toBe(false);
  }, 12000);

  it("honors SIGTERM (anchor cleared so graceful stop works)", async () => {
    const PORT = 19104;
    const STATE_DIR = `/tmp/pyanchor-listen-ref-sig-${process.pid}-state`;
    const WORKSPACE = `/tmp/pyanchor-listen-ref-sig-${process.pid}-ws`;
    child = spawn("node", [serverScript], {
      env: {
        ...process.env,
        PYANCHOR_TOKEN: "listen-ref-sig-token-32-chars-1234567X",
        PYANCHOR_PORT: String(PORT),
        PYANCHOR_WORKSPACE_DIR: WORKSPACE,
        PYANCHOR_APP_DIR: WORKSPACE,
        PYANCHOR_AGENT: "openclaw",
        PYANCHOR_RESTART_SCRIPT: "/bin/true",
        PYANCHOR_HEALTHCHECK_URL: `http://127.0.0.1:${PORT}/healthz`,
        PYANCHOR_STATE_DIR: STATE_DIR
      },
      stdio: "pipe"
    });

    const sawListening = await new Promise<boolean>((resolve) => {
      const onData = (buf: Buffer) => {
        if (buf.toString().includes("listening")) resolve(true);
      };
      child!.stdout?.on("data", onData);
      child!.stderr?.on("data", onData);
      setTimeout(() => resolve(false), 5000);
    });
    expect(sawListening).toBe(true);

    // Send SIGTERM and wait for clean exit.
    child.kill("SIGTERM");
    const exitCode = await new Promise<number | null>((resolve) => {
      child!.on("exit", (code) => resolve(code));
      setTimeout(() => resolve(-1), 5000); // safety
    });
    // SIGTERM with the cleanup handler clears the interval; the
    // listening socket should then drain naturally and the process
    // should exit cleanly (code 0 or null=killed-by-signal).
    expect([0, null]).toContain(exitCode);
  }, 12000);
});
