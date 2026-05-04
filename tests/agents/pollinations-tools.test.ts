/**
 * v0.39.0 — search_replace tool unit tests.
 *
 * The tool itself isn't exported separately (it lives inside the
 * adapter module's IIFE-style helpers), so we exercise it through the
 * adapter's `run()` method by faking the model's tool call sequence.
 *
 * Pure-fs setup, no network — uses a temp workspace per test.
 */

import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRunInput, AgentRunContext, AgentEvent } from "../../src/agents/types";

const baseEnv: Record<string, string> = {
  PYANCHOR_TOKEN: "test-token-32-chars-1234567890ab",
  PYANCHOR_APP_DIR: "/tmp",
  PYANCHOR_RESTART_SCRIPT: "/usr/bin/true",
  PYANCHOR_HEALTHCHECK_URL: "http://localhost:3000",
  PYANCHOR_WORKSPACE_DIR: "/tmp",
  PYANCHOR_OPENCLAW_BIN: "/usr/bin/true"
};

const originalEnv = { ...process.env };

let workspaceDir: string;

beforeEach(() => {
  vi.resetModules();
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(originalEnv)) process.env[k] = v as string;
  for (const [k, v] of Object.entries(baseEnv)) process.env[k] = v;
  workspaceDir = mkdtempSync(path.join(tmpdir(), "pyanchor-pol-tools-"));
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(originalEnv)) process.env[k] = v as string;
});

/**
 * Fake the Pollinations chat endpoint by stubbing global `fetch` to
 * return a sequence of pre-baked tool-call responses. Each call to
 * fetch advances the sequence by one.
 */
function stubFetchSequence(responses: Array<{ tool_calls?: any[]; content?: string }>) {
  let i = 0;
  const original = global.fetch;
  global.fetch = vi.fn(async () => {
    const r = responses[i++] ?? { content: "fallthrough" };
    return new Response(
      JSON.stringify({
        choices: [{ message: r }]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    ) as unknown as Response;
  }) as unknown as typeof global.fetch;
  return () => {
    global.fetch = original;
  };
}

const baseInput = (overrides: Partial<AgentRunInput> = {}): AgentRunInput => ({
  prompt: "test",
  targetPath: "/",
  mode: "edit",
  recentMessages: [],
  jobId: "j1",
  ...overrides
});

const baseCtx = (): AgentRunContext => ({
  workspaceDir,
  timeoutMs: 60_000,
  model: "",
  thinking: "",
  signal: new AbortController().signal
});

async function drain(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

describe("search_replace tool (v0.39.0)", () => {
  it("replaces a unique substring and persists to disk", async () => {
    const target = path.join(workspaceDir, "page.tsx");
    await fs.writeFile(target, "hello world\nbye world\n", "utf8");

    const restore = stubFetchSequence([
      {
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: {
              name: "search_replace",
              arguments: JSON.stringify({
                path: "page.tsx",
                find: "hello world",
                replace: "hi world"
              })
            }
          }
        ]
      },
      {
        tool_calls: [
          {
            id: "c2",
            type: "function",
            function: { name: "done", arguments: JSON.stringify({ summary: "renamed" }) }
          }
        ]
      }
    ]);

    try {
      const { PollinationsAgentRunner } = await import("../../src/agents/pollinations");
      const runner = new PollinationsAgentRunner();
      await drain(runner.run(baseInput(), baseCtx()));
    } finally {
      restore();
    }

    const after = await fs.readFile(target, "utf8");
    expect(after).toBe("hi world\nbye world\n");
  });

  it("errors and surfaces a tool error when find appears 0 times", async () => {
    const target = path.join(workspaceDir, "page.tsx");
    await fs.writeFile(target, "hello world\n", "utf8");

    const restore = stubFetchSequence([
      {
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: {
              name: "search_replace",
              arguments: JSON.stringify({
                path: "page.tsx",
                find: "this-string-does-not-exist",
                replace: "x"
              })
            }
          }
        ]
      },
      {
        tool_calls: [
          {
            id: "c2",
            type: "function",
            function: { name: "done", arguments: JSON.stringify({ summary: "gave up" }) }
          }
        ]
      }
    ]);

    let logs: string[] = [];
    try {
      const { PollinationsAgentRunner } = await import("../../src/agents/pollinations");
      const runner = new PollinationsAgentRunner();
      const events = await drain(runner.run(baseInput(), baseCtx()));
      logs = events
        .filter((e): e is { type: "log"; text: string } => e.type === "log")
        .map((e) => e.text);
    } finally {
      restore();
    }

    expect(logs.some((l) => /not found/i.test(l) && /search_replace/.test(l))).toBe(true);
    // File unchanged.
    const after = await fs.readFile(target, "utf8");
    expect(after).toBe("hello world\n");
  });

  it("errors when find appears multiple times (ambiguous match)", async () => {
    const target = path.join(workspaceDir, "page.tsx");
    await fs.writeFile(target, "the cat\nthe cat\nthe dog\n", "utf8");

    const restore = stubFetchSequence([
      {
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: {
              name: "search_replace",
              arguments: JSON.stringify({
                path: "page.tsx",
                find: "the cat",
                replace: "the lion"
              })
            }
          }
        ]
      },
      {
        tool_calls: [
          {
            id: "c2",
            type: "function",
            function: { name: "done", arguments: JSON.stringify({ summary: "ambig" }) }
          }
        ]
      }
    ]);

    let logs: string[] = [];
    try {
      const { PollinationsAgentRunner } = await import("../../src/agents/pollinations");
      const runner = new PollinationsAgentRunner();
      const events = await drain(runner.run(baseInput(), baseCtx()));
      logs = events
        .filter((e): e is { type: "log"; text: string } => e.type === "log")
        .map((e) => e.text);
    } finally {
      restore();
    }

    expect(logs.some((l) => /appears 2 times/.test(l))).toBe(true);
    const after = await fs.readFile(target, "utf8");
    expect(after).toBe("the cat\nthe cat\nthe dog\n");
  });

  it("treats `replace` as a literal string (no $1 / $& backref expansion)", async () => {
    const target = path.join(workspaceDir, "page.tsx");
    await fs.writeFile(target, "before MARKER after\n", "utf8");

    const restore = stubFetchSequence([
      {
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: {
              name: "search_replace",
              arguments: JSON.stringify({
                path: "page.tsx",
                find: "MARKER",
                replace: "$& and $1 and $$"
              })
            }
          }
        ]
      },
      {
        tool_calls: [
          {
            id: "c2",
            type: "function",
            function: { name: "done", arguments: JSON.stringify({ summary: "literal" }) }
          }
        ]
      }
    ]);

    try {
      const { PollinationsAgentRunner } = await import("../../src/agents/pollinations");
      const runner = new PollinationsAgentRunner();
      await drain(runner.run(baseInput(), baseCtx()));
    } finally {
      restore();
    }

    const after = await fs.readFile(target, "utf8");
    expect(after).toBe("before $& and $1 and $$ after\n");
  });

  it("rejects path traversal (workspace escape)", async () => {
    const target = path.join(workspaceDir, "page.tsx");
    await fs.writeFile(target, "ok\n", "utf8");

    const restore = stubFetchSequence([
      {
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: {
              name: "search_replace",
              arguments: JSON.stringify({
                path: "../../../etc/passwd",
                find: "root",
                replace: "x"
              })
            }
          }
        ]
      },
      {
        tool_calls: [
          {
            id: "c2",
            type: "function",
            function: { name: "done", arguments: JSON.stringify({ summary: "nope" }) }
          }
        ]
      }
    ]);

    let logs: string[] = [];
    try {
      const { PollinationsAgentRunner } = await import("../../src/agents/pollinations");
      const runner = new PollinationsAgentRunner();
      const events = await drain(runner.run(baseInput(), baseCtx()));
      logs = events
        .filter((e): e is { type: "log"; text: string } => e.type === "log")
        .map((e) => e.text);
    } finally {
      restore();
    }

    expect(logs.some((l) => /escapes workspace/.test(l))).toBe(true);
    // Original file untouched.
    const after = await fs.readFile(target, "utf8");
    expect(after).toBe("ok\n");
  });

  it("rejects search_replace in chat mode", async () => {
    const target = path.join(workspaceDir, "page.tsx");
    await fs.writeFile(target, "hello\n", "utf8");

    const restore = stubFetchSequence([
      {
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: {
              name: "search_replace",
              arguments: JSON.stringify({
                path: "page.tsx",
                find: "hello",
                replace: "bye"
              })
            }
          }
        ]
      },
      {
        tool_calls: [
          {
            id: "c2",
            type: "function",
            function: { name: "done", arguments: JSON.stringify({ summary: "chatted" }) }
          }
        ]
      }
    ]);

    try {
      const { PollinationsAgentRunner } = await import("../../src/agents/pollinations");
      const runner = new PollinationsAgentRunner();
      await drain(runner.run(baseInput({ mode: "chat" }), baseCtx()));
    } finally {
      restore();
    }

    const after = await fs.readFile(target, "utf8");
    // chat mode → tool runs but errors out → file unchanged.
    expect(after).toBe("hello\n");
  });
});
