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
      options.activeChildren?.delete(child);
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    });

    child.on("close", (code, signal) => {
      options.activeChildren?.delete(child);
      if (timeoutId) clearTimeout(timeoutId);

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

    // Capture (don't crash on) stdin errors. The close handler above
    // already surfaces the non-zero exit through the normal failure
    // path; without this listener Node would re-emit the stdin
    // 'error' event as an uncaughtException and kill the worker.
    //
    // We retain the error code on the child object so failure paths
    // can include it in their diagnostic message instead of silently
    // dropping the EPIPE / EBADF / etc. signal.
    let stdinError: NodeJS.ErrnoException | null = null;
    child.stdin.on("error", (err: NodeJS.ErrnoException) => {
      stdinError = err;
    });

    // Augment the close handler's error message with the stdin error
    // when both are present. Wraps the existing close listener instead
    // of replacing it so the resolve/reject contract stays the same.
    child.on("close", () => {
      if (stdinError && options.onStderrChunk) {
        options.onStderrChunk(`[stdin closed early: ${stdinError.code ?? stdinError.message}]\n`);
      }
    });

    if (options.input) {
      child.stdin.write(options.input);
    }

    child.stdin.end();
  });
}
