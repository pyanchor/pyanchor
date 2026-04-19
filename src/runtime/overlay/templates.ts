/**
 * Pure HTML-string template builders.
 *
 * Each function takes plain props (no closures over uiState /
 * serverState) and returns a markup string. Lets the templates be
 * snapshot-tested in isolation without spinning up the full overlay.
 */

import { typingDots } from "./elements";
import { escapeHtml, formatTime } from "./format";
import type { AiEditMessage, AiEditState } from "./state";
import type { StringTable } from "./strings";

/** What `renderMessagesTemplate` needs to know about server-side state. */
export interface RenderMessagesProps {
  messages: AiEditMessage[];
  /** 1-based; from getTrackedQueuePosition. 0 means no tracked job. */
  queuePosition: number;
  /** AiEditState.status. */
  serverStatus: AiEditState["status"];
  /** Heartbeat/start fallback for the pending bubble's timestamp. */
  heartbeatAt: string | null;
  startedAt: string | null;
  /** Title shown inside the pending bubble (from getPendingBubbleTitle). */
  pendingBubbleTitle: string;
  /** Trim window — keep only the most recent N. Default 18 (overlay original). */
  messageWindow?: number;
  /** Localized strings. Pass enStrings for English defaults. */
  strings: StringTable;
}

const roleLabelFor = (
  role: AiEditMessage["role"],
  strings: StringTable
): string => (role === "user" ? strings.roleYou : strings.rolePyanchor);

/**
 * Build the messages list markup. Returns:
 *   - empty-state placeholder when there are no messages and no
 *     pending work
 *   - the message list, optionally followed by a pending bubble
 *     when the server is running/canceling or the user has a
 *     queued job
 */
export function renderMessagesTemplate(props: RenderMessagesProps): string {
  const window = props.messageWindow ?? 18;
  const messages = props.messages.slice(-window);
  const showPendingMessage =
    props.serverStatus === "running" ||
    props.serverStatus === "canceling" ||
    props.queuePosition > 0;

  if (messages.length === 0 && !showPendingMessage) {
    return `<div class="messages messages--empty">${escapeHtml(props.strings.messagesEmpty)}</div>`;
  }

  const pendingTime =
    formatTime(props.heartbeatAt) ?? formatTime(props.startedAt) ?? "";

  return `
    <div class="messages">
      ${messages.map((m) => renderMessageRow(m, props.strings)).join("")}
      ${
        showPendingMessage
          ? renderPendingBubble(pendingTime, props.pendingBubbleTitle, props.strings)
          : ""
      }
    </div>
  `;
}

function renderMessageRow(message: AiEditMessage, strings: StringTable): string {
  const roleLabel = roleLabelFor(message.role, strings);
  return `
    <div class="message-row message-row--${message.role}">
      <article class="message message--${message.role}">
        <div class="message__head">
          <span class="message__name">${escapeHtml(roleLabel)}</span>
          <span class="message__time">${escapeHtml(formatTime(message.createdAt) ?? "")}</span>
        </div>
        <div class="message__body">${escapeHtml(message.text)}</div>
      </article>
    </div>
  `;
}

function renderPendingBubble(
  formattedTime: string,
  title: string,
  strings: StringTable
): string {
  return `
    <div class="message-row message-row--assistant">
      <article class="message message--assistant message--pending">
        <div class="message__head">
          <span class="message__name">${escapeHtml(strings.rolePyanchor)}</span>
          <span class="message__time">${escapeHtml(formattedTime)}</span>
        </div>
        <div class="message__body message__body--pending">${typingDots}<span class="message__body--pending-text">${escapeHtml(title)}</span></div>
      </article>
    </div>
  `;
}
