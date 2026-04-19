/**
 * Job lifecycle: dequeue from the queue, drive the agent stream,
 * finalize on success/failure/cancel.
 *
 * `runAdapterAgent` consumes the AgentRunner contract directly so
 * adapters (openclaw / codex / aider / claude-code) plug in without
 * the lifecycle knowing about any of them. State and runtime-buffer
 * dependencies are injected so this module is testable with a stub
 * AgentRunner against an in-memory state.
 */

import type {
  AgentEvent,
  AgentRunContext,
  AgentRunInput,
  AgentRunner
} from "../agents/types";
import type {
  AiEditMode,
  AiEditQueueItem,
  AiEditState
} from "../shared/types";

import {
  createMessage,
  pushMessageWithCap,
  updateUserMessageStatus
} from "./messages";

export interface LifecycleConfig {
  /** Absolute path the agent is allowed to mutate. */
  workspaceDir: string;
  /** Per-run timeout passed to AgentRunContext.timeoutMs. */
  agentTimeoutMs: number;
  /** Free-form model hint forwarded to AgentRunContext.model. */
  model: string;
  /** Reasoning level forwarded to AgentRunContext.thinking. */
  thinking: string;
  /** Error message thrown when the agent stream is interrupted by cancel. */
  canceledError: string;
  /** activeJob.jobId — the job this lifecycle instance is wired to. */
  jobIdForFinalize: string;
  /** activeJob.mode — used as the fallback when finalizeFailure has no mode. */
  jobModeForFinalize: AiEditMode;
  /** PYANCHOR_MAX_MESSAGES cap for pushMessage trimming. */
  maxMessages: number;
}

export interface LifecycleDeps {
  // ─── state I/O (injected from createStateIO) ────────────────────
  readState(): Promise<AiEditState>;
  writeState(state: AiEditState): Promise<AiEditState>;

  // ─── runtime-buffer (injected from createRuntimeBuffer) ─────────
  queueLog(lines: string[]): void;
  queueThinking(text: string): void;
  pulseState(args: { step?: string | null; label?: string | null }): Promise<void>;
  flushRuntimeBuffers(): Promise<void>;
  trimLog(lines: string[]): string[];
  stampLogLine(message: string): string;
  mergeThinking(current: string | null, incoming: string | null): string | null;

  // ─── cancel signaling (owned by runner) ─────────────────────────
  /** AbortSignal handed to AgentRunContext so adapters can short-circuit. */
  cancelSignal: AbortSignal;
  /** Polled inside the agent stream loop and the catch handler. */
  isCancelled(): boolean;
  /**
   * True iff finalizeCancellation already wrote a "canceled" final
   * state. finalizeFailure short-circuits on this so a duplicate
   * "canceled" write doesn't clobber the cancel-handler's state.
   */
  isCancelHandled(): boolean;
}

export interface AgentResult {
  summary: string;
  thinking: string | null;
  /** Non-null when the agent stream errored without being canceled. */
  failure: string | null;
}

export interface Lifecycle {
  /**
   * Pop the next queued job, mark it running in state, return it.
   * Returns null when the queue is empty.
   */
  dequeueNext(): Promise<AiEditQueueItem | null>;

  /** Write the success final state + assistant message. */
  finalizeSuccess(summary: string, thinking: string | null, mode: AiEditMode): Promise<void>;

  /**
   * Write the failure or canceled final state + system message.
   * No-op when isCancelHandled() is true and status === "canceled"
   * (the cancel handler already finalized).
   */
  finalizeFailure(message: string, status: "failed" | "canceled", mode: AiEditMode): Promise<void>;

  /**
   * Drive the AgentRunner for one turn. Forwards events to the
   * runtime buffer (logs, thinking, step pulses) and aggregates
   * the final summary + thinking. Bails out of the loop when
   * isCancelled() flips true. Throws canceledError if the agent
   * itself throws after a cancel — caller distinguishes via
   * `result.failure`.
   */
  runAdapterAgent(
    agent: AgentRunner,
    jobId: string,
    jobPrompt: string,
    jobTargetPath: string,
    mode: AiEditMode,
    recentMessages: AiEditState["messages"]
  ): Promise<AgentResult>;
}

export function createLifecycle(config: LifecycleConfig, deps: LifecycleDeps): Lifecycle {
  const buildAgentContext = (): AgentRunContext => ({
    workspaceDir: config.workspaceDir,
    timeoutMs: config.agentTimeoutMs,
    model: config.model,
    thinking: config.thinking,
    signal: deps.cancelSignal
  });

  async function dequeueNext(): Promise<AiEditQueueItem | null> {
    const state = await deps.readState();
    if (state.queue.length === 0) return null;

    const [next, ...remaining] = state.queue;

    await deps.writeState(
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
          activityLog: deps.trimLog([
            ...state.activityLog,
            deps.stampLogLine("Starting next queued job.")
          ])
        },
        next.jobId,
        "running"
      )
    );

    return next;
  }

  async function finalizeSuccess(
    summary: string,
    thinking: string | null,
    mode: AiEditMode
  ): Promise<void> {
    await deps.flushRuntimeBuffers();
    const state = await deps.readState();

    await deps.writeState(
      pushMessageWithCap(
        updateUserMessageStatus(
          {
            ...state,
            status: "done",
            pid: null,
            currentStep: summary,
            heartbeatAt: new Date().toISOString(),
            heartbeatLabel: "Done",
            thinking: deps.mergeThinking(state.thinking, thinking),
            error: null,
            completedAt: new Date().toISOString(),
            activityLog: deps.trimLog([
              ...state.activityLog,
              deps.stampLogLine("Job complete.")
            ])
          },
          config.jobIdForFinalize,
          "done"
        ),
        createMessage({
          jobId: config.jobIdForFinalize,
          role: "assistant",
          mode,
          text: summary,
          status: "done"
        }),
        config.maxMessages
      )
    );
  }

  async function finalizeFailure(
    message: string,
    status: "failed" | "canceled",
    mode: AiEditMode
  ): Promise<void> {
    if (status === "canceled" && deps.isCancelHandled()) return;

    await deps.flushRuntimeBuffers();
    const state = await deps.readState();

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
        activityLog: deps.trimLog([...state.activityLog, deps.stampLogLine(message)])
      },
      config.jobIdForFinalize,
      status
    );

    await deps.writeState(
      pushMessageWithCap(
        nextState,
        createMessage({
          jobId: config.jobIdForFinalize,
          role: "system",
          mode,
          text: message,
          status
        }),
        config.maxMessages
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
  ): Promise<AgentResult> {
    const summaryParts: string[] = [];
    const thinkingParts: string[] = [];

    try {
      if (agent.prepare) {
        await agent.prepare(buildAgentContext());
      }

      const input: AgentRunInput = {
        prompt: jobPrompt,
        targetPath: jobTargetPath,
        mode,
        recentMessages,
        jobId
      };

      const stream = agent.run(input, buildAgentContext());

      for await (const event of stream as AsyncIterable<AgentEvent>) {
        if (deps.isCancelled()) break;

        switch (event.type) {
          case "log":
            deps.queueLog([`[agent] ${event.text}`]);
            break;
          case "thinking":
            deps.queueThinking(event.text);
            thinkingParts.push(event.text);
            break;
          case "step":
            await deps.pulseState({
              step: event.description ?? event.label,
              label: event.label
            });
            break;
          case "result":
            summaryParts.push(event.summary);
            if (event.thinking) thinkingParts.push(event.thinking);
            break;
        }
      }
    } catch (error) {
      if (deps.isCancelled()) {
        throw new Error(config.canceledError);
      }
      const failureMessage = error instanceof Error ? error.message : String(error);
      return { summary: "", thinking: null, failure: failureMessage };
    }

    const summary =
      summaryParts.join("\n\n").trim() || (mode === "edit" ? "Edit complete." : "");
    const thinking = thinkingParts.join("\n\n").trim() || null;
    return { summary, thinking, failure: null };
  }

  return { dequeueNext, finalizeSuccess, finalizeFailure, runAdapterAgent };
}
