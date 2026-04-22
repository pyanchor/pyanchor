/**
 * Streaming subprocess helper used by the OpenClaw adapter.
 *
 * Independent of the worker's runCommand because:
 *   - The adapter observes ctx.signal (AbortSignal) instead of the
 *     worker's module-level cancelRequested flag.
 *   - The adapter cares about line-by-line streaming so it can yield
 *     AgentEvents as they arrive, not after the process exits.
 */

import { type ChildProcess, spawn } from "node:child_process";

export type StreamEvent =
  | { kind: "stdout"; text: string }
  | { kind: "stderr"; text: string }
  | { kind: "close"; code: number; signal: NodeJS.Signals | null };

export interface SpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  /** Wall-clock timeout. SIGTERM then SIGKILL after a 5s grace. */
  timeoutMs?: number;
  /** When aborted, the child is SIGTERM'd then SIGKILL'd after 200ms. */
  signal?: AbortSignal;
}

/**
 * Spawn a process and stream stdout / stderr / close events as an
 * AsyncIterable. The iterator naturally terminates after `close`.
 *
 * Stdout / stderr are emitted as raw chunks (not lines). Callers are
 * responsible for buffering and line-splitting if they need it.
 */
export async function* streamSpawn(
  command: string,
  args: string[],
  options: SpawnOptions = {}
): AsyncIterable<StreamEvent> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const queue: StreamEvent[] = [];
  let waker: () => void = () => undefined;
  let pending = new Promise<void>((resolve) => {
    waker = resolve;
  });

  const wake = () => {
    const fire = waker;
    pending = new Promise<void>((resolve) => {
      waker = resolve;
    });
    fire();
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    queue.push({ kind: "stdout", text: chunk.toString() });
    wake();
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    queue.push({ kind: "stderr", text: chunk.toString() });
    wake();
  });

  child.on("error", () => {
    queue.push({ kind: "close", code: 1, signal: null });
    wake();
  });

  child.on("close", (code, signal) => {
    queue.push({ kind: "close", code: code ?? 1, signal });
    wake();
  });

  let timeoutId: NodeJS.Timeout | null = null;
  if (options.timeoutMs && options.timeoutMs > 0) {
    timeoutId = setTimeout(() => terminate(child, "SIGTERM"), options.timeoutMs);
  }

  const onAbort = () => terminate(child, "SIGTERM");
  if (options.signal) {
    if (options.signal.aborted) {
      terminate(child, "SIGTERM");
    } else {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  // Capture (don't crash on) stdin errors. If the child exits before
  // consuming stdin (no-op wrapper, broken openclaw binary, sudo
  // prompt rejection), Node would re-emit the stdin 'error' as an
  // uncaughtException without this listener. We surface the captured
  // error as a synthetic stderr chunk so the failure path retains
  // diagnostic context instead of silently dropping the signal.
  child.stdin?.on("error", (err: NodeJS.ErrnoException) => {
    queue.push({ kind: "stderr", text: `[stdin closed early: ${err.code ?? err.message}]\n` });
    wake();
  });

  if (options.input !== undefined) {
    child.stdin?.write(options.input);
  }
  child.stdin?.end();

  try {
    while (true) {
      while (queue.length > 0) {
        const event = queue.shift() as StreamEvent;
        yield event;
        if (event.kind === "close") return;
      }
      await pending;
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function terminate(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try {
    child.kill(signal);
  } catch {}
  // v0.33.0 — exitCode/signalCode gate before SIGKILL so we don't
  // accidentally signal a recycled PID. Mirrors the
  // child-process.ts fix. Caught by codex static audit.
  setTimeout(() => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (!child.pid) return;
    try {
      child.kill("SIGKILL");
    } catch {}
  }, 5000).unref();
}

/**
 * Convenience wrapper: drains streamSpawn into a single buffered result.
 * Used for short-lived calls (agents list, agents add, tee EDIT_BRIEF.md).
 */
export async function execBuffered(
  command: string,
  args: string[],
  options: SpawnOptions = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
  let stdout = "";
  let stderr = "";
  let code = 1;
  for await (const event of streamSpawn(command, args, options)) {
    if (event.kind === "stdout") stdout += event.text;
    else if (event.kind === "stderr") stderr += event.text;
    else code = event.code;
  }
  if (code !== 0) {
    const message = stderr.trim() || stdout.trim() || `${command} exited with ${code}`;
    throw new Error(message);
  }
  return { stdout, stderr, code };
}
