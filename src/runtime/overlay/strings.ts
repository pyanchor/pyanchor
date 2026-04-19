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

  // Panel header / status meta (v0.9.2 — completing the i18n extraction)
  /** Brand title shown in the panel header AND used as the dialog aria-label. */
  panelTitle: string;
  /** Label preceding the current page path in the panel header. */
  panelContextLabel: string;
  /** "Your request: position {N}" breadcrumb in getStatusMeta. */
  statusYourPosition: (position: number) => string;

  // Error-path fallbacks (v0.9.3 — Codex round-9 #2 i18n completion)
  /** Generic fallback when a non-2xx response has no {error} field (fetch-helper). */
  errorRequestFailed: string;
  /** Generic fallback when a polling outcome reports `failed` with null error (polling). */
  errorJobFailed: string;

  // UX phase 1 (v0.9.5 — Codex round-9 feature suggestions 2/3/4)
  /** Subtle hint shown in composer footer about the keyboard shortcut. */
  kbdShortcutHint: string;
  /** Label for the "Retry last request" button shown after fail/cancel. */
  retryLast: string;
  /** Label for the "Copy" button (copies last assistant message OR error). */
  copyLast: string;
  /** Toast after successful clipboard write. */
  toastCopied: string;
  /** Toast when navigator.clipboard.writeText rejects. */
  toastCopyFailed: string;

  // Diagnostics panel (v0.9.7 — Codex round-9 feature suggestion #6)
  /** <summary> label for the collapsible diagnostics block. */
  diagnosticsTitle: string;
  /** Field label: where the runtime is mounted (baseUrl). */
  diagRuntime: string;
  /** Field label: resolved locale code. */
  diagLocale: string;
  /** Field label: how API requests authenticate (cookie / bearer / none). */
  diagAuth: string;
  /** Field label: serverState.status. */
  diagStatus: string;
  /** Field label: serverState.jobId or em-dash. */
  diagJobId: string;
  /** Field label: serverState.mode. */
  diagMode: string;
  /** Field label: serverState.queue.length. */
  diagQueue: string;
  /** Field label: serverState.updatedAt formatted. */
  diagLastUpdate: string;
  /** Value: cookie-session auth mode (token blanked, cookie active). */
  diagAuthCookie: string;
  /** Value: bearer-header auth mode (token still present in window). */
  diagAuthBearer: string;
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
  composerHeadlineEdit: "Edit page",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Current page",
  statusYourPosition: (n) => `Your request: position ${n}`,

  errorRequestFailed: "Request failed.",
  errorJobFailed: "Job failed.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . to toggle",
  retryLast: "Retry last request",
  copyLast: "Copy",
  toastCopied: "Copied to clipboard.",
  toastCopyFailed: "Copy failed.",

  diagnosticsTitle: "Diagnostics",
  diagRuntime: "Runtime",
  diagLocale: "Locale",
  diagAuth: "Auth",
  diagStatus: "Status",
  diagJobId: "Job ID",
  diagMode: "Mode",
  diagQueue: "Queue",
  diagLastUpdate: "Last update",
  diagAuthCookie: "cookie session",
  diagAuthBearer: "bearer token"
};

/**
 * Locale registry. Populated by:
 *   - host code calling `registerStrings(locale, bundle)`
 *   - locale bundle modules (`src/runtime/overlay/locales/{ko,ja,zh-cn}.ts`)
 *     that build into separate IIFE files (`dist/public/locales/*.js`)
 *     and push onto `window.__PyanchorPendingLocales` at script load.
 *
 * v0.11.0 split: built-in locale bundles no longer ship inside the
 * main overlay.js (saves ~9KB). Bootstrap auto-injects the matching
 * `locales/{locale}.js` script BEFORE the overlay script when
 * `data-pyanchor-locale="..."` is set, so script ordering (defer)
 * guarantees the bundle is in the queue when the overlay drains it.
 *
 * For host pages that load `overlay.js` directly (no bootstrap),
 * either include the locale `<script>` BEFORE the overlay one, OR
 * call `window.__PyanchorRegisterStrings(locale, bundle)` after the
 * overlay loads.
 */

interface PendingLocale {
  locale: string;
  bundle: Partial<StringTable>;
}

declare global {
  interface Window {
    __PyanchorPendingLocales?: PendingLocale[];
    /**
     * Late-registration hook exposed by the overlay bundle. Locale
     * scripts loaded AFTER the overlay (uncommon — bootstrap orders
     * them first) call this instead of pushing to the queue.
     */
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

/**
 * Event fired whenever a locale bundle is registered via the
 * late-register hook. The overlay listens for this so that hosts
 * that load `overlay.js` BEFORE the locale bundle still get a
 * translated UI once the bundle arrives — without this event, the
 * overlay captures its string table at boot and never re-resolves.
 * Round-12 #1: closes the gap between "hook called" and "UI
 * actually localized".
 */
export const LOCALE_REGISTERED_EVENT = "pyanchor:locale-registered";

const registry = new Map<string, Partial<StringTable>>();

const drainPendingQueue = () => {
  if (typeof window === "undefined") return;
  const pending = window.__PyanchorPendingLocales;
  if (!pending || pending.length === 0) return;
  for (const { locale, bundle } of pending) {
    registry.set(locale.toLowerCase(), bundle);
  }
  // Replace with a fresh array; locale scripts loaded later push
  // onto the new one. (Using length=0 would mutate observably.)
  window.__PyanchorPendingLocales = [];
};

drainPendingQueue();

if (typeof window !== "undefined") {
  // Late-registration: locales loaded AFTER the overlay can call
  // this directly. Same merge semantics as `registerStrings`.
  window.__PyanchorRegisterStrings = (locale, bundle) => {
    const key = locale.toLowerCase();
    registry.set(key, bundle);
    // Notify any overlay currently running so it can re-resolve its
    // string table and re-render. Fires AFTER the registry set so
    // listeners see the update.
    window.dispatchEvent(
      new CustomEvent(LOCALE_REGISTERED_EVENT, { detail: { locale: key } })
    );
  };
}

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

/**
 * For tests — wipes the registry AND re-drains any locale bundles
 * the test has loaded into `window.__PyanchorPendingLocales`. Lets
 * tests reset to a clean state while preserving locales that the
 * test fixture script-loaded itself.
 */
export function _clearRegistry(): void {
  registry.clear();
  drainPendingQueue();
}
