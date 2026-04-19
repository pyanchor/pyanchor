import { describe, expect, it } from "vitest";

import {
  createEmptyServerState,
  createUIState,
  getComposerTitle,
  getPendingBubbleTitle,
  getPlaceholder,
  getStatusHeadline,
  getStatusMeta,
  getTrackedQueuePosition,
  shouldPoll,
  type AiEditQueueItem,
  type AiEditState,
  type UIState
} from "../../../src/runtime/overlay/state";
import { enStrings } from "../../../src/runtime/overlay/strings";

const queueItem = (overrides: Partial<AiEditQueueItem> = {}): AiEditQueueItem => ({
  jobId: "q1",
  prompt: "p",
  targetPath: "/",
  enqueuedAt: new Date(0).toISOString(),
  mode: "edit",
  ...overrides
});

const stateWith = (overrides: Partial<AiEditState> = {}): AiEditState => ({
  ...createEmptyServerState(),
  ...overrides
});

const uiWith = (overrides: Partial<UIState> = {}): UIState => ({
  ...createUIState(),
  ...overrides
});

describe("createUIState", () => {
  it("returns the documented defaults", () => {
    const ui = createUIState();
    expect(ui.isOpen).toBe(false);
    expect(ui.mode).toBe("edit");
    expect(ui.lastSubmittedJobId).toBeNull();
    expect(ui.toast).toBeNull();
  });

  it("returns a fresh object on every call (no shared reference)", () => {
    const a = createUIState();
    const b = createUIState();
    a.isOpen = true;
    expect(b.isOpen).toBe(false);
  });
});

describe("createEmptyServerState", () => {
  it("returns the documented idle baseline", () => {
    const s = createEmptyServerState();
    expect(s.status).toBe("idle");
    expect(s.queue).toEqual([]);
    expect(s.messages).toEqual([]);
    expect(s.configured).toBe(false);
  });
});

describe("getTrackedQueuePosition", () => {
  it("returns 0 when there is no submitted job to track", () => {
    const ui = uiWith({ lastSubmittedJobId: null });
    const s = stateWith({ queue: [queueItem({ jobId: "q1" })] });
    expect(getTrackedQueuePosition(ui, s)).toBe(0);
  });

  it("returns the 1-based position when the tracked job is queued", () => {
    const ui = uiWith({ lastSubmittedJobId: "q2" });
    const s = stateWith({
      queue: [queueItem({ jobId: "q1" }), queueItem({ jobId: "q2" }), queueItem({ jobId: "q3" })]
    });
    expect(getTrackedQueuePosition(ui, s)).toBe(2);
  });

  it("returns 0 when the tracked job is no longer in the queue (started or canceled)", () => {
    const ui = uiWith({ lastSubmittedJobId: "q2" });
    const s = stateWith({ queue: [queueItem({ jobId: "q1" })] });
    expect(getTrackedQueuePosition(ui, s)).toBe(0);
  });
});

describe("shouldPoll", () => {
  it("polls while server is running", () => {
    expect(shouldPoll(uiWith(), stateWith({ status: "running" }))).toBe(true);
  });

  it("polls while server is canceling", () => {
    expect(shouldPoll(uiWith(), stateWith({ status: "canceling" }))).toBe(true);
  });

  it("polls while the global queue is non-empty", () => {
    expect(
      shouldPoll(uiWith(), stateWith({ status: "idle", queue: [queueItem()] }))
    ).toBe(true);
  });

  it("polls while the user's tracked job is in the queue", () => {
    const ui = uiWith({ lastSubmittedJobId: "mine" });
    const s = stateWith({ status: "idle", queue: [queueItem({ jobId: "mine" })] });
    expect(shouldPoll(ui, s)).toBe(true);
  });

  it("stops polling when idle with empty queue and no tracked job", () => {
    expect(shouldPoll(uiWith(), stateWith({ status: "idle", queue: [] }))).toBe(false);
  });
});

describe("getStatusHeadline", () => {
  it("shows the queue position when the user's tracked job is queued (and server is not running)", () => {
    const ui = uiWith({ lastSubmittedJobId: "mine" });
    const s = stateWith({
      status: "idle",
      queue: [queueItem({ jobId: "other" }), queueItem({ jobId: "mine" })]
    });
    const headline = getStatusHeadline(ui, s, { thinkingPreview: "" }, enStrings);
    expect(headline).toContain("Queued at position 2");
  });

  it("prefers the live thinking preview while running", () => {
    const s = stateWith({ status: "running", heartbeatLabel: "Build" });
    const headline = getStatusHeadline(uiWith(), s, { thinkingPreview: "scanning auth files" }, enStrings);
    expect(headline).toBe("scanning auth files");
  });

  it("falls back to heartbeatLabel when no thinking preview", () => {
    const s = stateWith({ status: "running", heartbeatLabel: "Install" });
    const headline = getStatusHeadline(uiWith(), s, { thinkingPreview: "" }, enStrings);
    expect(headline).toBe("Install");
  });

  it("falls back to currentStep when no thinking + no heartbeat label", () => {
    const s = stateWith({ status: "running", currentStep: "Preparing workspace." });
    const headline = getStatusHeadline(uiWith(), s, { thinkingPreview: "" }, enStrings);
    expect(headline).toBe("Preparing workspace.");
  });

  it("uses the chat-mode generic fallback when running with nothing else", () => {
    const s = stateWith({ status: "running", mode: "chat" });
    expect(getStatusHeadline(uiWith(), s, { thinkingPreview: "" }, enStrings)).toBe(
      "Reading your question."
    );
  });

  it("uses the edit-mode generic fallback when running with nothing else", () => {
    const s = stateWith({ status: "running", mode: "edit" });
    expect(getStatusHeadline(uiWith(), s, { thinkingPreview: "" }, enStrings)).toBe(
      "Reading the page and the code."
    );
  });

  it("shows the error message on failed", () => {
    const s = stateWith({ status: "failed", error: "build failed" });
    expect(getStatusHeadline(uiWith(), s, { thinkingPreview: "" }, enStrings)).toBe("build failed");
  });

  it("shows a generic 'Job failed.' when failed with no error", () => {
    const s = stateWith({ status: "failed", error: null });
    expect(getStatusHeadline(uiWith(), s, { thinkingPreview: "" }, enStrings)).toBe("Job failed.");
  });

  it("differentiates done summary by mode", () => {
    const chatDone = stateWith({ status: "done", mode: "chat" });
    const editDone = stateWith({ status: "done", mode: "edit" });
    expect(getStatusHeadline(uiWith(), chatDone, { thinkingPreview: "" }, enStrings)).toBe("Answer ready.");
    expect(getStatusHeadline(uiWith(), editDone, { thinkingPreview: "" }, enStrings)).toBe("Edit complete.");
  });

  it("returns the empty string when idle and no tracked queue position", () => {
    expect(getStatusHeadline(uiWith(), stateWith({ status: "idle" }), { thinkingPreview: "" }, enStrings)).toBe(
      ""
    );
  });
});

describe("getStatusMeta", () => {
  it("joins heartbeat label, formatted time, and queue position with ' / '", () => {
    const ui = uiWith({ lastSubmittedJobId: "mine" });
    const s = stateWith({
      heartbeatLabel: "Build",
      heartbeatAt: "2026-04-19T03:14:07Z",
      queue: [queueItem({ jobId: "mine" })]
    });
    const meta = getStatusMeta(ui, s, "03:14:07", enStrings);
    expect(meta).toBe("Build / 03:14:07 / Your request: position 1");
  });

  it("omits null pieces", () => {
    const s = stateWith({ heartbeatLabel: null, heartbeatAt: null });
    expect(getStatusMeta(uiWith(), s, null, enStrings)).toBe("");
  });

  it("uses strings.statusYourPosition for the queue breadcrumb (i18n)", () => {
    const koStrings = {
      ...enStrings,
      statusYourPosition: (n: number) => `대기열 ${n}번째`
    };
    const ui = uiWith({ lastSubmittedJobId: "mine" });
    const s = stateWith({
      heartbeatLabel: null,
      heartbeatAt: null,
      queue: [queueItem({ jobId: "mine" })]
    });
    expect(getStatusMeta(ui, s, null, koStrings)).toBe("대기열 1번째");
  });
});

describe("getPlaceholder + getComposerTitle", () => {
  it("uses edit-flavored copy when mode is 'edit'", () => {
    expect(getPlaceholder("edit", enStrings)).toContain("login/signup");
    expect(getComposerTitle("edit", enStrings)).toBe("Edit request");
  });

  it("uses chat-flavored copy when mode is 'chat'", () => {
    expect(getPlaceholder("chat", enStrings)).toContain("explain why this page");
    expect(getComposerTitle("chat", enStrings)).toBe("Send a question");
  });
});

describe("getPendingBubbleTitle", () => {
  it("shows 'Drafting your request.' while the server is canceling", () => {
    const s = stateWith({ status: "canceling", mode: "edit" });
    expect(getPendingBubbleTitle(uiWith({ mode: "edit" }), s, enStrings)).toBe("Drafting your request.");
  });

  it("shows 'Reading page and code.' when the active job is in edit mode", () => {
    const s = stateWith({ status: "running", mode: "edit" });
    expect(getPendingBubbleTitle(uiWith({ mode: "chat" }), s, enStrings)).toBe("Reading page and code.");
  });

  it("shows 'Reading page and code.' when the UI mode is edit (even if server hasn't started)", () => {
    const s = stateWith({ status: "running", mode: null });
    expect(getPendingBubbleTitle(uiWith({ mode: "edit" }), s, enStrings)).toBe("Reading page and code.");
  });

  it("shows 'Drafting an answer.' for a chat-mode running job", () => {
    const s = stateWith({ status: "running", mode: "chat" });
    expect(getPendingBubbleTitle(uiWith({ mode: "chat" }), s, enStrings)).toBe("Drafting an answer.");
  });
});
