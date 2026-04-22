/**
 * Worker subprocess primitives — pure helpers around node:child_process
 * with no module-level state.
 *
 * Caller owns:
 *   - the Set<ChildProcess> of in-flight children (passed via
 *     options.activeChildren so cancelActiveChildren can SIGTERM them)
 *   - the cancel flag (passed via options.isCancelled, polled on close)
 *
 * This split is what makes runner.ts's job lifecycle testable without
 * spinning up the full sidecar.
 */

import { type ChildProcess, spawn } from "node:child_process";

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
  onStdoutChunk?: (text: string) => void;
  onStderrChunk?: (text: string) => void;
  /**
   * Bookkeeping set the caller maintains. The spawned child is added on
   * spawn and removed on close/error so cancelActiveChildren() can
   * SIGTERM whatever is still in flight.
   */
  activeChildren?: Set<ChildProcess>;
  /**
   * Polled inside the close handler. When this returns true on close,
   * the runCommand promise rejects with `canceledError` instead of the
   * normal exit-code path. Lets the caller distinguish a user cancel
   * from a real subprocess failure.
   */
  isCancelled?: () => boolean;
  /** Error message thrown when isCancelled() fires. */
  canceledError?: string;
}

const DEFAULT_CANCELED_ERROR = "Job canceled by user.";

export function killChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    child.kill(signal);
  } catch {}
}

/**
 * SIGTERM every tracked child, wait 200ms for graceful shutdown, then
 * SIGKILL the survivors. Used when the worker receives its own SIGTERM
 * (the cancel-from-API path).
 */
export async function cancelActiveChildren(children: Iterable<ChildProcess>): Promise<void> {
  const list = Array.from(children);
  for (const child of list) {
    killChild(child, "SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  for (const child of list) {
    killChild(child, "SIGKILL");
  }
}

export function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"]
    });

    options.activeChildren?.add(child);

    let stdout = "";
    let stderr = "";
    let timeoutId: NodeJS.Timeout | null = null;
    // v0.33.0 — track the nested SIGKILL fallback so we can cancel
    // it when the child exits cleanly. Pre-fix the timer fired 5s
    // after timeout regardless and only checked `child.pid`. In a
    // process-churn environment that PID could already belong to
    // an unrelated process, sending it an unintended SIGKILL.
    // Caught by codex static audit.
    let killTimerId: NodeJS.Timeout | null = null;

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        killChild(child, "SIGTERM");
        killTimerId = setTimeout(() => {
          // Re-check that the child hasn't already exited before
          // sending SIGKILL — exitCode/signalCode go non-null on
          // close, so this is the safe gate against PID reuse.
          if (child.exitCode !== null || child.signalCode !== null) return;
          killChild(child, "SIGKILL");
        }, 5000);
        killTimerId.unref();
      }, options.timeoutMs);
    }

    const clearTimers = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (killTimerId) {
        clearTimeout(killTimerId);
        killTimerId = null;
      }
    };

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
      options.activeChildren?.delete(child);
      clearTimers();
      reject(error);
    });

    // v0.33.2 — give pending stdin EPIPE / stdout/stderr drain
    // events one I/O tick to land in their buffers before we settle.
    // Pre-fix, when a child exited before reading stdin, the close
    // event could win the race against the stdin 'error' event,
    // so the synthetic "[stdin closed early: EPIPE]" note never
    // made it into the rejected error message — operators saw a
    // bare "exited with code N" without the actual root cause.
    // Caught by codex static audit (deferred chip from v0.33.0).
    child.on("close", (code, signal) => {
      options.activeChildren?.delete(child);
      clearTimers();
      // setImmediate runs at the end of the current poll phase,
      // after pending I/O callbacks (including queued stdin error
      // events). One tick is enough to drain — Node delivers all
      // pending events from the same poll batch before the
      // setImmediate fires.
      setImmediate(() => {
        if (options.isCancelled?.()) {
          reject(new Error(options.canceledError ?? DEFAULT_CANCELED_ERROR));
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
    });

    // Capture (don't crash on) stdin errors AND fold the diagnostic
    // into the stderr buffer. The first close handler above settles
    // the promise from `stderr` directly, so attaching the note as a
    // stderr chunk here ensures it lands BEFORE settle — which means
    // the thrown error message (when exit code is non-zero) actually
    // contains "[stdin closed early: EPIPE]" instead of just dropping
    // it on the floor. Also serves callers that don't pass
    // onStderrChunk (e.g. workspace.ts's prepare/sync/chown), since
    // those still see the augmented `stderr` field on the resolved
    // result.
    child.stdin.on("error", (err: NodeJS.ErrnoException) => {
      const note = `[stdin closed early: ${err.code ?? err.message}]\n`;
      stderr += note;
      options.onStderrChunk?.(note);
    });

    if (options.input) {
      child.stdin.write(options.input);
    }

    child.stdin.end();
  });
}
