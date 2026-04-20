/**
 * Gemini adapter argv contract (v0.25.1 round-16 P1).
 *
 * Round-16 caught that v0.25.0 forwarded `ctx.model` unconditionally,
 * and the config-level default for `PYANCHOR_AGENT_MODEL`
 * ("openai-codex/gpt-5.4") was an openclaw-shaped value that would
 * make `gemini -m openai-codex/gpt-5.4` fail immediately on the
 * first opt-in run. v0.25.1 reads `PYANCHOR_AGENT_MODEL` directly
 * from env and only appends `-m` when explicitly set.
 *
 * `buildGeminiArgs` exported for this test so we don't need to mock
 * `node:child_process` to verify the contract.
 */

import { describe, expect, it } from "vitest";

import { buildGeminiArgs } from "../../src/agents/gemini";

describe("buildGeminiArgs (v0.25.1 round-16 P1)", () => {
  it("emits the canonical four flags + prompt when no model is set", () => {
    const args = buildGeminiArgs("make it bluer", null);
    expect(args).toEqual([
      "-p",
      "make it bluer",
      "--output-format",
      "stream-json",
      "--yolo"
    ]);
    // No -m flag when the operator hasn't pinned a model.
    expect(args).not.toContain("-m");
  });

  it("appends -m <model> when an explicit model is supplied", () => {
    const args = buildGeminiArgs("p", "gemini-2.5-pro");
    expect(args).toEqual([
      "-p",
      "p",
      "--output-format",
      "stream-json",
      "--yolo",
      "-m",
      "gemini-2.5-pro"
    ]);
  });

  it("omits -m when explicitModel is null (round-16 P1: no openclaw-default leak)", () => {
    // Pre-fix bug: `if (ctx.model)` truthy on the config default
    // "openai-codex/gpt-5.4". Now buildGeminiArgs requires the
    // caller to resolve "explicit vs default" first.
    const args = buildGeminiArgs("p", null);
    expect(args).not.toContain("-m");
    expect(args).not.toContain("openai-codex/gpt-5.4");
  });

  it("omits -m when explicitModel is empty string (caller already trimmed)", () => {
    // The runner does `process.env.PYANCHOR_AGENT_MODEL?.trim() || null`
    // so empty strings reach the helper as null. Defensive: even if
    // a future caller passes "" directly, treat it like no model.
    const args = buildGeminiArgs("p", "");
    expect(args).not.toContain("-m");
  });

  it("preserves prompt content verbatim (no escaping in argv)", () => {
    // Argv passing avoids shell quoting issues. Special chars +
    // newlines + Korean go through unchanged — Node's spawn passes
    // them as-is to the child's argv vector.
    const tricky = 'Line one\nline two with "quotes" and `ticks` and 한글';
    const args = buildGeminiArgs(tricky, null);
    expect(args[1]).toBe(tricky);
  });
});
