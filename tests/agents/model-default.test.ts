// v0.32.3 regression — PYANCHOR_AGENT_MODEL default is the empty
// string, NOT "openai-codex/gpt-5.4" (the openclaw-shaped routing
// prefix). Pre-v0.32.3 the default leaked into non-openclaw adapters
// via `pyanchorConfig.model` → `ctx.model` → adapter spawn args:
//
//   codex exec ... -m openai-codex/gpt-5.4 "..."  ← codex CLI rejects
//   aider --model openai-codex/gpt-5.4 ...        ← aider rejects
//   claude-code (SDK)  model: "openai-codex/..."  ← Claude rejects
//
// The first real-agent edit on a fresh `pyanchor init` (any non-
// openclaw backend) therefore failed with no obvious cause. Caught
// by the reviewer-sim end-to-end run on pyanchor-demo.
//
// Gemini already had a per-adapter workaround (v0.25.1) — see
// gemini-runner.test.ts. v0.32.3 removes the leak at the source so
// codex / aider / claude-code don't need their own workaround.

import { describe, expect, it } from "vitest";

describe("PYANCHOR_AGENT_MODEL default — config-level fix", () => {
  it("config exports an empty model string when env is unset", async () => {
    // Need a clean module load so the optionalEnv() default kicks in.
    const prior = process.env.PYANCHOR_AGENT_MODEL;
    delete process.env.PYANCHOR_AGENT_MODEL;
    try {
      // vitest's resetModules-on-import isn't on by default; use a
      // dynamic import path that vitest will treat as a fresh load.
      const mod = await import(`../../src/config?model-default-test=${Date.now()}` as string);
      expect(mod.pyanchorConfig.model).toBe("");
    } finally {
      if (prior !== undefined) process.env.PYANCHOR_AGENT_MODEL = prior;
    }
  });

  it("config keeps an explicit value when env IS set", async () => {
    const prior = process.env.PYANCHOR_AGENT_MODEL;
    process.env.PYANCHOR_AGENT_MODEL = "o4-mini";
    try {
      const mod = await import(`../../src/config?explicit-test=${Date.now()}` as string);
      expect(mod.pyanchorConfig.model).toBe("o4-mini");
    } finally {
      if (prior === undefined) delete process.env.PYANCHOR_AGENT_MODEL;
      else process.env.PYANCHOR_AGENT_MODEL = prior;
    }
  });
});

describe("openclaw adapter — keeps a self-contained model fallback", () => {
  it("openclaw source still names the openclaw-shaped default", async () => {
    // Read the source rather than spawn the runner — runner needs a
    // real openclaw bin. Confirm the fallback string is wired in.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.resolve(__dirname, "../../src/agents/openclaw/index.ts"),
      "utf8"
    );
    // The fallback must remain in the openclaw adapter even after
    // config.model goes to "". If this assertion fails, the openclaw
    // path will break (adapter would pass an empty model to the bin).
    expect(src).toContain("openai-codex/gpt-5.4");
    expect(src).toContain("ctx.model || pyanchorConfig.model");
  });
});

describe("codex / aider adapters — guarded -m forwarding", () => {
  it("codex source only adds -m when ctx.model is truthy", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.resolve(__dirname, "../../src/agents/codex.ts"),
      "utf8"
    );
    // The guard `if (ctx.model)` is the load-bearing line. Empty
    // string is falsy → -m is skipped → codex CLI uses its own
    // default from ~/.codex/config.toml. Do not regress this.
    expect(src).toMatch(/if\s*\(\s*ctx\.model\s*\)\s*\{[\s\S]*?-m/);
  });

  it("aider source only adds --model when ctx.model is truthy", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.resolve(__dirname, "../../src/agents/aider.ts"),
      "utf8"
    );
    expect(src).toMatch(/if\s*\(\s*ctx\.model\s*\)\s*\{[\s\S]*?--model/);
  });
});
