import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRunInput } from "../../src/agents/types";

const originalEnv = { ...process.env };

const setEnv = (overrides: Record<string, string> = {}) => {
  process.env.PYANCHOR_TOKEN = "test-token-32-chars-1234567890ab";
  process.env.PYANCHOR_APP_DIR = "/tmp";
  process.env.PYANCHOR_RESTART_SCRIPT = "/usr/bin/true";
  process.env.PYANCHOR_HEALTHCHECK_URL = "http://localhost:3000";
  process.env.PYANCHOR_WORKSPACE_DIR = "/tmp";
  process.env.PYANCHOR_OPENCLAW_BIN = "/usr/bin/true";
  for (const [k, v] of Object.entries(overrides)) {
    process.env[k] = v;
  }
};

beforeEach(() => {
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v as string;
  }
  setEnv();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v as string;
  }
});

const baseInput = (overrides: Partial<AgentRunInput> = {}): AgentRunInput => ({
  prompt: "make the button blue",
  targetPath: "/dashboard",
  mode: "edit",
  recentMessages: [],
  jobId: "job-1",
  ...overrides
});

describe("codex.buildBrief", () => {
  it("includes target route, mode, and the user request", async () => {
    const { buildBrief } = await import("../../src/agents/codex");
    const brief = buildBrief(baseInput());
    expect(brief).toContain("Target route: /dashboard");
    expect(brief).toContain("Mode: edit");
    expect(brief).toContain("make the button blue");
  });

  it("omits the target route line when targetPath is empty", async () => {
    const { buildBrief } = await import("../../src/agents/codex");
    const brief = buildBrief(baseInput({ targetPath: "" }));
    expect(brief).not.toContain("Target route:");
  });

  it("inlines the recent conversation when present", async () => {
    const { buildBrief } = await import("../../src/agents/codex");
    const brief = buildBrief(
      baseInput({
        recentMessages: [
          {
            id: "m1",
            jobId: "j1",
            role: "user",
            mode: "edit",
            text: "earlier turn",
            createdAt: new Date(0).toISOString(),
            status: "done"
          }
        ]
      })
    );
    expect(brief).toContain("Recent conversation:");
    expect(brief).toContain("earlier turn");
  });

  it("splices the framework's build hint in edit mode (nextjs default)", async () => {
    const { buildBrief } = await import("../../src/agents/codex");
    const brief = buildBrief(baseInput({ mode: "edit" }));
    expect(brief).toContain("next build");
  });

  it("uses the vite build hint when PYANCHOR_FRAMEWORK=vite", async () => {
    setEnv({ PYANCHOR_FRAMEWORK: "vite" });
    vi.resetModules();
    const { buildBrief } = await import("../../src/agents/codex");
    const brief = buildBrief(baseInput({ mode: "edit" }));
    expect(brief).toMatch(/vite build|npm run build/);
    expect(brief).not.toContain("next build");
  });

  it("emits chat-mode constraints (no build hint, no edits)", async () => {
    const { buildBrief } = await import("../../src/agents/codex");
    const brief = buildBrief(baseInput({ mode: "chat" }));
    expect(brief).toContain("Mode: chat");
    expect(brief).toContain("Do not modify files");
    expect(brief).not.toContain("production build");
  });
});

describe("aider.buildBrief", () => {
  it("includes target route, mode, and user request", async () => {
    const { buildBrief } = await import("../../src/agents/aider");
    const brief = buildBrief(baseInput());
    expect(brief).toContain("Target route: /dashboard");
    expect(brief).toContain("make the button blue");
  });

  it("uses the framework build hint with a leading 'After the edit,' clause", async () => {
    const { buildBrief } = await import("../../src/agents/aider");
    const brief = buildBrief(baseInput({ mode: "edit" }));
    expect(brief).toContain("After the edit,");
    expect(brief).toContain("next build");
  });

  it("swaps the build hint when PYANCHOR_FRAMEWORK=vite", async () => {
    setEnv({ PYANCHOR_FRAMEWORK: "vite" });
    vi.resetModules();
    const { buildBrief } = await import("../../src/agents/aider");
    const brief = buildBrief(baseInput({ mode: "edit" }));
    expect(brief).toMatch(/vite build|npm run build/);
    expect(brief).not.toContain("next build");
  });

  it("emits chat-mode constraints", async () => {
    const { buildBrief } = await import("../../src/agents/aider");
    const brief = buildBrief(baseInput({ mode: "chat" }));
    expect(brief).toContain("Do not modify files");
    expect(brief).not.toContain("production build");
  });
});

describe("claude-code.buildBrief", () => {
  it("includes target route, mode, and user request", async () => {
    const { buildBrief } = await import("../../src/agents/claude-code");
    const brief = buildBrief(baseInput());
    expect(brief).toContain("Target route: /dashboard");
    expect(brief).toContain("make the button blue");
  });

  it("includes the framework build hint in edit mode", async () => {
    const { buildBrief } = await import("../../src/agents/claude-code");
    const brief = buildBrief(baseInput({ mode: "edit" }));
    expect(brief).toContain("next build");
  });

  it("swaps the build hint with vite profile", async () => {
    setEnv({ PYANCHOR_FRAMEWORK: "vite" });
    vi.resetModules();
    const { buildBrief } = await import("../../src/agents/claude-code");
    const brief = buildBrief(baseInput({ mode: "edit" }));
    expect(brief).toMatch(/vite build|npm run build/);
    expect(brief).not.toContain("next build");
  });

  it("does not emit any build hint in chat mode", async () => {
    const { buildBrief } = await import("../../src/agents/claude-code");
    const brief = buildBrief(baseInput({ mode: "chat" }));
    expect(brief).not.toMatch(/build/);
    expect(brief).toContain("Do not modify files");
  });

  it("truncates conversation history to the last 6 turns", async () => {
    const { buildBrief } = await import("../../src/agents/claude-code");
    const messages = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      jobId: "j",
      role: "user" as const,
      mode: "edit" as const,
      text: `msg-${i}`,
      createdAt: new Date(0).toISOString(),
      status: null
    }));
    const brief = buildBrief(baseInput({ recentMessages: messages }));
    expect(brief).not.toContain("msg-3");
    expect(brief).toContain("msg-4");
    expect(brief).toContain("msg-9");
  });
});

describe("gemini.buildBrief (v0.25.0)", () => {
  // Same brief contract as the codex / aider / claude-code adapters.
  // Brief is identical across shell-out adapters by design — the
  // workspace context + framework hint + mode-specific constraint is
  // backend-agnostic.
  it("includes target route, mode, and the user request", async () => {
    const { buildBrief } = await import("../../src/agents/gemini");
    const brief = buildBrief(baseInput());
    expect(brief).toContain("Target route: /dashboard");
    expect(brief).toContain("Mode: edit");
    expect(brief).toContain("make the button blue");
  });

  it("emits chat-mode constraints (no edits)", async () => {
    const { buildBrief } = await import("../../src/agents/gemini");
    const brief = buildBrief(baseInput({ mode: "chat" }));
    expect(brief).toContain("Mode: chat");
    expect(brief).toContain("Do not modify files");
  });

  it("splices the framework's build hint in edit mode", async () => {
    const { buildBrief } = await import("../../src/agents/gemini");
    const brief = buildBrief(baseInput({ mode: "edit" }));
    expect(brief).toContain("next build");
  });

  it("truncates conversation history to the last 6 turns", async () => {
    const { buildBrief } = await import("../../src/agents/gemini");
    const messages = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      jobId: "j",
      role: "user" as const,
      mode: "edit" as const,
      text: `msg-${i}`,
      createdAt: new Date(0).toISOString(),
      status: null
    }));
    const brief = buildBrief(baseInput({ recentMessages: messages }));
    expect(brief).not.toContain("msg-3");
    expect(brief).toContain("msg-4");
    expect(brief).toContain("msg-9");
  });
});

describe("pollinations.buildBrief (v0.36.0)", () => {
  // Pollinations is HTTP-only (no CLI shell-out) but still uses the
  // shared brief contract so user expectations carry across backends.
  it("includes target route, mode, and the user request", async () => {
    const { buildBrief } = await import("../../src/agents/pollinations");
    const brief = buildBrief(baseInput());
    expect(brief).toContain("Target route: /dashboard");
    expect(brief).toContain("Mode: edit");
    expect(brief).toContain("make the button blue");
  });

  it("instructs the model to call `done` and not refactor in edit mode", async () => {
    const { buildBrief } = await import("../../src/agents/pollinations");
    const brief = buildBrief(baseInput({ mode: "edit" }));
    // Tool-loop adapter — the brief steers the model toward the `done`
    // tool and away from broad refactors.
    expect(brief).toContain("done");
    expect(brief).toMatch(/Do not refactor/i);
  });

  it("forbids write_file in chat mode", async () => {
    const { buildBrief } = await import("../../src/agents/pollinations");
    const brief = buildBrief(baseInput({ mode: "chat" }));
    expect(brief).toContain("Mode: chat");
    expect(brief).toContain("Do NOT call write_file");
  });

  it("truncates conversation history to the last 4 turns (v0.38.1)", async () => {
    const { buildBrief } = await import("../../src/agents/pollinations");
    const messages = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      jobId: "j",
      role: "user" as const,
      mode: "edit" as const,
      text: `pmsg-${i}`,
      createdAt: new Date(0).toISOString(),
      status: null
    }));
    const brief = buildBrief(baseInput({ recentMessages: messages }));
    // Cap is 4 (down from pre-v0.38.1's 6) — see formatRecent comment.
    expect(brief).not.toContain("pmsg-5");
    expect(brief).toContain("pmsg-6");
    expect(brief).toContain("pmsg-9");
  });

  it("v0.40.2 — adds explicit response-language hint when prompt contains non-Latin script", async () => {
    const { buildBrief } = await import("../../src/agents/pollinations");
    // Korean prompt
    const ko = buildBrief(baseInput({ prompt: "헤더 색깔 바꿔줘" }));
    expect(ko).toMatch(/Respond in Korean|user wrote in Korean/i);
    expect(ko).toMatch(/done.*summary in Korean/i);
    // Japanese prompt (hiragana)
    const ja = buildBrief(baseInput({ prompt: "ヘッダーの色を変えて" }));
    expect(ja).toMatch(/user wrote in Japanese/i);
    // Plain English — no hint added.
    const en = buildBrief(baseInput({ prompt: "make the button red" }));
    expect(en).not.toMatch(/user wrote in/i);
    // Mixed prompt with even one Hangul character → Korean hint.
    const mixed = buildBrief(baseInput({ prompt: "make the heading 안녕" }));
    expect(mixed).toMatch(/user wrote in Korean/i);
  });

  it("v0.38.1 — drops `system` rows and assistant boilerplate-done summaries", async () => {
    const { buildBrief } = await import("../../src/agents/pollinations");
    const messages = [
      {
        id: "u1",
        jobId: "j",
        role: "user" as const,
        mode: "edit" as const,
        text: "real-user-prompt-A",
        createdAt: new Date(0).toISOString(),
        status: null
      },
      {
        id: "s1",
        jobId: "j",
        role: "system" as const,
        mode: "edit" as const,
        text: "worker-chatter-do-not-show",
        createdAt: new Date(0).toISOString(),
        status: null
      },
      {
        id: "a1",
        jobId: "j",
        role: "assistant" as const,
        mode: "edit" as const,
        text: "Done (no explicit summary).",
        createdAt: new Date(0).toISOString(),
        status: "done" as const
      },
      {
        id: "u2",
        jobId: "j",
        role: "user" as const,
        mode: "edit" as const,
        text: "real-user-prompt-B",
        createdAt: new Date(0).toISOString(),
        status: null
      }
    ];
    const brief = buildBrief(baseInput({ recentMessages: messages }));
    expect(brief).toContain("real-user-prompt-A");
    expect(brief).toContain("real-user-prompt-B");
    // System chatter and boilerplate-done summaries are stripped so
    // they don't teach the model "previous turns ended in a no-op".
    expect(brief).not.toContain("worker-chatter-do-not-show");
    expect(brief).not.toContain("Done (no explicit summary)");
  });
});
