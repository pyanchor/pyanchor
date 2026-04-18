import { pyanchorConfig } from "../config";

import { AiderAgentRunner } from "./aider";
import { ClaudeCodeAgentRunner } from "./claude-code";
import { CodexAgentRunner } from "./codex";
import type { AgentRunner } from "./types";

export type { AgentEvent, AgentRunContext, AgentRunInput, AgentRunner } from "./types";

/** Registered adapters. Add new entries here to expose them to PYANCHOR_AGENT. */
const adapters = new Map<string, () => AgentRunner>([
  ["claude-code", () => new ClaudeCodeAgentRunner()],
  ["codex", () => new CodexAgentRunner()],
  ["aider", () => new AiderAgentRunner()]
]);

/**
 * Marker returned for the openclaw adapter. The OpenClaw flow lives inline
 * in src/worker/runner.ts (it pre-dates the AgentRunner interface). The
 * sidecar dispatcher branches on this string.
 *
 * v0.2.0 will move OpenClaw behind the same AgentRunner interface.
 */
export const OPENCLAW_INLINE = Symbol.for("pyanchor.openclaw.inline");

export function selectAgent(): AgentRunner | typeof OPENCLAW_INLINE {
  const name = pyanchorConfig.agent.toLowerCase();

  if (name === "openclaw") {
    return OPENCLAW_INLINE;
  }

  const factory = adapters.get(name);
  if (!factory) {
    const available = ["openclaw", ...adapters.keys()].join(", ");
    throw new Error(
      `[pyanchor] Unknown agent "${pyanchorConfig.agent}". ` +
        `Set PYANCHOR_AGENT to one of: ${available}.`
    );
  }

  return factory();
}
