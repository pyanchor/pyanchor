/**
 * Localizable UI string table for the in-page overlay.
 *
 * Every user-visible string lands here as a key. The default
 * English bundle (`enStrings`) ships in the runtime; alternate
 * locales register via `registerStrings(locale, partial)` and
 * are looked up at bootstrap time via the `data-pyanchor-locale`
 * script attribute (or `window.__PyanchorConfig.locale` if the
 * host app sets it directly).
 *
 * Partial overrides merge over `enStrings` so a locale only has
 * to translate the keys it cares about — un-translated keys fall
 * back to English.
 */

export interface StringTable {
  // Status banner (getStatusHeadline)
  statusReadingChat: string;
  statusReadingEdit: string;
  statusJobFailed: string;
  statusJobCanceled: string;
  statusAnswerReady: string;
  statusEditComplete: string;
  /** "Queued at position {N}. Will run after the current jobs finish." */
  statusQueuedAt: (position: number) => string;

  // Pending bubble (getPendingBubbleTitle)
  pendingDrafting: string;
  pendingReading: string;
  pendingAnswering: string;

  // Composer (getComposerTitle / getPlaceholder + render)
  composerEditTitle: string;
  composerChatTitle: string;
  composerEditPlaceholder: string;
  composerChatPlaceholder: string;
  /** "Ctrl/Cmd + Enter to send" hint */
  composerSendHint: string;
  composerNotConfigured: string;
  /** Submit button labels */
  composerSubmitSend: string; // chat
  composerSubmitRun: string; // edit
  composerSubmitSending: string; // in-flight
  composerCancelLabel: string;

  // Mode switch
  modeAsk: string;
  modeEdit: string;
  modeLockedTitle: string;

  // Toggle button
  toggleOpen: string; // aria-label when closed
  toggleClose: string; // aria-label when open
  toggleTitle: string; // mouseover hint

  // Toasts
  toastAnswerReceived: string;
  toastEditComplete: string;
  toastQuestionSent: string;
  toastEditStarted: string;
  toastCancelSent: string;
  toastCancelFailed: string;
  toastRequestCanceled: string;
  toastFailedToStart: string;

  // Empty state + role labels (renderMessagesTemplate)
  messagesEmpty: string;
  roleYou: string;
  rolePyanchor: string;

  // Boot errors
  errorRuntimeNotConfigured: string;

  // Composer headline ("Ask / Explain" vs "Edit page")
  composerHeadlineChat: string;
  composerHeadlineEdit: string;
}

export const enStrings: StringTable = {
  statusReadingChat: "Reading your question.",
  statusReadingEdit: "Reading the page and the code.",
  statusJobFailed: "Job failed.",
  statusJobCanceled: "Job canceled.",
  statusAnswerReady: "Answer ready.",
  statusEditComplete: "Edit complete.",
  statusQueuedAt: (n) =>
    `Queued at position ${n}. Will run after the current jobs finish.`,

  pendingDrafting: "Drafting your request.",
  pendingReading: "Reading page and code.",
  pendingAnswering: "Drafting an answer.",

  composerEditTitle: "Edit request",
  composerChatTitle: "Send a question",
  composerEditPlaceholder:
    "e.g. make the login/signup tab transition smoother. Keep the existing structure intact.",
  composerChatPlaceholder:
    "e.g. explain why this page behaves the way it does. Cite the files.",
  composerSendHint: "Ctrl/Cmd + Enter to send",
  composerNotConfigured: "Sidecar is not fully configured yet.",
  composerSubmitSend: "Send",
  composerSubmitRun: "Run",
  composerSubmitSending: "Sending\u2026",
  composerCancelLabel: "Cancel",

  modeAsk: "Ask",
  modeEdit: "Edit",
  modeLockedTitle: "Mode is locked while a job is in flight.",

  toggleOpen: "Open Pyanchor DevTools",
  toggleClose: "Close Pyanchor DevTools",
  toggleTitle: "Ask about the current page or request a change",

  toastAnswerReceived: "Answer received.",
  toastEditComplete: "Edit complete.",
  toastQuestionSent: "Question sent.",
  toastEditStarted: "Edit started.",
  toastCancelSent: "Cancel request sent.",
  toastCancelFailed: "Cancel request failed.",
  toastRequestCanceled: "Request canceled.",
  toastFailedToStart: "Failed to start the request.",

  messagesEmpty:
    "Ask a question or request a change. Conversation history shows up here.",
  roleYou: "You",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools runtime is not configured.",

  composerHeadlineChat: "Ask / Explain",
  composerHeadlineEdit: "Edit page"
};

const registry = new Map<string, Partial<StringTable>>();

/**
 * Register a locale bundle. Partial overrides merge over the English
 * defaults; missing keys fall back to English. Idempotent — last
 * registration for a locale wins.
 */
export function registerStrings(locale: string, bundle: Partial<StringTable>): void {
  registry.set(locale.toLowerCase(), bundle);
}

/**
 * Resolve the string table for a locale. Pass undefined / unknown /
 * "en" → English defaults verbatim. For registered locales, partial
 * overrides merge on top of English.
 */
export function resolveStrings(locale?: string | null): StringTable {
  if (!locale) return enStrings;
  const key = locale.toLowerCase();
  if (key === "en" || key === "en-us" || key === "en-gb") return enStrings;
  const overrides = registry.get(key);
  if (!overrides) return enStrings;
  return { ...enStrings, ...overrides };
}

/** For tests — wipes the registry so each test starts clean. */
export function _clearRegistry(): void {
  registry.clear();
}
