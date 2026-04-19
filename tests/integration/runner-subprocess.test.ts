/**
 * Real-subprocess integration smoke for `dist/worker/runner.cjs`.
 *
 * Spawns the actual built worker binary with sudo / flock pointed at
 * `/bin/true` so the workspace ops become no-ops. The agent (openclaw
 * adapter) ALSO shells out via the overridden sudo, so its
 * subprocess invocations succeed with empty output — runAdapterAgent
 * sees zero events and falls back to the default success summary
 * ("Edit complete." for edit mode), which is exactly what we want
 * to verify wires up end-to-end.
 *
 * What this finally covers (at runtime, in a real Node process):
 *   - top-level env validation (PYANCHOR_STATE_FILE_PATH check)
 *   - createStateIO / createRuntimeBuffer / createLifecycle / workspace
 *     wiring as it runs in the actual entry point
 *   - dequeue/process/finalize loop with state.json mutations observed
 *     from outside the process
 *   - signal handlers (SIGTERM → finalizeCancellation → state goes
 *     to "canceled")
 *
 * What this does NOT cover (still on the v0.8.x roadmap proper):
 *   - real sudo / rsync / chown semantics (we stub them with /bin/true)
 *   - real adapter behavior (openclaw / codex / aider / claude-code
 *     producing actual edits — those need their respective binaries)
 *   - frontend restart script invocation (skipped via PYANCHOR_FAST_RELOAD)
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AiEditState } from "../../src/shared/types";

// Tests run from the repo root (pnpm test); dist/worker/runner.cjs is
// produced by `pnpm build`.
const workerScript = path.resolve(process.cwd(), "dist", "worker", "runner.cjs");

const baseState = (overrides: Partial<AiEditState> = {}): AiEditState => ({
  configured: true,
  status: "running",
  jobId: "active-job",
  pid: null,
  prompt: "do the thing",
  targetPath: "/dashboard",
  mode: "edit",
  currentStep: null,
  heartbeatAt: null,
  heartbeatLabel: null,
  thinking: null,
  activityLog: [],
  error: null,
  startedAt: new Date(0).toISOString(),
  completedAt: null,
  updatedAt: new Date(0).toISOString(),
  queue: [],
  messages: [
    {
      id: "u1",
      jobId: "active-job",
      role: "user",
      mode: "edit",
      text: "do the thing",
      createdAt: new Date(0).toISOString(),
      status: "running"
    }
  ],
  ...overrides
});

let tmpDir = "";
let stateFile = "";
let workspaceDir = "";
let appDir = "";
let lockFile = "";
let restartScript = "";

const buildEnv = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...process.env,
  PYANCHOR_TOKEN: "test-token-32-chars-1234567890ab",
  PYANCHOR_APP_DIR: appDir,
  PYANCHOR_WORKSPACE_DIR: workspaceDir,
  PYANCHOR_RESTART_SCRIPT: restartScript,
  PYANCHOR_HEALTHCHECK_URL: "http://127.0.0.1:65530/", // intentionally unreachable; not used with FAST_RELOAD
  PYANCHOR_STATE_FILE_PATH: stateFile,
  PYANCHOR_APP_DIR_LOCK: lockFile,
  // Stubs that turn workspace ops into no-ops.
  PYANCHOR_SUDO_BIN: "/bin/true",
  PYANCHOR_FLOCK_BIN: "/bin/true",
  // Skip install/build/restart. Even with /bin/true sudo those
  // would no-op too, but FAST_RELOAD makes the assertion text
  // about the test's intent more obvious.
  PYANCHOR_FAST_RELOAD: "true",
  // Tell the worker NOT to look for a real openclaw binary on disk.
  // It uses sudo (which is now /bin/true) for everything, so the
  // value just needs to be a path-shaped string.
  PYANCHOR_OPENCLAW_BIN: "/bin/true",
  // Per-job env the sidecar would normally inject when spawning
  // the runner subprocess.
  PYANCHOR_JOB_ID: "active-job",
  PYANCHOR_JOB_PROMPT: "do the thing",
  PYANCHOR_JOB_TARGET_PATH: "/dashboard",
  PYANCHOR_JOB_MODE: "edit",
  PYANCHOR_RESTART_AFTER_EDIT: "false",
  ...overrides
});

const readState = (): AiEditState =>
  JSON.parse(readFileSync(stateFile, "utf8")) as AiEditState;

const waitForStatus = async (
  predicate: (state: AiEditState) => boolean,
  timeoutMs = 8000,
  intervalMs = 50
): Promise<AiEditState> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(stateFile)) {
      try {
        const state = readState();
        if (predicate(state)) return state;
      } catch {
        // mid-write; retry
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `waitForStatus timed out after ${timeoutMs}ms. Last state: ${
      existsSync(stateFile) ? readFileSync(stateFile, "utf8") : "<no file>"
    }`
  );
};

const spawnRunner = (envOverrides: Record<string, string> = {}): ChildProcess => {
  const child = spawn(process.execPath, [workerScript], {
    env: buildEnv(envOverrides),
    stdio: ["ignore", "pipe", "pipe"]
  });
  return child;
};

const killChild = (child: ChildProcess) => {
  if (child.pid && !child.killed) {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
};

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "pyanchor-runner-"));
  stateFile = path.join(tmpDir, "state.json");
  workspaceDir = path.join(tmpDir, "workspace");
  appDir = path.join(tmpDir, "app");
  lockFile = path.join(tmpDir, "app-dir.lock");
  restartScript = "/bin/true";

  // Pre-write initial state with the running job already promoted.
  // (In production the sidecar's startAiEdit writes this before
  // spawning the worker; we replicate that setup here.)
  writeFileSync(stateFile, JSON.stringify(baseState()));
});

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe("runner.cjs subprocess — happy path", () => {
  it("processes the active job, finalizes success, exits cleanly", async () => {
    const child = spawnRunner();
    try {
      const finalState = await waitForStatus((s) => s.status === "done", 12_000);
      expect(finalState.status).toBe("done");
      expect(finalState.heartbeatLabel).toBe("Done");
      expect(finalState.completedAt).not.toBeNull();
      expect(finalState.pid).toBeNull();

      // The user message status flipped from "running" to "done";
      // an assistant message was appended with the default summary.
      const userMsg = finalState.messages.find((m) => m.role === "user");
      const assistantMsg = finalState.messages.find((m) => m.role === "assistant");
      expect(userMsg?.status).toBe("done");
      expect(assistantMsg?.text).toBeTruthy();
      // openclaw with /bin/true sudo emits zero events → defaults
      // to "Edit complete." for edit-mode jobs.
      expect(assistantMsg?.text).toBe("Edit complete.");
    } finally {
      killChild(child);
    }
  }, 20_000);

  it("emits an activity-log entry for each lifecycle step (preparing/installing/syncing)", async () => {
    const child = spawnRunner();
    try {
      const finalState = await waitForStatus((s) => s.status === "done", 12_000);
      const log = finalState.activityLog.join("\n");
      // Heartbeat steps written via runtime-buffer's queueLog.
      // FAST_RELOAD skips install/build/restart, so the install
      // step won't appear; prepare and sync should.
      expect(log).toContain("Preparing");
      expect(log).toContain("Syncing");
      expect(log).toContain("Job complete");
    } finally {
      killChild(child);
    }
  }, 20_000);
});

describe("runner.cjs subprocess — env validation", () => {
  it("exits non-zero when PYANCHOR_STATE_FILE_PATH is missing", async () => {
    // Strip the var via spawn-level env instead of buildEnv.
    const env = { ...buildEnv() };
    delete env.PYANCHOR_STATE_FILE_PATH;

    const child = spawn(process.execPath, [workerScript], {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.once("exit", (code) => resolve(code));
    });

    expect(exitCode).toBe(1);
    killChild(child);
  }, 10_000);
});

describe("runner.cjs subprocess — cancel signal", () => {
  it(
    "responds to SIGTERM by writing a 'canceled' final state and exiting",
    async () => {
      // For cancellation to be observable, the agent subprocess has
      // to actually run long enough for SIGTERM to land mid-flight.
      // /bin/true exits immediately so the worker would finish first.
      // Use a fake openclaw that hangs on the chat invocation but
      // returns instantly for the agents-list / agents-add calls
      // prepare() makes.
      const fakeOpenclaw = path.join(tmpDir, "fake-openclaw.sh");
      writeFileSync(
        fakeOpenclaw,
        `#!/bin/sh
# First arg = subcommand. agents list/add return immediately;
# everything else (the chat invocation) hangs so SIGTERM has
# something to interrupt.
case "$1" in
  agents) echo '[]'; exit 0 ;;
  *) sleep 30 ;;
esac
`,
        { mode: 0o755 }
      );

      // Real-ish sudo wrapper. Handles both call shapes the worker
      // emits:
      //   - sudo <cmd> [args...]            (workspace ops)
      //   - sudo -u <user> <cmd> [args...]  (agent ops)
      const fakeSudo = path.join(tmpDir, "fake-sudo.sh");
      writeFileSync(
        fakeSudo,
        `#!/bin/sh
if [ "$1" = "-u" ]; then
  shift 2
fi
exec "$@"
`,
        { mode: 0o755 }
      );

      // The workspace prep needs the workspace dir to actually exist
      // (so subsequent ops don't ENOENT). Pre-create it since /bin/true
      // sudo would skip the mkdir but the real sudo wrapper above
      // would actually run `mkdir -p` — but the WORKER calls
      // `sudo mkdir -p WORKSPACE`, not `sudo -u USER mkdir`, so our
      // wrapper would exec `mkdir -p WORKSPACE`. That works. Still,
      // belt-and-suspenders, ensure the dir exists.
      const fs = await import("node:fs/promises");
      await fs.mkdir(workspaceDir, { recursive: true });

      const child = spawnRunner({
        PYANCHOR_SUDO_BIN: fakeSudo,
        PYANCHOR_OPENCLAW_BIN: fakeOpenclaw
      });

      try {
        // Wait until the agent stream is actively running. The
        // heartbeatLabel transitions to "Thinking" once
        // runAdapterAgent's withHeartbeat fires.
        await waitForStatus(
          (s) =>
            s.heartbeatLabel === "Thinking" ||
            s.currentStep?.includes("Analyzing") === true ||
            s.currentStep?.includes("Reading") === true,
          10_000
        );

        // SIGTERM the worker. finalizeCancellation writes the canceled
        // final state before process.exit(0).
        child.kill("SIGTERM");

        const final = await waitForStatus((s) => s.status === "canceled", 10_000);
        expect(final.status).toBe("canceled");
        expect(final.heartbeatLabel).toBe("Canceled");
        expect(final.error).toBe("Job canceled by user.");
        expect(final.pid).toBeNull();

        const userMsg = final.messages.find((m) => m.role === "user");
        expect(userMsg?.status).toBe("canceled");
      } finally {
        killChild(child);
      }
    },
    30_000
  );
});
