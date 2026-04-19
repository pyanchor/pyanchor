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
  toastCopyFailed: "Copy failed."
};

/**
 * Built-in Korean bundle (v0.9.4).
 *
 * Translation rules:
 *   - Sentence-final period preserved (matches enStrings typography)
 *   - "Pyanchor" / "DevTools" left as-is (brand names)
 *   - Conversational register matches the English source — short,
 *     directive, no honorifics ("…해주세요" omitted for compactness)
 *   - Parameterized strings keep the same placeholder semantics
 *
 * Activation: `window.__PyanchorConfig.locale = "ko"` or
 * `<script data-pyanchor-locale="ko">`. Registered automatically
 * at module-load — no extra import needed.
 */
export const koStrings: Partial<StringTable> = {
  statusReadingChat: "질문을 읽는 중입니다.",
  statusReadingEdit: "페이지와 코드를 읽는 중입니다.",
  statusJobFailed: "작업 실패.",
  statusJobCanceled: "작업 취소됨.",
  statusAnswerReady: "답변 준비됨.",
  statusEditComplete: "편집 완료.",
  statusQueuedAt: (n) => `대기열 ${n}번째. 현재 작업이 끝나면 실행됩니다.`,

  pendingDrafting: "요청을 정리하는 중입니다.",
  pendingReading: "페이지와 코드를 읽고 있습니다.",
  pendingAnswering: "답변을 작성하는 중입니다.",

  composerEditTitle: "편집 요청",
  composerChatTitle: "질문 보내기",
  composerEditPlaceholder:
    "예: 로그인/회원가입 탭 전환을 더 매끄럽게. 기존 구조는 유지.",
  composerChatPlaceholder:
    "예: 이 페이지가 왜 이렇게 동작하는지 설명. 파일 경로 인용.",
  composerSendHint: "Ctrl/Cmd + Enter 로 전송",
  composerNotConfigured: "사이드카가 아직 설정되지 않았습니다.",
  composerSubmitSend: "전송",
  composerSubmitRun: "실행",
  composerSubmitSending: "전송 중\u2026",
  composerCancelLabel: "취소",

  modeAsk: "질문",
  modeEdit: "편집",
  modeLockedTitle: "작업이 진행 중일 때는 모드를 변경할 수 없습니다.",

  toggleOpen: "Pyanchor DevTools 열기",
  toggleClose: "Pyanchor DevTools 닫기",
  toggleTitle: "현재 페이지에 대해 질문하거나 변경 요청",

  toastAnswerReceived: "답변을 받았습니다.",
  toastEditComplete: "편집이 완료되었습니다.",
  toastQuestionSent: "질문을 보냈습니다.",
  toastEditStarted: "편집을 시작했습니다.",
  toastCancelSent: "취소 요청을 보냈습니다.",
  toastCancelFailed: "취소 요청에 실패했습니다.",
  toastRequestCanceled: "요청이 취소되었습니다.",
  toastFailedToStart: "요청을 시작하지 못했습니다.",

  messagesEmpty: "질문하거나 변경을 요청하면 대화 기록이 여기에 표시됩니다.",
  roleYou: "사용자",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools 런타임이 설정되지 않았습니다.",

  composerHeadlineChat: "질문 / 설명",
  composerHeadlineEdit: "페이지 편집",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "현재 페이지",
  statusYourPosition: (n) => `내 요청: ${n}번째`,

  errorRequestFailed: "요청 실패.",
  errorJobFailed: "작업 실패.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . 로 열기/닫기",
  retryLast: "마지막 요청 다시 시도",
  copyLast: "복사",
  toastCopied: "클립보드에 복사됨.",
  toastCopyFailed: "복사 실패."
};

/**
 * Built-in locale registry. Bundles registered here ship in the
 * runtime; host apps add more via the public `registerStrings`.
 * Reset by `_clearRegistry()` in tests, then re-registered in the
 * test setup.
 */
const BUILT_IN_BUNDLES: ReadonlyArray<readonly [string, Partial<StringTable>]> = [
  ["ko", koStrings]
];

const registry = new Map<string, Partial<StringTable>>();

const seedBuiltIns = () => {
  for (const [locale, bundle] of BUILT_IN_BUNDLES) {
    registry.set(locale, bundle);
  }
};

// Seed on module load — overlay.ts (and downstream) sees ko available
// without needing an explicit import.
seedBuiltIns();

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
 * For tests — wipes the registry then re-seeds the built-in bundles
 * so production-like behavior survives the reset. Tests that want a
 * truly empty registry should call this AND not rely on built-ins.
 */
export function _clearRegistry(): void {
  registry.clear();
  seedBuiltIns();
}
