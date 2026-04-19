/**
 * UI state types + pure derived helpers (queue position, polling
 * predicate, status headline / meta).
 *
 * The mutable `uiState` object and `serverState` slot still live in
 * overlay.ts (they're tightly coupled to the render() loop), but
 * everything that derives FROM (uiState, serverState) is here so
 * the logic can be tested without DOM/jsdom.
 */

// Re-declared inline so the overlay bundle stays self-contained
// (no shared/types import — the runtime .ts is browser-bound).
export type AiEditStatus =
  | "idle"
  | "running"
  | "canceling"
  | "done"
  | "failed"
  | "canceled";
export type AiEditMode = "edit" | "chat";
export type AiEditMessageRole = "user" | "assistant" | "system";
export type AiEditMessageStatus = "queued" | "running" | "done" | "failed" | "canceled";

export interface AiEditQueueItem {
  jobId: string;
  prompt: string;
  targetPath: string;
  enqueuedAt: string;
  mode: AiEditMode;
}

export interface AiEditMessage {
  id: string;
  jobId: string | null;
  role: AiEditMessageRole;
  mode: AiEditMode;
  text: string;
  createdAt: string;
  status: AiEditMessageStatus | null;
}

export interface AiEditState {
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

export interface UIState {
  isOpen: boolean;
  isSubmitting: boolean;
  isCanceling: boolean;
  prompt: string;
  mode: AiEditMode;
  /** jobId of the most recent submit — used to highlight the user's queued slot. */
  lastSubmittedJobId: string | null;
  toast: { message: string; tone: "info" | "success" | "error" } | null;
  toastTimer: number;
}

export const createUIState = (): UIState => ({
  isOpen: false,
  isSubmitting: false,
  isCanceling: false,
  prompt: "",
  mode: "edit",
  lastSubmittedJobId: null,
  toast: null,
  toastTimer: 0
});

export const createEmptyServerState = (): AiEditState => ({
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
});

/**
 * 1-based position of the user's most recent submit in the queue,
 * or 0 when no tracked job is queued. Used by the UI to display
 * "Queued at position N." and to keep the polling loop alive even
 * after the running job finishes (the user's job hasn't started
 * yet but is still in flight).
 */
export const getTrackedQueuePosition = (
  uiState: Pick<UIState, "lastSubmittedJobId">,
  serverState: Pick<AiEditState, "queue">
): number => {
  if (!uiState.lastSubmittedJobId) return 0;
  return serverState.queue.findIndex((item) => item.jobId === uiState.lastSubmittedJobId) + 1;
};

/**
 * True when the overlay should poll /api/status. Conditions:
 *   - server has a running or canceling job (we want progress),
 *   - the global queue is non-empty (someone has work pending),
 *   - the user's tracked job is queued (waiting for its turn).
 */
export const shouldPoll = (
  uiState: Pick<UIState, "lastSubmittedJobId">,
  serverState: Pick<AiEditState, "status" | "queue">
): boolean =>
  serverState.status === "running" ||
  serverState.status === "canceling" ||
  serverState.queue.length > 0 ||
  getTrackedQueuePosition(uiState, serverState) > 0;

export interface StatusHeadlineDeps {
  /** Truncated first line of serverState.thinking. */
  thinkingPreview: string;
}

/**
 * One-line status banner shown above the message list. Priority:
 *   1. Tracked queue position (if user is queued and not running)
 *   2. Live thinking preview / heartbeat label / currentStep (running)
 *   3. Error reason (failed / canceled)
 *   4. "Answer ready." / "Edit complete." (done)
 *   5. "" (idle)
 */
export const getStatusHeadline = (
  uiState: Pick<UIState, "lastSubmittedJobId">,
  serverState: Pick<
    AiEditState,
    "status" | "mode" | "queue" | "heartbeatLabel" | "currentStep" | "error"
  >,
  deps: StatusHeadlineDeps
): string => {
  const queuePosition = getTrackedQueuePosition(uiState, serverState);

  if (
    queuePosition > 0 &&
    serverState.status !== "running" &&
    serverState.status !== "canceling"
  ) {
    return `Queued at position ${queuePosition}. Will run after the current jobs finish.`;
  }

  if (serverState.status === "running" || serverState.status === "canceling") {
    return (
      deps.thinkingPreview ||
      serverState.heartbeatLabel ||
      serverState.currentStep ||
      (serverState.mode === "chat"
        ? "Reading your question."
        : "Reading the page and the code.")
    );
  }

  if (serverState.status === "failed") {
    return serverState.error ?? "Job failed.";
  }

  if (serverState.status === "canceled") {
    return serverState.error ?? "Job canceled.";
  }

  if (serverState.status === "done") {
    return serverState.mode === "chat" ? "Answer ready." : "Edit complete.";
  }

  return "";
};

/**
 * Sub-line beneath the headline: heartbeat label + formatted heartbeat
 * time + queue position breadcrumb, joined by " / ". Empty string
 * when nothing meaningful to show.
 */
export const getStatusMeta = (
  uiState: Pick<UIState, "lastSubmittedJobId">,
  serverState: Pick<AiEditState, "queue" | "heartbeatLabel" | "heartbeatAt">,
  formattedHeartbeatAt: string | null
): string => {
  const queuePosition = getTrackedQueuePosition(uiState, serverState);
  const pieces = [
    serverState.heartbeatLabel,
    formattedHeartbeatAt,
    queuePosition > 0 ? `Your request: position ${queuePosition}` : null
  ].filter(Boolean);
  return pieces.join(" / ");
};

/**
 * Default placeholder text for the prompt textarea, mode-aware.
 */
export const getPlaceholder = (mode: AiEditMode): string =>
  mode === "edit"
    ? "e.g. make the login/signup tab transition smoother. Keep the existing structure intact."
    : "e.g. explain why this page behaves the way it does. Cite the files.";

export const getComposerTitle = (mode: AiEditMode): string =>
  mode === "edit" ? "Edit request" : "Send a question";

/**
 * Title used inside the "pending bubble" (the loading placeholder
 * shown while the agent is working). Choice depends on whether the
 * server is canceling and which mode the active job is in.
 */
export const getPendingBubbleTitle = (
  uiState: Pick<UIState, "mode">,
  serverState: Pick<AiEditState, "status" | "mode">
): string => {
  if (serverState.status === "canceling") return "Drafting your request.";
  if (serverState.mode === "edit" || uiState.mode === "edit") return "Reading page and code.";
  return "Drafting an answer.";
};
