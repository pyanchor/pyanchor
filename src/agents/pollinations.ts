import { promises as fs } from "node:fs";
import path from "node:path";

import { pyanchorConfig } from "../config";
import { selectFramework } from "../frameworks";

import type { AgentEvent, AgentRunContext, AgentRunInput, AgentRunner } from "./types";

/**
 * Pollinations.AI adapter.
 *
 * Pollinations exposes an OpenAI-compatible chat completions endpoint
 * (POST https://gen.pollinations.ai/v1/chat/completions; the legacy
 * https://text.pollinations.ai/openai endpoint is still honored via
 * PYANCHOR_POLLINATIONS_BASE_URL) with `tools` support. Unlike the other
 * adapters in this directory, Pollinations is HTTP-only — there is no
 * CLI binary and the model has no built-in workspace IO. So this adapter
 * implements its own tool loop: the LLM calls `list_files`, `read_file`,
 * `search_replace`, `write_file`, and `done`, and we execute them against
 * the agent's scratch workspace.
 *
 * Configuration (all optional):
 *   PYANCHOR_AGENT=pollinations
 *   PYANCHOR_POLLINATIONS_TOKEN=sk_...     # backend bearer token (recommended)
 *   PYANCHOR_POLLINATIONS_REFERRER=...     # referrer for attribution / tier
 *   PYANCHOR_POLLINATIONS_MODEL=nova-fast              # default since v0.38.0
 *   PYANCHOR_POLLINATIONS_BASE_URL=https://gen.pollinations.ai   # default since v0.38.0
 *   PYANCHOR_POLLINATIONS_PATH=/v1/chat/completions    # default since v0.38.0
 *   PYANCHOR_POLLINATIONS_MAX_TURNS=12
 *
 * Anonymous (no token) works but is rate-limited per IP. Attribution via
 * referrer (or a project bearer token) is what unlocks the developer's
 * tier on https://auth.pollinations.ai.
 */

// v0.38.0 — migrated from the legacy `text.pollinations.ai/openai`
// endpoint to the new `gen.pollinations.ai/v1/chat/completions`
// gateway (per Pollinations' deprecation notice). The new endpoint
// exposes the full ~36-model catalog at runtime, not just `openai-fast`,
// so we can also default to a cheaper model (`nova-fast` = Amazon Nova
// Micro, ~$0.000245/call vs `openai-fast` ~$0.000550/call).
//
// Pre-v0.38 env vars are still honored: deployments that pinned
// `PYANCHOR_POLLINATIONS_BASE_URL=https://text.pollinations.ai` keep
// working when paired with `PYANCHOR_POLLINATIONS_PATH=/openai`.
const DEFAULT_BASE_URL = "https://gen.pollinations.ai";
const DEFAULT_PATH = "/v1/chat/completions";
const DEFAULT_MODEL = "nova-fast";
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

// v0.38.1 — filter and trim history before injecting into the brief.
//
// Pre-v0.38.1 we passed the last 6 messages verbatim. With pyanchor's
// shorter Pollinations cycles, prior assistant turns were often the
// generic "Done (no explicit summary)." marker; replaying those at
// the top of the next brief taught the model "previous turns ended
// with an immediate done" and it started no-op'ing on the new request.
//
// Now we drop assistant boilerplate-summaries entirely, drop system
// rows (they're worker chatter the model doesn't need), and cap to
// the last 4 user-facing turns.
const ASSISTANT_BOILERPLATE = /^(done|done\.|done \(no explicit summary\)\.?)$/i;

// v0.40.2 — quick natural-language detection for the user prompt.
// Used by buildBrief() to add an explicit "respond in X" hint at the
// END of the brief (recency bias — small models pay more attention
// to instructions near the end). Returns null for English/Latin
// scripts (those don't need the hint; the system prompt's English
// already biases the model that way).
//
// Detection is character-set based, NOT a real language model — it
// returns "Korean" for any prompt containing Hangul codepoints, even
// if the prompt is "open the file 한글-test.txt". That's intentional:
// false positives are cheap (model just answers in Korean, which is
// fine if the user used Korean characters at all), false negatives
// are the bug we're fixing.
//
// Order matters: Japanese check before CJK Unified Ideographs check
// so a prompt with hiragana/katakana doesn't get classified as Chinese.
function detectPromptLanguage(prompt: string): string | null {
  if (/[가-힣ㄱ-ㆎ]/.test(prompt)) return "Korean";
  if (/[぀-ゟ゠-ヿ]/.test(prompt)) return "Japanese";
  if (/[一-龯]/.test(prompt)) return "Chinese";
  if (/[؀-ۿ]/.test(prompt)) return "Arabic";
  if (/[֐-׿]/.test(prompt)) return "Hebrew";
  if (/[Ѐ-ӿ]/.test(prompt)) return "Russian";
  if (/[฀-๿]/.test(prompt)) return "Thai";
  if (/[ऀ-ॿ]/.test(prompt)) return "Hindi";
  if (/[ঀ-৿]/.test(prompt)) return "Bengali";
  return null;
}

function formatRecent(messages: AgentRunInput["recentMessages"]): string {
  const filtered = messages.filter((m) => {
    if (m.role === "system") return false;
    if (m.role === "assistant" && ASSISTANT_BOILERPLATE.test(m.text.trim())) return false;
    return true;
  });
  return filtered
    .slice(-4)
    .map((m) => {
      const role = m.role === "assistant" ? "Assistant" : "User";
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
      "Apply the change by: (1) calling read_file on the target file, (2) calling " +
        "search_replace once per spot you need to change (preferred for small edits) " +
        "OR write_file with the full new contents (only for new files or full rewrites), " +
        "(3) calling done. Do not skip the edit step. " +
        `${framework.briefBuildHint} ` +
        "Do not refactor unrelated areas. The `done` summary should be 2-3 lines."
    );
  } else {
    sections.push("");
    sections.push(
      "Inspect the relevant files with read_file and answer the user's question. " +
        "Do NOT call write_file or search_replace. Call the `done` tool with your " +
        "answer when finished."
    );
  }

  // v0.40.2 — explicit response-language hint at the END of the brief
  // (recency bias). The system prompt already says "respond in user's
  // language" but small models often skip system-level meta hints when
  // the brief is otherwise English. Detected language → explicit
  // "Respond in X" line wins.
  const promptLanguage = detectPromptLanguage(input.prompt);
  if (promptLanguage) {
    sections.push("");
    sections.push(
      `IMPORTANT: the user wrote in ${promptLanguage}. Write your \`done\` summary ` +
        `in ${promptLanguage}, not in English. Tool-call arguments (file paths, code, ` +
        `find/replace literal strings) stay in their original form — code is code.`
    );
  }

  return sections.join("\n");
}

const SYSTEM_PROMPT = [
  "You are pyanchor's Pollinations agent. You edit a small slice of a running",
  "web app via five tools: list_files, read_file, search_replace, write_file, done.",
  "",
  "MANDATORY workflow for every edit-mode request:",
  "  1. ALWAYS call read_file at least once on the file you intend to change",
  "     BEFORE doing anything else. Never assume you remember a file's contents.",
  "  2. After reading, prefer search_replace over write_file:",
  "       - search_replace(path, find, replace) — for any change that touches",
  "         less than ~20 lines of an existing file. The `find` substring must",
  "         be unique in the file (5-15 chars of surrounding context on each",
  "         side is usually enough). For multi-spot edits, call search_replace",
  "         once per spot.",
  "       - write_file(path, content) — ONLY when creating a new file or",
  "         rewriting an existing file in its entirety. Do NOT use write_file",
  "         for small edits to existing 200+ line files; small models often",
  "         truncate the tail when emitting the whole file.",
  "  3. After all edits, call done with a 2-3 line summary of what changed.",
  "",
  "Tool-call discipline (violations cause silent failures):",
  "  - In edit mode, NEVER call done without calling search_replace or",
  "    write_file at least once. If you think no change is needed, look",
  "    again — the user prefers a no-op edit to a missed edit.",
  "  - NEVER pass diff/patch syntax to write_file. The `content` argument is",
  "    the literal new file contents — no \"+\"/\"-\" line prefixes, no \"@@\"",
  "    hunk headers, no \"diff --git\" lines.",
  "  - search_replace's `find` and `replace` are LITERAL strings — no regex,",
  "    no escapes. If the tool errors with \"appears N times\", add more",
  "    surrounding context to make the match unique. If it errors with",
  "    \"not found\", call read_file again to update your view of the file.",
  "  - In chat mode, NEVER call write_file or search_replace. Use read_file",
  "    to inspect, then call done with the answer in the summary.",
  "",
  "Path discipline:",
  "  - All paths are workspace-relative.",
  "  - Never use absolute paths or `..` segments.",
  "  - Common locations: package.json / vite.config.ts / tsconfig.json /",
  "    next.config.js / index.html sit at the workspace ROOT, not under src/.",
  "    Component sources sit under src/.",
  "",
  "Constraint discipline:",
  "  - Edit only the files explicitly named or implied by the user request.",
  "  - Do NOT modify package.json or package-lock.json unless the user",
  "    request is explicitly about adding or removing a dependency.",
  "",
  "Response-language discipline:",
  "  - Detect the user prompt's natural language (English, Korean,",
  "    Japanese, Spanish, etc.) and write the `done` summary in the",
  "    SAME language. If the user prompt is Korean, the summary must",
  "    be Korean; if Japanese, Japanese; etc.",
  "  - This applies to the `done` tool's `summary` argument and any",
  "    free-form `content` you emit. Tool-call arguments (paths,",
  "    `find`/`replace` strings) stay in whatever literal form the",
  "    target file uses — code stays code regardless of prompt",
  "    language."
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
      name: "search_replace",
      description:
        "PREFERRED for small edits — replace a unique substring in a file. Both `find` and `replace` are literal strings (no regex, no escaping). The `find` string MUST appear exactly once in the file; if it appears 0 or 2+ times the tool errors so you can add more surrounding context. Use this for line-level or string-level edits instead of write_file — it preserves the rest of the file verbatim and avoids the truncation/regeneration bugs that hit 200+ line files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative path." },
          find: {
            type: "string",
            description:
              "Literal substring to locate. Include enough surrounding context (5-15 chars on each side of the change) so the match is unique."
          },
          replace: {
            type: "string",
            description: "What to substitute in place of the matched substring."
          }
        },
        required: ["path", "find", "replace"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Replace a workspace-relative file with the given full contents. Creates parent dirs as needed. Use ONLY when creating a new file or rewriting a file in its entirety — for small edits to existing files, use search_replace instead (write_file on a 200+ line file from a small model often truncates the tail).",
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

/**
 * v0.39.0 — small-edit tool. Read the existing file, count how many
 * times `find` appears, and only commit when the count is exactly 1.
 * Zero or multiple matches return a descriptive error so the model
 * can either add more surrounding context (to disambiguate) or read
 * the file again (to update its mental model).
 *
 * Why a separate tool instead of just write_file: small/fast models
 * (nova-fast, qwen-coder, openai-fast) regularly truncate the tail
 * of a 200+ line file when asked to emit the entire new contents
 * via write_file. search_replace lets them emit just the change,
 * so token budget / attention limits never become a quality risk.
 */
async function searchReplaceTool(
  workspaceDir: string,
  args: { path?: string; find?: string; replace?: string }
): Promise<string> {
  if (!args.path) throw new Error("path is required");
  if (typeof args.find !== "string") throw new Error("find must be a string");
  if (typeof args.replace !== "string") throw new Error("replace must be a string");
  if (args.find.length === 0) throw new Error("find must be a non-empty string");

  const abs = resolveInsideWorkspace(workspaceDir, args.path);
  const original = await fs.readFile(abs, "utf8");

  // Count occurrences without paying the cost of regex compilation. For
  // the workspace files we touch (under 8KB typical, 32KB max via
  // read_file) split() is fast enough.
  const occurrences = original.split(args.find).length - 1;
  if (occurrences === 0) {
    throw new Error(
      `find string not found in ${args.path}. Call read_file again to see the current contents, ` +
        `then retry with a substring that actually appears in the file.`
    );
  }
  if (occurrences > 1) {
    throw new Error(
      `find string appears ${occurrences} times in ${args.path}. Add more surrounding ` +
        `context (5-15 chars on each side) so the match is unique, then retry.`
    );
  }

  // Use the callback form of String.prototype.replace so `replace`
  // patterns like `$1` / `$&` don't get interpreted as backrefs.
  const updated = original.replace(args.find, () => args.replace as string);
  await fs.writeFile(abs, updated, "utf8");
  return `replaced ${args.find.length} chars with ${args.replace.length} chars in ${args.path}`;
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
  path: string;
  model: string;
  token: string;
  referrer: string;
  maxTurns: number;
}

function readSettings(ctxModel: string): PollinationsSettings {
  const env = process.env;
  const rawBase = env.PYANCHOR_POLLINATIONS_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const baseUrl = rawBase.replace(/\/+$/, "");
  const rawPath = env.PYANCHOR_POLLINATIONS_PATH?.trim() || DEFAULT_PATH;
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const model = (ctxModel || env.PYANCHOR_POLLINATIONS_MODEL || DEFAULT_MODEL).trim();
  const token = env.PYANCHOR_POLLINATIONS_TOKEN?.trim() ?? "";
  const referrer = env.PYANCHOR_POLLINATIONS_REFERRER?.trim() ?? "";
  const rawTurns = Number.parseInt(env.PYANCHOR_POLLINATIONS_MAX_TURNS ?? "", 10);
  const maxTurns =
    Number.isFinite(rawTurns) && rawTurns > 0 && rawTurns <= 64 ? rawTurns : DEFAULT_MAX_TURNS;
  return { baseUrl, path, model, token, referrer, maxTurns };
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

  const response = await fetch(`${settings.baseUrl}${settings.path}`, {
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

      // v0.38.1 — strip `content` when tool_calls are present. Some
      // Bedrock-routed models on Pollinations (notably nova-fast) emit
      // a "<thinking>…</thinking>" prelude in `content` alongside the
      // tool_calls; replaying that on the next turn trips the Bedrock
      // backend's "Model produced invalid sequence as part of ToolUse"
      // rejection. The OpenAI canonical shape for an assistant turn
      // that calls tools is content=null + tool_calls=[…], and that's
      // what every Pollinations model accepts on the next turn.
      messages.push({
        role: "assistant",
        content: toolCalls.length > 0 ? null : (choice.content ?? null),
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
          } else if (name === "search_replace") {
            if (input.mode !== "edit") {
              toolOutput = "error: search_replace is not allowed in chat mode";
            } else {
              yield { type: "step", label: "search_replace", description: String(args.path ?? "") };
              toolOutput = await searchReplaceTool(
                ctx.workspaceDir,
                args as { path?: string; find?: string; replace?: string }
              );
            }
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
