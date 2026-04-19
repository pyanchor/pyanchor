import { describe, expect, it, vi } from "vitest";

import { createSyncStateClient } from "../../../src/runtime/overlay/polling";
import {
  createEmptyServerState,
  createUIState,
  type AiEditState,
  type UIState
} from "../../../src/runtime/overlay/state";

interface Harness {
  uiState: UIState;
  serverState: AiEditState;
  fetchJson: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  onOutcome: ReturnType<typeof vi.fn>;
  client: ReturnType<typeof createSyncStateClient>;
}

const makeHarness = (
  initialUI: Partial<UIState> = {},
  initialServer: Partial<AiEditState> = {}
): Harness => {
  const uiState: UIState = { ...createUIState(), ...initialUI };
  let serverState: AiEditState = { ...createEmptyServerState(), ...initialServer };

  const fetchJson = vi.fn();
  const render = vi.fn();
  const onOutcome = vi.fn();

  const client = createSyncStateClient({
    fetchJson: fetchJson as unknown as Parameters<typeof createSyncStateClient>[0]["fetchJson"],
    buildStatusUrl: () => "/_pyanchor/api/status",
    getUIState: () => uiState,
    getServerState: () => serverState,
    setServerState: (next) => {
      serverState = next;
    },
    mutateUIState: (mutator) => mutator(uiState),
    render,
    onOutcome
  });

  return {
    get uiState() {
      return uiState;
    },
    get serverState() {
      return serverState;
    },
    fetchJson,
    render,
    onOutcome,
    client
  };
};

describe("createSyncStateClient", () => {
  it("fetches /api/status, replaces serverState, and calls render once", async () => {
    const next = { ...createEmptyServerState(), status: "running" as const };
    const h = makeHarness();
    h.fetchJson.mockResolvedValue(next);

    await h.client.sync();

    expect(h.fetchJson).toHaveBeenCalledWith("/_pyanchor/api/status");
    expect(h.serverState.status).toBe("running");
    expect(h.render).toHaveBeenCalledOnce();
  });

  it("calls render() even when fetch rejects (UI stays responsive)", async () => {
    const h = makeHarness();
    h.fetchJson.mockRejectedValue(new Error("network"));

    await h.client.sync();

    expect(h.render).toHaveBeenCalledOnce();
    expect(h.serverState.status).toBe("idle"); // unchanged
  });

  it("clears lastSubmittedJobId once the user's job has left the queue AND is not the running job", async () => {
    const h = makeHarness({ lastSubmittedJobId: "mine" });
    h.fetchJson.mockResolvedValue({
      ...createEmptyServerState(),
      status: "idle",
      jobId: null,
      queue: [] // mine is gone
    });

    await h.client.sync();

    expect(h.uiState.lastSubmittedJobId).toBeNull();
  });

  it("keeps lastSubmittedJobId when the user's job is the currently-running one", async () => {
    const h = makeHarness({ lastSubmittedJobId: "mine" });
    h.fetchJson.mockResolvedValue({
      ...createEmptyServerState(),
      status: "running",
      jobId: "mine", // OUR job is now running — keep tracking
      queue: []
    });

    await h.client.sync();

    expect(h.uiState.lastSubmittedJobId).toBe("mine");
  });

  it("keeps lastSubmittedJobId while the user's job is still in the queue", async () => {
    const h = makeHarness({ lastSubmittedJobId: "mine" });
    h.fetchJson.mockResolvedValue({
      ...createEmptyServerState(),
      status: "running",
      jobId: "other",
      queue: [
        {
          jobId: "mine",
          prompt: "p",
          targetPath: "/",
          enqueuedAt: new Date(0).toISOString(),
          mode: "edit"
        }
      ]
    });

    await h.client.sync();

    expect(h.uiState.lastSubmittedJobId).toBe("mine");
  });

  it("keeps lastSubmittedJobId while server is canceling (transition state)", async () => {
    const h = makeHarness({ lastSubmittedJobId: "mine" });
    h.fetchJson.mockResolvedValue({
      ...createEmptyServerState(),
      status: "canceling",
      jobId: "other", // someone else's running job is being canceled
      queue: [] // ours is gone, but we keep lastSubmittedJobId across the transition
    });

    await h.client.sync();

    expect(h.uiState.lastSubmittedJobId).toBe("mine");
  });
});

describe("createSyncStateClient — outcome toasts", () => {
  it("emits 'done' outcome when status flips to done on the same jobId (with toast)", async () => {
    const h = makeHarness({}, { status: "running", jobId: "j1" });
    h.fetchJson.mockResolvedValue({
      ...createEmptyServerState(),
      status: "done",
      jobId: "j1",
      mode: "edit"
    });

    await h.client.sync(true);

    expect(h.onOutcome).toHaveBeenCalledWith({ kind: "done", mode: "edit" });
    // Toast path returns early — render() NOT called for outcome syncs
    expect(h.render).not.toHaveBeenCalled();
  });

  it("emits 'failed' outcome with the error message", async () => {
    const h = makeHarness({}, { status: "running", jobId: "j1" });
    h.fetchJson.mockResolvedValue({
      ...createEmptyServerState(),
      status: "failed",
      jobId: "j1",
      error: "build broke"
    });

    await h.client.sync(true);

    expect(h.onOutcome).toHaveBeenCalledWith({ kind: "failed", error: "build broke" });
  });

  it("falls back to a generic error message when {error} is null", async () => {
    const h = makeHarness({}, { status: "running", jobId: "j1" });
    h.fetchJson.mockResolvedValue({
      ...createEmptyServerState(),
      status: "failed",
      jobId: "j1",
      error: null
    });

    await h.client.sync(true);

    expect(h.onOutcome).toHaveBeenCalledWith({ kind: "failed", error: "Job failed." });
  });

  it("uses defaultJobFailedMessage override when {error} is null (i18n)", async () => {
    const initialUI: Partial<UIState> = {};
    const initialServer: Partial<AiEditState> = { status: "running", jobId: "j1" };

    let serverState: AiEditState = { ...createEmptyServerState(), ...initialServer };
    const fetchJson = vi.fn().mockResolvedValue({
      ...createEmptyServerState(),
      status: "failed",
      jobId: "j1",
      error: null
    });
    const onOutcome = vi.fn();
    const client = createSyncStateClient({
      fetchJson: fetchJson as unknown as Parameters<typeof createSyncStateClient>[0]["fetchJson"],
      buildStatusUrl: () => "/_pyanchor/api/status",
      getUIState: () => ({ ...createUIState(), ...initialUI }),
      getServerState: () => serverState,
      setServerState: (next) => {
        serverState = next;
      },
      mutateUIState: () => undefined,
      render: () => undefined,
      onOutcome,
      defaultJobFailedMessage: "작업 실패."
    });

    await client.sync(true);

    expect(onOutcome).toHaveBeenCalledWith({ kind: "failed", error: "작업 실패." });
  });

  it("emits 'canceled' outcome", async () => {
    const h = makeHarness({}, { status: "canceling", jobId: "j1" });
    h.fetchJson.mockResolvedValue({
      ...createEmptyServerState(),
      status: "canceled",
      jobId: "j1"
    });

    await h.client.sync(true);

    expect(h.onOutcome).toHaveBeenCalledWith({ kind: "canceled" });
  });

  it("does NOT emit an outcome when withOutcomeToast is false (silent poll)", async () => {
    const h = makeHarness({}, { status: "running", jobId: "j1" });
    h.fetchJson.mockResolvedValue({
      ...createEmptyServerState(),
      status: "done",
      jobId: "j1",
      mode: "edit"
    });

    await h.client.sync(false);

    expect(h.onOutcome).not.toHaveBeenCalled();
    expect(h.render).toHaveBeenCalledOnce();
  });

  it("does NOT emit an outcome when the jobId changed (different job, not a transition)", async () => {
    const h = makeHarness({}, { status: "running", jobId: "j1" });
    h.fetchJson.mockResolvedValue({
      ...createEmptyServerState(),
      status: "done",
      jobId: "j2", // different job
      mode: "edit"
    });

    await h.client.sync(true);

    expect(h.onOutcome).not.toHaveBeenCalled();
    expect(h.render).toHaveBeenCalledOnce();
  });
});
