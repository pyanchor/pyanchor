import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRuntimeBuffer,
  mergeThinkingWithCap,
  stampLogLine,
  trimLogWithCap
} from "../../src/worker/runtime-buffer";
import type { AiEditState } from "../../src/shared/types";

const baseState = (overrides: Partial<AiEditState> = {}): AiEditState => ({
  configured: true,
  status: "running",
  jobId: "j1",
  pid: process.pid,
  prompt: "p",
  targetPath: "/x",
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
  messages: [],
  ...overrides
});

interface RecordedUpdate {
  before: AiEditState;
  after: AiEditState;
}

const makeUpdateState = (initial: AiEditState) => {
  let current = initial;
  const calls: RecordedUpdate[] = [];
  const fn = vi
    .fn()
    .mockImplementation(async (mutator: (s: AiEditState) => AiEditState | Promise<AiEditState>) => {
      const before = current;
      current = await mutator(JSON.parse(JSON.stringify(current)));
      calls.push({ before, after: current });
      return current;
    });
  return { updateState: fn, calls, get: () => current };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pure helpers", () => {
  it("stampLogLine prefixes with [HH:MM:SS]", () => {
    vi.setSystemTime(new Date("2026-04-19T07:08:09Z"));
    const stamped = stampLogLine("hello");
    // local-tz formatting: just match the pattern, value depends on TZ
    expect(stamped).toMatch(/^\[\d{2}:\d{2}:\d{2}\] hello$/);
  });

  it("trimLogWithCap drops empty lines and slices to the cap", () => {
    expect(trimLogWithCap(["a", "", "b", "c", "d"], 3)).toEqual(["b", "c", "d"]);
  });

  it("mergeThinkingWithCap returns current when incoming is empty/whitespace", () => {
    expect(mergeThinkingWithCap("kept", "   ", 100)).toBe("kept");
    expect(mergeThinkingWithCap("kept", null, 100)).toBe("kept");
  });

  it("mergeThinkingWithCap returns capped incoming when current is null", () => {
    expect(mergeThinkingWithCap(null, "abcdef", 4)).toBe("cdef");
  });

  it("mergeThinkingWithCap dedupes when one is a substring of the other", () => {
    expect(mergeThinkingWithCap("abc", "abcdef", 100)).toBe("abcdef"); // incoming superset
    expect(mergeThinkingWithCap("abcdef", "abc", 100)).toBe("abcdef"); // current superset
  });

  it("mergeThinkingWithCap concatenates when neither is a substring", () => {
    expect(mergeThinkingWithCap("alpha", "beta", 100)).toBe("alpha\n\nbeta");
  });

  it("mergeThinkingWithCap caps the merged string from the right", () => {
    const merged = mergeThinkingWithCap("xxx", "yyy", 5);
    expect(merged?.length).toBe(5);
    expect(merged?.endsWith("yyy")).toBe(true);
  });
});

describe("queueLog + flushRuntimeBuffers (coalesce)", () => {
  it("does not call updateState until the flush window elapses", async () => {
    const { updateState, calls } = makeUpdateState(baseState());
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    buf.queueLog(["one", "two"]);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    expect(calls[0].after.activityLog.map((l) => l.replace(/^\[\d{2}:\d{2}:\d{2}\] /, ""))).toEqual([
      "one",
      "two"
    ]);
  });

  it("schedules only one flush even on repeated queueLog within the window", async () => {
    const { updateState, calls } = makeUpdateState(baseState());
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    buf.queueLog(["a"]);
    buf.queueLog(["b"]);
    buf.queueLog(["c"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    expect(calls[0].after.activityLog).toHaveLength(3);
  });

  it("splits multi-line strings, trims, and drops empties", async () => {
    const { updateState, calls } = makeUpdateState(baseState());
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    buf.queueLog(["line one\n  line two  \n\nline three", "  ", ""]);
    await vi.advanceTimersByTimeAsync(500);
    const lines = calls[0].after.activityLog.map((l) =>
      l.replace(/^\[\d{2}:\d{2}:\d{2}\] /, "")
    );
    expect(lines).toEqual(["line one", "line two", "line three"]);
  });

  it("queueLog with no usable lines does not schedule a flush", async () => {
    const { updateState, calls } = makeUpdateState(baseState());
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    buf.queueLog(["", "  ", "\n"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toHaveLength(0);
  });

  it("trims activityLog to maxActivityLog after merging", async () => {
    const initial = baseState({
      activityLog: Array.from({ length: 78 }, (_, i) => `[old-${i}]`)
    });
    const { updateState, calls } = makeUpdateState(initial);
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    buf.queueLog(["x", "y", "z"]); // pushes to 81 → cap to 80
    await vi.advanceTimersByTimeAsync(500);
    expect(calls[0].after.activityLog).toHaveLength(80);
  });

  it("flushRuntimeBuffers manually empties the queue and skips updateState if both queues empty", async () => {
    const { updateState, calls } = makeUpdateState(baseState());
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    await buf.flushRuntimeBuffers();
    expect(calls).toHaveLength(0);
  });

  it("invokes onFlushError when the timer-driven flush rejects (no unhandled rejection)", async () => {
    const updateState = vi.fn().mockRejectedValue(new Error("EROFS: read-only fs"));
    const onFlushError = vi.fn();
    const buf = createRuntimeBuffer({
      updateState,
      maxActivityLog: 80,
      maxThinkingChars: 8000,
      onFlushError
    });
    buf.queueLog(["something"]);
    await vi.advanceTimersByTimeAsync(500);
    // Let any pending microtasks (the .catch chain) settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(onFlushError).toHaveBeenCalledOnce();
    expect(onFlushError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((onFlushError.mock.calls[0]?.[0] as Error).message).toContain("EROFS");
  });

  it("does not throw when onFlushError is not supplied (silent swallow)", async () => {
    const updateState = vi.fn().mockRejectedValue(new Error("disk full"));
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    buf.queueLog(["x"]);
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    await Promise.resolve();
    // If the .catch wasn't there, vitest would fail this test with
    // an unhandledRejection. Reaching here means the swallow works.
    expect(true).toBe(true);
  });
});

describe("queueThinking", () => {
  it("merges multiple segments into the thinking field via mergeThinking", async () => {
    const { updateState, calls } = makeUpdateState(baseState({ thinking: null }));
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    buf.queueThinking("first chunk");
    buf.queueThinking("second chunk");
    await vi.advanceTimersByTimeAsync(500);
    expect(calls[0].after.thinking).toBe("first chunk\n\nsecond chunk");
  });

  it("ignores whitespace-only segments", async () => {
    const { updateState, calls } = makeUpdateState(baseState());
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    buf.queueThinking("   ");
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(0);
  });
});

describe("pulseState", () => {
  it("flushes pending logs first, then writes a heartbeat tick", async () => {
    const { updateState, calls } = makeUpdateState(baseState());
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    buf.queueLog(["pre-pulse"]);
    await buf.pulseState({ step: "Building.", label: "Build" });
    // Two updateState calls: one to flush the queue, one for the tick
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const final = calls[calls.length - 1].after;
    expect(final.currentStep).toBe("Building.");
    expect(final.heartbeatLabel).toBe("Build");
    expect(final.heartbeatAt).toBeTruthy();
  });

  it("preserves prior currentStep / heartbeatLabel when fields are omitted", async () => {
    const initial = baseState({ currentStep: "Existing.", heartbeatLabel: "Working" });
    const { updateState, calls } = makeUpdateState(initial);
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    await buf.pulseState({});
    const final = calls[calls.length - 1].after;
    expect(final.currentStep).toBe("Existing.");
    expect(final.heartbeatLabel).toBe("Working");
    expect(final.heartbeatAt).toBeTruthy();
  });
});

describe("withHeartbeat", () => {
  it("logs the step, pulses, runs task, returns the result, and clears the timer", async () => {
    const { updateState, calls } = makeUpdateState(baseState());
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    const result = await buf.withHeartbeat(
      { step: "Working hard.", label: "Work" },
      async () => "done"
    );
    expect(result).toBe("done");
    const stepLogged = calls.some((c) =>
      c.after.activityLog.some((line) => line.endsWith("Working hard."))
    );
    expect(stepLogged).toBe(true);
    const labelSet = calls.some((c) => c.after.heartbeatLabel === "Work");
    expect(labelSet).toBe(true);
  });

  it("clears the interval timer even when the task throws (no leaked pulses)", async () => {
    const { updateState, calls } = makeUpdateState(baseState());
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    await expect(
      buf.withHeartbeat({ step: "boom step", label: "Boom", intervalMs: 100 }, async () => {
        throw new Error("task failed");
      })
    ).rejects.toThrow("task failed");
    // Snapshot how many updateState calls happened up to (and including)
    // the throw. After the throw, advancing time by many heartbeat
    // windows must NOT cause additional updateState invocations.
    const callsAfterThrow = calls.length;
    await vi.advanceTimersByTimeAsync(1000); // 10 missed intervals if the timer leaked
    expect(calls.length).toBe(callsAfterThrow);
    // Belt-and-suspenders: vitest exposes the active fake-timer count.
    // After cleanup there should be zero pending heartbeat timers.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the configured intervalMs for repeated pulses while task runs", async () => {
    const { updateState, calls } = makeUpdateState(baseState());
    const buf = createRuntimeBuffer({ updateState, maxActivityLog: 80, maxThinkingChars: 8000 });
    let resolveTask!: () => void;
    const taskPromise = new Promise<void>((resolve) => {
      resolveTask = resolve;
    });
    const pending = buf.withHeartbeat({ step: "long", label: "Long", intervalMs: 100 }, () =>
      taskPromise
    );
    // Initial setup pulse already fired
    const initialCalls = calls.length;
    await vi.advanceTimersByTimeAsync(350);
    expect(calls.length).toBeGreaterThan(initialCalls);
    resolveTask();
    await pending;
  });
});
