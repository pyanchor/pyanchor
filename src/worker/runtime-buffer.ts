/**
 * Worker-side log/thinking buffer.
 *
 * Coalesces queued log lines and "thinking" segments into a single
 * state.json write every ~500ms so streaming agent output doesn't
 * thrash the file. Also owns the heartbeat helpers (pulseState,
 * withHeartbeat) since they share the same flush-then-write pattern.
 *
 * Returned as a closure-bound bundle so each createRuntimeBuffer()
 * call has its own pending queues + flush timer — what makes the
 * coalescing behavior unit-testable with fake timers.
 */

import type { AiEditState } from "../shared/types";

export interface RuntimeBufferOptions {
  /**
   * State mutator the buffer flushes through. The runner injects
   * stateIO.updateState here so the buffer doesn't need to know
   * about the lock chain or the file path.
   */
  updateState(
    mutator: (state: AiEditState) => AiEditState | Promise<AiEditState>
  ): Promise<AiEditState>;
  /** Activity-log line cap (PYANCHOR_MAX_ACTIVITY_LOG, default 80). */
  maxActivityLog: number;
  /** Hard cap on the merged thinking field's length, in chars. */
  maxThinkingChars: number;
  /** Flush coalesce window in ms. Default 500. Lower for tests. */
  flushIntervalMs?: number;
  /**
   * Optional sink for flush failures from the timer-driven path.
   * `setTimeout(flushRuntimeBuffers)` is fire-and-forget by design
   * — without this hook, a rejected flush (disk full, EROFS, perm
   * change after fork) would surface as an unhandledRejection and
   * crash the worker mid-job. Caller can wire to its own logger /
   * activity log.
   */
  onFlushError?: (error: unknown) => void;
}

export interface RuntimeBuffer {
  /** Push N lines into the activity-log queue. Schedules a flush. */
  queueLog(lines: string[]): void;
  /** Push a thinking segment into the queue. Schedules a flush. */
  queueThinking(text: string): void;
  /** Force-flush both queues into state. */
  flushRuntimeBuffers(): Promise<void>;
  /** Flush + write a heartbeat tick (currentStep / heartbeatLabel). */
  pulseState(args: { step?: string | null; label?: string | null }): Promise<void>;
  /**
   * Run task() while pulsing heartbeat at intervalMs. Logs the
   * step text to the activity log up front. Cleans up the timer
   * on resolve OR reject.
   */
  withHeartbeat<T>(
    config: { step: string; label: string; intervalMs?: number },
    task: () => Promise<T>
  ): Promise<T>;
  /** Pure helper: prepend [HH:MM:SS] to a message. Exposed for callers. */
  stampLogLine(message: string): string;
  /** Pure helper: trim activity log to the configured cap. */
  trimLog(lines: string[]): string[];
  /** Pure helper: merge two thinking buffers into one capped string. */
  mergeThinking(current: string | null, incoming: string | null): string | null;
}

export const stampLogLine = (message: string): string => {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  return `[${time}] ${message}`;
};

export const trimLogWithCap = (lines: string[], cap: number): string[] =>
  lines.filter(Boolean).slice(-cap);

/**
 * De-dupes the case where the agent's streamed thinking text is a
 * superset / subset of what's already buffered (common with reasoning
 * models that re-emit the running tail). Final string is capped at
 * maxThinkingChars from the right.
 */
export const mergeThinkingWithCap = (
  current: string | null,
  incoming: string | null,
  cap: number
): string | null => {
  const next = incoming?.trim();
  if (!next) return current;
  if (!current) return next.slice(-cap);
  if (next.includes(current)) return next.slice(-cap);
  if (current.includes(next)) return current.slice(-cap);
  return `${current}\n\n${next}`.slice(-cap);
};

export function createRuntimeBuffer(opts: RuntimeBufferOptions): RuntimeBuffer {
  const { updateState, maxActivityLog, maxThinkingChars } = opts;
  const flushIntervalMs = opts.flushIntervalMs ?? 500;

  let pendingLogLines: string[] = [];
  let pendingThinkingSegments: string[] = [];
  let flushTimer: NodeJS.Timeout | null = null;

  const trimLog = (lines: string[]) => trimLogWithCap(lines, maxActivityLog);
  const mergeThinking = (current: string | null, incoming: string | null) =>
    mergeThinkingWithCap(current, incoming, maxThinkingChars);

  const flushRuntimeBuffers = async () => {
    const logLines = pendingLogLines;
    const thinkingSegments = pendingThinkingSegments;
    pendingLogLines = [];
    pendingThinkingSegments = [];

    if (logLines.length === 0 && thinkingSegments.length === 0) return;

    await updateState((state) => ({
      ...state,
      activityLog: trimLog([...state.activityLog, ...logLines]),
      thinking: thinkingSegments.reduce(
        (acc, segment) => mergeThinking(acc, segment),
        state.thinking
      )
    }));
  };

  const scheduleRuntimeFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      // Swallow + report flush failures so they don't surface as
      // unhandledRejection and kill the worker. Real bugs still
      // bubble through the synchronous flushRuntimeBuffers() callers
      // (pulseState, withHeartbeat) where they're awaited.
      flushRuntimeBuffers().catch((error) => {
        opts.onFlushError?.(error);
      });
    }, flushIntervalMs);
  };

  const queueLog = (lines: string[]) => {
    const next = lines
      .flatMap((line) => line.split(/\r?\n/g))
      .map((line) => line.trim())
      .filter(Boolean)
      .map(stampLogLine);
    if (next.length === 0) return;
    pendingLogLines.push(...next);
    scheduleRuntimeFlush();
  };

  const queueThinking = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    pendingThinkingSegments.push(trimmed);
    scheduleRuntimeFlush();
  };

  const pulseState = async ({
    step,
    label
  }: {
    step?: string | null;
    label?: string | null;
  }) => {
    const timestamp = new Date().toISOString();
    await flushRuntimeBuffers();
    await updateState((state) => ({
      ...state,
      currentStep: step ?? state.currentStep,
      heartbeatAt: timestamp,
      heartbeatLabel: label ?? state.heartbeatLabel
    }));
  };

  const withHeartbeat = async <T>(
    config: { step: string; label: string; intervalMs?: number },
    task: () => Promise<T>
  ): Promise<T> => {
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
  };

  return {
    queueLog,
    queueThinking,
    flushRuntimeBuffers,
    pulseState,
    withHeartbeat,
    stampLogLine,
    trimLog,
    mergeThinking
  };
}
