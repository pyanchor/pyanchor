/**
 * Pure prompt-construction helpers for the OpenClaw adapter.
 *
 * These take everything as parameters — no module state — so they can
 * be unit-tested without spinning up a worker process.
 */

import type { FrameworkProfile } from "../../frameworks/types";
import { nextjsProfile } from "../../frameworks/nextjs";
import type { AiEditMode, AiEditState } from "../../shared/types";

/**
 * Per-route guidance appended to the brief. Delegated to the framework
 * profile so each stack ships its own file-path conventions; this stays
 * a thin re-export for the existing tests and call sites.
 */
export function getRouteHints(jobTargetPath: string, framework: FrameworkProfile = nextjsProfile): string[] {
  return framework.routeHints(jobTargetPath);
}

/**
 * Formats the last 6 messages of the conversation as a markdown list
 * the agent can read. Empty input collapses to a one-line marker.
 */
export function formatConversationContext(messages: AiEditState["messages"]): string {
  if (messages.length === 0) {
    return "- No prior conversation.";
  }

  return messages
    .slice(-6)
    .map((message) => {
      const label =
        message.role === "assistant" ? "Assistant" : message.role === "system" ? "System" : "User";
      return `- ${label} [${message.mode}]${message.status ? ` (${message.status})` : ""}: ${message.text}`;
    })
    .join("\n");
}

/**
 * Builds the EDIT_BRIEF.md body the agent reads as its task spec.
 * Pure: same inputs always produce the same string.
 */
export function createBrief(
  jobPrompt: string,
  jobTargetPath: string,
  mode: AiEditMode,
  messages: AiEditState["messages"],
  framework: FrameworkProfile = nextjsProfile
): string {
  return [
    "# AI UI Request",
    "",
    `Mode: ${mode}`,
    `Target page: ${jobTargetPath || "not specified"}`,
    "",
    "## Current request",
    jobPrompt,
    "",
    "## Recent conversation",
    formatConversationContext(messages),
    "",
    "## Constraints",
    "- This project uses custom CSS, not Tailwind.",
    "- Keep Korean UI copy unless the request explicitly asks for text changes.",
    "- Stay focused on the current page and the components it directly uses.",
    ...(mode === "edit"
      ? [
          "- Preserve route flow, API logic, and data behavior.",
          "- Prefer production-ready UI changes over placeholder landing-page styling.",
          "- Do not create unrelated files or refactor unrelated areas."
        ]
      : [
          "- Do not modify files unless the user explicitly asked for a code change.",
          "- Answer clearly in Korean, based on the actual code and structure you inspected.",
          "- If you infer something, say that it is an inference."
        ]),
    "",
    "## Project hints",
    ...getRouteHints(jobTargetPath, framework),
    "",
    "## Output",
    ...(mode === "edit"
      ? [
          "- Implement the requested UI change completely in this workspace.",
          "- Review modified files for obvious TypeScript or JSX mistakes before finishing.",
          "- Keep the final response to 2 or 3 concise lines."
        ]
      : [
          "- Explain the answer directly and concisely.",
          "- If no code change is required, do not change files.",
          "- Keep the final response to 3 to 6 concise sentences."
        ])
  ].join("\n");
}
