import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { randomUUID } from "node:crypto";

import { pyanchorConfig } from "../config";
import {
  selectAgent,
  type AgentEvent,
  type AgentRunner
} from "../agents";
import { selectFramework } from "../frameworks";
import type { AiEditMessage, AiEditMessageStatus, AiEditMode, AiEditState } from "../shared/types";

const resolvedStateFile = process.env.PYANCHOR_STATE_FILE_PATH;

if (!resolvedStateFile) {
  console.error("PYANCHOR_STATE_FILE_PATH is required (worker is normally spawned by the sidecar).");
  process.exit(1);
}

const stateFile = resolvedStateFile;
const sudoBin = "/usr/bin/sudo";
const flockBin = "/usr/bin/flock";
const framework = selectFramework(pyanchorConfig.framework);
const installCommandShell = pyanchorConfig.installCommand || framework.installCommand;
const buildCommandShell = pyanchorConfig.buildCommand || framework.buildCommand;
const MAX_MESSAGES = pyanchorConfig.maxMessages;
const MAX_ACTIVITY_LOG = pyanchorConfig.maxActivityLog;
const MAX_THINKING_CHARS = 8000;
const CANCELED_ERROR = "Job canceled by user.";

const shouldRestartAfterEdit =
  process.env.PYANCHOR_RESTART_AFTER_EDIT === "true" ||
  (!Object.prototype.hasOwnProperty.call(process.env, "PYANCHOR_RESTART_AFTER_EDIT") &&
    process.platform === "linux" &&
    fsSync.existsSync(pyanchorConfig.restartFrontendScript));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const activeJob = {
  jobId: process.env.PYANCHOR_JOB_ID || "",
  prompt: process.env.PYANCHOR_JOB_PROMPT || "",
  targetPath: process.env.PYANCHOR_JOB_TARGET_PATH || "",
  mode: process.env.PYANCHOR_JOB_MODE === "chat" ? "chat" : "edit"
} as const;

let stateLock = Promise.resolve();
let cancelRequested = false;
let cancelHandled = false;
const cancelController = new AbortController();
let pendingLogLines: string[] = [];
let pendingThinkingSegments: string[] = [];
let flushTimer: NodeJS.Timeout | null = null;

const activeChildren = new Set<ChildProcess>();

const withStateLock = async <T>(task: () => Promise<T>) => {
  const next = stateLock.then(task, task);
  stateLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
};

async function readStateUnlocked() {
  const raw = JSON.parse(await fs.readFile(stateFile, "utf8")) as AiEditState;
  if (!Array.isArray(raw.queue)) {
    raw.queue = [];
  }
  if (!Array.isArray(raw.messages)) {
    raw.messages = [];
  }
  if (!Array.isArray(raw.activityLog)) {
    raw.activityLog = [];
  }
  return raw;
}

async function readState() {
  return withStateLock(() => readStateUnlocked());
}

async function writeStateUnlocked(state: AiEditState) {
  const next = { ...state, updatedAt: new Date().toISOString() };
  // Atomic write: tmp file + rename, same pattern as src/state.ts.
  const tmp = `${stateFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmp, stateFile);
  return next;
}

async function writeState(state: AiEditState) {
  return withStateLock(() => writeStateUnlocked(state));
}

async function updateState(mutator: (state: AiEditState) => AiEditState | Promise<AiEditState>) {
  return withStateLock(async () => {
    const current = await readStateUnlocked();
    const next = await mutator(clone(current));
    return writeStateUnlocked(next);
  });
}

const trimLog = (lines: string[]) => lines.filter(Boolean).slice(-MAX_ACTIVITY_LOG);

const mergeThinking = (current: string | null, incoming: string | null) => {
  const next = incoming?.trim();
  if (!next) {
    return current;
  }

  if (!current) {
    return next.slice(-MAX_THINKING_CHARS);
  }

  if (next.includes(current)) {
    return next.slice(-MAX_THINKING_CHARS);
  }

  if (current.includes(next)) {
    return current.slice(-MAX_THINKING_CHARS);
  }

  return `${current}\n\n${next}`.slice(-MAX_THINKING_CHARS);
};

const stampLogLine = (message: string) => {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  return `[${time}] ${message}`;
};

const createMessage = ({
  jobId,
  role,
  mode,
  text,
  status
}: {
  jobId: string | null;
  role: AiEditMessage["role"];
  mode: AiEditMode;
  text: string;
  status: AiEditMessageStatus | null;
}): AiEditMessage => ({
  id: randomUUID(),
  jobId,
  role,
  mode,
  text,
  createdAt: new Date().toISOString(),
  status
});

const updateUserMessageStatus = (
  state: AiEditState,
  jobId: string,
  status: AiEditMessageStatus
) => ({
  ...state,
  messages: state.messages.map((message) =>
    message.jobId === jobId && message.role === "user" ? { ...message, status } : message
  )
});

const pushMessage = (state: AiEditState, message: AiEditMessage) => ({
  ...state,
  messages: [...state.messages, message].slice(-MAX_MESSAGES)
});

function queueLog(lines: string[]) {
  const next = lines
    .flatMap((line) => line.split(/\r?\n/g))
    .map((line) => line.trim())
    .filter(Boolean)
    .map(stampLogLine);

  if (next.length === 0) {
    return;
  }

  pendingLogLines.push(...next);
  scheduleRuntimeFlush();
}

function queueThinking(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  pendingThinkingSegments.push(trimmed);
  scheduleRuntimeFlush();
}

function scheduleRuntimeFlush() {
  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushRuntimeBuffers();
  }, 500);
}

async function flushRuntimeBuffers() {
  const logLines = pendingLogLines;
  const thinkingSegments = pendingThinkingSegments;
  pendingLogLines = [];
  pendingThinkingSegments = [];

  if (logLines.length === 0 && thinkingSegments.length === 0) {
    return;
  }

  await updateState((state) => ({
    ...state,
    activityLog: trimLog([...state.activityLog, ...logLines]),
    thinking: thinkingSegments.reduce((acc, segment) => mergeThinking(acc, segment), state.thinking)
  }));
}

async function pulseState({ step, label }: { step?: string | null; label?: string | null }) {
  const timestamp = new Date().toISOString();
  await flushRuntimeBuffers();
  await updateState((state) => ({
    ...state,
    currentStep: step ?? state.currentStep,
    heartbeatAt: timestamp,
    heartbeatLabel: label ?? state.heartbeatLabel
  }));
}

async function withHeartbeat<T>(
  config: { step: string; label: string; intervalMs?: number },
  task: () => Promise<T>
) {
  queueLog([config.step]);
  await pulseState({ step: config.step, label: config.label });

  const timer = setInterval(() => {
    void pulseState({ step: config.step, label: config.label }).catch(() => undefined);
  }, config.intervalMs ?? 8000);

  try {
    return await task();
  } finally {
    clearInterval(timer);
  }
}

function killChild(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) {
    return;
  }

  try {
    child.kill(signal);
  } catch {}
}

async function cancelActiveChildren() {
  const children = Array.from(activeChildren);
  for (const child of children) {
    killChild(child, "SIGTERM");
  }

  await new Promise((resolve) => setTimeout(resolve, 200));

  for (const child of children) {
    killChild(child, "SIGKILL");
  }
}

async function finalizeCancellation(signal: NodeJS.Signals) {
  if (cancelHandled) {
    return;
  }

  cancelHandled = true;
  cancelRequested = true;
  cancelController.abort();
  queueLog([`Cancel signal received. (${signal})`, "Tearing down active children."]);
  await flushRuntimeBuffers();
  await cancelActiveChildren();

  const state = await readState();

  await writeState(
    pushMessage(
      updateUserMessageStatus(
        {
          ...state,
          status: "canceled",
          pid: null,
          currentStep: null,
          heartbeatAt: new Date().toISOString(),
          heartbeatLabel: "Canceled",
          error: CANCELED_ERROR,
          completedAt: new Date().toISOString(),
          activityLog: trimLog([...state.activityLog, stampLogLine("Job canceled.")])
        },
        activeJob.jobId,
        "canceled"
      ),
      createMessage({
        jobId: activeJob.jobId,
        role: "system",
        mode: activeJob.mode,
        text: CANCELED_ERROR,
        status: "canceled"
      })
    )
  );

  process.exit(0);
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeoutMs?: number;
    onStdoutChunk?: (text: string) => void;
    onStderrChunk?: (text: string) => void;
  } = {}
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"]
    });

    activeChildren.add(child);

    let stdout = "";
    let stderr = "";
    let timeoutId: NodeJS.Timeout | null = null;

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        killChild(child, "SIGTERM");
        setTimeout(() => killChild(child, "SIGKILL"), 5000).unref();
      }, options.timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdoutChunk?.(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderrChunk?.(text);
    });

    child.on("error", (error) => {
      activeChildren.delete(child);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(error);
    });

    child.on("close", (code, signal) => {
      activeChildren.delete(child);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (cancelRequested) {
        reject(new Error(CANCELED_ERROR));
        return;
      }

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      if (signal) {
        reject(new Error(`${command} was terminated by ${signal}`));
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`));
    });

    if (options.input) {
      child.stdin.write(options.input);
    }

    child.stdin.end();
  });
}

const runAsOpenClaw = (args: string[], options: Parameters<typeof runCommand>[2] = {}) =>
  runCommand(sudoBin, ["-u", pyanchorConfig.openClawUser, ...args], options);

const runAsOpenClawInDir = (
  workingDir: string,
  args: string[],
  options: Parameters<typeof runCommand>[2] = {}
) =>
  runAsOpenClaw(["bash", "-lc", 'cd "$1" && shift && exec "$@"', "--", workingDir, ...args], options);

// .git and node_modules are always excluded (huge / not source); the
// framework profile adds its own cache/output dirs (.next for nextjs,
// dist + .vite for vite).
const baseRsyncExcludes = [".git", "node_modules"];
const workspaceRsyncExcludes = [...baseRsyncExcludes, ...framework.workspaceExcludes];
const buildRsyncExcludeArgs = (excludes: string[]): string[] =>
  excludes.flatMap((entry) => ["--exclude", entry]);

async function prepareWorkspace() {
  // Persistent-workspace path (default since v0.2.3) preserves the
  // workspace's node_modules and framework cache dirs (.next, dist, ...)
  // across jobs so install and build stay incremental. rsync still
  // mirrors source files from the app dir with --delete, scoped to
  // non-excluded paths.
  if (pyanchorConfig.freshWorkspace) {
    await runCommand(sudoBin, ["rm", "-rf", pyanchorConfig.workspaceDir]);
  }
  await runCommand(sudoBin, ["mkdir", "-p", pyanchorConfig.workspaceDir]);

  await runCommand(flockBin, [
    "-s",
    "-w",
    "60",
    pyanchorConfig.appDirLock,
    sudoBin,
    "rsync",
    "-a",
    "--delete",
    ...buildRsyncExcludeArgs(workspaceRsyncExcludes),
    `${pyanchorConfig.appDir}/`,
    `${pyanchorConfig.workspaceDir}/`
  ]);

  // chown is idempotent on persistent workspaces; the agent user owning
  // unchanged hardlinks is fine because rsync (without --link-dest)
  // doesn't create cross-tree hardlinks.
  await runCommand(sudoBin, [
    "chown",
    "-R",
    `${pyanchorConfig.openClawUser}:${pyanchorConfig.openClawUser}`,
    pyanchorConfig.workspaceDir
  ]);
}

function installWorkspaceDependencies() {
  return runAsOpenClawInDir(
    pyanchorConfig.workspaceDir,
    ["bash", "-lc", installCommandShell],
    {
      timeoutMs: pyanchorConfig.installTimeoutMs,
      onStdoutChunk: (text) => queueLog([`[install] ${text}`]),
      onStderrChunk: (text) => queueLog([`[install] ${text}`])
    }
  );
}

function buildWorkspace() {
  return runAsOpenClawInDir(
    pyanchorConfig.workspaceDir,
    ["bash", "-lc", buildCommandShell],
    {
      timeoutMs: pyanchorConfig.buildTimeoutMs,
      onStdoutChunk: (text) => queueLog([`[build] ${text}`]),
      onStderrChunk: (text) => queueLog([`[build] ${text}`])
    }
  );
}

// Agent scratch artifacts that must NEVER reach the app dir on sync-back.
// OpenClaw drops these into the workspace root; other adapters add
// nothing here. Keep this list narrow — anything else lives in the
// framework profile's workspaceExcludes.
const agentScratchExcludes = [
  ".openclaw",
  "AGENTS.md",
  "BOOTSTRAP.md",
  "EDIT_BRIEF.md",
  "HEARTBEAT.md",
  "IDENTITY.md",
  "SOUL.md",
  "TOOLS.md",
  "USER.md"
];

async function syncToAppDir() {
  await runCommand(flockBin, [
    "-x",
    "-w",
    "60",
    pyanchorConfig.appDirLock,
    sudoBin,
    "rsync",
    "-a",
    "--delete",
    ...buildRsyncExcludeArgs([...workspaceRsyncExcludes, ...agentScratchExcludes]),
    `${pyanchorConfig.workspaceDir}/`,
    `${pyanchorConfig.appDir}/`
  ]);

  if (process.platform === "linux") {
    await runCommand(sudoBin, ["chown", "-R", pyanchorConfig.appDirOwner, pyanchorConfig.appDir]);
  }
}

function restartFrontend() {
  return runCommand(pyanchorConfig.restartFrontendScript, []);
}

async function dequeueNext() {
  const state = await readState();
  if (state.queue.length === 0) {
    return null;
  }

  const [next, ...remaining] = state.queue;

  await writeState(
    updateUserMessageStatus(
      {
        ...state,
        status: "running",
        jobId: next.jobId,
        pid: process.pid,
        prompt: next.prompt,
        targetPath: next.targetPath,
        mode: next.mode,
        currentStep: `Starting queued ${next.mode} job (${remaining.length} remaining).`,
        heartbeatAt: null,
        heartbeatLabel: null,
        thinking: null,
        error: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        queue: remaining,
        activityLog: trimLog([...state.activityLog, stampLogLine("Starting next queued job.")])
      },
      next.jobId,
      "running"
    )
  );

  return next;
}

async function finalizeSuccess(summary: string, thinking: string | null, mode: AiEditMode) {
  await flushRuntimeBuffers();
  const state = await readState();

  await writeState(
    pushMessage(
      updateUserMessageStatus(
        {
          ...state,
          status: "done",
          pid: null,
          currentStep: summary,
          heartbeatAt: new Date().toISOString(),
          heartbeatLabel: "Done",
          thinking: mergeThinking(state.thinking, thinking),
          error: null,
          completedAt: new Date().toISOString(),
          activityLog: trimLog([...state.activityLog, stampLogLine("Job complete.")])
        },
        activeJob.jobId,
        "done"
      ),
      createMessage({
        jobId: activeJob.jobId,
        role: "assistant",
        mode,
        text: summary,
        status: "done"
      })
    )
  );
}

async function finalizeFailure(message: string, status: "failed" | "canceled", mode: AiEditMode) {
  if (status === "canceled" && cancelHandled) {
    return;
  }

  await flushRuntimeBuffers();
  const state = await readState();

  const nextState = updateUserMessageStatus(
    {
      ...state,
      status,
      pid: null,
      currentStep: null,
      heartbeatAt: new Date().toISOString(),
      heartbeatLabel: status === "canceled" ? "Canceled" : "Failed",
      error: message,
      completedAt: new Date().toISOString(),
      activityLog: trimLog([...state.activityLog, stampLogLine(message)])
    },
    activeJob.jobId,
    status
  );

  await writeState(
    pushMessage(
      nextState,
      createMessage({
        jobId: activeJob.jobId,
        role: status === "failed" ? "system" : "system",
        mode,
        text: message,
        status
      })
    )
  );
}

async function runAdapterAgent(
  agent: AgentRunner,
  jobId: string,
  jobPrompt: string,
  jobTargetPath: string,
  mode: AiEditMode,
  recentMessages: AiEditState["messages"]
): Promise<{ summary: string; thinking: string | null; failure: string | null }> {
  let summary = "";
  let thinking: string | null = null;
  const summaryParts: string[] = [];
  const thinkingParts: string[] = [];

  try {
    if (agent.prepare) {
      await agent.prepare({
        workspaceDir: pyanchorConfig.workspaceDir,
        timeoutMs: pyanchorConfig.agentTimeoutSeconds * 1000,
        model: pyanchorConfig.model,
        thinking: pyanchorConfig.thinking,
        signal: cancelController.signal
      });
    }

    const stream = agent.run(
      {
        prompt: jobPrompt,
        targetPath: jobTargetPath,
        mode,
        recentMessages,
        jobId
      },
      {
        workspaceDir: pyanchorConfig.workspaceDir,
        timeoutMs: pyanchorConfig.agentTimeoutSeconds * 1000,
        model: pyanchorConfig.model,
        thinking: pyanchorConfig.thinking,
        signal: cancelController.signal
      }
    );

    for await (const event of stream as AsyncIterable<AgentEvent>) {
      if (cancelRequested) break;

      switch (event.type) {
        case "log":
          queueLog([`[agent] ${event.text}`]);
          break;
        case "thinking":
          queueThinking(event.text);
          thinkingParts.push(event.text);
          break;
        case "step":
          await pulseState({ step: event.description ?? event.label, label: event.label });
          break;
        case "result":
          summaryParts.push(event.summary);
          if (event.thinking) thinkingParts.push(event.thinking);
          break;
      }
    }
  } catch (error) {
    if (cancelRequested) {
      throw new Error(CANCELED_ERROR);
    }
    const message = error instanceof Error ? error.message : String(error);
    return { summary: "", thinking: null, failure: message };
  }

  summary = summaryParts.join("\n\n").trim() || (mode === "edit" ? "Edit complete." : "");
  thinking = thinkingParts.join("\n\n").trim() || null;
  return { summary, thinking, failure: null };
}

async function processJob(jobId: string, jobPrompt: string, jobTargetPath: string, mode: AiEditMode) {
  const stateBefore = await readState();
  const agent = selectAgent();

  await withHeartbeat(
    {
      step: "Preparing workspace.",
      label: "Preparing"
    },
    () => prepareWorkspace()
  );

  if (mode === "edit" && !pyanchorConfig.fastReload) {
    await withHeartbeat(
      {
        step: "Installing workspace dependencies.",
        label: "Install"
      },
      () => installWorkspaceDependencies()
    );
  }

  await pulseState({
    step: "Initializing agent.",
    label: "Initializing"
  });

  queueLog([`Agent (${agent.name}) ready.`, "Waiting for model response."]);

  const result = await withHeartbeat(
    {
      step: mode === "chat" ? "Reading code and drafting an answer." : "Analyzing code and applying edits.",
      label: "Thinking"
    },
    () => runAdapterAgent(agent, jobId, jobPrompt, jobTargetPath, mode, stateBefore.messages)
  );

  const { summary, thinking, failure } = result;

  await flushRuntimeBuffers();

  if (failure) {
    throw new Error(failure);
  }

  if (mode === "chat") {
    await finalizeSuccess(summary, thinking, mode);
    return true;
  }

  if (!pyanchorConfig.fastReload) {
    await withHeartbeat(
      {
        step: "Validating with a workspace build.",
        label: "Build"
      },
      () => buildWorkspace()
    );
  }

  await withHeartbeat(
    {
      step: "Syncing edits back to the app dir.",
      label: "Syncing"
    },
    () => syncToAppDir()
  );

  if (shouldRestartAfterEdit && !pyanchorConfig.fastReload) {
    await updateState((state) =>
      pushMessage(
        {
          ...state,
          status: "running",
          pid: process.pid,
          currentStep: summary,
          heartbeatAt: new Date().toISOString(),
          heartbeatLabel: "Restarting",
          thinking: mergeThinking(state.thinking, thinking),
          error: null,
          completedAt: null
        },
        createMessage({
          jobId,
          role: "assistant",
          mode,
          text: summary,
          status: "done"
        })
      )
    );

    await restartFrontend();
    return false;
  }

  await finalizeSuccess(summary, thinking, mode);
  return true;
}

process.on("SIGTERM", () => {
  void finalizeCancellation("SIGTERM");
});

process.on("SIGINT", () => {
  void finalizeCancellation("SIGINT");
});

async function main() {
  let currentJobId = activeJob.jobId;
  let currentPrompt = activeJob.prompt;
  let currentTargetPath = activeJob.targetPath;
  let currentMode = activeJob.mode;

  while (true) {
    try {
      const canContinue = await processJob(currentJobId, currentPrompt, currentTargetPath, currentMode);
      if (!canContinue) {
        break;
      }
    } catch (error) {
      if (cancelRequested || (error instanceof Error && error.message === CANCELED_ERROR)) {
        await finalizeFailure(CANCELED_ERROR, "canceled", currentMode);
      } else {
        await finalizeFailure(
          error instanceof Error ? error.message : "Unknown error.",
          "failed",
          currentMode
        );
      }
    }

    const next = await dequeueNext();
    if (!next) {
      break;
    }

    currentJobId = next.jobId;
    currentPrompt = next.prompt;
    currentTargetPath = next.targetPath;
    currentMode = next.mode;
  }
}

void main().catch(async (error) => {
  if (cancelRequested) {
    await finalizeFailure(CANCELED_ERROR, "canceled", activeJob.mode);
    return;
  }

  await finalizeFailure(
    error instanceof Error ? error.message : "Unknown error.",
    "failed",
    activeJob.mode
  );
});
