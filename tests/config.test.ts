import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

const setMinimalEnv = (overrides: Record<string, string> = {}) => {
  process.env.PYANCHOR_TOKEN = "test-token-32-chars-1234567890ab";
  process.env.PYANCHOR_APP_DIR = "/tmp"; // exists
  process.env.PYANCHOR_RESTART_SCRIPT = "/usr/bin/true"; // exists
  process.env.PYANCHOR_HEALTHCHECK_URL = "http://localhost:3000";
  process.env.PYANCHOR_WORKSPACE_DIR = "/tmp";
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
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v as string;
  }
});

describe("isPyanchorConfigured (agent-aware)", () => {
  it("returns false when a required env var is unset", async () => {
    // No env set at all → all required vars are placeholders.
    delete process.env.PYANCHOR_APP_DIR;
    setMinimalEnv();
    delete process.env.PYANCHOR_APP_DIR;
    const { isPyanchorConfigured } = await import("../src/config");
    expect(isPyanchorConfigured()).toBe(false);
  });

  it("returns true for the claude-code agent without any agent binary on PATH", async () => {
    setMinimalEnv({
      PYANCHOR_AGENT: "claude-code",
      PYANCHOR_OPENCLAW_BIN: "/no/such/path/openclaw",
      PYANCHOR_CODEX_BIN: "/no/such/path/codex",
      PYANCHOR_AIDER_BIN: "/no/such/path/aider"
    });
    const { isPyanchorConfigured } = await import("../src/config");
    expect(isPyanchorConfigured()).toBe(true);
  });

  it("returns true for codex when PYANCHOR_CODEX_BIN exists", async () => {
    setMinimalEnv({
      PYANCHOR_AGENT: "codex",
      PYANCHOR_CODEX_BIN: "/usr/bin/true",
      PYANCHOR_OPENCLAW_BIN: "/no/such/path/openclaw"
    });
    const { isPyanchorConfigured } = await import("../src/config");
    expect(isPyanchorConfigured()).toBe(true);
  });

  it("returns false for codex when PYANCHOR_CODEX_BIN does not exist", async () => {
    setMinimalEnv({
      PYANCHOR_AGENT: "codex",
      PYANCHOR_CODEX_BIN: "/no/such/path/codex"
    });
    const { isPyanchorConfigured } = await import("../src/config");
    expect(isPyanchorConfigured()).toBe(false);
  });

  it("returns true for aider when PYANCHOR_AIDER_BIN exists", async () => {
    setMinimalEnv({
      PYANCHOR_AGENT: "aider",
      PYANCHOR_AIDER_BIN: "/usr/bin/true",
      PYANCHOR_OPENCLAW_BIN: "/no/such/path/openclaw"
    });
    const { isPyanchorConfigured } = await import("../src/config");
    expect(isPyanchorConfigured()).toBe(true);
  });

  it("returns true for openclaw (default) when openClawBin exists", async () => {
    setMinimalEnv({ PYANCHOR_OPENCLAW_BIN: "/usr/bin/true" });
    const { isPyanchorConfigured } = await import("../src/config");
    expect(isPyanchorConfigured()).toBe(true);
  });

  it("returns false for openclaw (default) when openClawBin is missing", async () => {
    setMinimalEnv({ PYANCHOR_OPENCLAW_BIN: "/no/such/path/openclaw" });
    const { isPyanchorConfigured } = await import("../src/config");
    expect(isPyanchorConfigured()).toBe(false);
  });
});

describe("workspace command overrides (PYANCHOR_SUDO_BIN / PYANCHOR_FLOCK_BIN)", () => {
  it("sudoBin defaults to /usr/bin/sudo when env var unset", async () => {
    setMinimalEnv();
    delete process.env.PYANCHOR_SUDO_BIN;
    const { pyanchorConfig } = await import("../src/config");
    expect(pyanchorConfig.sudoBin).toBe("/usr/bin/sudo");
  });

  it("flockBin defaults to /usr/bin/flock when env var unset", async () => {
    setMinimalEnv();
    delete process.env.PYANCHOR_FLOCK_BIN;
    const { pyanchorConfig } = await import("../src/config");
    expect(pyanchorConfig.flockBin).toBe("/usr/bin/flock");
  });

  it("PYANCHOR_SUDO_BIN env override is reflected in pyanchorConfig.sudoBin", async () => {
    setMinimalEnv({ PYANCHOR_SUDO_BIN: "/opt/local/sudo" });
    const { pyanchorConfig } = await import("../src/config");
    expect(pyanchorConfig.sudoBin).toBe("/opt/local/sudo");
  });

  it("PYANCHOR_FLOCK_BIN env override is reflected in pyanchorConfig.flockBin", async () => {
    setMinimalEnv({ PYANCHOR_FLOCK_BIN: "/usr/local/bin/flock" });
    const { pyanchorConfig } = await import("../src/config");
    expect(pyanchorConfig.flockBin).toBe("/usr/local/bin/flock");
  });

  it("PYANCHOR_SUDO_BIN trims whitespace", async () => {
    setMinimalEnv({ PYANCHOR_SUDO_BIN: "  /custom/sudo  " });
    const { pyanchorConfig } = await import("../src/config");
    expect(pyanchorConfig.sudoBin).toBe("/custom/sudo");
  });

  it("empty PYANCHOR_SUDO_BIN falls back to /usr/bin/sudo", async () => {
    setMinimalEnv({ PYANCHOR_SUDO_BIN: "" });
    const { pyanchorConfig } = await import("../src/config");
    expect(pyanchorConfig.sudoBin).toBe("/usr/bin/sudo");
  });

  it("whitespace-only PYANCHOR_FLOCK_BIN falls back to /usr/bin/flock", async () => {
    setMinimalEnv({ PYANCHOR_FLOCK_BIN: "   " });
    const { pyanchorConfig } = await import("../src/config");
    expect(pyanchorConfig.flockBin).toBe("/usr/bin/flock");
  });
});
