/**
 * OpenClaw agent adapter — implements the AgentRunner interface
 * by shelling out to the `openclaw` CLI under (optionally) a
 * different Unix user.
 */

import { pyanchorConfig } from "../../config";
import type { AgentEvent, AgentRunContext, AgentRunInput, AgentRunner } from "../types";

import { createBrief } from "./brief";
import { execBuffered, streamSpawn } from "./exec";
import { extractAgentSignals, parseAgentResult } from "./parse";

const SUDO_BIN = "/usr/bin/sudo";

interface AgentRecord {
  id?: string;
}

export class OpenClawAgentRunner implements AgentRunner {
  readonly name = "openclaw";

  /**
   * Make sure the OpenClaw agent record we manage (`PYANCHOR_AGENT_ID`)
   * exists in the user's OpenClaw install. Idempotent: list first,
   * register only if missing.
   */
  async prepare(ctx: AgentRunContext): Promise<void> {
    const agentId = pyanchorConfig.agentId;

    const list = await this.runAsOpenClaw(
      [pyanchorConfig.openClawBin, "agents", "list", "--json"],
      { signal: ctx.signal }
    );

    let agents: AgentRecord[] = [];
    try {
      const parsed = JSON.parse(list.stdout || "[]");
      if (Array.isArray(parsed)) agents = parsed as AgentRecord[];
    } catch {
      // tolerate non-JSON output; treat as no existing agent
    }

    if (agents.some((agent) => agent.id === agentId)) {
      return;
    }

    await this.runAsOpenClaw(
      [
        pyanchorConfig.openClawBin,
        "agents",
        "add",
        agentId,
        "--workspace",
        ctx.workspaceDir,
        "--model",
        ctx.model || pyanchorConfig.model,
        "--non-interactive",
        "--json"
      ],
      { signal: ctx.signal }
    );
  }

  /**
   * Drive a single agent turn. Writes EDIT_BRIEF.md, spawns
   * `openclaw agent --json -m <message>`, streams stdout line-by-line,
   * yields AgentEvents as JSON events arrive.
   */
  async *run(input: AgentRunInput, ctx: AgentRunContext): AsyncIterable<AgentEvent> {
    yield { type: "step", label: "Briefing" };
    await this.writeBrief(input, ctx);

    const agentMessage = buildAgentMessage(input);
    const agentId = pyanchorConfig.agentId;

    yield {
      type: "step",
      label: "Thinking",
      description:
        input.mode === "chat"
          ? "Reading code and drafting an answer."
          : "Analyzing code and applying edits."
    };

    let stdoutBuffer = "";
    let allStdout = "";
    let allStderr = "";

    const args = [
      "-u",
      pyanchorConfig.openClawUser,
      "bash",
      "-lc",
      'cd "$1" && shift && exec "$@"',
      "--",
      ctx.workspaceDir,
      pyanchorConfig.openClawBin,
      "agent",
      "--agent",
      agentId,
      "--session-id",
      input.jobId,
      "--thinking",
      ctx.thinking || pyanchorConfig.thinking,
      "--timeout",
      String(Math.floor(ctx.timeoutMs / 1000)),
      "--json",
      "-m",
      agentMessage
    ];

    for await (const event of streamSpawn(SUDO_BIN, args, {
      signal: ctx.signal,
      timeoutMs: ctx.timeoutMs + 120_000
    })) {
      if (event.kind === "stdout") {
        allStdout += event.text;
        stdoutBuffer += event.text;
        const lines = stdoutBuffer.split(/\r?\n/g);
        stdoutBuffer = lines.pop() ?? "";
        for (const event2 of parseLine(lines)) yield event2;
        continue;
      }

      if (event.kind === "stderr") {
        allStderr += event.text;
        const trimmed = event.text.trim();
        if (trimmed) yield { type: "log", text: `[stderr] ${trimmed}` };
        continue;
      }

      // close — flush buffered tail
      if (stdoutBuffer.trim()) {
        for (const event2 of parseLine([stdoutBuffer])) yield event2;
      }

      if (event.code !== 0 && !ctx.signal.aborted) {
        const message = allStderr.trim() || `openclaw exited with ${event.code}`;
        throw new Error(message);
      }
    }

    const { summary, thinking, failure } = parseAgentResult(allStdout);
    if (failure) {
      throw new Error(failure);
    }
    yield { type: "result", summary, thinking };
  }

  // ── private helpers ───────────────────────────────────────────────

  private runAsOpenClaw(
    args: string[],
    options: { signal?: AbortSignal; input?: string } = {}
  ) {
    return execBuffered(SUDO_BIN, ["-u", pyanchorConfig.openClawUser, ...args], options);
  }

  private async writeBrief(input: AgentRunInput, _ctx: AgentRunContext): Promise<void> {
    const brief = createBrief(input.prompt, input.targetPath, input.mode, input.recentMessages as never);
    await this.runAsOpenClaw(
      ["tee", `${pyanchorConfig.workspaceDir}/EDIT_BRIEF.md`],
      { input: brief }
    );
  }
}

export function buildAgentMessage(input: AgentRunInput): string {
  const routeFocus =
    input.targetPath === "/login" || input.targetPath === "/signup"
      ? "Focus on the auth routes, their shared auth components, and auth-related CSS only."
      : "Focus only on the target route and the components that route directly uses.";

  if (input.mode === "edit") {
    return [
      "Read EDIT_BRIEF.md first.",
      routeFocus,
      "Do not scan or refactor the whole repository.",
      "Implement the requested UI change completely in this workspace.",
      "Run a production build in this workspace and fix any issues until it passes.",
      "Keep behavior intact, then review the modified files for obvious issues.",
      "Respond in 2 or 3 lines summarizing the actual changes you made."
    ].join(" ");
  }

  return [
    "Read EDIT_BRIEF.md first.",
    routeFocus,
    "Inspect the relevant files and answer the user's question in Korean.",
    "Do not modify files unless the request explicitly asked for a code change.",
    "Do not run installs or builds for this answer.",
    "Be concise, concrete, and cite file paths in the response when relevant."
  ].join(" ");
}

/**
 * Parses one or more raw lines (ignoring whitespace-only) into a flat
 * list of AgentEvents. Mirrors the heuristics in the v0.1.x inline path:
 *   - JSON line → walk via extractAgentSignals → log/thinking events
 *   - JSON-fragment-looking line on stdout → silently dropped (tail
 *     of the final response document)
 *   - any other stdout line → forwarded as a log event
 */
export function* parseLine(lines: string[]): Iterable<AgentEvent> {
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    try {
      const parsed = JSON.parse(line) as unknown;
      const bucket = { texts: [] as string[], thinkings: [] as string[], logs: [] as string[] };
      extractAgentSignals(parsed, bucket);
      for (const text of bucket.texts) yield { type: "log", text: `[agent] ${text}` };
      for (const text of bucket.logs) yield { type: "log", text: `[agent] ${text}` };
      if (bucket.thinkings.length) {
        yield { type: "thinking", text: bucket.thinkings.join("\n\n") };
      }
      continue;
    } catch {
      // not JSON
    }

    const looksLikeJsonFragment =
      /^[\[\]{},"0-9.\-]+$/.test(line) ||
      line.includes('":') ||
      line.endsWith(",") ||
      line === "]";

    if (!looksLikeJsonFragment) {
      yield { type: "log", text: `[stdout] ${line}` };
    }
  }
}
