/**
 * `pyanchor agent test [agent]` — fire a one-shot prompt at the
 * configured (or named) agent and print every event the adapter
 * yields. v0.30.0+. Sister to `init` / `doctor` / `logs`.
 *
 * What it's for:
 *   - Operator wants to confirm "is the agent CLI installed,
 *     authenticated, and actually responding?" without booting the
 *     full sidecar and clicking through the overlay.
 *   - Easier to pinpoint "openclaw token expired" vs "sidecar
 *     bug" — this command exercises only the adapter loop.
 *   - Useful in CI dry-runs and in `pyanchor doctor` follow-ups
 *     when an agent's CLI resolves on PATH but the auth state
 *     is unknown.
 *
 * What it's NOT:
 *   - Not a benchmark. Single shot, no warm-up.
 *   - Not safe for production token rotation flows — it spawns
 *     the actual agent CLI which charges API credits.
 *   - Not a full edit. We run with mode=chat by default so the
 *     adapter is asked to answer, not mutate code (most adapters
 *     respect this; aider/openclaw with --no-write also does).
 */

import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { selectAgent, type AgentEvent } from "../agents";
import { pyanchorConfig } from "../config";
import type { AiEditMode } from "../shared/types";

// v0.31.1 — exact-match success criterion.
// Round 19 P2: pre-v0.31.1 `agent test` accepted ANY result event as
// success, but the help text promised an "exact-match" check. An
// adapter that responded "I cannot comply" was scored as ✓. Now:
//   - Default prompt → success only if result.summary contains the
//     expected token below (i.e. the adapter actually obeyed)
//   - Custom prompt → any result event still counts (operator
//     specified the prompt, they own the success definition)
const DEFAULT_AGENT_TEST_PROMPT = "Reply with the exact text: pyanchor-agent-test-ok";
const DEFAULT_AGENT_TEST_EXPECTED = "pyanchor-agent-test-ok";

interface AgentTestArgs {
  prompt: string;
  agent?: string; // override PYANCHOR_AGENT for this run only
  mode: AiEditMode;
  timeoutMs: number;
  workspace?: string;
  printHelp: boolean;
}

function parseArgs(argv: string[]): AgentTestArgs {
  const out: AgentTestArgs = {
    prompt: DEFAULT_AGENT_TEST_PROMPT,
    mode: "chat",
    timeoutMs: 30_000,
    printHelp: false
  };

  // Positional: first non-flag is the agent name; rest is the prompt.
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.printHelp = true;
    else if (a === "--prompt" || a === "-p") {
      const v = argv[++i];
      if (!v) throw new Error("--prompt requires a value");
      out.prompt = v;
    } else if (a === "--mode" || a === "-m") {
      const v = argv[++i];
      if (v !== "chat" && v !== "edit")
        throw new Error(`--mode must be chat or edit (got "${v}")`);
      out.mode = v;
    } else if (a === "--timeout") {
      const v = argv[++i];
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0)
        throw new Error(`--timeout must be a positive integer ms (got "${v}")`);
      out.timeoutMs = n;
    } else if (a === "--workspace") {
      const v = argv[++i];
      if (!v) throw new Error("--workspace requires a path");
      out.workspace = v;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown argument: ${a}. Try --help.`);
    } else {
      positionals.push(a);
    }
  }
  if (positionals.length > 0) out.agent = positionals[0];
  if (positionals.length > 1) out.prompt = positionals.slice(1).join(" ");
  return out;
}

function helpText(): string {
  return `Usage: pyanchor agent test [agent] [prompt] [options]

Fire a one-shot prompt at the configured (or named) agent and print
every event the adapter yields. Invokes the real agent CLI — this
**will consume API credits / tokens**. Exit 0 on success, 1 on
failure or timeout.

Success criterion:
  - Default prompt: agent's result event must include the literal
    string "pyanchor-agent-test-ok". A "result" event with any
    other content (e.g. "I cannot comply") is treated as failure.
  - Custom prompt (--prompt or positional): any result event counts
    as success — you own the prompt, you own the success definition.

Arguments:
  agent      Override PYANCHOR_AGENT for this run only
             (openclaw | claude-code | codex | aider | gemini).
             Default: whatever PYANCHOR_AGENT is set to.
  prompt     Prompt to send. Default: "Reply with the exact text:
             pyanchor-agent-test-ok".

Options:
  --prompt, -p <s>   Same as positional prompt.
  --mode, -m <kind>  chat (default — answer without writing) or
                     edit (let the adapter mutate the workspace).
  --timeout <ms>     Run timeout in milliseconds (default 30000).
  --workspace <path> Use this directory as workspace (default:
                     a fresh tmpdir under /tmp).
  --help, -h         This message.

Environment: reads PYANCHOR_AGENT, PYANCHOR_AGENT_MODEL,
PYANCHOR_AGENT_THINKING, and the per-adapter PYANCHOR_*_BIN env vars.

Examples:
  pyanchor agent test
  pyanchor agent test gemini "What's 2+2?"
  pyanchor agent test --mode edit --timeout 120000
`;
}

const NO_COLOR = !!process.env.NO_COLOR || !process.stdout.isTTY;
const dim = (s: string) => (NO_COLOR ? s : `\x1b[90m${s}\x1b[0m`);
const green = (s: string) => (NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`);
const red = (s: string) => (NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`);
const cyan = (s: string) => (NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`);

function renderEvent(e: AgentEvent): string {
  const t = new Date().toISOString().replace("T", " ").replace(/\..+Z$/, "Z");
  switch (e.type) {
    case "log":
      return `${dim(t)} ${dim("[log]    ")} ${e.text}`;
    case "thinking":
      return `${dim(t)} ${dim("[think]  ")} ${dim(e.text.slice(0, 200))}`;
    case "step":
      return `${dim(t)} ${cyan("[step]   ")} ${e.label}${e.description ? ` — ${dim(e.description)}` : ""}`;
    case "result":
      return `${dim(t)} ${green("[result] ")} ${e.summary}`;
  }
}

export async function runAgentTest(argv: string[] = []): Promise<number> {
  let args: AgentTestArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`pyanchor agent test: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  if (args.printHelp) {
    process.stdout.write(helpText());
    return 0;
  }

  // If user passed an agent override, swap PYANCHOR_AGENT *before*
  // selectAgent() reads it. This is the cleanest hand-off — the
  // alternative would be to plumb an explicit name into the agent
  // factory, but selectAgent() already knows how to map config →
  // adapter, and we want to avoid a parallel resolution path.
  if (args.agent) {
    process.env.PYANCHOR_AGENT = args.agent;
    // pyanchorConfig.agent was captured at module load; we mutate
    // process.env here for selectAgent's runtime check.
    (pyanchorConfig as { agent: string }).agent = args.agent;
  }

  const workspaceDir = args.workspace ?? mkdtempSync(path.join(os.tmpdir(), "pyanchor-agent-test-"));
  console.log(
    dim(
      `pyanchor agent test — agent=${pyanchorConfig.agent} mode=${args.mode} timeout=${args.timeoutMs}ms workspace=${workspaceDir}`
    )
  );
  console.log(dim(`prompt: ${args.prompt}`));
  console.log("");

  let agent;
  try {
    agent = selectAgent();
  } catch (err) {
    console.error(red(`✗ failed to select agent: ${err instanceof Error ? err.message : String(err)}`));
    return 1;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  let eventCount = 0;
  let resultSummary: string | null = null;
  const startedAt = Date.now();

  try {
    if (agent.prepare) {
      await agent.prepare({
        workspaceDir,
        timeoutMs: args.timeoutMs,
        model: pyanchorConfig.model,
        thinking: pyanchorConfig.thinking,
        signal: controller.signal
      });
    }

    for await (const event of agent.run(
      {
        prompt: args.prompt,
        targetPath: "/",
        mode: args.mode,
        recentMessages: [],
        jobId: `agent-test-${Date.now()}`
      },
      {
        workspaceDir,
        timeoutMs: args.timeoutMs,
        model: pyanchorConfig.model,
        thinking: pyanchorConfig.thinking,
        signal: controller.signal
      }
    )) {
      eventCount++;
      console.log(renderEvent(event));
      if (event.type === "result") resultSummary = event.summary;
    }
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("");
    if (controller.signal.aborted) {
      console.error(red(`✗ agent run aborted (timeout ${args.timeoutMs}ms exceeded)`));
    } else {
      console.error(red(`✗ agent run failed: ${msg}`));
    }
    return 1;
  } finally {
    clearTimeout(timer);
  }

  const elapsedMs = Date.now() - startedAt;
  console.log("");
  if (resultSummary !== null) {
    // v0.31.1: exact-match check ONLY when we used the default prompt.
    // Custom prompts: any result event counts (operator picked the
    // prompt, they own the success criterion).
    if (
      args.prompt === DEFAULT_AGENT_TEST_PROMPT &&
      !resultSummary.includes(DEFAULT_AGENT_TEST_EXPECTED)
    ) {
      console.log(
        red(
          `✗ agent result did not include "${DEFAULT_AGENT_TEST_EXPECTED}" — got: ${resultSummary.slice(0, 200)}`
        )
      );
      return 1;
    }
    console.log(green(`✓ agent responded in ${elapsedMs}ms (${eventCount} event${eventCount === 1 ? "" : "s"})`));
    return 0;
  }
  console.log(
    red(`✗ agent finished without emitting a result event (${eventCount} event${eventCount === 1 ? "" : "s"} in ${elapsedMs}ms)`)
  );
  return 1;
}
