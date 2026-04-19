/**
 * Subprocess smoke for `dist/worker/runner.cjs`.
 *
 * Spawns the actual built worker binary, but with sudo / flock /
 * openclaw all stubbed via fake wrapper scripts. This is NOT a true
 * end-to-end integration test — real sudo permissions, rsync edge
 * cases, chown ownership are all skipped. What it catches is wiring
 * regressions in the orchestration: env validation, factory
 * composition, the dequeue/process/finalize loop, signal handlers,
 * and the agent stream → result event → finalizeSuccess flow.
 *
 * The fake `openclaw` script:
 *   - echoes `[]` for `agents list/add` (so prepare() proceeds)
 *   - emits a real JSON result document for the `agent` invocation
 *     (so runAdapterAgent yields an honest "result" event with text
 *     the test asserts against — NOT the empty-stream fallback)
 *   - or hangs on `agent` when the test wants to interrupt with
 *     SIGTERM
 *
 * Anything fidelity-sensitive (real sudo permissions, rsync edge
 * cases, chown ownership) needs a Docker sandbox. Tracked as a
 * lower-priority follow-up; the orchestration smoke this file
 * provides catches the wiring regressions Codex round-5 / round-6
 * flagged.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AiEditState } from "../../src/shared/types";

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
let fakeSudo = "";
let fakeOpenclaw = "";

const FAKE_SUDO_BODY = `#!/bin/sh
# Real-ish sudo wrapper. Strips the "-u <user>" prefix the worker
# uses for agent ops; passes bare workspace ops straight through.
if [ "$1" = "-u" ]; then
  shift 2
fi
exec "$@"
`;

const SUCCESS_SUMMARY = "actually wired up the change";

const writeFakeOpenclaw = (mode: "success" | "hang") => {
  // For success mode, the agent invocation prints a real JSON document
  // matching what parseAgentResult expects. For hang mode, it sleeps
  // long enough for SIGTERM to interrupt mid-run.
  // Using printf instead of a heredoc — heredocs inside `case` arms
  // are fragile across /bin/sh implementations (dash treats the
  // closing tag strictly).
  const agentBranch =
    mode === "success"
      ? `printf '%s\\n' '{"result":{"payloads":[{"text":"${SUCCESS_SUMMARY}"}]}}'`
      : "sleep 30";

  const body = `#!/bin/sh
# Fake openclaw — first arg is the subcommand the worker invokes.
case "$1" in
  agents) echo '[]'; exit 0 ;;
  agent)  ${agentBranch}; exit 0 ;;
  *)      exit 0 ;;
esac
`;
  writeFileSync(fakeOpenclaw, body, { mode: 0o755 });
};

const buildEnv = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...process.env,
  PYANCHOR_TOKEN: "test-token-32-chars-1234567890ab",
  PYANCHOR_APP_DIR: appDir,
  PYANCHOR_WORKSPACE_DIR: workspaceDir,
  PYANCHOR_RESTART_SCRIPT: restartScript,
  PYANCHOR_HEALTHCHECK_URL: "http://127.0.0.1:65530/",
  PYANCHOR_STATE_FILE_PATH: stateFile,
  PYANCHOR_APP_DIR_LOCK: lockFile,
  PYANCHOR_SUDO_BIN: fakeSudo,
  PYANCHOR_FLOCK_BIN: "/bin/true",
  PYANCHOR_FAST_RELOAD: "true",
  PYANCHOR_OPENCLAW_BIN: fakeOpenclaw,
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

const spawnRunner = (envOverrides: Record<string, string> = {}): ChildProcess =>
  spawn(process.execPath, [workerScript], {
    env: buildEnv(envOverrides),
    stdio: ["ignore", "pipe", "pipe"]
  });

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
  fakeSudo = path.join(tmpDir, "fake-sudo.sh");
  fakeOpenclaw = path.join(tmpDir, "fake-openclaw.sh");

  // mkdir -p the workspace; the worker's prepareWorkspace would
  // normally do this via sudo, but our fake-sudo passes the call
  // through and we want to be defensive.
  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(appDir, { recursive: true });

  writeFileSync(fakeSudo, FAKE_SUDO_BODY, { mode: 0o755 });
  writeFakeOpenclaw("success");

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

describe("runner.cjs subprocess — happy path with real agent result", () => {
  it("processes a job end-to-end, emits the agent's REAL result text (not the fallback)", async () => {
    const child = spawnRunner();
    try {
      const finalState = await waitForStatus((s) => s.status === "done", 12_000);
      expect(finalState.status).toBe("done");
      expect(finalState.heartbeatLabel).toBe("Done");
      expect(finalState.completedAt).not.toBeNull();
      expect(finalState.pid).toBeNull();

      const userMsg = finalState.messages.find((m) => m.role === "user");
      const assistantMsg = finalState.messages.find((m) => m.role === "assistant");
      expect(userMsg?.status).toBe("done");
      // CRITICAL: the assistant message carries the REAL summary the
      // fake-openclaw emitted, NOT the "Edit complete." fallback. This
      // proves the streamed result event flowed through parseAgentResult
      // → summaryParts → finalizeSuccess end-to-end.
      expect(assistantMsg?.text).toBe(SUCCESS_SUMMARY);
      // currentStep on done state mirrors the assistant summary.
      expect(finalState.currentStep).toBe(SUCCESS_SUMMARY);
    } finally {
      killChild(child);
    }
  }, 20_000);

  it("emits an activity-log entry for each lifecycle step (preparing/syncing)", async () => {
    const child = spawnRunner();
    try {
      const finalState = await waitForStatus((s) => s.status === "done", 12_000);
      const log = finalState.activityLog.join("\n");
      // FAST_RELOAD skips install/build/restart, so we only assert
      // the steps that always run.
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
  it("responds to SIGTERM mid-run by writing a 'canceled' final state and exiting", async () => {
    // Swap the fake openclaw to hang mode so SIGTERM has something
    // to interrupt.
    writeFakeOpenclaw("hang");

    const child = spawnRunner();

    try {
      // Wait until the agent stream is actively running (heartbeat
      // label transitions to "Thinking" once runAdapterAgent's
      // withHeartbeat fires). This proves we're past prepareWorkspace
      // and into the agent stream.
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
  }, 30_000);
});
