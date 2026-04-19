import { closeIcon, mountOverlayHost, sparkIcon, typingDots } from "./overlay/elements";
import { createFetchJson, runtimePath as buildRuntimePath } from "./overlay/fetch-helper";
import { escapeHtml, formatTime, shorten, takeFirstLine } from "./overlay/format";
import { createSyncStateClient } from "./overlay/polling";
import {
  createEmptyServerState,
  createUIState,
  getComposerTitle,
  getPendingBubbleTitle,
  getPlaceholder,
  getStatusHeadline,
  getStatusMeta,
  getTrackedQueuePosition,
  shouldPoll,
  type AiEditMessage,
  type AiEditMode,
  type AiEditState
} from "./overlay/state";
import { resolveStrings } from "./overlay/strings";
import { renderMessagesTemplate } from "./overlay/templates";

interface RuntimeConfig {
  baseUrl: string;
  token: string;
  /** Optional locale code (e.g. "ko", "en"). Falls back to English when unset. */
  locale?: string;
}

declare global {
  interface Window {
    __PyanchorConfig?: RuntimeConfig;
    __PyanchorOverlayLoaded?: boolean;
  }
}

const POLL_INTERVAL_MS = 3500;
const AUTO_SCROLL_THRESHOLD_PX = 48;

const emptyState: AiEditState = createEmptyServerState();

const styles = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .pyanchor-root {
    position: fixed;
    right: clamp(12px, 2vw, 24px);
    bottom: clamp(12px, 2vh, 24px);
    z-index: 2147483000;
    font-family: "IBM Plex Sans KR", system-ui, sans-serif;
    color: #edf2ff;
  }
  .trigger {
    width: 58px;
    height: 58px;
    border: 1px solid rgba(121, 144, 255, 0.28);
    border-radius: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(circle at top, rgba(125, 156, 255, 0.35), transparent 48%),
      linear-gradient(180deg, rgba(14, 18, 28, 0.98), rgba(21, 30, 48, 0.98));
    color: #eef3ff;
    cursor: pointer;
    box-shadow: 0 18px 42px rgba(5, 8, 14, 0.38);
    transition: transform 120ms ease, border-color 120ms ease;
  }
  .trigger:hover {
    transform: translateY(-1px);
    border-color: rgba(151, 170, 255, 0.42);
  }
  .trigger--busy {
    border-color: rgba(97, 210, 166, 0.38);
  }
  .panel {
    position: absolute;
    right: 0;
    bottom: 74px;
    width: min(420px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    max-height: min(860px, calc(100dvh - 104px));
    border-radius: 24px;
    border: 1px solid rgba(132, 151, 199, 0.18);
    background:
      linear-gradient(180deg, rgba(12, 16, 24, 0.98), rgba(16, 23, 38, 0.98));
    box-shadow: 0 28px 70px rgba(0, 0, 0, 0.46);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
  }
  .panel__title {
    display: grid;
    gap: 4px;
  }
  .panel__title-line {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.92rem;
    font-weight: 700;
  }
  .panel__context {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #8b97b5;
    font-size: 0.77rem;
    line-height: 1.5;
  }
  .panel__path {
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    color: #dbe4ff;
    font-family: "JetBrains Mono", monospace;
  }
  .icon-button {
    border: 0;
    width: 32px;
    height: 32px;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.06);
    color: #dbe4ff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .mode-switch {
    margin: 14px 18px 0;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
  }
  .mode-switch__button {
    border: 0;
    border-radius: 12px;
    padding: 10px 12px;
    background: transparent;
    color: #9aa8ca;
    font-weight: 600;
    cursor: pointer;
  }
  .mode-switch__button--active {
    background: rgba(84, 111, 255, 0.2);
    color: #eef3ff;
  }
  .mode-switch__button[disabled] {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .mode-switch__button[disabled]:hover {
    background: transparent;
  }
  .mode-switch__button--active[disabled] {
    background: rgba(84, 111, 255, 0.14);
    opacity: 0.6;
  }
  .status-line {
    margin: 12px 18px 0;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.8rem;
    line-height: 1.55;
    color: #d7e1fb;
  }
  .status-line--running,
  .status-line--canceling {
    border-color: rgba(94, 132, 255, 0.24);
    background: rgba(94, 132, 255, 0.08);
  }
  .status-line--failed,
  .status-line--canceled {
    border-color: rgba(255, 120, 120, 0.24);
    background: rgba(255, 120, 120, 0.08);
  }
  .status-line--done {
    border-color: rgba(70, 194, 139, 0.24);
    background: rgba(70, 194, 139, 0.08);
  }
  .status-line__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .status-line__headline {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status-line__meta {
    color: #93a3c7;
    font-size: 0.74rem;
  }
  .messages {
    margin: 14px 18px 0;
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    overflow-y: auto;
    padding: 4px 0 12px;
    display: grid;
    gap: 12px;
    align-content: start;
    align-items: start;
  }
  .messages--empty {
    display: grid;
    place-items: center;
    color: #8b97b5;
    font-size: 0.82rem;
    text-align: center;
    padding: 18px 8px 12px;
  }
  .message-row {
    display: flex;
    width: 100%;
  }
  .message-row--user {
    justify-content: flex-end;
  }
  .message-row--assistant,
  .message-row--system {
    justify-content: flex-start;
  }
  .message {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    width: fit-content;
    max-width: min(84%, 330px);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
  }
  .message--user {
    background: rgba(84, 111, 255, 0.14);
    border-color: rgba(84, 111, 255, 0.22);
    border-bottom-right-radius: 8px;
  }
  .message--assistant {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
    border-bottom-left-radius: 8px;
  }
  .message--system {
    background: rgba(70, 194, 139, 0.08);
    border-color: rgba(70, 194, 139, 0.16);
    border-bottom-left-radius: 8px;
  }
  .message--pending {
    background: rgba(255, 255, 255, 0.05);
  }
  .message__head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: #9aa8ca;
  }
  .message__name {
    font-weight: 700;
    color: #eef3ff;
  }
  .message__time {
    margin-left: auto;
  }
  .message__body {
    white-space: pre-wrap;
    font-size: 0.9rem;
    line-height: 1.65;
    word-break: break-word;
  }
  .message__body--pending {
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: normal;
    line-height: 1.5;
  }
  .message__body--pending .typing {
    flex: 0 0 auto;
  }
  .message__body--pending-text {
    min-width: 0;
  }
  .message__sub {
    color: #8b97b5;
    font-size: 0.75rem;
    line-height: 1.45;
  }
  .typing {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .typing__dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.3;
    animation: typing 1.1s infinite ease-in-out;
  }
  .typing__dot:nth-child(2) { animation-delay: 0.15s; }
  .typing__dot:nth-child(3) { animation-delay: 0.3s; }
  .composer {
    margin: 14px 18px 18px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.03);
    display: grid;
    gap: 12px;
  }
  .composer__title {
    display: block;
    color: #8b97b5;
    font-size: 0.76rem;
  }
  .textarea {
    width: 100%;
    min-height: 104px;
    max-height: min(220px, 28dvh);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    background: rgba(5, 7, 12, 0.72);
    color: inherit;
    padding: 14px;
    resize: vertical;
    font: 0.9rem/1.65 "IBM Plex Sans KR", system-ui, sans-serif;
  }
  .textarea:disabled {
    opacity: 0.72;
    cursor: not-allowed;
  }
  .composer__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .composer__hint {
    display: grid;
    gap: 3px;
    color: #8b97b5;
    font-size: 0.76rem;
  }
  .composer__hint strong {
    color: #dbe4ff;
    font-size: 0.8rem;
  }
  .composer__hint-shortcut {
    color: #6f7c9a;
    font-size: 0.7rem;
  }
  .actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .button {
    border: 0;
    border-radius: 14px;
    padding: 11px 16px;
    cursor: pointer;
    font-weight: 700;
  }
  .button--danger {
    background: rgba(255, 120, 120, 0.16);
    color: #ffd8d8;
  }
  .button--primary {
    background: linear-gradient(135deg, #4e6dff, #7e94ff);
    color: white;
  }
  .button--ghost {
    background: rgba(180, 198, 255, 0.08);
    color: #c8d3ff;
  }
  .button--ghost:hover {
    background: rgba(180, 198, 255, 0.15);
  }
  .button:disabled {
    opacity: 0.54;
    cursor: not-allowed;
  }
  .toast {
    position: absolute;
    right: 0;
    bottom: calc(100% + 12px);
    min-width: 220px;
    max-width: 320px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(9, 12, 18, 0.96);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
    font-size: 0.82rem;
    line-height: 1.55;
  }
  .toast--success { border-color: rgba(70, 194, 139, 0.32); }
  .toast--error { border-color: rgba(255, 120, 120, 0.32); }
  .toast--info { border-color: rgba(122, 146, 255, 0.32); }
  .spark, .close {
    width: 18px;
    height: 18px;
    display: inline-block;
  }
  @media (max-height: 860px) {
    .panel {
      max-height: calc(100dvh - 92px);
    }
    .mode-switch,
    .status-line,
    .messages,
    .composer {
      margin-left: 16px;
      margin-right: 16px;
    }
    .composer {
      margin-bottom: 16px;
      padding: 12px;
    }
    .textarea {
      min-height: 92px;
    }
  }
  @media (max-height: 740px) {
    .panel {
      bottom: 68px;
      width: min(400px, calc(100vw - 16px));
      max-width: calc(100vw - 16px);
      max-height: calc(100dvh - 96px);
      border-radius: 20px;
    }
    .panel__header {
      padding: 14px 16px 10px;
    }
    .mode-switch,
    .status-line,
    .messages,
    .composer {
      margin-top: 10px;
      margin-left: 14px;
      margin-right: 14px;
    }
    .composer {
      margin-bottom: 14px;
    }
    .textarea {
      min-height: 80px;
    }
  }
  @media (max-height: 680px) {
    .panel {
      bottom: 64px;
      max-height: calc(100dvh - 88px);
    }
    .messages {
      gap: 10px;
      padding-bottom: 8px;
    }
    .message {
      max-width: min(88%, 320px);
    }
    .composer__footer {
      align-items: flex-end;
      flex-direction: column;
    }
    .actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
  @keyframes typing {
    0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
    40% { opacity: 1; transform: translateY(-2px); }
  }
`;

const config = window.__PyanchorConfig;

// Resolve the localized string table once at boot. Order of preference:
//   1. window.__PyanchorConfig.locale (host app sets it directly)
//   2. data-pyanchor-locale on the runtime <script> tag
//   3. English defaults
const overlayScriptTag = document.querySelector<HTMLScriptElement>(
  "script[data-pyanchor-overlay='1']"
);
const localeFromScript = overlayScriptTag?.dataset.pyanchorLocale?.trim();
const s = resolveStrings(config?.locale ?? localeFromScript ?? null);

if (!config || window.__PyanchorOverlayLoaded) {
  throw new Error(s.errorRuntimeNotConfigured);
}

window.__PyanchorOverlayLoaded = true;

const { host: root, shadowRoot } = mountOverlayHost();

const uiState = createUIState();

let serverState: AiEditState = { ...emptyState };

// Lazy token reader — bootstrap blanks config.token after the
// session-exchange POST resolves (since v0.5.1), so capturing it
// at module-eval time would defeat the cookie-only fallback.
const fetchJson = createFetchJson({
  baseUrl: config.baseUrl,
  getToken: () => config.token || null,
  defaultErrorMessage: s.errorRequestFailed
});

const runtimePath = (suffix: string) => buildRuntimePath(config.baseUrl, suffix);
const currentPath = () => window.location.pathname;

const showToast = (message: string, tone: "info" | "success" | "error") => {
  uiState.toast = { message, tone };
  if (uiState.toastTimer) {
    window.clearTimeout(uiState.toastTimer);
  }
  uiState.toastTimer = window.setTimeout(() => {
    uiState.toast = null;
    render();
  }, 3200);
  render();
};

// Closures over the local mutable uiState + serverState + the
// resolved string table. The pure versions live in ./overlay/state.ts;
// these adapters keep call sites compact and let the render() body
// stay readable.
const trackedQueuePosition = () => getTrackedQueuePosition(uiState, serverState);
const shouldPollNow = () => shouldPoll(uiState, serverState);
const statusHeadline = () =>
  getStatusHeadline(
    uiState,
    serverState,
    { thinkingPreview: shorten(takeFirstLine(serverState.thinking)) },
    s
  );
const statusMeta = () =>
  getStatusMeta(uiState, serverState, formatTime(serverState.heartbeatAt), s);
const placeholder = () => getPlaceholder(uiState.mode, s);
const composerTitle = () => getComposerTitle(uiState.mode, s);
const pendingBubbleTitle = () => getPendingBubbleTitle(uiState, serverState, s);

const renderMessages = () =>
  renderMessagesTemplate({
    messages: serverState.messages,
    queuePosition: trackedQueuePosition(),
    serverStatus: serverState.status,
    heartbeatAt: serverState.heartbeatAt,
    startedAt: serverState.startedAt,
    pendingBubbleTitle: pendingBubbleTitle(),
    strings: s
  });

const bindHistory = () => {
  const dispatch = () => window.dispatchEvent(new Event("pyanchor:navigation"));
  const wrap = <T extends "pushState" | "replaceState">(method: T) => {
    const original = history[method];
    history[method] = function wrappedHistoryMethod(this: History, ...args: Parameters<History[T]>) {
      const result = original.apply(this, args);
      dispatch();
      return result;
    };
  };

  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", dispatch);
};

// Module-level focus tracking for the panel a11y fix (Codex round-9 #1).
// `wasOpenLastRender` lets isFreshOpen distinguish the first render
// where the panel appears from later renders that happen while the
// panel is still open but focus has drifted outside the shadow tree.
// Without this, the v0.9.2 `previousActive === null` check would
// re-steal focus to the textarea on any external-focus + render race.
let wasOpenLastRender = false;

const syncStateClient = createSyncStateClient({
  fetchJson,
  buildStatusUrl: () => runtimePath("/api/status"),
  getUIState: () => uiState,
  getServerState: () => serverState,
  setServerState: (next) => {
    serverState = next;
  },
  mutateUIState: (mutator) => mutator(uiState),
  render: () => render(),
  onOutcome: (outcome) => {
    if (outcome.kind === "done") {
      showToast(outcome.mode === "chat" ? s.toastAnswerReceived : s.toastEditComplete, "success");
    } else if (outcome.kind === "failed") {
      showToast(outcome.error, "error");
    } else {
      showToast(s.toastRequestCanceled, "info");
    }
  },
  defaultJobFailedMessage: s.errorJobFailed
});

const syncState = (withOutcomeToast = false) => syncStateClient.sync(withOutcomeToast);

const render = () => {
  const isWorking = serverState.status === "running" || serverState.status === "canceling";
  const isBusy = isWorking || uiState.isSubmitting || uiState.isCanceling;
  const canCancel = isWorking || trackedQueuePosition() > 0;
  const headline = statusHeadline();
  const meta = statusMeta();

  const previousActive = shadowRoot.activeElement as HTMLElement | null;
  const previousMessagesPanel = shadowRoot.querySelector<HTMLElement>(".messages");
  const previousScrollState = previousMessagesPanel
    ? {
        scrollTop: previousMessagesPanel.scrollTop,
        shouldStickToBottom:
          previousMessagesPanel.scrollHeight - previousMessagesPanel.clientHeight - previousMessagesPanel.scrollTop <=
          AUTO_SCROLL_THRESHOLD_PX
      }
    : null;

  // Save the focused element's IDENTITY (not the DOM node — that
  // gets destroyed by the innerHTML wipe below). After the wipe we
  // re-find the element with the matching identity and restore
  // focus, so keyboard nav stays inside the dialog across renders.
  // Codex round-9 #1: v0.9.2 only restored textarea focus, leaving
  // mode-button / cancel-button / etc. clicks dropping focus to BODY.
  type FocusIdentity =
    | { kind: "textarea"; selection: { start: number; end: number } | null }
    | { kind: "action"; action: string }
    | null;

  let focusIdentity: FocusIdentity = null;
  if (previousActive) {
    if (
      previousActive.classList.contains("textarea") &&
      previousActive instanceof HTMLTextAreaElement
    ) {
      focusIdentity = {
        kind: "textarea",
        selection: { start: previousActive.selectionStart, end: previousActive.selectionEnd }
      };
    } else if (previousActive.dataset.action) {
      focusIdentity = { kind: "action", action: previousActive.dataset.action };
    }
  }

  // Fresh-open / just-closed transitions drive the auto-focus + close-
  // return behavior. Track the previous render's open state separately
  // from previousActive — externally-focused-while-still-open should
  // NOT count as fresh open (Codex round-9 edge case).
  const isFreshOpen = uiState.isOpen && !wasOpenLastRender;
  const justClosed = !uiState.isOpen && wasOpenLastRender;

  // v0.9.5 secondary actions:
  //   - Retry: re-run the last submitted prompt+mode after a fail/cancel
  //   - Copy:  put the last assistant text (or the error) on the clipboard
  // v0.9.6 (Codex round-10 #3): narrowed Copy to assistant-only.
  // System messages are bookkeeping ("Queued request canceled.",
  // "Edit job exited abnormally.") — useful to display, not useful to
  // copy. The error path stays as-is and supersedes the assistant
  // lookup when status === "failed".
  const canRetry =
    !isBusy &&
    uiState.lastSubmittedPrompt !== null &&
    (serverState.status === "failed" || serverState.status === "canceled");
  const lastAssistantMessage = [...serverState.messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const copyableText =
    serverState.status === "failed" && serverState.error
      ? serverState.error
      : lastAssistantMessage?.text ?? null;
  const canCopy = copyableText !== null;

  shadowRoot.innerHTML = `
    <style>${styles}</style>
    <div class="pyanchor-root">
      ${uiState.toast ? `<div class="toast toast--${uiState.toast.tone}">${escapeHtml(uiState.toast.message)}</div>` : ""}
      ${uiState.isOpen ? `
        <div class="panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(s.panelTitle)}" aria-describedby="pyanchor-status-line">
          <div class="panel__header">
            <div class="panel__title">
              <div class="panel__title-line">${sparkIcon}<span>${escapeHtml(s.panelTitle)}</span></div>
              <div class="panel__context">
                <span>${escapeHtml(s.panelContextLabel)}</span>
                <code class="panel__path">${escapeHtml(currentPath())}</code>
              </div>
            </div>
            <button class="icon-button" type="button" data-action="close" aria-label="${escapeHtml(s.toggleClose)}">${closeIcon}</button>
          </div>

          <div class="mode-switch" role="group" aria-label="${escapeHtml(s.composerHeadlineEdit)} / ${escapeHtml(s.composerHeadlineChat)}" title="${isBusy ? escapeHtml(s.modeLockedTitle) : ""}">
            <button class="mode-switch__button ${uiState.mode === "chat" ? "mode-switch__button--active" : ""}" type="button" data-action="mode-chat" aria-pressed="${uiState.mode === "chat"}" ${isBusy ? "disabled" : ""}>${escapeHtml(s.modeAsk)}</button>
            <button class="mode-switch__button ${uiState.mode === "edit" ? "mode-switch__button--active" : ""}" type="button" data-action="mode-edit" aria-pressed="${uiState.mode === "edit"}" ${isBusy ? "disabled" : ""}>${escapeHtml(s.modeEdit)}</button>
          </div>

          <div id="pyanchor-status-line" aria-live="polite" aria-atomic="true">
          ${
            headline
              ? `
                <div class="status-line status-line--${serverState.status}">
                  ${isWorking ? typingDots : ""}
                  <div class="status-line__copy">
                    <div class="status-line__headline">${escapeHtml(headline)}</div>
                    ${meta ? `<div class="status-line__meta">${escapeHtml(meta)}</div>` : ""}
                  </div>
                </div>
              `
              : ""
          }
          </div>

          ${renderMessages()}

          <form class="composer" data-action="submit">
            <div>
              <label class="composer__title" for="pyanchor-prompt">${escapeHtml(composerTitle())}</label>
              <textarea id="pyanchor-prompt" class="textarea" rows="4" placeholder="${escapeHtml(placeholder())}" ${isBusy ? "disabled" : ""} aria-label="${escapeHtml(composerTitle())}"></textarea>
            </div>
            <div class="composer__footer">
              <div class="composer__hint">
                <strong>${escapeHtml(uiState.mode === "chat" ? s.composerHeadlineChat : s.composerHeadlineEdit)}</strong>
                <span>${escapeHtml(serverState.configured ? s.composerSendHint : s.composerNotConfigured)}</span>
                <span class="composer__hint-shortcut">${escapeHtml(s.kbdShortcutHint)}</span>
              </div>
              <div class="actions">
                ${canCopy ? `<button class="button button--ghost" type="button" data-action="copy" aria-label="${escapeHtml(s.copyLast)}">${escapeHtml(s.copyLast)}</button>` : ""}
                ${canRetry ? `<button class="button button--ghost" type="button" data-action="retry" aria-label="${escapeHtml(s.retryLast)}">${escapeHtml(s.retryLast)}</button>` : ""}
                ${canCancel ? `<button class="button button--danger" type="button" data-action="cancel" aria-label="${escapeHtml(s.composerCancelLabel)}" ${uiState.isCanceling ? "disabled" : ""}>${escapeHtml(s.composerCancelLabel)}</button>` : ""}
                <button class="button button--primary" type="submit" data-action="submit-button" ${!serverState.configured || isBusy || !uiState.prompt.trim() ? "disabled" : ""}>
                  ${escapeHtml(uiState.isSubmitting ? s.composerSubmitSending : uiState.mode === "chat" ? s.composerSubmitSend : s.composerSubmitRun)}
                </button>
              </div>
            </div>
          </form>
        </div>
      ` : ""}
      <button class="trigger ${isWorking ? "trigger--busy" : ""}" type="button" data-action="toggle" aria-label="${escapeHtml(uiState.isOpen ? s.toggleClose : s.toggleOpen)}" title="${escapeHtml(s.toggleTitle)}">
        ${isWorking ? typingDots : sparkIcon}
      </button>
    </div>
  `;

  const promptField = shadowRoot.querySelector<HTMLTextAreaElement>(".textarea");
  const messagesPanel = shadowRoot.querySelector<HTMLElement>(".messages");

  if (promptField) {
    promptField.value = uiState.prompt;
  }

  // Focus restoration order:
  //   1. Textarea identity → focus textarea, restore selection
  //   2. Action identity → focus the matching button (still attached)
  //   3. Action identity but element gone (e.g. cancel disappeared
  //      after job finished) → fall back to textarea
  //   4. Fresh open + no prior identity → auto-focus textarea
  //   5. Just closed → return focus to the toggle button
  //   6. Otherwise → leave focus alone (browser default)
  if (focusIdentity?.kind === "textarea" && promptField) {
    promptField.focus({ preventScroll: true });
    if (focusIdentity.selection) {
      promptField.setSelectionRange(focusIdentity.selection.start, focusIdentity.selection.end);
    }
  } else if (focusIdentity?.kind === "action") {
    const target = shadowRoot.querySelector<HTMLElement>(
      `[data-action='${focusIdentity.action}']`
    );
    if (target && !target.matches("[disabled]")) {
      target.focus({ preventScroll: true });
    } else if (uiState.isOpen && promptField) {
      // Element disappeared (e.g. cancel after job done). Don't drop
      // focus to BODY — keep it inside the dialog.
      promptField.focus({ preventScroll: true });
    }
  } else if (isFreshOpen && promptField) {
    promptField.focus({ preventScroll: true });
  } else if (justClosed) {
    // Focus return on close (Codex round-9 feature suggestion #1):
    // Move focus back to the trigger button so keyboard users
    // don't get dropped to <body>.
    const toggle = shadowRoot.querySelector<HTMLElement>("[data-action='toggle']");
    toggle?.focus({ preventScroll: true });
  }

  wasOpenLastRender = uiState.isOpen;

  if (messagesPanel) {
    if (!previousScrollState || previousScrollState.shouldStickToBottom) {
      messagesPanel.scrollTop = messagesPanel.scrollHeight;
    } else {
      const maxScrollTop = Math.max(0, messagesPanel.scrollHeight - messagesPanel.clientHeight);
      messagesPanel.scrollTop = Math.min(previousScrollState.scrollTop, maxScrollTop);
    }
  }

  shadowRoot.querySelector<HTMLElement>("[data-action='toggle']")?.addEventListener("click", () => {
    uiState.isOpen = !uiState.isOpen;
    render();
  });

  shadowRoot.querySelector<HTMLElement>("[data-action='close']")?.addEventListener("click", () => {
    uiState.isOpen = false;
    render();
  });

  shadowRoot.querySelector<HTMLElement>("[data-action='mode-chat']")?.addEventListener("click", () => {
    uiState.mode = "chat";
    render();
  });

  shadowRoot.querySelector<HTMLElement>("[data-action='mode-edit']")?.addEventListener("click", () => {
    uiState.mode = "edit";
    render();
  });

  promptField?.addEventListener("input", (event) => {
    uiState.prompt = (event.target as HTMLTextAreaElement).value;
    const submit = shadowRoot.querySelector<HTMLButtonElement>(".button--primary");
    if (submit) {
      submit.disabled = !serverState.configured || isBusy || !uiState.prompt.trim();
    }
  });

  promptField?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
    }
  });

  shadowRoot.querySelector<HTMLElement>("[data-action='cancel']")?.addEventListener("click", async () => {
    if (uiState.isCanceling) {
      return;
    }

    uiState.isCanceling = true;
    render();

    try {
      const next = await fetchJson<AiEditState>(runtimePath("/api/cancel"), {
        method: "POST",
        body: JSON.stringify({
          jobId:
            (serverState.jobId && uiState.lastSubmittedJobId === serverState.jobId ? serverState.jobId : null) ??
            uiState.lastSubmittedJobId ??
            undefined
        })
      });
      serverState = next;
      showToast(s.toastCancelSent, "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : s.toastCancelFailed, "error");
    } finally {
      uiState.isCanceling = false;
      render();
    }
  });

  shadowRoot.querySelector<HTMLFormElement>("[data-action='submit']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const trimmed = uiState.prompt.trim();
    if (!trimmed || uiState.isSubmitting || isWorking) {
      return;
    }

    uiState.isSubmitting = true;
    render();

    try {
      const next = await fetchJson<AiEditState>(runtimePath("/api/edit"), {
        method: "POST",
        body: JSON.stringify({
          prompt: trimmed,
          targetPath: currentPath(),
          mode: uiState.mode
        })
      });

      serverState = next;
      // v0.9.5: stash the prompt + mode so the user can Retry without
      // re-typing if the job fails or gets canceled.
      uiState.lastSubmittedPrompt = trimmed;
      uiState.lastSubmittedMode = uiState.mode;
      uiState.prompt = "";

      const lastQueued = next.queue[next.queue.length - 1];
      uiState.lastSubmittedJobId = lastQueued?.jobId ?? next.jobId ?? null;

      if (lastQueued) {
        showToast(s.statusQueuedAt(next.queue.length), "info");
      } else {
        showToast(uiState.mode === "chat" ? s.toastQuestionSent : s.toastEditStarted, "info");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : s.toastFailedToStart, "error");
    } finally {
      uiState.isSubmitting = false;
      render();
    }
  });

  // v0.9.5 retry: re-fill the textarea + restore the mode the last
  // request used. Doesn't auto-submit — leaves the user in control.
  // v0.9.6 (Codex round-10 #2): explicitly move focus to the textarea
  // after the render. Without this, the focus-retention logic would
  // restore focus to the Retry button (still attached, since canRetry
  // remains true on the same render) and immediate typing would not
  // edit the restored prompt.
  shadowRoot.querySelector<HTMLElement>("[data-action='retry']")?.addEventListener("click", () => {
    if (!uiState.lastSubmittedPrompt) return;
    uiState.prompt = uiState.lastSubmittedPrompt;
    if (uiState.lastSubmittedMode) uiState.mode = uiState.lastSubmittedMode;
    render();
    const newTextarea = shadowRoot.querySelector<HTMLTextAreaElement>(".textarea");
    if (newTextarea) {
      newTextarea.focus({ preventScroll: true });
      // Position cursor at end of restored prompt so the user can
      // immediately keep typing or correct from the tail.
      const len = newTextarea.value.length;
      newTextarea.setSelectionRange(len, len);
    }
  });

  // v0.9.5 copy: write the last assistant message text (or the
  // current error) to the clipboard. Falls back to a toast on
  // permission rejection.
  shadowRoot.querySelector<HTMLElement>("[data-action='copy']")?.addEventListener("click", async () => {
    if (!copyableText) return;
    try {
      await navigator.clipboard.writeText(copyableText);
      showToast(s.toastCopied, "success");
    } catch {
      showToast(s.toastCopyFailed, "error");
    }
  });
};

document.addEventListener("mousedown", (event) => {
  if (!uiState.isOpen) {
    return;
  }
  if (root.contains(event.target as Node)) {
    return;
  }
  uiState.isOpen = false;
  render();
});

// ESC closes the overlay (a11y).
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!uiState.isOpen) return;
  uiState.isOpen = false;
  render();
});

// Cmd/Ctrl + Shift + . toggles the panel from anywhere on the page
// (v0.9.5 — Codex round-9 feature suggestion #2; v0.9.6 added the
// `event.repeat` guard from Codex round-10 #1). The accelerator is
// the same across platforms so the in-product hint can stay concise.
// Doesn't fire when the user is mid-IME composition (would otherwise
// eat composition completion keys), and doesn't bounce on a held
// chord (would otherwise toggle open/closed/open by key-repeat).
document.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.repeat) return;
  if (event.key !== ".") return;
  if (!event.shiftKey) return;
  if (!event.metaKey && !event.ctrlKey) return;
  event.preventDefault();
  uiState.isOpen = !uiState.isOpen;
  render();
});

// Focus trap (a11y). When the panel is open and the user Tabs past the
// last focusable element (or Shift+Tabs past the first), wrap to the
// other end so focus stays inside the dialog. Listener attached once
// at module load to avoid stacking handlers across re-renders.
shadowRoot.addEventListener("keydown", (event: Event) => {
  const keyEvent = event as KeyboardEvent;
  if (keyEvent.key !== "Tab") return;
  if (!uiState.isOpen) return;

  const panel = shadowRoot.querySelector<HTMLElement>(".panel");
  if (!panel) return;

  const focusable = Array.from(
    panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("aria-hidden"));
  if (focusable.length === 0) return;

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = shadowRoot.activeElement as HTMLElement | null;

  if (keyEvent.shiftKey && active === first) {
    keyEvent.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!keyEvent.shiftKey && active === last) {
    keyEvent.preventDefault();
    first.focus({ preventScroll: true });
  }
});

window.addEventListener("pyanchor:navigation", () => {
  render();
});

bindHistory();
render();
void syncState(false);

window.setInterval(() => {
  if (document.visibilityState === "hidden" && !shouldPollNow()) {
    return;
  }
  void syncState(true);
}, POLL_INTERVAL_MS);
