/**
 * Google Gemini CLI adapter (v0.25.0).
 *
 * Shell-out pattern, mirror of `codex.ts`. Spawns `gemini -p "<prompt>"
 * --output-format stream-json --yolo` in the workspace dir, parses the
 * NDJSON event stream, separates assistant text (summary) from
 * thoughts (thinking), forwards everything to the worker as
 * `AgentEvent`s.
 *
 * **Why a CLI adapter, not an SDK adapter:** Gemini publishes a
 * standalone CLI (`@google/gemini-cli`) whose `-p` non-interactive
 * mode is the natural seam for pyanchor's "give me a prompt + a
 * workspace" contract. The Generative Language API + Vertex AI both
 * have JS SDKs but they don't ship the workspace-edit tool loop on
 * their own — the CLI bundles that. We follow the CLI to get the
 * tool loop for free, same way the codex adapter follows
 * `@openai/codex`.
 *
 * **Auth:** the CLI handles auth via env or `gemini auth login`
 * (persists OAuth credentials). pyanchor doesn't touch credentials
 * — same separation of concerns as openclaw / codex / aider.
 *
 * **--yolo flag:** Gemini CLI's "yes-to-everything" mode (analogous
 * to Codex's `--full-auto`). Without it, the CLI asks for tool
 * permission interactively, which would hang in a headless worker.
 * Edit-mode briefs already constrain the agent to the workspace dir;
 * chat-mode briefs explicitly forbid file modification, so the
 * --yolo trade-off is safe inside our contract.
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
 * Gemini CLI's stream-json schema as observed against `@google/gemini-cli`
 * 0.x. The CLI emits one JSON object per line with at minimum a `type`
 * discriminator; we tolerate unknown / partial events so a CLI version
 * bump that adds new event types doesn't break the worker.
 */
interface GeminiStreamEvent {
  type?: string;
  /** Plain assistant text — may appear as `text` (top-level) or
   *  nested in `message.content`. We accept both shapes. */
  text?: string;
  message?: { content?: string | Array<{ type?: string; text?: string; thought?: string }> };
  /** Reasoning trace ("thoughts" in Gemini's terminology). */
  thought?: string;
  /** Error events surfaced as logs to the operator. */
  error?: string;
}

/**
 * Build the argv for `gemini` invocation.
 *
 * Exported so the spawn-argv contract can be unit-tested without
 * mocking `node:child_process`. The flags are:
 *   `-p` — non-interactive prompt mode
 *   `--output-format stream-json` — NDJSON event stream on stdout
 *   `--yolo` — auto-approve tool use (codex `--full-auto` equiv)
 *   `-m <model>` — only when the operator EXPLICITLY set
 *     `PYANCHOR_AGENT_MODEL`. The config-level default is openclaw-
 *     shaped; passing it to gemini fails the spawn immediately.
 */
export function buildGeminiArgs(prompt: string, explicitModel: string | null): string[] {
  const args: string[] = ["-p", prompt, "--output-format", "stream-json", "--yolo"];
  if (explicitModel) {
    args.push("-m", explicitModel);
  }
  return args;
}

async function* readLines(stream: NodeJS.ReadableStream): AsyncGenerator<string> {
  let buffer = "";
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (line.length > 0) yield line;
    }
  }
  if (buffer.trim().length > 0) yield buffer;
}

export class GeminiAgentRunner implements AgentRunner {
  readonly name = "gemini";

  async *run(input: AgentRunInput, ctx: AgentRunContext): AsyncIterable<AgentEvent> {
    const bin = pyanchorConfig.geminiBin;
    const prompt = buildBrief(input);

    // Round-16 P1: only forward -m when PYANCHOR_AGENT_MODEL was set
    // EXPLICITLY by the operator. The config-level default
    // ("openai-codex/gpt-5.4") is openclaw-shaped and would make
    // `gemini -m openai-codex/gpt-5.4` fail immediately. When
    // unset, let the Gemini CLI pick its own default model.
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

    const summaryParts: string[] = [];
    const thinkingParts: string[] = [];
    const stderrChunks: string[] = [];

    (async () => {
      if (!child.stderr) return;
      for await (const chunk of child.stderr as AsyncIterable<Buffer | string>) {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        stderrChunks.push(text);
      }
    })().catch(() => {
      /* swallow — we only care about stderr for the error path */
    });

    try {
      if (child.stdout) {
        for await (const line of readLines(child.stdout)) {
          if (ctx.signal.aborted) break;

          const trimmed = line.trim();
          if (!trimmed) continue;

          if (!trimmed.startsWith("{")) {
            // Non-JSON line (Gemini sometimes prints status lines
            // before the stream begins). Forward as a log for visibility.
            yield { type: "log", text: trimmed };
            continue;
          }

          let event: GeminiStreamEvent | null = null;
          try {
            event = JSON.parse(trimmed) as GeminiStreamEvent;
          } catch {
            // Truncated chunk or unknown encoding — skip; the next
            // line will catch up.
            continue;
          }
          if (!event) continue;

          // Top-level `text` (newer Gemini CLI versions emit this).
          if (typeof event.text === "string" && event.text.trim()) {
            summaryParts.push(event.text.trim());
            yield { type: "log", text: event.text.trim() };
            continue;
          }
          // Top-level `thought` (reasoning trace).
          if (typeof event.thought === "string" && event.thought.trim()) {
            thinkingParts.push(event.thought.trim());
            yield { type: "thinking", text: event.thought.trim() };
            continue;
          }

          // Nested message.content: either a string or an array of blocks.
          const content = event.message?.content;
          if (typeof content === "string" && content.trim()) {
            summaryParts.push(content.trim());
            yield { type: "log", text: content.trim() };
            continue;
          }
          if (Array.isArray(content)) {
            for (const block of content) {
              if (typeof block.text === "string" && block.text.trim()) {
                summaryParts.push(block.text.trim());
                yield { type: "log", text: block.text.trim() };
              } else if (typeof block.thought === "string" && block.thought.trim()) {
                thinkingParts.push(block.thought.trim());
                yield { type: "thinking", text: block.thought.trim() };
              }
            }
            continue;
          }

          // Errors surface as a log so the operator sees what happened.
          if (typeof event.error === "string" && event.error.trim()) {
            yield { type: "log", text: event.error.trim() };
          }
        }
      }

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
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
      if (!child.killed && child.exitCode === null) {
        child.kill("SIGTERM");
      }
    }

    const summary = summaryParts.join("\n\n").trim() || "Done.";
    const thinking = thinkingParts.join("\n\n").trim() || null;

    yield { type: "result", summary, thinking };
  }
}
