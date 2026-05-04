import { promises as fs } from "node:fs";
import path from "node:path";

import { pyanchorConfig } from "../config";
import { selectFramework } from "../frameworks";

import type { AgentEvent, AgentRunContext, AgentRunInput, AgentRunner } from "./types";

/**
 * Pollinations.AI adapter.
 *
 * Pollinations exposes an OpenAI-compatible chat completions endpoint
 * (POST https://text.pollinations.ai/openai) with `tools` support. Unlike
 * the other adapters in this directory, Pollinations is HTTP-only — there
 * is no CLI binary and the model has no built-in workspace IO. So this
 * adapter implements its own tool loop: the LLM calls `list_files`,
 * `read_file`, `write_file`, and `done`, and we execute them against the
 * agent's scratch workspace.
 *
 * Configuration (all optional):
 *   PYANCHOR_AGENT=pollinations
 *   PYANCHOR_POLLINATIONS_TOKEN=sk_...     # backend bearer token (recommended)
 *   PYANCHOR_POLLINATIONS_REFERRER=...     # referrer for attribution / tier
 *   PYANCHOR_POLLINATIONS_MODEL=openai-fast  # any model from text.pollinations.ai/models
 *   PYANCHOR_POLLINATIONS_BASE_URL=https://text.pollinations.ai
 *   PYANCHOR_POLLINATIONS_MAX_TURNS=12
 *
 * Anonymous (no token) works but is rate-limited per IP. Attribution via
 * referrer (or a project bearer token) is what unlocks the developer's
 * tier on https://auth.pollinations.ai.
 */

const DEFAULT_BASE_URL = "https://text.pollinations.ai";
const DEFAULT_MODEL = "openai-fast";
const DEFAULT_MAX_TURNS = 12;
const READ_FILE_MAX_BYTES = 32_000;
const TOOL_RESULT_MAX_CHARS = 8_000;
const LIST_DIR_MAX_ENTRIES = 200;

interface ToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface ChoiceMessage {
  role: string;
  content?: string | null;
  reasoning?: string | null;
  tool_calls?: ToolCall[];
}

interface ChatResponse {
  choices?: Array<{ message?: ChoiceMessage }>;
  error?: { message?: string } | string;
}

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content?: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

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
      "Apply the change to the appropriate files in the workspace. " +
        `${framework.briefBuildHint} ` +
        "Do not refactor unrelated areas. Call the `done` tool with a 2-3 line summary " +
        "when finished."
    );
  } else {
    sections.push("");
    sections.push(
      "Inspect the relevant files and answer the user's question. Do NOT call write_file. " +
        "Call the `done` tool with your answer when finished."
    );
  }

  return sections.join("\n");
}

const SYSTEM_PROMPT = [
  "You are pyanchor's Pollinations agent. You edit a small slice of a running web app",
  "via four tools: list_files, read_file, write_file, done.",
  "",
  "Workflow:",
  "  1. Use list_files / read_file to understand the area you must change.",
  "  2. Make the smallest possible edit with write_file (full file contents).",
  "  3. Call done with a short summary.",
  "",
  "Rules:",
  "  - All paths are workspace-relative. Never use absolute paths or `..` segments.",
  "  - Edit only the files needed for the user request. Do not refactor.",
  "  - In chat mode, never call write_file.",
  "  - When you have nothing more to do, call done. Do not loop forever."
].join("\n");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and subdirectories under a workspace-relative directory.",
      parameters: {
        type: "object",
        properties: {
          dir: {
            type: "string",
            description: "Workspace-relative directory. Use \"\" for the workspace root."
          }
        },
        required: ["dir"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a workspace-relative file. Returns up to ~32KB of UTF-8 text.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Workspace-relative path." } },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Replace a workspace-relative file with the given full contents. Creates parent dirs as needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative path." },
          content: { type: "string", description: "Full new contents of the file." }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "done",
      description: "Signal that the request is complete. Provide a 2-3 line summary.",
      parameters: {
        type: "object",
        properties: { summary: { type: "string", description: "Short summary of what changed." } },
        required: ["summary"]
      }
    }
  }
];

/**
 * Resolve a user-supplied workspace-relative path safely. Throws if the
 * resolved absolute path escapes `workspaceDir` (defence-in-depth — same
 * principle as src/agents/aider.ts:guessFilesForRoute).
 */
function resolveInsideWorkspace(workspaceDir: string, rel: string): string {
  if (typeof rel !== "string") throw new Error("path must be a string");
  if (rel.includes("\0")) throw new Error("path contains NUL byte");
  const cleaned = rel.replace(/^\/+/, "");
  const abs = path.resolve(workspaceDir, cleaned);
  const normWorkspace = path.resolve(workspaceDir);
  if (abs !== normWorkspace && !abs.startsWith(normWorkspace + path.sep)) {
    throw new Error(`path escapes workspace: ${rel}`);
  }
  return abs;
}

async function listFilesTool(workspaceDir: string, args: { dir?: string }): Promise<string> {
  const dir = args.dir ?? "";
  const abs = resolveInsideWorkspace(workspaceDir, dir);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  const items = entries
    .slice(0, LIST_DIR_MAX_ENTRIES)
    .map((e) => `${e.isDirectory() ? "[d]" : "   "} ${e.name}`);
  if (entries.length > LIST_DIR_MAX_ENTRIES) {
    items.push(`... (${entries.length - LIST_DIR_MAX_ENTRIES} more)`);
  }
  return items.join("\n");
}

async function readFileTool(workspaceDir: string, args: { path?: string }): Promise<string> {
  if (!args.path) throw new Error("path is required");
  const abs = resolveInsideWorkspace(workspaceDir, args.path);
  const handle = await fs.open(abs, "r");
  try {
    const buf = Buffer.alloc(READ_FILE_MAX_BYTES);
    const { bytesRead } = await handle.read(buf, 0, READ_FILE_MAX_BYTES, 0);
    const stat = await handle.stat();
    const truncated = stat.size > bytesRead;
    const text = buf.subarray(0, bytesRead).toString("utf8");
    return truncated
      ? `${text}\n\n[truncated — file is ${stat.size} bytes, returned first ${bytesRead}]`
      : text;
  } finally {
    await handle.close();
  }
}

async function writeFileTool(
  workspaceDir: string,
  args: { path?: string; content?: string }
): Promise<string> {
  if (!args.path) throw new Error("path is required");
  if (typeof args.content !== "string") throw new Error("content must be a string");
  const abs = resolveInsideWorkspace(workspaceDir, args.path);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, args.content, "utf8");
  return `wrote ${args.content.length} bytes to ${args.path}`;
}

function clip(s: string, max = TOOL_RESULT_MAX_CHARS): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n[...truncated to ${max} chars]`;
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface PollinationsSettings {
  baseUrl: string;
  model: string;
  token: string;
  referrer: string;
  maxTurns: number;
}

function readSettings(ctxModel: string): PollinationsSettings {
  const env = process.env;
  const rawBase = env.PYANCHOR_POLLINATIONS_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const baseUrl = rawBase.replace(/\/+$/, "");
  const model = (ctxModel || env.PYANCHOR_POLLINATIONS_MODEL || DEFAULT_MODEL).trim();
  const token = env.PYANCHOR_POLLINATIONS_TOKEN?.trim() ?? "";
  const referrer = env.PYANCHOR_POLLINATIONS_REFERRER?.trim() ?? "";
  const rawTurns = Number.parseInt(env.PYANCHOR_POLLINATIONS_MAX_TURNS ?? "", 10);
  const maxTurns =
    Number.isFinite(rawTurns) && rawTurns > 0 && rawTurns <= 64 ? rawTurns : DEFAULT_MAX_TURNS;
  return { baseUrl, model, token, referrer, maxTurns };
}

async function callChat(
  settings: PollinationsSettings,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<ChoiceMessage> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.token) headers.Authorization = `Bearer ${settings.token}`;
  if (settings.referrer) headers.Referer = settings.referrer;

  const body = {
    model: settings.model,
    messages,
    tools: TOOLS,
    tool_choice: "auto" as const,
    ...(settings.referrer ? { referrer: settings.referrer } : {})
  };

  const response = await fetch(`${settings.baseUrl}/openai`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Pollinations chat error: HTTP ${response.status} ${response.statusText} ${clip(text, 500)}`
    );
  }

  const data = (await response.json()) as ChatResponse;
  if (data.error) {
    const msg = typeof data.error === "string" ? data.error : data.error.message;
    throw new Error(`Pollinations chat error: ${msg ?? "unknown"}`);
  }
  const choice = data.choices?.[0]?.message;
  if (!choice) throw new Error("Pollinations chat error: no choices in response");
  return choice;
}

export class PollinationsAgentRunner implements AgentRunner {
  readonly name = "pollinations";

  async *run(input: AgentRunInput, ctx: AgentRunContext): AsyncIterable<AgentEvent> {
    const settings = readSettings(ctx.model);

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildBrief(input) }
    ];

    let summary = "";
    let lastAssistantContent = "";

    for (let turn = 0; turn < settings.maxTurns; turn++) {
      if (ctx.signal.aborted) break;

      let choice: ChoiceMessage;
      try {
        choice = await callChat(settings, messages, ctx.signal);
      } catch (err) {
        if (ctx.signal.aborted) break;
        const msg = err instanceof Error ? err.message : String(err);
        yield { type: "log", text: msg };
        throw err;
      }

      const reasoning = typeof choice.reasoning === "string" ? choice.reasoning.trim() : "";
      if (reasoning) yield { type: "thinking", text: reasoning };

      const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
      lastAssistantContent = (choice.content ?? "").trim();

      if (toolCalls.length === 0) {
        // Model finished without an explicit `done` call — accept content as summary.
        if (lastAssistantContent) summary = lastAssistantContent;
        break;
      }

      messages.push({
        role: "assistant",
        content: choice.content ?? null,
        tool_calls: toolCalls
      });

      let didDone = false;

      for (const call of toolCalls) {
        if (ctx.signal.aborted) break;
        const name = call.function?.name ?? "";
        const args = parseArgs(call.function?.arguments);
        const callId = call.id ?? `${name}-${turn}`;

        let toolOutput: string;
        try {
          if (name === "list_files") {
            yield { type: "step", label: "list_files", description: String(args.dir ?? "") };
            toolOutput = await listFilesTool(ctx.workspaceDir, args as { dir?: string });
          } else if (name === "read_file") {
            yield { type: "step", label: "read_file", description: String(args.path ?? "") };
            toolOutput = await readFileTool(ctx.workspaceDir, args as { path?: string });
          } else if (name === "write_file") {
            if (input.mode !== "edit") {
              toolOutput = "error: write_file is not allowed in chat mode";
            } else {
              yield { type: "step", label: "write_file", description: String(args.path ?? "") };
              toolOutput = await writeFileTool(
                ctx.workspaceDir,
                args as { path?: string; content?: string }
              );
            }
          } else if (name === "done") {
            const givenSummary = typeof args.summary === "string" ? args.summary.trim() : "";
            summary = givenSummary || lastAssistantContent || "Done.";
            yield { type: "step", label: "done", description: summary };
            didDone = true;
            toolOutput = "ok";
          } else {
            toolOutput = `error: unknown tool ${name}`;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toolOutput = `error: ${msg}`;
          yield { type: "log", text: `${name} failed: ${msg}` };
        }

        messages.push({ role: "tool", tool_call_id: callId, content: clip(toolOutput) });
      }

      if (didDone) break;
    }

    if (ctx.signal.aborted) {
      yield { type: "result", summary: summary || "Cancelled.", thinking: null };
      return;
    }

    if (!summary) summary = lastAssistantContent || "Done (no explicit summary).";
    yield { type: "result", summary, thinking: null };
  }
}
