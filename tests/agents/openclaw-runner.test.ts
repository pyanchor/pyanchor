import { describe, expect, it } from "vitest";

import {
  OpenClawAgentRunner,
  buildAgentMessage,
  parseLine
} from "../../src/agents/openclaw";
import type { AgentEvent } from "../../src/agents/types";
import type { AiEditMessage } from "../../src/shared/types";

const message = (overrides: Partial<AiEditMessage> = {}): AiEditMessage => ({
  id: "id",
  jobId: "job",
  role: "user",
  mode: "edit",
  text: "hi",
  createdAt: new Date(0).toISOString(),
  status: null,
  ...overrides
});

const drainParseLine = (lines: string[]): AgentEvent[] => Array.from(parseLine(lines));

describe("OpenClawAgentRunner", () => {
  it("registers under name 'openclaw'", () => {
    expect(new OpenClawAgentRunner().name).toBe("openclaw");
  });
});

describe("buildAgentMessage", () => {
  it("uses auth-route focus copy for /login", () => {
    const text = buildAgentMessage({
      prompt: "p",
      targetPath: "/login",
      mode: "edit",
      recentMessages: [],
      jobId: "j"
    });
    expect(text).toContain("Read EDIT_BRIEF.md first");
    expect(text).toContain("Focus on the auth routes");
    expect(text).toContain("Run a production build");
  });

  it("uses generic route focus for arbitrary paths", () => {
    const text = buildAgentMessage({
      prompt: "p",
      targetPath: "/dashboard",
      mode: "edit",
      recentMessages: [],
      jobId: "j"
    });
    expect(text).toContain("Focus only on the target route");
    expect(text).not.toContain("auth routes");
  });

  it("emits chat-mode language in chat mode", () => {
    const text = buildAgentMessage({
      prompt: "p",
      targetPath: "/x",
      mode: "chat",
      recentMessages: [],
      jobId: "j"
    });
    expect(text).toContain("Inspect the relevant files");
    expect(text).toContain("Do not modify files");
    expect(text).not.toContain("Run a production build");
  });
});

describe("parseLine", () => {
  it("ignores blank/whitespace-only lines", () => {
    expect(drainParseLine(["", "   ", "\t"])).toEqual([]);
  });

  it("parses a JSON line with text payload as a log event", () => {
    const events = drainParseLine([JSON.stringify({ text: "edited footer" })]);
    expect(events).toEqual([{ type: "log", text: "[agent] edited footer" }]);
  });

  it("parses a JSON line with thinking as a thinking event", () => {
    const events = drainParseLine([
      JSON.stringify({ type: "thinking", thinking: "considering next step" })
    ]);
    expect(events).toEqual([{ type: "thinking", text: "considering next step" }]);
  });

  it("parses status/event/message fields as log events", () => {
    const events = drainParseLine([
      JSON.stringify({ status: "running", event: "build_pass", message: "started" })
    ]);
    const texts = events.map((e) => (e as { text: string }).text);
    expect(texts).toContain("[agent] started");
    expect(texts).toContain("[agent] event: build_pass");
    expect(texts).toContain("[agent] status: running");
  });

  it("forwards a non-JSON stdout line as a log event", () => {
    expect(drainParseLine(["agent: starting"])).toEqual([
      { type: "log", text: "[stdout] agent: starting" }
    ]);
  });

  it("silently drops lines that look like JSON fragments", () => {
    expect(drainParseLine(['"foo": 1,', "]", "{,", "1.5"])).toEqual([]);
  });

  it("handles a multi-line burst", () => {
    const events = drainParseLine([
      JSON.stringify({ text: "step a" }),
      JSON.stringify({ text: "step b" }),
      "raw line",
      JSON.stringify({ type: "thinking", thinking: "hmm" })
    ]);
    expect(events).toEqual([
      { type: "log", text: "[agent] step a" },
      { type: "log", text: "[agent] step b" },
      { type: "log", text: "[stdout] raw line" },
      { type: "thinking", text: "hmm" }
    ]);
  });
});
