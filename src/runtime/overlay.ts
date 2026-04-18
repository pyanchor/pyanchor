export {};

type AiEditStatus = "idle" | "running" | "canceling" | "done" | "failed" | "canceled";
type AiEditMode = "edit" | "chat";
type AiEditMessageRole = "user" | "assistant" | "system";
type AiEditMessageStatus = "queued" | "running" | "done" | "failed" | "canceled";

interface AiEditQueueItem {
  jobId: string;
  prompt: string;
  targetPath: string;
  enqueuedAt: string;
  mode: AiEditMode;
}

interface AiEditMessage {
  id: string;
  jobId: string | null;
  role: AiEditMessageRole;
  mode: AiEditMode;
  text: string;
  createdAt: string;
  status: AiEditMessageStatus | null;
}

interface AiEditState {
  configured: boolean;
  status: AiEditStatus;
  jobId: string | null;
  pid: number | null;
  prompt: string;
  targetPath: string;
  mode: AiEditMode | null;
  currentStep: string | null;
  heartbeatAt: string | null;
  heartbeatLabel: string | null;
  thinking: string | null;
  activityLog: string[];
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  queue: AiEditQueueItem[];
  messages: AiEditMessage[];
}

interface RuntimeConfig {
  baseUrl: string;
}

declare global {
  interface Window {
    __PyanchorConfig?: RuntimeConfig;
    __PyanchorOverlayLoaded?: boolean;
  }
}

const POLL_INTERVAL_MS = 3500;
const AUTO_SCROLL_THRESHOLD_PX = 48;

const emptyState: AiEditState = {
  configured: false,
  status: "idle",
  jobId: null,
  pid: null,
  prompt: "",
  targetPath: "",
  mode: null,
  currentStep: null,
  heartbeatAt: null,
  heartbeatLabel: null,
  thinking: null,
  activityLog: [],
  error: null,
  startedAt: null,
  completedAt: null,
  updatedAt: new Date(0).toISOString(),
  queue: [],
  messages: []
};

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

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const sparkIcon = `
  <svg class="spark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 2 11.8 7.8H17.8L12.9 11.4 14.7 17.2 10 13.6 5.3 17.2 7.1 11.4 2.2 7.8H8.2L10 2Z" fill="currentColor" />
  </svg>
`;

const closeIcon = `
  <svg class="close" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 4 12 12M12 4 4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
`;

const typingDots = `
  <span class="typing" aria-hidden="true">
    <span class="typing__dot"></span>
    <span class="typing__dot"></span>
    <span class="typing__dot"></span>
  </span>
`;

const config = window.__PyanchorConfig;

if (!config || window.__PyanchorOverlayLoaded) {
  throw new Error("Pyanchor devtools runtime is not configured.");
}

window.__PyanchorOverlayLoaded = true;

const root = document.createElement("div");
root.id = "pyanchor-overlay-root";
document.body.appendChild(root);

const shadowRoot = root.attachShadow({ mode: "open" });

const uiState = {
  isOpen: false,
  isSubmitting: false,
  isCanceling: false,
  prompt: "",
  mode: "edit" as AiEditMode,
  lastSubmittedJobId: null as string | null,
  toast: null as null | { message: string; tone: "info" | "success" | "error" },
  toastTimer: 0
};

let serverState: AiEditState = { ...emptyState };

const runtimePath = (suffix: string) => `${config.baseUrl}${suffix}`;
const currentPath = () => window.location.pathname;

const formatTime = (iso: string | null) => {
  if (!iso) {
    return null;
  }

  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(value);
};

const takeFirstLine = (value: string | null) => {
  if (!value) {
    return "";
  }

  return value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
};

const shorten = (value: string, max = 120) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const fetchJson = async <T>(input: string, init?: RequestInit) => {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
  }
  return data;
};

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

const getTrackedQueuePosition = () => {
  if (!uiState.lastSubmittedJobId) {
    return 0;
  }
  return serverState.queue.findIndex((item) => item.jobId === uiState.lastSubmittedJobId) + 1;
};

const shouldPoll = () =>
  serverState.status === "running" ||
  serverState.status === "canceling" ||
  serverState.queue.length > 0 ||
  getTrackedQueuePosition() > 0;

const getStatusHeadline = () => {
  const queuePosition = getTrackedQueuePosition();
  const thinkingPreview = shorten(takeFirstLine(serverState.thinking));

  if (queuePosition > 0 && serverState.status !== "running" && serverState.status !== "canceling") {
    return `대기열 ${queuePosition}번째입니다. 앞선 요청이 끝나면 이어서 처리합니다.`;
  }

  if (serverState.status === "running" || serverState.status === "canceling") {
    return (
      thinkingPreview ||
      serverState.heartbeatLabel ||
      serverState.currentStep ||
      (serverState.mode === "chat" ? "질문을 확인하고 있습니다." : "화면과 코드를 살펴보고 있습니다.")
    );
  }

  if (serverState.status === "failed") {
    return serverState.error ?? "작업 중 오류가 발생했습니다.";
  }

  if (serverState.status === "canceled") {
    return serverState.error ?? "작업이 취소되었습니다.";
  }

  if (serverState.status === "done") {
    return serverState.mode === "chat" ? "답변을 남겼습니다." : "수정 작업을 마쳤습니다.";
  }

  return "";
};

const getStatusMeta = () => {
  const pieces = [
    serverState.heartbeatLabel,
    formatTime(serverState.heartbeatAt),
    getTrackedQueuePosition() > 0 ? `내 요청 ${getTrackedQueuePosition()}번째` : null
  ].filter(Boolean);

  return pieces.join(" / ");
};

const getPlaceholder = () =>
  uiState.mode === "edit"
    ? "예: 로그인/회원가입 전환을 더 부드럽게 만들고, 현재 구조와 한국어 문구는 유지해줘."
    : "예: 이 화면이 왜 이렇게 동작하는지 설명해줘. 관련 파일도 같이 알려줘.";

const getComposerTitle = () => (uiState.mode === "edit" ? "수정 요청" : "질문 보내기");

const getPendingBubbleTitle = () => {
  if (serverState.status === "canceling") {
    return "요청을 정리하는 중입니다.";
  }

  if (serverState.mode === "edit" || uiState.mode === "edit") {
    return "화면과 코드를 확인하고 있습니다.";
  }

  return "답변을 준비하고 있습니다.";
};

const renderMessages = () => {
  const messages = serverState.messages.slice(-18);
  const queuePosition = getTrackedQueuePosition();
  const showPendingMessage =
    serverState.status === "running" ||
    serverState.status === "canceling" ||
    queuePosition > 0;

  if (messages.length === 0 && !showPendingMessage) {
    return `<div class="messages messages--empty">이 페이지에 대해 질문하거나, 수정 요청을 보내면 여기 대화가 쌓입니다.</div>`;
  }

  return `
    <div class="messages">
      ${messages
        .map((message) => {
          const roleLabel =
            message.role === "assistant" ? "Pyanchor" : message.role === "system" ? "Pyanchor" : "나";

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
        })
        .join("")}
      ${
        showPendingMessage
          ? `
            <div class="message-row message-row--assistant">
              <article class="message message--assistant message--pending">
                <div class="message__head">
                  <span class="message__name">Pyanchor</span>
                  <span class="message__time">${escapeHtml(formatTime(serverState.heartbeatAt) ?? formatTime(serverState.startedAt) ?? "")}</span>
                </div>
                <div class="message__body message__body--pending">${typingDots}<span class="message__body--pending-text">${escapeHtml(getPendingBubbleTitle())}</span></div>
              </article>
            </div>
          `
          : ""
      }
    </div>
  `;
};

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

const syncState = async (withOutcomeToast = false) => {
  try {
    const previousStatus = serverState.status;
    const previousJobId = serverState.jobId;
    const next = await fetchJson<AiEditState>(runtimePath("/api/status"));
    serverState = next;

    if (uiState.lastSubmittedJobId && next.queue.every((item) => item.jobId !== uiState.lastSubmittedJobId)) {
      if (next.jobId !== uiState.lastSubmittedJobId && next.status !== "running" && next.status !== "canceling") {
        uiState.lastSubmittedJobId = null;
      }
    }

    if (withOutcomeToast && previousJobId && previousStatus !== next.status && previousJobId === next.jobId) {
      if (next.status === "done") {
        showToast(next.mode === "chat" ? "답변을 받았습니다." : "수정 작업을 완료했습니다.", "success");
        return;
      }
      if (next.status === "failed") {
        showToast(next.error ?? "작업이 실패했습니다.", "error");
        return;
      }
      if (next.status === "canceled") {
        showToast("요청을 취소했습니다.", "info");
        return;
      }
    }

    render();
  } catch {
    render();
  }
};

const render = () => {
  const isWorking = serverState.status === "running" || serverState.status === "canceling";
  const isBusy = isWorking || uiState.isSubmitting || uiState.isCanceling;
  const canCancel = isWorking || getTrackedQueuePosition() > 0;
  const statusHeadline = getStatusHeadline();
  const statusMeta = getStatusMeta();

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
  const shouldRestoreTextareaFocus = previousActive?.classList.contains("textarea") ?? false;
  const previousSelection =
    shouldRestoreTextareaFocus && previousActive instanceof HTMLTextAreaElement
      ? {
          start: previousActive.selectionStart,
          end: previousActive.selectionEnd
        }
      : null;

  shadowRoot.innerHTML = `
    <style>${styles}</style>
    <div class="pyanchor-root">
      ${uiState.toast ? `<div class="toast toast--${uiState.toast.tone}">${escapeHtml(uiState.toast.message)}</div>` : ""}
      ${uiState.isOpen ? `
        <div class="panel" role="dialog" aria-label="Pyanchor 개발 도구">
          <div class="panel__header">
            <div class="panel__title">
              <div class="panel__title-line">${sparkIcon}<span>Pyanchor 개발 도구</span></div>
              <div class="panel__context">
                <span>현재 페이지</span>
                <code class="panel__path">${escapeHtml(currentPath())}</code>
              </div>
            </div>
            <button class="icon-button" type="button" data-action="close" aria-label="닫기">${closeIcon}</button>
          </div>

          <div class="mode-switch">
            <button class="mode-switch__button ${uiState.mode === "chat" ? "mode-switch__button--active" : ""}" type="button" data-action="mode-chat">대화</button>
            <button class="mode-switch__button ${uiState.mode === "edit" ? "mode-switch__button--active" : ""}" type="button" data-action="mode-edit">수정</button>
          </div>

          ${
            statusHeadline
              ? `
                <div class="status-line status-line--${serverState.status}">
                  ${isWorking ? typingDots : ""}
                  <div class="status-line__copy">
                    <div class="status-line__headline">${escapeHtml(statusHeadline)}</div>
                    ${statusMeta ? `<div class="status-line__meta">${escapeHtml(statusMeta)}</div>` : ""}
                  </div>
                </div>
              `
              : ""
          }

          ${renderMessages()}

          <form class="composer" data-action="submit">
            <div>
              <span class="composer__title">${getComposerTitle()}</span>
              <textarea class="textarea" rows="4" placeholder="${escapeHtml(getPlaceholder())}" ${isBusy ? "disabled" : ""}></textarea>
            </div>
            <div class="composer__footer">
              <div class="composer__hint">
                <strong>${uiState.mode === "chat" ? "질문/설명" : "화면 수정"}</strong>
                <span>${serverState.configured ? "Ctrl/Cmd + Enter로 바로 전송" : "서버 설정이 아직 연결되지 않았습니다."}</span>
              </div>
              <div class="actions">
                ${canCancel ? `<button class="button button--danger" type="button" data-action="cancel" ${uiState.isCanceling ? "disabled" : ""}>취소</button>` : ""}
                <button class="button button--primary" type="submit" ${!serverState.configured || isBusy || !uiState.prompt.trim() ? "disabled" : ""}>
                  ${uiState.isSubmitting ? "전송 중..." : uiState.mode === "chat" ? "보내기" : "요청하기"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ` : ""}
      <button class="trigger ${isWorking ? "trigger--busy" : ""}" type="button" data-action="toggle" aria-label="${uiState.isOpen ? "Pyanchor 개발 도구 닫기" : "Pyanchor 개발 도구 열기"}" title="현재 화면에 대해 질문하거나 수정 요청">
        ${isWorking ? typingDots : sparkIcon}
      </button>
    </div>
  `;

  const promptField = shadowRoot.querySelector<HTMLTextAreaElement>(".textarea");
  const messagesPanel = shadowRoot.querySelector<HTMLElement>(".messages");

  if (promptField) {
    promptField.value = uiState.prompt;
    if (shouldRestoreTextareaFocus) {
      promptField.focus({ preventScroll: true });
      if (previousSelection) {
        promptField.setSelectionRange(previousSelection.start, previousSelection.end);
      }
    }
  }

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
      showToast("취소 요청을 보냈습니다.", "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "취소 요청을 처리하지 못했습니다.", "error");
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
      uiState.prompt = "";

      const lastQueued = next.queue[next.queue.length - 1];
      uiState.lastSubmittedJobId = lastQueued?.jobId ?? next.jobId ?? null;

      if (lastQueued) {
        showToast(`대기열에 추가했습니다. (${next.queue.length}번째)`, "info");
      } else {
        showToast(uiState.mode === "chat" ? "질문을 보냈습니다." : "수정 요청을 시작했습니다.", "info");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "요청을 시작하지 못했습니다.", "error");
    } finally {
      uiState.isSubmitting = false;
      render();
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

window.addEventListener("pyanchor:navigation", () => {
  render();
});

bindHistory();
render();
void syncState(false);

window.setInterval(() => {
  if (document.visibilityState === "hidden" && !shouldPoll()) {
    return;
  }
  void syncState(true);
}, POLL_INTERVAL_MS);
