import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { pyanchorConfig } from "../config";
import { selectFramework } from "../frameworks";

import type { AgentEvent, AgentRunContext, AgentRunInput, AgentRunner } from "./types";

const INSTALL_HINT =
  "pyanchor's aider adapter requires the aider CLI on PATH. " +
  "Install it: `pip install aider-chat` (or `python -m pip install aider-install && aider-install`). " +
  "Override the binary with PYANCHOR_AIDER_BIN.";

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
        `After the edit, ${framework.briefBuildHint.charAt(0).toLowerCase()}${framework.briefBuildHint.slice(1)} ` +
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
 * Heuristically map a route hint (e.g. "/login") to candidate files in the
 * workspace. Returns the first matching path, or [] if nothing obvious is
 * found — in that case aider falls back to its repomap.
 *
 * The framework profile owns the candidate list; this function just walks
 * it against the filesystem.
 */
function guessFilesForRoute(workspaceDir: string, targetPath: string): string[] {
  if (!targetPath) return [];

  const framework = selectFramework(pyanchorConfig.framework);
  const candidates = framework.routeFileCandidates(targetPath);

  for (const rel of candidates) {
    const abs = path.join(workspaceDir, rel);
    if (existsSync(abs)) return [abs];
  }

  return [];
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
      yield line;
    }
  }
  if (buffer.length > 0) yield buffer;
}

export class AiderAgentRunner implements AgentRunner {
  readonly name = "aider";

  async *run(input: AgentRunInput, ctx: AgentRunContext): AsyncIterable<AgentEvent> {
    const bin = pyanchorConfig.aiderBin;
    const prompt = buildBrief(input);

    // aider --no-stream --yes --message "<prompt>" [files...]
    //   --no-stream  : flush full responses as units (cleaner line-buffered output)
    //   --yes        : auto-approve edits / file additions (non-interactive)
    //   --message    : single-shot prompt; aider exits after one turn
    //
    // For chat-only mode we add --dry-run so aider plans the change but
    // doesn't write to disk.
    const args: string[] = ["--no-stream", "--yes", "--message", prompt];

    if (input.mode !== "edit") {
      args.push("--dry-run");
    }

    if (ctx.model) {
      args.push("--model", ctx.model);
    }

    const guessedFiles = guessFilesForRoute(ctx.workspaceDir, input.targetPath);
    args.push(...guessedFiles);

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

    const transcriptLines: string[] = [];
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
        for await (const rawLine of readLines(child.stdout)) {
          if (ctx.signal.aborted) break;

          const line = rawLine.trimEnd();
          transcriptLines.push(line);

          const trimmed = line.trim();
          if (!trimmed) continue;

          // Forward most lines as logs. Aider prints diff hunks, file
          // additions, commit messages, and a final summary; the overlay
          // can render these as activity entries.
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
        throw new Error(`aider exited with code ${exitCode}.${tail}`);
      }
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
      if (!child.killed && child.exitCode === null) {
        child.kill("SIGTERM");
      }
    }

    // Aider doesn't separate "summary" from log lines — use the trailing
    // non-empty lines as a brief summary so the overlay shows something.
    const tail = transcriptLines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(-8)
      .join("\n")
      .trim();

    const summary = tail || "Done.";

    yield { type: "result", summary, thinking: null };
  }
}
