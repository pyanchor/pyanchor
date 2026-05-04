import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("selectAgent", () => {
  it("returns the OpenClaw runner by default", async () => {
    const { selectAgent } = await import("../../src/agents");
    const runner = selectAgent();
    expect(runner.name).toBe("openclaw");
  });

  it("returns the codex runner when PYANCHOR_AGENT=codex", async () => {
    setEnv({ PYANCHOR_AGENT: "codex" });
    vi.resetModules();
    const { selectAgent } = await import("../../src/agents");
    expect(selectAgent().name).toBe("codex");
  });

  it("returns the aider runner when PYANCHOR_AGENT=aider", async () => {
    setEnv({ PYANCHOR_AGENT: "aider" });
    vi.resetModules();
    const { selectAgent } = await import("../../src/agents");
    expect(selectAgent().name).toBe("aider");
  });

  it("returns the claude-code runner when PYANCHOR_AGENT=claude-code", async () => {
    setEnv({ PYANCHOR_AGENT: "claude-code" });
    vi.resetModules();
    const { selectAgent } = await import("../../src/agents");
    expect(selectAgent().name).toBe("claude-code");
  });

  it("returns the gemini runner when PYANCHOR_AGENT=gemini (v0.25.0)", async () => {
    setEnv({ PYANCHOR_AGENT: "gemini" });
    vi.resetModules();
    const { selectAgent } = await import("../../src/agents");
    expect(selectAgent().name).toBe("gemini");
  });

  it("returns the pollinations runner when PYANCHOR_AGENT=pollinations (v0.36.0)", async () => {
    setEnv({ PYANCHOR_AGENT: "pollinations" });
    vi.resetModules();
    const { selectAgent } = await import("../../src/agents");
    expect(selectAgent().name).toBe("pollinations");
  });

  it("matches case-insensitively", async () => {
    setEnv({ PYANCHOR_AGENT: "OpenClaw" });
    vi.resetModules();
    const { selectAgent } = await import("../../src/agents");
    expect(selectAgent().name).toBe("openclaw");
  });

  it("throws with the available adapter list when PYANCHOR_AGENT is unknown", async () => {
    setEnv({ PYANCHOR_AGENT: "ghost-agent" });
    vi.resetModules();
    const { selectAgent } = await import("../../src/agents");
    expect(() => selectAgent()).toThrow(/Unknown agent "ghost-agent"/);
    expect(() => selectAgent()).toThrow(/openclaw, claude-code, codex, aider, gemini, pollinations/);
  });
});
