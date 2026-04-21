/**
 * Google Gemini CLI adapter.
 *
 * Shell-out pattern, mirror of `codex.ts`. Spawns
 * `gemini -p "<prompt>" --yolo` in the workspace dir, captures the
 * plain-text output, forwards it to the worker as a single result
 * `summary`.
 *
 * **Why plain text, not stream-json (v0.32.6+):** earlier pyanchor
 * versions (v0.25.0–v0.32.5) used `--output-format stream-json` to
 * stream NDJSON events that we split into `log` (assistant text)
 * and `thinking` (reasoning trace) channels. The `--output-format`
 * flag was removed in `@google/gemini-cli` ~0.1.x — the CLI now
 * only emits plain text on stdout in non-interactive `-p` mode.
 * Caught by the reviewer-sim audit harness on a clean install:
 * every gemini edit started failing with `gemini exited with code
 * 1.` plus a help-text dump on stderr because the CLI rejected the
 * unknown flag. v0.32.6 drops stream-json and goes back to plain
 * text capture; the trade-off is no live `thinking` events, just
 * the final summary.
 *
 * **Why a CLI adapter, not an SDK adapter:** Gemini publishes a
 * standalone CLI (`@google/gemini-cli`) whose `-p` non-interactive
 * mode is the natural seam for pyanchor's "give me a prompt + a
 * workspace" contract. The Generative Language API + Vertex AI
 * have JS SDKs but they don't ship the workspace-edit tool loop
 * on their own — the CLI bundles that.
 *
 * **Auth:** the CLI handles auth via env or `gemini auth login`
 * (persists OAuth credentials). pyanchor doesn't touch credentials.
 *
 * **--yolo flag:** Gemini CLI's "yes-to-everything" mode. Without
 * it, the CLI asks for tool permission interactively, which would
 * hang in a headless worker. Edit-mode briefs constrain the agent
 * to the workspace dir; chat-mode briefs forbid file modification,
 * so --yolo is safe inside our contract.
 */

import { spawn } from "node:child_process";

import { pyanchorConfig } from "../config";
import { selectFramework } from "../frameworks";

import type { AgentEvent, AgentRunContext, AgentRunInput, AgentRunner } from "./types";

const INSTALL_HINT =
  "pyanchor's gemini adapter requires the Google Gemini CLI on PATH. " +
  "Install it: `npm i -g @google/gemini-cli`. " +
  "Auth: `export GEMINI_API_KEY=<key from aistudio.google.com>` " +
  "OR `gemini auth login` (OAuth, persists). " +
  "Override the binary with PYANCHOR_GEMINI_BIN.";

function formatRecent(messages: AgentRunInput["recentMessages"]): string {
  return messages
    .slice(-6)
    .map((m) => {
      const role = m.role === "assistant" ? "Assistant" : m.role === "system" ? "System" : "User";
      return `- ${role} [${m.mode}]${m.status ? ` (${m.status})` : ""}: ${m.text}`;
    })
    .join("\n");
}

export function buildBrief(input: AgentRunInput): string {
  const sections: string[] = [];

  if (input.targetPath) {
    sections.push(`Target route: ${input.targetPath}`);
  }

  sections.push(`Mode: ${input.mode}`);

  if (input.recentMessages.length > 0) {
    sections.push(`Recent conversation:\n${formatRecent(input.recentMessages)}`);
  }

  sections.push("");
  sections.push("User request:");
  sections.push(input.prompt);

  if (input.mode === "edit") {
    const framework = selectFramework(pyanchorConfig.framework);
    sections.push("");
    sections.push(
      "Apply the change to the appropriate files in the working directory. " +
        `${framework.briefBuildHint} ` +
        "Do not refactor unrelated areas. Respond in 2-3 lines summarizing the changes."
    );
  } else {
    sections.push("");
    sections.push(
      "Inspect the relevant files and answer the user's question. " +
        "Do not modify files. Be concise and cite file paths when relevant."
    );
  }

  return sections.join("\n");
}

/**
 * Build the argv for `gemini` invocation.
 *
 * Exported so the spawn-argv contract can be unit-tested without
 * mocking `node:child_process`. The flags are:
 *   `-p` — non-interactive prompt mode
 *   `--yolo` — auto-approve tool use (codex `--full-auto` equiv)
 *   `-m <model>` — only when the operator EXPLICITLY set
 *     `PYANCHOR_AGENT_MODEL` (the config default is empty as of
 *     v0.32.3 to avoid leaking openclaw routing prefixes).
 *
 * v0.32.6 removed `--output-format stream-json` — that flag was
 * dropped upstream in @google/gemini-cli ~0.1.x. The CLI now emits
 * plain text on stdout in -p mode; we capture all of it as the
 * result summary.
 */
export function buildGeminiArgs(prompt: string, explicitModel: string | null): string[] {
  const args: string[] = ["-p", prompt, "--yolo"];
  if (explicitModel) {
    args.push("-m", explicitModel);
  }
  return args;
}

export class GeminiAgentRunner implements AgentRunner {
  readonly name = "gemini";

  async *run(input: AgentRunInput, ctx: AgentRunContext): AsyncIterable<AgentEvent> {
    const bin = pyanchorConfig.geminiBin;
    const prompt = buildBrief(input);

    const explicitModel = process.env.PYANCHOR_AGENT_MODEL?.trim() || null;
    const args = buildGeminiArgs(prompt, explicitModel);

    const child = spawn(bin, args, {
      cwd: ctx.workspaceDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let spawnError: Error | null = null;
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        spawnError = new Error(INSTALL_HINT);
      } else {
        spawnError = err;
      }
    });

    const onAbort = () => {
      if (!child.killed) child.kill("SIGTERM");
    };
    if (ctx.signal.aborted) {
      onAbort();
    } else {
      ctx.signal.addEventListener("abort", onAbort, { once: true });
    }

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    // Capture stdout — emit each line as a `log` event so the
    // overlay can show progress, and also accumulate the full
    // text for the final result `summary`.
    const stdoutTask = (async () => {
      if (!child.stdout) return;
      let buffer = "";
      for await (const chunk of child.stdout as AsyncIterable<Buffer | string>) {
        if (ctx.signal.aborted) break;
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        stdoutChunks.push(text);
        buffer += text;
        // Emit complete lines as logs while preserving the tail.
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          if (line.trim().length > 0) {
            // We don't yield from this nested async fn (that would
            // need a queue). Just collect; the top-level loop yields.
          }
        }
      }
    })().catch(() => {});

    const stderrTask = (async () => {
      if (!child.stderr) return;
      for await (const chunk of child.stderr as AsyncIterable<Buffer | string>) {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        stderrChunks.push(text);
      }
    })().catch(() => {});

    try {
      // Wait for stdout collection to finish (child closes its
      // stdout when it exits).
      await stdoutTask;
      await stderrTask;

      const exitCode: number | null = await new Promise((resolve) => {
        if (child.exitCode !== null) {
          resolve(child.exitCode);
          return;
        }
        child.once("close", (code) => resolve(code));
      });

      if (spawnError) {
        throw spawnError;
      }

      if (exitCode !== 0 && !ctx.signal.aborted) {
        const stderr = stderrChunks.join("").trim();
        const tail = stderr ? `\n${stderr.split("\n").slice(-10).join("\n")}` : "";
        throw new Error(`gemini exited with code ${exitCode}.${tail}`);
      }

      // Emit the captured stdout as a single log event (so the
      // overlay shows the full agent output) before the result.
      const fullStdout = stdoutChunks.join("").trim();
      if (fullStdout) {
        yield { type: "log", text: fullStdout };
      }
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
      if (!child.killed && child.exitCode === null) {
        child.kill("SIGTERM");
      }
    }

    const summary = stdoutChunks.join("").trim() || "Done.";
    yield { type: "result", summary, thinking: null };
  }
}
