import { describe, expect, it } from "vitest";

import {
  collectTextPayloads,
  detectAgentFailure,
  extractAgentSignals,
  parseAgentResult,
  type AgentSignalBucket
} from "../../src/agents/openclaw/parse";

const emptyBucket = (): AgentSignalBucket => ({ texts: [], thinkings: [], logs: [] });

describe("extractAgentSignals", () => {
  it("ignores primitives and nulls", () => {
    const b = emptyBucket();
    extractAgentSignals(null, b);
    extractAgentSignals(42, b);
    extractAgentSignals("hello", b);
    expect(b).toEqual({ texts: [], thinkings: [], logs: [] });
  });

  it("collects text payloads", () => {
    const b = emptyBucket();
    extractAgentSignals({ text: "  edited footer.tsx  " }, b);
    expect(b.texts).toEqual(["edited footer.tsx"]);
  });

  it("collects thinking blocks tagged with type", () => {
    const b = emptyBucket();
    extractAgentSignals({ type: "thinking", thinking: "considering options" }, b);
    expect(b.thinkings).toEqual(["considering options"]);
  });

  it("collects message / event / status fields as logs", () => {
    const b = emptyBucket();
    extractAgentSignals(
      { message: "started", event: "build_pass", status: "running" },
      b
    );
    expect(b.logs).toContain("started");
    expect(b.logs).toContain("event: build_pass");
    expect(b.logs).toContain("status: running");
  });

  it("recurses into arrays and nested objects", () => {
    const b = emptyBucket();
    extractAgentSignals(
      {
        items: [
          { text: "outer-1" },
          { nested: { text: "inner-1", more: { text: "inner-2" } } }
        ]
      },
      b
    );
    expect(b.texts.sort()).toEqual(["inner-1", "inner-2", "outer-1"].sort());
  });
});

describe("collectTextPayloads", () => {
  it("returns empty + null on empty input", () => {
    expect(collectTextPayloads([])).toEqual({ summary: "", thinking: null });
  });

  it("joins text payloads with newlines and strips edges", () => {
    const out = collectTextPayloads([{ text: "first" }, { text: "second" }]);
    expect(out.summary).toBe("first\nsecond");
    expect(out.thinking).toBeNull();
  });

  it("separates thinking from text via type === thinking", () => {
    const out = collectTextPayloads([
      { type: "thinking", thinking: "step a" },
      { text: "result text" },
      { type: "thinking", thinking: "step b" }
    ]);
    expect(out.summary).toBe("result text");
    expect(out.thinking).toBe("step a\n\nstep b");
  });

  it("ignores empty text and missing thinking", () => {
    expect(collectTextPayloads([{ text: "  " }, { type: "thinking" }])).toEqual({
      summary: "",
      thinking: null
    });
  });
});

describe("detectAgentFailure", () => {
  it("returns null for clean output", () => {
    expect(detectAgentFailure("done", "edited 3 files")).toBeNull();
  });

  it("recognizes the explicit pre-response timeout", () => {
    const msg = detectAgentFailure(
      "agent error: request timed out before a response was generated",
      ""
    );
    expect(msg).toBe("Agent response timed out. Try narrowing the request and retry.");
  });

  it("recognizes the generic 'response timed out' pattern", () => {
    expect(detectAgentFailure("the response timed out after 900s", "")).toBe(
      "Agent response timed out. Try again shortly."
    );
  });

  it("recognizes 401 / unauthorized", () => {
    expect(detectAgentFailure("HTTP 401 Unauthorized", "")).toBe(
      "Agent authentication failed."
    );
    expect(detectAgentFailure("Unauthorized", "")).toBe("Agent authentication failed.");
  });

  it("matches against the summary too, not just the raw output", () => {
    expect(detectAgentFailure("ok", "Unauthorized")).toBe(
      "Agent authentication failed."
    );
  });
});

describe("parseAgentResult", () => {
  it("parses the canonical result.payloads shape", () => {
    const stdout = JSON.stringify({
      result: {
        payloads: [
          { type: "thinking", thinking: "hmm" },
          { text: "all good" }
        ]
      }
    });
    expect(parseAgentResult(stdout)).toEqual({
      summary: "all good",
      thinking: "hmm",
      failure: null
    });
  });

  it("falls back to top-level content when result is missing", () => {
    const stdout = JSON.stringify({ content: [{ text: "older shape" }] });
    expect(parseAgentResult(stdout)).toEqual({
      summary: "older shape",
      thinking: null,
      failure: null
    });
  });

  it("returns 'Edit complete.' when JSON parses but yields no text", () => {
    expect(parseAgentResult("{}").summary).toBe("Edit complete.");
  });

  it("falls back to raw stdout when JSON parse fails", () => {
    const out = parseAgentResult("agent: i did stuff");
    expect(out.summary).toBe("agent: i did stuff");
    expect(out.thinking).toBeNull();
  });

  it("propagates failure detection through the JSON path", () => {
    const stdout = JSON.stringify({
      result: { payloads: [{ text: "Unauthorized" }] }
    });
    expect(parseAgentResult(stdout).failure).toBe("Agent authentication failed.");
  });

  it("propagates failure detection through the fallback path", () => {
    expect(
      parseAgentResult("request timed out before a response was generated").failure
    ).toBe("Agent response timed out. Try narrowing the request and retry.");
  });
});
