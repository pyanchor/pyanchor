import { describe, expect, it } from "vitest";

import {
  createMessage,
  pushMessageWithCap,
  updateUserMessageStatus
} from "../../src/worker/messages";
import type { AiEditMessage, AiEditState } from "../../src/shared/types";

const baseState = (overrides: Partial<AiEditState> = {}): AiEditState => ({
  configured: true,
  status: "running",
  jobId: "j1",
  pid: 1234,
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

const userMsg = (overrides: Partial<AiEditMessage> = {}): AiEditMessage => ({
  id: "m1",
  jobId: "j1",
  role: "user",
  mode: "edit",
  text: "hello",
  createdAt: new Date(0).toISOString(),
  status: "running",
  ...overrides
});

describe("createMessage", () => {
  it("returns a fresh uuid + ISO createdAt for each call", () => {
    const a = createMessage({
      jobId: "j",
      role: "user",
      mode: "edit",
      text: "t",
      status: "running"
    });
    const b = createMessage({
      jobId: "j",
      role: "user",
      mode: "edit",
      text: "t",
      status: "running"
    });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.id).not.toBe(b.id);
    expect(() => new Date(a.createdAt).toISOString()).not.toThrow();
  });

  it("forwards every input field verbatim", () => {
    const msg = createMessage({
      jobId: "abc",
      role: "assistant",
      mode: "chat",
      text: "answer",
      status: "done"
    });
    expect(msg.jobId).toBe("abc");
    expect(msg.role).toBe("assistant");
    expect(msg.mode).toBe("chat");
    expect(msg.text).toBe("answer");
    expect(msg.status).toBe("done");
  });

  it("accepts a null jobId (used for system messages without a job)", () => {
    const msg = createMessage({
      jobId: null,
      role: "system",
      mode: "edit",
      text: "info",
      status: null
    });
    expect(msg.jobId).toBeNull();
  });
});

describe("updateUserMessageStatus", () => {
  it("flips the status of the matching user message in place", () => {
    const state = baseState({
      messages: [userMsg({ status: "running" })]
    });
    const next = updateUserMessageStatus(state, "j1", "done");
    expect(next.messages[0]?.status).toBe("done");
  });

  it("leaves non-user messages unchanged even when jobId matches", () => {
    const state = baseState({
      messages: [
        userMsg({ id: "u", jobId: "j1", role: "user", status: "running" }),
        userMsg({ id: "a", jobId: "j1", role: "assistant", status: "done" })
      ]
    });
    const next = updateUserMessageStatus(state, "j1", "canceled");
    expect(next.messages[0]?.status).toBe("canceled");
    expect(next.messages[1]?.status).toBe("done");
  });

  it("returns a new array (no in-place mutation)", () => {
    const state = baseState({ messages: [userMsg()] });
    const next = updateUserMessageStatus(state, "j1", "done");
    expect(next.messages).not.toBe(state.messages);
    expect(state.messages[0]?.status).toBe("running");
  });

  it("is a no-op when no user message has the given jobId", () => {
    const state = baseState({ messages: [userMsg({ jobId: "other" })] });
    const next = updateUserMessageStatus(state, "missing", "done");
    expect(next.messages[0]?.status).toBe("running");
  });
});

describe("pushMessageWithCap", () => {
  it("appends the new message to the end of the list", () => {
    const state = baseState({ messages: [userMsg({ id: "old" })] });
    const next = pushMessageWithCap(state, userMsg({ id: "new", text: "second" }), 10);
    expect(next.messages.map((m) => m.id)).toEqual(["old", "new"]);
  });

  it("trims to the most recent N when length exceeds the cap", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      userMsg({ id: `m-${i}`, text: `msg-${i}` })
    );
    const state = baseState({ messages });
    const next = pushMessageWithCap(state, userMsg({ id: "new", text: "last" }), 3);
    expect(next.messages).toHaveLength(3);
    expect(next.messages.map((m) => m.id)).toEqual(["m-8", "m-9", "new"]);
  });

  it("returns a new array (no in-place mutation)", () => {
    const state = baseState({ messages: [userMsg()] });
    const next = pushMessageWithCap(state, userMsg({ id: "x" }), 10);
    expect(next.messages).not.toBe(state.messages);
    expect(state.messages).toHaveLength(1);
  });
});
