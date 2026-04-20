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
