/**
 * Japanese locale bundle for the overlay (v0.10.0; module-split in v0.11.0).
 *
 * Tone: concise, です/ます on instruction sentences, 体言止め on
 * status labels — the register Chrome / VS Code Japanese UIs use.
 * Brand "Pyanchor" / "DevTools" left as-is.
 *
 * Loaded on demand by bootstrap when `data-pyanchor-locale="ja"`
 * is set; pushes itself onto `window.__PyanchorPendingLocales` for
 * the overlay to drain at boot.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
  }
}

export const jaStrings: Partial<StringTable> = {
  statusReadingChat: "質問を読み込み中。",
  statusReadingEdit: "ページとコードを読み込み中。",
  statusJobFailed: "ジョブ失敗。",
  statusJobCanceled: "ジョブをキャンセルしました。",
  statusAnswerReady: "回答の準備ができました。",
  statusEditComplete: "編集完了。",
  statusQueuedAt: (n) => `キュー ${n} 番目。現在のジョブ完了後に実行されます。`,

  pendingDrafting: "リクエストを整理中。",
  pendingReading: "ページとコードを読み込み中。",
  pendingAnswering: "回答を作成中。",

  composerEditTitle: "編集リクエスト",
  composerChatTitle: "質問を送信",
  composerEditPlaceholder:
    "例: ログイン/サインアップのタブ切り替えを滑らかに。既存の構造は維持。",
  composerChatPlaceholder:
    "例: このページがなぜこう動作するのか説明。ファイルパスを引用。",
  composerSendHint: "Ctrl/Cmd + Enter で送信",
  composerNotConfigured: "サイドカーがまだ設定されていません。",
  composerSubmitSend: "送信",
  composerSubmitRun: "実行",
  composerSubmitSending: "送信中\u2026",
  composerCancelLabel: "キャンセル",

  modeAsk: "質問",
  modeEdit: "編集",
  modeLockedTitle: "ジョブ実行中はモードを変更できません。",

  toggleOpen: "Pyanchor DevTools を開く",
  toggleClose: "Pyanchor DevTools を閉じる",
  toggleTitle: "現在のページに質問する、または変更をリクエスト",

  toastAnswerReceived: "回答を受信しました。",
  toastEditComplete: "編集が完了しました。",
  toastQuestionSent: "質問を送信しました。",
  toastEditStarted: "編集を開始しました。",
  toastCancelSent: "キャンセルリクエストを送信しました。",
  toastCancelFailed: "キャンセルリクエストに失敗しました。",
  toastRequestCanceled: "リクエストをキャンセルしました。",
  toastFailedToStart: "リクエストの開始に失敗しました。",

  messagesEmpty: "質問または変更をリクエストすると、ここに会話履歴が表示されます。",
  roleYou: "あなた",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools ランタイムが設定されていません。",

  composerHeadlineChat: "質問 / 説明",
  composerHeadlineEdit: "ページ編集",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "現在のページ",
  statusYourPosition: (n) => `あなたのリクエスト: ${n} 番目`,

  errorRequestFailed: "リクエスト失敗。",
  errorJobFailed: "ジョブ失敗。",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . で開閉",
  retryLast: "前回のリクエストを再実行",
  copyLast: "コピー",
  toastCopied: "クリップボードにコピーしました。",
  toastCopyFailed: "コピーに失敗しました。",

  diagnosticsTitle: "診断情報",
  diagRuntime: "ランタイム",
  diagLocale: "ロケール",
  diagAuth: "認証",
  diagStatus: "ステータス",
  diagJobId: "ジョブ ID",
  diagMode: "モード",
  diagQueue: "キュー",
  diagLastUpdate: "最終更新",
  diagAuthCookie: "Cookie セッション",
  diagAuthBearer: "Bearer トークン"
};

if (typeof window !== "undefined") {
  (window.__PyanchorPendingLocales ||= []).push({ locale: "ja", bundle: jaStrings });
}
