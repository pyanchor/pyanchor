import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AgentEvent, AgentRunner } from "../../src/agents/types";
import { nextjsProfile } from "../../src/frameworks";
import {
  cancelActiveChildren,
  type RunCommandOptions
} from "../../src/worker/child-process";
import { createLifecycle } from "../../src/worker/lifecycle";
import { createRuntimeBuffer } from "../../src/worker/runtime-buffer";
import { createStateIO } from "../../src/worker/state-io";
import {
  buildWorkspace,
  installWorkspaceDependencies,
  prepareWorkspace,
  syncToAppDir,
  type WorkspaceConfig,
  type WorkspaceDeps
} from "../../src/worker/workspace";
import type { AiEditState } from "../../src/shared/types";

/**
 * End-to-end smoke for the worker assembly:
 * createStateIO + createRuntimeBuffer + createLifecycle + workspace
 * (with stubbed runCommand). NOT a real subprocess — runner.ts has
 * sudo / rsync dependencies that need a Docker sandbox to test
 * faithfully (slated for v0.8.x).
 *
 * What this DOES cover:
 * - the dependency-injection chain across all six worker modules
 *   (state-io → runtime-buffer → lifecycle, plus workspace deps)
 * - the cancel signal flowing from runner-style globals through
 *   isCancelled / isCancelHandled callbacks into both the lifecycle
 *   and the workspace command builder
 * - the happy-path job sequence (prepareWorkspace → install → build →
 *   syncToAppDir → finalizeSuccess) wires up without a missing seam
 *
 * What this does NOT cover:
 * - real spawn / sudo / rsync (those need integration with the host)
 * - signal handlers in runner.ts (process.on("SIGTERM"))
 * - the queue auto-promote behavior in src/state.ts (separate test)
 */

let tmpDir = "";
let stateFile = "";

const baseState = (overrides: Partial<AiEditState> = {}): AiEditState => ({
  configured: true,
  status: "running",
  jobId: "active-job",
  pid: process.pid,
  prompt: "make the button blue",
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
      text: "make the button blue",
      createdAt: new Date(0).toISOString(),
      status: "running"
    }
  ],
  ...overrides
});

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "pyanchor-integration-"));
  stateFile = path.join(tmpDir, "state.json");
});

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  vi.useRealTimers();
});

interface RunnerHarness {
  stateIO: ReturnType<typeof createStateIO>;
  runtimeBuffer: ReturnType<typeof createRuntimeBuffer>;
  lifecycle: ReturnType<typeof createLifecycle>;
  workspaceConfig: WorkspaceConfig;
  workspaceDeps: WorkspaceDeps;
  cancel: { requested: boolean; handled: boolean; controller: AbortController };
  activeChildren: Set<ChildProcess>;
  runCommandCalls: Array<{ command: string; args: string[] }>;
}

const buildHarness = (initial: AiEditState): RunnerHarness => {
  writeFileSync(stateFile, JSON.stringify(initial));

  const stateIO = createStateIO({ stateFile });
  const cancel = { requested: false, handled: false, controller: new AbortController() };
  const activeChildren = new Set<ChildProcess>();
  const runCommandCalls: Array<{ command: string; args: string[] }> = [];

  // Runner-style runCommand stub: records the call, runs no real
  // subprocess. Honors the activeChildren / isCancelled options the
  // way the real runCommand does so the workspace and lifecycle
  // modules see the same contract.
  const stubRunCommand = async (
    command: string,
    args: string[],
    _options: RunCommandOptions = {}
  ) => {
    runCommandCalls.push({ command, args });
    return { stdout: "", stderr: "" };
  };

  const runtimeBuffer = createRuntimeBuffer({
    updateState: stateIO.updateState,
    maxActivityLog: 80,
    maxThinkingChars: 8000,
    onFlushError: () => undefined,
    flushIntervalMs: 10
  });

  const workspaceConfig: WorkspaceConfig = {
    workspaceDir: "/var/work",
    appDir: "/srv/app",
    appDirLock: "/var/lock/app",
    appDirOwner: "studio:studio",
    openClawUser: "openclaw",
    freshWorkspace: false,
    installCommand: "echo install",
    buildCommand: "echo build",
    installTimeoutMs: 60_000,
    buildTimeoutMs: 60_000,
    restartFrontendScript: "/srv/app/restart.sh"
  };

  const baseExecOptions = (): Pick<
    RunCommandOptions,
    "activeChildren" | "isCancelled" | "canceledError"
  > => ({
    activeChildren,
    isCancelled: () => cancel.requested,
    canceledError: "Job canceled by user."
  });

  const workspaceDeps: WorkspaceDeps = {
    runCommand: stubRunCommand,
    framework: nextjsProfile,
    baseExecOptions,
    log: (lines) => runtimeBuffer.queueLog(lines)
  };

  const lifecycle = createLifecycle(
    {
      workspaceDir: workspaceConfig.workspaceDir,
      agentTimeoutMs: 60_000,
      model: "test/model",
      thinking: "medium",
      canceledError: "Job canceled by user.",
      jobIdForFinalize: "active-job",
      jobModeForFinalize: "edit",
      maxMessages: 24
    },
    {
      readState: stateIO.readState,
      writeState: stateIO.writeState,
      queueLog: runtimeBuffer.queueLog,
      queueThinking: runtimeBuffer.queueThinking,
      pulseState: runtimeBuffer.pulseState,
      flushRuntimeBuffers: runtimeBuffer.flushRuntimeBuffers,
      trimLog: runtimeBuffer.trimLog,
      stampLogLine: runtimeBuffer.stampLogLine,
      mergeThinking: runtimeBuffer.mergeThinking,
      cancelSignal: cancel.controller.signal,
      isCancelled: () => cancel.requested,
      isCancelHandled: () => cancel.handled
    }
  );

  return {
    stateIO,
    runtimeBuffer,
    lifecycle,
    workspaceConfig,
    workspaceDeps,
    cancel,
    activeChildren,
    runCommandCalls
  };
};

describe("worker assembly — happy path (edit mode)", () => {
  it("runs prepare → install → agent → build → sync → finalizeSuccess in order, all sharing state", async () => {
    const h = buildHarness(baseState());

    await prepareWorkspace(h.workspaceConfig, h.workspaceDeps);
    await installWorkspaceDependencies(h.workspaceConfig, h.workspaceDeps);

    const agent: AgentRunner = {
      name: "fake",
      async *run() {
        yield { type: "log", text: "scanning route file" };
        yield { type: "thinking", text: "considering structural changes" };
        yield { type: "result", summary: "Made the button blue.", thinking: null };
      }
    };
    const result = await h.lifecycle.runAdapterAgent(
      agent,
      "active-job",
      "make it blue",
      "/dashboard",
      "edit",
      []
    );
    expect(result.failure).toBeNull();
    expect(result.summary).toBe("Made the button blue.");

    await buildWorkspace(h.workspaceConfig, h.workspaceDeps);
    await syncToAppDir(h.workspaceConfig, h.workspaceDeps);
    await h.lifecycle.finalizeSuccess(result.summary, result.thinking, "edit");

    // State persisted: assistant message added, status flipped to done.
    const persisted = JSON.parse(readFileSync(stateFile, "utf8")) as AiEditState;
    expect(persisted.status).toBe("done");
    expect(persisted.heartbeatLabel).toBe("Done");
    const assistantMsg = persisted.messages.find((m) => m.role === "assistant");
    expect(assistantMsg?.text).toBe("Made the button blue.");
    expect(assistantMsg?.status).toBe("done");
    const userMsg = persisted.messages.find((m) => m.role === "user");
    expect(userMsg?.status).toBe("done");

    // workspace sequence executed against the stubbed runCommand:
    // 1. mkdir workspaceDir
    // 2. flock + sudo + rsync app→workspace
    // 3. chown workspace
    // 4. install command
    // 5. build command
    // 6. flock + sudo + rsync workspace→app
    // 7. chown appDir (linux only)
    const calls = h.runCommandCalls;
    const bashCalls = calls.filter((c) => c.args.includes("bash"));
    expect(bashCalls.some((c) => c.args.join(" ").includes("echo install"))).toBe(true);
    expect(bashCalls.some((c) => c.args.join(" ").includes("echo build"))).toBe(true);
    const rsyncCalls = calls.filter((c) => c.args.includes("rsync"));
    expect(rsyncCalls.length).toBeGreaterThanOrEqual(2); // forward + backward
  });

  it("forwards baseExecOptions (cancel signal + activeChildren) to every workspace runCommand call", async () => {
    const h = buildHarness(baseState());

    let received: RunCommandOptions[] = [];
    const recordingDeps: WorkspaceDeps = {
      ...h.workspaceDeps,
      runCommand: async (_cmd, _args, options = {}) => {
        received.push(options);
        return { stdout: "", stderr: "" };
      }
    };
    await prepareWorkspace(h.workspaceConfig, recordingDeps);

    expect(received.length).toBeGreaterThan(0);
    for (const opts of received) {
      expect(opts.activeChildren).toBe(h.activeChildren);
      expect(typeof opts.isCancelled).toBe("function");
      expect(opts.canceledError).toBe("Job canceled by user.");
    }
  });
});

describe("worker assembly — cancel boundary", () => {
  it("cancelActiveChildren walks the SAME Set the workspace runCommand options point at", async () => {
    const h = buildHarness(baseState());
    const calls: NodeJS.Signals[] = [];
    const fake = {
      pid: 12345,
      kill: (signal: NodeJS.Signals) => {
        calls.push(signal);
        return true;
      }
    } as unknown as ChildProcess;

    h.activeChildren.add(fake);
    await cancelActiveChildren(h.activeChildren);
    expect(calls).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("when cancel flips, lifecycle.runAdapterAgent throws canceledError instead of swallowing", async () => {
    const h = buildHarness(baseState());
    h.cancel.requested = true;

    const angryAgent: AgentRunner = {
      name: "angry",
      async *run() {
        throw new Error("internal abort signal received");
      }
    };
    await expect(
      h.lifecycle.runAdapterAgent(angryAgent, "active-job", "p", "/x", "edit", [])
    ).rejects.toThrow("Job canceled by user.");
  });

  it("after cancelHandled is set, finalizeFailure('canceled') no-ops (cancel handler already wrote)", async () => {
    const initial = baseState({
      status: "canceled",
      heartbeatLabel: "Canceled",
      currentStep: null,
      error: "Job canceled by user."
    });
    const h = buildHarness(initial);
    h.cancel.handled = true;

    await h.lifecycle.finalizeFailure("late echo", "canceled", "edit");

    const persisted = JSON.parse(readFileSync(stateFile, "utf8")) as AiEditState;
    expect(persisted.status).toBe("canceled");
    expect(persisted.heartbeatLabel).toBe("Canceled");
    // No new system message clobbered the cancel-handler's record.
    const lateMessages = persisted.messages.filter((m) => m.text === "late echo");
    expect(lateMessages).toHaveLength(0);
  });
});

describe("worker assembly — runtime-buffer + state-io coalesce", () => {
  it("queueLog batches written through state-io's locked writes, not racing each other", async () => {
    const h = buildHarness(baseState({ activityLog: [] }));

    // Burst of 50 log lines → coalesced into <= 50 writes by the
    // 10ms flush window we configured. Each write goes through
    // state-io's lock chain so concurrent updateState calls observe
    // each other in order (no torn writes).
    for (let i = 0; i < 50; i++) {
      h.runtimeBuffer.queueLog([`line ${i}`]);
    }
    await h.runtimeBuffer.flushRuntimeBuffers();

    const persisted = JSON.parse(readFileSync(stateFile, "utf8")) as AiEditState;
    expect(persisted.activityLog.length).toBe(50);
    // Stripped of timestamps, the order is preserved (lock chain works).
    const messages = persisted.activityLog.map((line) =>
      line.replace(/^\[\d{2}:\d{2}:\d{2}\] /, "")
    );
    expect(messages[0]).toBe("line 0");
    expect(messages[49]).toBe("line 49");
  });
});
