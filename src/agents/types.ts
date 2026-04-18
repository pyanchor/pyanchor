import type { AiEditMessage, AiEditMode } from "../shared/types";

/**
 * Stable contract every agent backend must implement.
 *
 * The sidecar handles workspace lifecycle (rsync, install, build, sync-back,
 * frontend restart). The adapter handles the agentic step in between:
 * the loop that reads code, plans, edits files, and emits progress.
 */
export interface AgentRunner {
  /** Identifier used in logs and the PYANCHOR_AGENT env var. */
  readonly name: string;

  /**
   * Optional one-time setup for the workspace (e.g. registering an agent
   * record with an external system). Called once per job before run().
   */
  prepare?(context: AgentRunContext): Promise<void>;

  /**
   * Drive the agent for a single user request. Yield events as the agent
   * thinks/acts. Return naturally when the agent is done.
   *
   * The yielded events are best-effort progress signals; the sidecar uses
   * them to update the in-page overlay. An adapter that emits no events
   * still works (the user just sees a spinner until completion).
   */
  run(input: AgentRunInput, context: AgentRunContext): AsyncIterable<AgentEvent>;
}

/** What the user asked for, plus a tiny slice of conversation history. */
export interface AgentRunInput {
  /** User prompt, raw. */
  prompt: string;
  /** Hint about which route/file to focus on. May be empty. */
  targetPath: string;
  /** "edit" mutates files; "chat" must answer without writing. */
  mode: AiEditMode;
  /** Recent messages, oldest first. Truncated to a small window. */
  recentMessages: ReadonlyArray<AiEditMessage>;
  /** Stable id for this turn (use as session/correlation id). */
  jobId: string;
}

/** What the adapter has access to during a run. */
export interface AgentRunContext {
  /** Absolute path to the scratch directory the agent should mutate. */
  workspaceDir: string;
  /** Configured timeout for this single run, in milliseconds. */
  timeoutMs: number;
  /** Optional model hint from PYANCHOR_AGENT_MODEL. Free-form string. */
  model: string;
  /** Optional reasoning level hint from PYANCHOR_AGENT_THINKING. */
  thinking: string;
  /**
   * Aborted when the user clicks cancel. Adapters MUST observe this
   * promptly (poll or AbortSignal). Honouring abort is what makes
   * cancel feel responsive.
   */
  signal: AbortSignal;
}

/** Progress signals streamed back to the sidecar overlay. */
export type AgentEvent =
  | { type: "log"; text: string }
  | { type: "thinking"; text: string }
  | { type: "step"; label: string; description?: string }
  | { type: "result"; summary: string; thinking?: string | null };
