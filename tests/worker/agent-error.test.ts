import { describe, expect, it } from "vitest";

import { classifyAgentFailure, humanizeAgentFailure } from "../../src/worker/agent-error";

describe("classifyAgentFailure", () => {
  describe("transient_auth", () => {
    it.each([
      // Real-world strings we've actually seen bubbled up from openclaw / codex
      "Agent authentication failed.",
      "Authentication failed: invalid token",
      "401 Unauthorized",
      "request returned 401",
      "Token expired",
      "Invalid credential",
      "auth failed (403 not actually returned, 401 was)"
    ])("classifies %p as transient_auth", (raw) => {
      const result = classifyAgentFailure(raw);
      expect(result.kind).toBe("transient_auth");
      expect(result.hint).toContain("token-refresh");
      expect(result.raw).toBe(raw);
    });

    it("hint mentions the typical re-auth commands (round-15 #2: openclaw onboard, not login)", () => {
      // v0.21.0 had `openclaw login` which doesn't exist in the
      // shipped openclaw CLI / docs. Round-15 caught it; v0.21.1
      // points at the documented `openclaw onboard` command.
      const { hint } = classifyAgentFailure("Agent authentication failed.");
      expect(hint).toMatch(/openclaw onboard|codex login/);
      expect(hint).not.toContain("openclaw login");
    });
  });

  describe("rate_limit", () => {
    it.each([
      "429 Too Many Requests",
      "Rate limit exceeded",
      "rate-limited",
      "rate limited",
      "Quota exceeded for the day"
    ])("classifies %p as rate_limit", (raw) => {
      expect(classifyAgentFailure(raw).kind).toBe("rate_limit");
    });

    it("hint suggests waiting + checking provider dashboard", () => {
      const { hint } = classifyAgentFailure("429 Too Many Requests");
      expect(hint).toMatch(/wait|usage/i);
    });
  });

  describe("timeout", () => {
    it.each([
      "Operation timed out after 900s",
      "ETIMEDOUT",
      "timeout while connecting",
      "request time-out"
    ])("classifies %p as timeout", (raw) => {
      expect(classifyAgentFailure(raw).kind).toBe("timeout");
    });

    it("hint references the timeout env var", () => {
      const { hint } = classifyAgentFailure("ETIMEDOUT");
      expect(hint).toContain("PYANCHOR_AGENT_TIMEOUT_S");
    });
  });

  describe("network", () => {
    it.each([
      "ENOTFOUND api.openai.com",
      "connect ECONNREFUSED 127.0.0.1:443",
      "EAI_AGAIN dns lookup failed",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "socket hang up: ECONNRESET"
    ])("classifies %p as network", (raw) => {
      expect(classifyAgentFailure(raw).kind).toBe("network");
    });

    it("hint mentions DNS / firewall / proxy", () => {
      const { hint } = classifyAgentFailure("ENOTFOUND");
      expect(hint).toMatch(/DNS|firewall|proxy/);
    });
  });

  describe("unknown (no pattern matches)", () => {
    it.each([
      "Build failed: SyntaxError on line 42",
      "Sidecar is not fully configured yet.",
      "",
      "totally novel error string"
    ])("classifies %p as unknown with empty hint", (raw) => {
      const result = classifyAgentFailure(raw);
      expect(result.kind).toBe("unknown");
      expect(result.hint).toBe("");
      expect(result.raw).toBe(raw);
    });
  });

  describe("specificity ordering", () => {
    it("matches transient_auth before rate_limit when both keywords present", () => {
      // Some upstream errors mention "auth" AND a 429-ish phrase.
      // We document that auth wins because it's the more actionable
      // hint (rate_limit just says "wait").
      const result = classifyAgentFailure("auth failed: rate limit on token endpoint");
      expect(result.kind).toBe("transient_auth");
    });
  });

  describe("input safety", () => {
    it("treats null/undefined as empty string", () => {
      // The runner promises a string but TS doesn't enforce it at the
      // worker boundary; defensive against `undefined.message` paths.
      expect(classifyAgentFailure(undefined as unknown as string).kind).toBe("unknown");
      expect(classifyAgentFailure(null as unknown as string).kind).toBe("unknown");
    });
  });
});

describe("humanizeAgentFailure", () => {
  it("appends the hint in parentheses when classified", () => {
    const result = humanizeAgentFailure("Agent authentication failed.");
    expect(result).toMatch(
      /^Agent authentication failed\.\s*\(.*token-refresh.*\)$/
    );
  });

  it("returns the raw message unchanged for unknown errors", () => {
    expect(humanizeAgentFailure("Build failed: SyntaxError")).toBe(
      "Build failed: SyntaxError"
    );
  });

  it("preserves the raw message even when augmented (no truncation)", () => {
    const raw = "401 Unauthorized: invalid_grant";
    expect(humanizeAgentFailure(raw)).toContain(raw);
  });

  it("safe on empty input", () => {
    expect(humanizeAgentFailure("")).toBe("");
  });
});
