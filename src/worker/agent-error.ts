/**
 * Heuristic classification of agent failures so we can show the
 * user (and the audit log) something more actionable than the raw
 * upstream error.
 *
 * Why this matters: the most common transient failure with OAuth-
 * backed agent backends (openclaw → openai-codex, etc.) is a
 * token-refresh timing race. The agent's in-memory access token
 * expires the moment a real edit lands, the upstream returns 401,
 * and the worker bubbles up "Agent authentication failed." — which
 * looks alarming but is usually fixed by a single retry (the next
 * request triggers a token refresh and works). Without a hint,
 * users wrongly assume their auth is broken and spend time
 * re-authenticating when they didn't need to.
 *
 * v0.21.0 — English-only hints to match the rest of runner output.
 * The classification kind is exported so future versions can
 * localize on the overlay side from the structured value.
 */

export type AgentFailureKind =
  | "transient_auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "unknown";

export interface AgentFailureClassification {
  /** Best-guess kind of failure. `unknown` = no known pattern matched. */
  kind: AgentFailureKind;
  /** Human-readable suggestion. Empty string when kind is `unknown`. */
  hint: string;
  /** The original raw message, preserved. */
  raw: string;
}

const PATTERNS: Array<{
  kind: Exclude<AgentFailureKind, "unknown">;
  pattern: RegExp;
  hint: string;
}> = [
  {
    kind: "transient_auth",
    // Match: "auth", "401", "unauthorized", "authentication", "token expired",
    // "invalid token". OAuth-backed agents bubble up these phrases.
    pattern: /\b(auth(?:entication)?\s+failed|401|unauthorized|invalid\s+(?:token|credential)|token\s+expired)\b/i,
    hint:
      "This is often a transient OAuth token-refresh race. " +
      "Try once more before re-authenticating the agent backend " +
      "(e.g. `openclaw onboard` / `codex login`)."
  },
  {
    kind: "rate_limit",
    // 429, "rate limit", "quota", "too many requests"
    pattern: /\b(429|rate[-_\s]*limit(?:ed|ing)?|quota\s+exceeded|too\s+many\s+requests)\b/i,
    hint:
      "Rate limit hit at the agent backend. Wait ~30 seconds before retrying. " +
      "If it keeps happening, check the upstream provider's usage dashboard."
  },
  {
    kind: "timeout",
    // "timeout", "timed out", ETIMEDOUT
    pattern: /\b(time(?:d)?\s*[-_]?\s*out|ETIMEDOUT)\b/i,
    hint:
      "Agent run exceeded its timeout. Raise `PYANCHOR_AGENT_TIMEOUT_S` " +
      "(default 900) if this is expected for your prompt size, or " +
      "investigate worker-host network latency."
  },
  {
    kind: "network",
    // DNS / TCP failures from node's net stack
    pattern: /\b(ENOTFOUND|ECONNREFUSED|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|ECONNRESET)\b/,
    hint:
      "Network error reaching the agent backend. Check connectivity from " +
      "the worker host (DNS, firewall, proxy)."
  }
];

/**
 * Classify a raw agent failure message.
 *
 * Pure: no I/O, no globals, deterministic on input.
 *
 * The first matching pattern wins (patterns are ordered by
 * specificity — `transient_auth` before `rate_limit` etc.).
 */
export function classifyAgentFailure(raw: string): AgentFailureClassification {
  const text = raw ?? "";
  for (const { kind, pattern, hint } of PATTERNS) {
    if (pattern.test(text)) {
      return { kind, hint, raw: text };
    }
  }
  return { kind: "unknown", hint: "", raw: text };
}

/**
 * Build the user-facing message: `<raw> (<hint>)` when a hint is
 * available, or just the raw message when nothing matched.
 *
 * Used by the worker so state.error + audit log + activity log all
 * carry the same hint without each callsite repeating the
 * classification logic.
 */
export function humanizeAgentFailure(raw: string): string {
  const { hint } = classifyAgentFailure(raw);
  if (!hint) return raw;
  return `${raw} (${hint})`;
}
