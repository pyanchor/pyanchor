import { type ChildProcess } from "node:child_process";
import fsSync from "node:fs";

import { pyanchorConfig } from "../config";
import { selectAgent } from "../agents";
import { selectFramework } from "../frameworks";
import type { AiEditMode, AiEditState } from "../shared/types";

import { humanizeAgentFailure } from "./agent-error";
import { FileAuditSink, NoopAuditSink, sha256Hex, type AuditSink } from "../audit";
import {
  FetchWebhookSink,
  NoopWebhookSink,
  type WebhookFormat,
  type WebhookSink
} from "../webhooks";

import { cancelActiveChildren, runCommand, type RunCommandOptions } from "./child-process";
import { createLifecycle } from "./lifecycle";
import { createMessage, pushMessageWithCap, updateUserMessageStatus } from "./messages";
import { executeOutput, preparePrWorkspace, resolveOutputMode } from "./output";
import { createRuntimeBuffer } from "./runtime-buffer";
import { createStateIO } from "./state-io";
import {
  installWorkspaceDependencies,
  prepareWorkspace,
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

// v0.18.0: output mode + audit sink. resolveOutputMode normalizes
// the env value with a stderr warning on unknowns. Audit defaults
// to disabled so existing setups don't grow a new file silently;
// PYANCHOR_AUDIT_LOG=true opt-in.
const outputMode = resolveOutputMode(pyanchorConfig.outputMode);
const auditSink: AuditSink = pyanchorConfig.auditLogEnabled
  ? new FileAuditSink(pyanchorConfig.auditLogFile)
  : new NoopAuditSink();

// v0.20.0: webhook sink for edit_applied + pr_opened. Each URL is
// independent — operators can wire only the events they care about.
const webhookSink: WebhookSink =
  pyanchorConfig.webhookEditAppliedUrl || pyanchorConfig.webhookPrOpenedUrl
    ? new FetchWebhookSink({
        urls: {
          ...(pyanchorConfig.webhookEditAppliedUrl
            ? { edit_applied: pyanchorConfig.webhookEditAppliedUrl }
            : {}),
          ...(pyanchorConfig.webhookPrOpenedUrl
            ? { pr_opened: pyanchorConfig.webhookPrOpenedUrl }
            : {})
        },
        formats: {
          edit_applied: pyanchorConfig.webhookEditAppliedFormat as WebhookFormat,
          pr_opened: pyanchorConfig.webhookPrOpenedFormat as WebhookFormat
        }
      })
    : new NoopWebhookSink();
const jobStartedAtMs = Date.now();
const jobActor = process.env.PYANCHOR_JOB_ACTOR || undefined;
let auditEmitted = false;
let lastPrUrl: string | undefined;
const emitAuditOnce = async (
  outcome: "success" | "failed" | "canceled",
  error?: string
) => {
  if (auditEmitted) return;
  auditEmitted = true;
  await auditSink.emit({
    ts: new Date().toISOString(),
    run_id: process.env.PYANCHOR_JOB_ID || "",
    ...(jobActor ? { actor: jobActor } : {}),
    prompt_hash: sha256Hex(process.env.PYANCHOR_JOB_PROMPT || ""),
    target_path: process.env.PYANCHOR_JOB_TARGET_PATH || undefined,
    mode: process.env.PYANCHOR_JOB_MODE === "chat" ? "chat" : "edit",
    output_mode: outputMode,
    outcome,
    duration_ms: Date.now() - jobStartedAtMs,
    agent: pyanchorConfig.agent,
    ...(lastPrUrl ? { pr_url: lastPrUrl } : {}),
    ...(error ? { error } : {})
  });
};

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

// Local pushMessage with the runner-side message cap baked in. The
// pure form (with explicit cap) lives in worker/messages.ts; this
// alias keeps the cancel-handler / processJob call sites compact.
const pushMessage = (state: AiEditState, message: AiEditState["messages"][number]) =>
  pushMessageWithCap(state, message, MAX_MESSAGES);

async function finalizeCancellation(signal: NodeJS.Signals) {
  if (cancelHandled) {
    return;
  }

  cancelHandled = true;
  cancelRequested = true;
  cancelController.abort();
  await emitAuditOnce("canceled", `Canceled via ${signal}`);
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
  log: (lines) => queueLog(lines),
  // Allow the test sandbox (and unusual distros) to override the
  // sudo/flock wrappers without touching the worker source.
  sudoBin: pyanchorConfig.sudoBin,
  flockBin: pyanchorConfig.flockBin
};

const lifecycle = createLifecycle(
  {
    workspaceDir: pyanchorConfig.workspaceDir,
    agentTimeoutMs: pyanchorConfig.agentTimeoutSeconds * 1000,
    model: pyanchorConfig.model,
    thinking: pyanchorConfig.thinking,
    canceledError: CANCELED_ERROR,
    jobIdForFinalize: activeJob.jobId,
    jobModeForFinalize: activeJob.mode,
    maxMessages: MAX_MESSAGES
  },
  {
    readState,
    writeState,
    queueLog,
    queueThinking,
    pulseState,
    flushRuntimeBuffers,
    trimLog,
    stampLogLine,
    mergeThinking,
    cancelSignal: cancelController.signal,
    isCancelled: () => cancelRequested,
    isCancelHandled: () => cancelHandled
  }
);
const { dequeueNext, finalizeSuccess, finalizeFailure, runAdapterAgent } = lifecycle;

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

  // Round-14 #1: PR mode re-anchors the persistent workspace's .git
  // on the configured base branch BEFORE the agent runs. Without
  // this, .git stays on the previous PR's branch (rsync excludes
  // .git to preserve history) and the next branch we cut would have
  // the previous PR's tip as its parent — accidentally stacked PRs.
  if (mode === "edit" && outputMode === "pr") {
    await withHeartbeat(
      {
        step: "Re-anchoring workspace on base branch.",
        label: "Anchor"
      },
      () =>
        preparePrWorkspace(
          workspaceConfig.workspaceDir,
          {
            gitBin: pyanchorConfig.gitBin,
            ghBin: pyanchorConfig.ghBin,
            gitRemote: pyanchorConfig.gitRemote,
            gitBaseBranch: pyanchorConfig.gitBaseBranch,
            gitBranchPrefix: pyanchorConfig.gitBranchPrefix,
            jobId,
            prompt: process.env.PYANCHOR_JOB_PROMPT || "",
            mode: "edit"
          },
          workspaceDeps.runCommand
        )
    );
  }

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

  // v0.18.0: output mode dispatch. apply (default) keeps the existing
  // build → rsync → restart tail. dryrun stops after build.
  // v0.19.0: pr mode runs git checkout/commit/push + `gh pr create`
  // in the workspace dir (which must be a git working tree —
  // operator opt-in via docs/PRODUCTION-HARDENING.md).
  const outputResult = await executeOutput(outputMode, {
    workspaceConfig,
    workspaceDeps,
    runBuild: !pyanchorConfig.fastReload,
    shouldRestart: shouldRestartAfterEdit && !pyanchorConfig.fastReload,
    withHeartbeat,
    prConfig:
      outputMode === "pr"
        ? {
            gitBin: pyanchorConfig.gitBin,
            ghBin: pyanchorConfig.ghBin,
            gitRemote: pyanchorConfig.gitRemote,
            gitBaseBranch: pyanchorConfig.gitBaseBranch,
            gitBranchPrefix: pyanchorConfig.gitBranchPrefix,
            jobId,
            prompt: process.env.PYANCHOR_JOB_PROMPT || "",
            mode,
            ...(jobActor ? { actor: jobActor } : {})
          }
        : undefined
  });
  if (outputResult.prUrl) {
    lastPrUrl = outputResult.prUrl;
  }

  // v0.20.0: webhook dispatch on success (apply or pr). Fire-and-
  // forget — sink errors log to stderr and never block finalize.
  if (outputMode === "pr" && outputResult.prUrl) {
    void webhookSink.emit("pr_opened", {
      event: "pr_opened",
      ts: new Date().toISOString(),
      run_id: jobId,
      ...(jobActor ? { actor: jobActor } : {}),
      target_path: process.env.PYANCHOR_JOB_TARGET_PATH || undefined,
      mode,
      output_mode: outputMode,
      pr_url: outputResult.prUrl,
      agent: pyanchorConfig.agent
    });
  } else if (outputMode === "apply") {
    void webhookSink.emit("edit_applied", {
      event: "edit_applied",
      ts: new Date().toISOString(),
      run_id: jobId,
      ...(jobActor ? { actor: jobActor } : {}),
      target_path: process.env.PYANCHOR_JOB_TARGET_PATH || undefined,
      mode,
      output_mode: outputMode,
      agent: pyanchorConfig.agent
    });
  }

  // For apply mode with restart, the original code used to write the
  // "Restarting" heartbeat message via pushMessage (so the assistant
  // bubble showed up immediately) and then return false to defer
  // finalize until restart completed. After the v0.18 refactor the
  // restart happens inside executeOutput, so the assistant message
  // gets written here in one place via finalizeSuccess.
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
      await emitAuditOnce("success");
      if (!canContinue) {
        break;
      }
    } catch (error) {
      if (cancelRequested || (error instanceof Error && error.message === CANCELED_ERROR)) {
        await finalizeFailure(CANCELED_ERROR, "canceled", currentMode);
        await emitAuditOnce("canceled", CANCELED_ERROR);
      } else {
        // v0.21.0: humanize the upstream agent error before it reaches
        // state.error / audit log / activity log. Keeps the raw message
        // and appends a kind-specific hint when the classifier matches
        // (auth / rate_limit / timeout / network). Default = raw passthrough.
        const raw = error instanceof Error ? error.message : "Unknown error.";
        const message = humanizeAgentFailure(raw);
        await finalizeFailure(message, "failed", currentMode);
        await emitAuditOnce("failed", message);
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
    await emitAuditOnce("canceled", CANCELED_ERROR);
    return;
  }

  const raw = error instanceof Error ? error.message : "Unknown error.";
  const message = humanizeAgentFailure(raw);
  await finalizeFailure(message, "failed", activeJob.mode);
  await emitAuditOnce("failed", message);
});
