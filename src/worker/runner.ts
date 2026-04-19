import { type ChildProcess } from "node:child_process";
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

import { cancelActiveChildren, runCommand, type RunCommandOptions } from "./child-process";
import { createRuntimeBuffer } from "./runtime-buffer";
import { createStateIO } from "./state-io";
import {
  buildWorkspace,
  installWorkspaceDependencies,
  prepareWorkspace,
  restartFrontend,
  syncToAppDir,
  type WorkspaceConfig,
  type WorkspaceDeps
} from "./workspace";

const resolvedStateFile = process.env.PYANCHOR_STATE_FILE_PATH;

if (!resolvedStateFile) {
  console.error("PYANCHOR_STATE_FILE_PATH is required (worker is normally spawned by the sidecar).");
  process.exit(1);
}

const stateFile = resolvedStateFile;
const framework = selectFramework(pyanchorConfig.framework);
const installCommandShell = pyanchorConfig.installCommand || framework.installCommand;
const buildCommandShell = pyanchorConfig.buildCommand || framework.buildCommand;

const stateIO = createStateIO({ stateFile });
const { readState, writeState, updateState } = stateIO;

const runtimeBuffer = createRuntimeBuffer({
  updateState,
  maxActivityLog: pyanchorConfig.maxActivityLog,
  maxThinkingChars: 8000,
  // Surface flush failures to stderr so they hit pm2/journald instead
  // of vanishing into an unhandledRejection. The next pulseState/
  // withHeartbeat call will surface a synchronous failure too.
  onFlushError: (error) => {
    console.error("[pyanchor] runtime-buffer flush failed:", error);
  }
});
const {
  queueLog,
  queueThinking,
  flushRuntimeBuffers,
  pulseState,
  withHeartbeat,
  stampLogLine,
  trimLog,
  mergeThinking
} = runtimeBuffer;

const workspaceConfig: WorkspaceConfig = {
  workspaceDir: pyanchorConfig.workspaceDir,
  appDir: pyanchorConfig.appDir,
  appDirLock: pyanchorConfig.appDirLock,
  appDirOwner: pyanchorConfig.appDirOwner,
  openClawUser: pyanchorConfig.openClawUser,
  freshWorkspace: pyanchorConfig.freshWorkspace,
  installCommand: installCommandShell,
  buildCommand: buildCommandShell,
  installTimeoutMs: pyanchorConfig.installTimeoutMs,
  buildTimeoutMs: pyanchorConfig.buildTimeoutMs,
  restartFrontendScript: pyanchorConfig.restartFrontendScript
};
// MAX_ACTIVITY_LOG and MAX_THINKING_CHARS now live inside the
// runtime-buffer factory below; only message-list trimming stays
// here (used by pushMessage in the lifecycle path).
const MAX_MESSAGES = pyanchorConfig.maxMessages;
const CANCELED_ERROR = "Job canceled by user.";

const shouldRestartAfterEdit =
  process.env.PYANCHOR_RESTART_AFTER_EDIT === "true" ||
  (!Object.prototype.hasOwnProperty.call(process.env, "PYANCHOR_RESTART_AFTER_EDIT") &&
    process.platform === "linux" &&
    fsSync.existsSync(pyanchorConfig.restartFrontendScript));

const activeJob = {
  jobId: process.env.PYANCHOR_JOB_ID || "",
  prompt: process.env.PYANCHOR_JOB_PROMPT || "",
  targetPath: process.env.PYANCHOR_JOB_TARGET_PATH || "",
  mode: process.env.PYANCHOR_JOB_MODE === "chat" ? "chat" : "edit"
} as const;

let cancelRequested = false;
let cancelHandled = false;
const cancelController = new AbortController();
const activeChildren = new Set<ChildProcess>();

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

async function finalizeCancellation(signal: NodeJS.Signals) {
  if (cancelHandled) {
    return;
  }

  cancelHandled = true;
  cancelRequested = true;
  cancelController.abort();
  queueLog([`Cancel signal received. (${signal})`, "Tearing down active children."]);
  await flushRuntimeBuffers();
  await cancelActiveChildren(activeChildren);

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

// Caller-side options shared with every runCommand call: the worker's
// activeChildren set + cancel flag, so cancelActiveChildren() and the
// "rejected with CANCELED_ERROR on close" path keep working after the
// child-process module became dependency-injected.
const baseExecOptions = (): Pick<RunCommandOptions, "activeChildren" | "isCancelled" | "canceledError"> => ({
  activeChildren,
  isCancelled: () => cancelRequested,
  canceledError: CANCELED_ERROR
});

const workspaceDeps: WorkspaceDeps = {
  runCommand,
  framework,
  baseExecOptions,
  log: (lines) => queueLog(lines)
};

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
    () => prepareWorkspace(workspaceConfig, workspaceDeps)
  );

  if (mode === "edit" && !pyanchorConfig.fastReload) {
    await withHeartbeat(
      {
        step: "Installing workspace dependencies.",
        label: "Install"
      },
      () => installWorkspaceDependencies(workspaceConfig, workspaceDeps)
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
      () => buildWorkspace(workspaceConfig, workspaceDeps)
    );
  }

  await withHeartbeat(
    {
      step: "Syncing edits back to the app dir.",
      label: "Syncing"
    },
    () => syncToAppDir(workspaceConfig, workspaceDeps)
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

    await restartFrontend(workspaceConfig, workspaceDeps);
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
