/**
 * Gemini adapter argv contract.
 *
 * v0.25.1 round-16 P1: only forward -m when PYANCHOR_AGENT_MODEL is
 *   EXPLICITLY set (not the openclaw-shaped config default).
 *
 * v0.32.6: dropped `--output-format stream-json`. The flag was
 *   removed upstream in @google/gemini-cli ~0.1.x; passing it now
 *   makes the CLI exit 1 with a help dump. The adapter switched
 *   to capturing the plain-text stdout in -p mode.
 *
 * `buildGeminiArgs` exported for this test so we don't need to mock
 * `node:child_process` to verify the contract.
 */

import { describe, expect, it } from "vitest";

import { buildGeminiArgs } from "../../src/agents/gemini";

describe("buildGeminiArgs", () => {
  it("emits -p + prompt + --yolo when no model is set", () => {
    const args = buildGeminiArgs("make it bluer", null);
    expect(args).toEqual(["-p", "make it bluer", "--yolo"]);
    expect(args).not.toContain("-m");
  });

  it("appends -m <model> when an explicit model is supplied", () => {
    const args = buildGeminiArgs("p", "gemini-2.5-pro");
    expect(args).toEqual(["-p", "p", "--yolo", "-m", "gemini-2.5-pro"]);
  });

  it("omits -m when explicitModel is null (no openclaw-default leak)", () => {
    // Pre-v0.25.1 bug: `if (ctx.model)` truthy on the config default
    // "openai-codex/gpt-5.4". Now buildGeminiArgs requires the
    // caller to resolve "explicit vs default" first.
    const args = buildGeminiArgs("p", null);
    expect(args).not.toContain("-m");
    expect(args).not.toContain("openai-codex/gpt-5.4");
  });

  it("omits -m when explicitModel is empty string (caller already trimmed)", () => {
    const args = buildGeminiArgs("p", "");
    expect(args).not.toContain("-m");
  });

  it("preserves prompt content verbatim (no escaping in argv)", () => {
    const tricky = 'Line one\nline two with "quotes" and `ticks` and 한글';
    const args = buildGeminiArgs(tricky, null);
    expect(args[1]).toBe(tricky);
  });

  it("v0.32.6: does NOT emit --output-format stream-json (removed upstream)", () => {
    // Pre-v0.32.6 args included --output-format stream-json. That
    // flag was dropped in @google/gemini-cli ~0.1.x and now causes
    // the CLI to exit 1 with a help-text dump. v0.32.6 removed it.
    // Caught by the reviewer-sim audit harness.
    const args = buildGeminiArgs("p", null);
    expect(args).not.toContain("--output-format");
    expect(args).not.toContain("stream-json");
  });
});
