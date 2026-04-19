import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLifecycle, type LifecycleConfig, type LifecycleDeps } from "../../src/worker/lifecycle";
import type {
  AgentEvent,
  AgentRunContext,
  AgentRunInput,
  AgentRunner
} from "../../src/agents/types";
import type { AiEditQueueItem, AiEditState } from "../../src/shared/types";

const baseState = (overrides: Partial<AiEditState> = {}): AiEditState => ({
  configured: true,
  status: "idle",
  jobId: null,
  pid: null,
  prompt: "",
  targetPath: "",
  mode: null,
  currentStep: null,
  heartbeatAt: null,
  heartbeatLabel: null,
  thinking: null,
  activityLog: [],
  error: null,
  startedAt: null,
  completedAt: null,
  updatedAt: new Date(0).toISOString(),
  queue: [],
  messages: [],
  ...overrides
});

const queueItem = (overrides: Partial<AiEditQueueItem> = {}): AiEditQueueItem => ({
  jobId: "job-q",
  prompt: "queued prompt",
  targetPath: "/dashboard",
  enqueuedAt: new Date(0).toISOString(),
  mode: "edit",
  ...overrides
});

interface Harness {
  config: LifecycleConfig;
  deps: LifecycleDeps;
  store: { current: AiEditState };
  cancel: { requested: boolean; handled: boolean; controller: AbortController };
  log: ReturnType<typeof vi.fn>;
  thinking: ReturnType<typeof vi.fn>;
  pulse: ReturnType<typeof vi.fn>;
}

const makeHarness = (
  initial: AiEditState = baseState(),
  overrides: Partial<LifecycleConfig> = {}
): Harness => {
  const store = { current: initial };
  const cancel = { requested: false, handled: false, controller: new AbortController() };

  const log = vi.fn();
  const thinking = vi.fn();
  const pulse = vi.fn().mockResolvedValue(undefined);

  const config: LifecycleConfig = {
    workspaceDir: "/var/work",
    agentTimeoutMs: 60_000,
    model: "test/model",
    thinking: "medium",
    canceledError: "Job canceled by user.",
    jobIdForFinalize: "active-job",
    jobModeForFinalize: "edit",
    maxMessages: 24,
    ...overrides
  };

  const deps: LifecycleDeps = {
    readState: async () => JSON.parse(JSON.stringify(store.current)),
    writeState: async (next) => {
      store.current = { ...next, updatedAt: new Date().toISOString() };
      return store.current;
    },
    queueLog: log,
    queueThinking: thinking,
    pulseState: pulse,
    flushRuntimeBuffers: async () => undefined,
    trimLog: (lines) => lines.slice(-80),
    stampLogLine: (msg) => `[00:00:00] ${msg}`,
    mergeThinking: (curr, inc) => (inc ? (curr ? `${curr}\n\n${inc}` : inc) : curr),
    cancelSignal: cancel.controller.signal,
    isCancelled: () => cancel.requested,
    isCancelHandled: () => cancel.handled
  };

  return { config, deps, store, cancel, log, thinking, pulse };
};

describe("dequeueNext", () => {
  it("returns null when the queue is empty", async () => {
    const h = makeHarness(baseState({ queue: [] }));
    const lc = createLifecycle(h.config, h.deps);
    expect(await lc.dequeueNext()).toBeNull();
  });

  it("pops the first queue item and writes the running state", async () => {
    const item = queueItem({ jobId: "j1", prompt: "first" });
    const h = makeHarness(baseState({ queue: [item, queueItem({ jobId: "j2", prompt: "second" })] }));
    const lc = createLifecycle(h.config, h.deps);

    const result = await lc.dequeueNext();
    expect(result?.jobId).toBe("j1");
    expect(h.store.current.status).toBe("running");
    expect(h.store.current.jobId).toBe("j1");
    expect(h.store.current.prompt).toBe("first");
    expect(h.store.current.queue).toHaveLength(1);
    expect(h.store.current.queue[0]?.jobId).toBe("j2");
    expect(h.store.current.activityLog.at(-1)).toContain("Starting next queued job.");
    expect(h.store.current.currentStep).toContain("1 remaining");
  });

  it("flips the popped user message status from 'queued' to 'running'", async () => {
    const item = queueItem({ jobId: "j1" });
    const h = makeHarness(
      baseState({
        queue: [item],
        messages: [
          {
            id: "m1",
            jobId: "j1",
            role: "user",
            mode: "edit",
            text: "hi",
            createdAt: new Date(0).toISOString(),
            status: "queued"
          }
        ]
      })
    );
    const lc = createLifecycle(h.config, h.deps);
    await lc.dequeueNext();
    expect(h.store.current.messages[0]?.status).toBe("running");
  });
});

describe("finalizeSuccess", () => {
  it("writes the done final state with assistant message + Done heartbeat", async () => {
    const h = makeHarness(
      baseState({
        status: "running",
        jobId: "active-job",
        messages: [
          {
            id: "u",
            jobId: "active-job",
            role: "user",
            mode: "edit",
            text: "hi",
            createdAt: new Date(0).toISOString(),
            status: "running"
          }
        ]
      })
    );
    const lc = createLifecycle(h.config, h.deps);
    await lc.finalizeSuccess("All done.", "thinking trace", "edit");
    expect(h.store.current.status).toBe("done");
    expect(h.store.current.heartbeatLabel).toBe("Done");
    expect(h.store.current.currentStep).toBe("All done.");
    expect(h.store.current.thinking).toContain("thinking trace");
    const userMsg = h.store.current.messages.find((m) => m.role === "user");
    const assistantMsg = h.store.current.messages.find((m) => m.role === "assistant");
    expect(userMsg?.status).toBe("done");
    expect(assistantMsg?.text).toBe("All done.");
  });

  it("preserves prior thinking by merging with the new chunk", async () => {
    const h = makeHarness(
      baseState({ status: "running", jobId: "active-job", thinking: "earlier" })
    );
    const lc = createLifecycle(h.config, h.deps);
    await lc.finalizeSuccess("ok", "later", "chat");
    expect(h.store.current.thinking).toContain("earlier");
    expect(h.store.current.thinking).toContain("later");
  });
});

describe("finalizeFailure", () => {
  it("writes the failed final state with system error message", async () => {
    const h = makeHarness(
      baseState({
        status: "running",
        jobId: "active-job",
        messages: [
          {
            id: "u",
            jobId: "active-job",
            role: "user",
            mode: "edit",
            text: "hi",
            createdAt: new Date(0).toISOString(),
            status: "running"
          }
        ]
      })
    );
    const lc = createLifecycle(h.config, h.deps);
    await lc.finalizeFailure("build failed", "failed", "edit");
    expect(h.store.current.status).toBe("failed");
    expect(h.store.current.heartbeatLabel).toBe("Failed");
    expect(h.store.current.error).toBe("build failed");
    const sysMsg = h.store.current.messages.find((m) => m.role === "system");
    expect(sysMsg?.text).toBe("build failed");
  });

  it("short-circuits when status='canceled' and isCancelHandled() returns true", async () => {
    const initial = baseState({ status: "running", currentStep: "untouched" });
    const h = makeHarness(initial);
    h.cancel.handled = true; // simulate finalizeCancellation already ran
    const lc = createLifecycle(h.config, h.deps);
    await lc.finalizeFailure("late cancel", "canceled", "edit");
    // No write should have happened — currentStep stayed untouched
    expect(h.store.current.currentStep).toBe("untouched");
    expect(h.store.current.status).toBe("running");
  });

  it("DOES write when status='failed' even if isCancelHandled() is true (no short-circuit)", async () => {
    const h = makeHarness(baseState({ status: "running" }));
    h.cancel.handled = true;
    const lc = createLifecycle(h.config, h.deps);
    await lc.finalizeFailure("real failure", "failed", "edit");
    expect(h.store.current.status).toBe("failed");
  });
});

const makeFakeAgent = (
  events: AgentEvent[],
  overrides: Partial<AgentRunner> = {}
): AgentRunner => ({
  name: "fake",
  async *run(_input: AgentRunInput, _ctx: AgentRunContext) {
    for (const event of events) yield event;
  },
  ...overrides
});

describe("runAdapterAgent", () => {
  it("aggregates a single 'result' event into the summary + thinking return", async () => {
    const h = makeHarness();
    const lc = createLifecycle(h.config, h.deps);
    const agent = makeFakeAgent([
      { type: "thinking", text: "let me think" },
      { type: "log", text: "looking at file" },
      { type: "result", summary: "Made the change.", thinking: "trailing thought" }
    ]);
    const result = await lc.runAdapterAgent(agent, "j1", "do it", "/x", "edit", []);
    expect(result.failure).toBeNull();
    expect(result.summary).toBe("Made the change.");
    expect(result.thinking).toContain("let me think");
    expect(result.thinking).toContain("trailing thought");
    expect(h.log).toHaveBeenCalledWith(["[agent] looking at file"]);
    expect(h.thinking).toHaveBeenCalledWith("let me think");
  });

  it("forwards 'step' events through pulseState with description fallback", async () => {
    const h = makeHarness();
    const lc = createLifecycle(h.config, h.deps);
    const agent = makeFakeAgent([
      { type: "step", label: "Searching", description: "Searching for the route file" },
      { type: "step", label: "Editing" }, // no description → label is the step text
      { type: "result", summary: "ok" }
    ]);
    await lc.runAdapterAgent(agent, "j1", "p", "/x", "edit", []);
    expect(h.pulse).toHaveBeenCalledWith({
      step: "Searching for the route file",
      label: "Searching"
    });
    expect(h.pulse).toHaveBeenCalledWith({ step: "Editing", label: "Editing" });
  });

  it("falls back to 'Edit complete.' summary when the agent emits no result text in edit mode", async () => {
    const h = makeHarness();
    const lc = createLifecycle(h.config, h.deps);
    const agent = makeFakeAgent([{ type: "log", text: "did stuff" }]);
    const result = await lc.runAdapterAgent(agent, "j1", "p", "/x", "edit", []);
    expect(result.summary).toBe("Edit complete.");
  });

  it("returns an empty summary in chat mode when the agent emits no result", async () => {
    const h = makeHarness();
    const lc = createLifecycle(h.config, h.deps);
    const agent = makeFakeAgent([{ type: "log", text: "answered" }]);
    const result = await lc.runAdapterAgent(agent, "j1", "p", "/x", "chat", []);
    expect(result.summary).toBe("");
  });

  it("returns failure (not throw) when the agent throws while NOT canceled", async () => {
    const h = makeHarness();
    const lc = createLifecycle(h.config, h.deps);
    const agent: AgentRunner = {
      name: "fake",
      async *run() {
        throw new Error("agent crashed");
      }
    };
    const result = await lc.runAdapterAgent(agent, "j1", "p", "/x", "edit", []);
    expect(result.failure).toBe("agent crashed");
    expect(result.summary).toBe("");
  });

  it("THROWS canceledError when the agent throws while canceled (so processJob distinguishes cancel from fail)", async () => {
    const h = makeHarness();
    h.cancel.requested = true;
    const lc = createLifecycle(h.config, h.deps);
    const agent: AgentRunner = {
      name: "fake",
      async *run() {
        throw new Error("aborted by signal");
      }
    };
    await expect(
      lc.runAdapterAgent(agent, "j1", "p", "/x", "edit", [])
    ).rejects.toThrow("Job canceled by user.");
  });

  it("breaks out of the event loop when isCancelled() flips true mid-stream", async () => {
    const h = makeHarness();
    const lc = createLifecycle(h.config, h.deps);
    let yielded = 0;
    const agent: AgentRunner = {
      name: "fake",
      async *run() {
        for (let i = 0; i < 100; i++) {
          yielded++;
          if (i === 2) {
            // simulate the cancel flag flipping after 3 events
            h.cancel.requested = true;
          }
          yield { type: "log", text: `event ${i}` };
        }
        yield { type: "result", summary: "should-not-reach" };
      }
    };
    const result = await lc.runAdapterAgent(agent, "j1", "p", "/x", "edit", []);
    expect(result.summary).toBe("Edit complete."); // no result event consumed
    expect(yielded).toBeLessThan(100); // loop broke early
  });

  it("invokes prepare() once when the agent provides one", async () => {
    const h = makeHarness();
    const lc = createLifecycle(h.config, h.deps);
    const prepare = vi.fn().mockResolvedValue(undefined);
    const agent: AgentRunner = {
      name: "fake",
      prepare,
      async *run() {
        yield { type: "result", summary: "ok" };
      }
    };
    await lc.runAdapterAgent(agent, "j1", "p", "/x", "edit", []);
    expect(prepare).toHaveBeenCalledOnce();
    const ctx = prepare.mock.calls[0]?.[0] as AgentRunContext;
    expect(ctx.workspaceDir).toBe("/var/work");
    expect(ctx.signal).toBe(h.cancel.controller.signal);
  });
});

describe("scenario B — cancel-during-dequeue boundary (codex round-4 deferred)", () => {
  it(
    "races a queued dequeue against a cancel that flips MID-write; final state is consistent " +
      "(either dequeue wins → status=running with new job, or cancel wins → finalizeFailure short-circuits)",
    async () => {
      // Setup: one queued job, no current job. dequeueNext is mid-flight
      // when the cancel flag flips and finalizeFailure("...", "canceled")
      // arrives. Without the isCancelHandled short-circuit on
      // status==="canceled", finalizeFailure would clobber the running
      // state that dequeueNext just wrote.
      const item = queueItem({ jobId: "race-job" });
      const h = makeHarness(baseState({ queue: [item] }));
      const lc = createLifecycle(h.config, h.deps);

      // Race: kick off the dequeue, then immediately flip cancel.handled
      // (simulating finalizeCancellation racing past) and call
      // finalizeFailure with the canceled status.
      const dequeuePromise = lc.dequeueNext();
      h.cancel.handled = true;
      const cancelPromise = lc.finalizeFailure(
        "Job canceled by user.",
        "canceled",
        "edit"
      );

      await Promise.all([dequeuePromise, cancelPromise]);

      // dequeueNext succeeded; finalizeFailure short-circuited because
      // isCancelHandled() returned true. Status reflects the dequeue,
      // not a stale "canceled" overwrite.
      expect(h.store.current.status).toBe("running");
      expect(h.store.current.jobId).toBe("race-job");
      expect(h.store.current.error).toBeNull();
    }
  );

  it(
    "when cancel is the WINNER of the race (handled flag set BEFORE dequeue starts), the " +
      "finalizeFailure 'canceled' short-circuit prevents clobbering whatever the cancel handler wrote",
    async () => {
      // Setup: the cancel handler has already finalized state (status='canceled').
      // A late finalizeFailure('...', 'canceled') from the lifecycle path
      // must not overwrite it.
      const cancelHandlerWrote = baseState({
        status: "canceled",
        jobId: "active-job",
        currentStep: null,
        heartbeatLabel: "Canceled",
        error: "Job canceled by user.",
        completedAt: new Date(0).toISOString()
      });
      const h = makeHarness(cancelHandlerWrote);
      h.cancel.handled = true;
      const lc = createLifecycle(h.config, h.deps);

      await lc.finalizeFailure("late echo of cancel", "canceled", "edit");

      // No write — state still shows the original cancel-handler output.
      expect(h.store.current.status).toBe("canceled");
      expect(h.store.current.error).toBe("Job canceled by user.");
      expect(h.store.current.heartbeatLabel).toBe("Canceled");
    }
  );

  it(
    "a real failure during cancel teardown still gets written (status='failed' bypasses the cancel-handled short-circuit)",
    async () => {
      const h = makeHarness(baseState({ status: "running" }));
      h.cancel.handled = true;
      const lc = createLifecycle(h.config, h.deps);
      await lc.finalizeFailure("rsync sync-back failed", "failed", "edit");
      expect(h.store.current.status).toBe("failed");
      expect(h.store.current.error).toBe("rsync sync-back failed");
    }
  );
});

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});
