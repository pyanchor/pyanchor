/**
 * Korean locale bundle for the overlay.
 *
 * v0.11.0 split: this used to be inlined in `strings.ts`; now it's
 * a standalone module so it can be built into a separate IIFE
 * (`dist/public/locales/ko.js`) that host pages load on demand.
 *
 * At module load, the bundle pushes itself onto
 * `window.__PyanchorPendingLocales`. The main overlay bundle
 * drains that queue when it boots, so script ordering (locale
 * before overlay, both `defer`) is enough to activate Korean.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
  }
}

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
  toastCopyFailed: "복사 실패.",

  diagnosticsTitle: "진단 정보",
  diagRuntime: "런타임",
  diagLocale: "로케일",
  diagAuth: "인증",
  diagStatus: "상태",
  diagJobId: "작업 ID",
  diagMode: "모드",
  diagQueue: "대기열",
  diagLastUpdate: "마지막 갱신",
  diagAuthCookie: "쿠키 세션",
  diagAuthBearer: "Bearer 토큰"
};

// Self-register on script load. The overlay drains the queue on
// boot; if this script loaded AFTER the overlay (uncommon — bootstrap
// orders us first), the queue still works because the overlay also
// exposes `window.__PyanchorRegisterStrings` for late additions.
if (typeof window !== "undefined") {
  (window.__PyanchorPendingLocales ||= []).push({ locale: "ko", bundle: koStrings });
}
