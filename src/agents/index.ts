import { pyanchorConfig } from "../config";

import { AiderAgentRunner } from "./aider";
import { ClaudeCodeAgentRunner } from "./claude-code";
import { CodexAgentRunner } from "./codex";
import { OpenClawAgentRunner } from "./openclaw";
import type { AgentRunner } from "./types";

export type { AgentEvent, AgentRunContext, AgentRunInput, AgentRunner } from "./types";

/** Registered adapters. Add new entries here to expose them to PYANCHOR_AGENT. */
const adapters = new Map<string, () => AgentRunner>([
  ["openclaw", () => new OpenClawAgentRunner()],
  ["claude-code", () => new ClaudeCodeAgentRunner()],
  ["codex", () => new CodexAgentRunner()],
  ["aider", () => new AiderAgentRunner()]
]);

export function selectAgent(): AgentRunner {
  const name = pyanchorConfig.agent.toLowerCase();
  const factory = adapters.get(name);
  if (!factory) {
    const available = Array.from(adapters.keys()).join(", ");
    throw new Error(
      `[pyanchor] Unknown agent "${pyanchorConfig.agent}". ` +
        `Set PYANCHOR_AGENT to one of: ${available}.`
    );
  }
  return factory();
}
