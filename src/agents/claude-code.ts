import { pyanchorConfig } from "../config";
import { selectFramework } from "../frameworks";

import type { AgentEvent, AgentRunContext, AgentRunInput, AgentRunner } from "./types";

const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";
const INSTALL_HINT =
  `pyanchor's claude-code adapter requires ${SDK_PACKAGE}. ` +
  `Install it: pnpm add ${SDK_PACKAGE} (or npm i ${SDK_PACKAGE}).`;

interface SdkModule {
  query: (args: {
    prompt: string;
    options?: Record<string, unknown>;
  }) => AsyncIterable<unknown>;
}

async function loadSdk(): Promise<SdkModule> {
  try {
    return (await import(SDK_PACKAGE)) as SdkModule;
  } catch {
    throw new Error(INSTALL_HINT);
  }
}

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

interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
}

interface AssistantPayload {
  type?: string;
  message?: { content?: ContentBlock[] };
  result?: string;
  thinking?: string;
}

export class ClaudeCodeAgentRunner implements AgentRunner {
  readonly name = "claude-code";

  async *run(input: AgentRunInput, ctx: AgentRunContext): AsyncIterable<AgentEvent> {
    const sdk = await loadSdk();

    const summaryParts: string[] = [];
    const thinkingParts: string[] = [];

    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    if (ctx.signal.aborted) {
      abortController.abort();
    } else {
      ctx.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const stream = sdk.query({
        prompt: buildBrief(input),
        options: {
          cwd: ctx.workspaceDir,
          permissionMode: input.mode === "edit" ? "acceptEdits" : "default",
          ...(ctx.model ? { model: ctx.model } : {}),
          abortController
        }
      });

      for await (const message of stream) {
        if (ctx.signal.aborted) break;

        const m = message as AssistantPayload;

        if (m.type === "thinking" && typeof m.thinking === "string" && m.thinking.trim()) {
          thinkingParts.push(m.thinking.trim());
          yield { type: "thinking", text: m.thinking.trim() };
          continue;
        }

        if (m.type === "result" && typeof m.result === "string" && m.result.trim()) {
          summaryParts.push(m.result.trim());
          continue;
        }

        const content = m.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
              summaryParts.push(block.text.trim());
            } else if (
              block.type === "thinking" &&
              typeof block.thinking === "string" &&
              block.thinking.trim()
            ) {
              thinkingParts.push(block.thinking.trim());
              yield { type: "thinking", text: block.thinking.trim() };
            }
          }
        }
      }
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
    }

    const summary = summaryParts.join("\n\n").trim() || "Done.";
    const thinking = thinkingParts.join("\n\n").trim() || null;

    yield { type: "result", summary, thinking };
  }
}
