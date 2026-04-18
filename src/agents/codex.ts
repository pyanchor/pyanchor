import { spawn } from "node:child_process";

import { pyanchorConfig } from "../config";
import { selectFramework } from "../frameworks";

import type { AgentEvent, AgentRunContext, AgentRunInput, AgentRunner } from "./types";

const INSTALL_HINT =
  "pyanchor's codex adapter requires the OpenAI Codex CLI on PATH. " +
  "Install it: `npm i -g @openai/codex` (or `brew install --cask codex`). " +
  "Override the binary with PYANCHOR_CODEX_BIN.";

function formatRecent(messages: AgentRunInput["recentMessages"]): string {
  return messages
    .slice(-6)
    .map((m) => {
      const role = m.role === "assistant" ? "Assistant" : m.role === "system" ? "System" : "User";
      return `- ${role} [${m.mode}]${m.status ? ` (${m.status})` : ""}: ${m.text}`;
    })
    .join("\n");
}

function buildBrief(input: AgentRunInput): string {
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

interface CodexThreadItemDetails {
  type?: string;
  text?: string;
}

interface CodexThreadItem {
  id?: string;
  details?: CodexThreadItemDetails;
}

interface CodexEvent {
  type?: string;
  item?: CodexThreadItem;
  message?: string;
}

/**
 * Pump a stream line-by-line. Yields when a complete line is buffered.
 * Trailing partial line is flushed on close.
 */
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

export class CodexAgentRunner implements AgentRunner {
  readonly name = "codex";

  async *run(input: AgentRunInput, ctx: AgentRunContext): AsyncIterable<AgentEvent> {
    const bin = pyanchorConfig.codexBin;
    const prompt = buildBrief(input);

    // codex exec --json --cd <dir> [--skip-git-repo-check] [--full-auto] [-m <model>] "<prompt>"
    // --skip-git-repo-check: workspaces aren't always git repos.
    // --full-auto: workspace-write sandbox + auto-approval; equivalent of "yes" for non-interactive.
    // For chat (read-only) mode we keep --full-auto so the agent can read/grep but the brief
    // already instructs it not to write.
    const args: string[] = ["exec", "--json", "--skip-git-repo-check", "--full-auto", "--cd", ctx.workspaceDir];
    if (ctx.model) {
      args.push("-m", ctx.model);
    }
    args.push(prompt);

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

    // Collect stderr for diagnostic context if the run fails.
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
      if (!child.stdout) {
        // Spawn failed before stdout was opened; surface the error after exit fires.
      } else {
        for await (const line of readLines(child.stdout)) {
          if (ctx.signal.aborted) break;

          const trimmed = line.trim();
          if (!trimmed) continue;

          // Try to parse as JSON; otherwise treat as a plain log line.
          if (trimmed.startsWith("{")) {
            let event: CodexEvent | null = null;
            try {
              event = JSON.parse(trimmed) as CodexEvent;
            } catch {
              event = null;
            }

            if (event) {
              const details = event.item?.details;
              const text = details?.text?.trim();
              if (text) {
                if (details?.type === "agent_message") {
                  summaryParts.push(text);
                  yield { type: "log", text };
                  continue;
                }
                if (details?.type === "reasoning") {
                  thinkingParts.push(text);
                  yield { type: "thinking", text };
                  continue;
                }
              }

              // Surface error events as logs so the user sees what went wrong.
              if (event.type === "error" && typeof event.message === "string" && event.message.trim()) {
                yield { type: "log", text: event.message.trim() };
              }
              continue;
            }
          }

          // Non-JSON stdout — likely human-readable status; forward as a log.
          yield { type: "log", text: trimmed };
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
        throw new Error(`codex exec exited with code ${exitCode}.${tail}`);
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
