/**
 * Urdu locale bundle for the overlay (RTL).
 *
 * v0.16.0 — fourth RTL locale. Same activation + layout-flip
 * mechanism as v0.15.0 ar. Brand "Pyanchor" / "DevTools" stays
 * in Latin script.
 *
 * Tone: standard Urdu, formal-respectful (آپ form). Persian-Arabic
 * script with Urdu-specific glyphs (ٹ، ڈ، ڑ).
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const urStrings: Partial<StringTable> = {
  statusReadingChat: "آپ کا سوال پڑھا جا رہا ہے۔",
  statusReadingEdit: "صفحہ اور کوڈ پڑھا جا رہا ہے۔",
  statusJobFailed: "کام ناکام ہو گیا۔",
  statusJobCanceled: "کام منسوخ کر دیا گیا۔",
  statusAnswerReady: "جواب تیار ہے۔",
  statusEditComplete: "ترمیم مکمل ہوگئی۔",
  statusQueuedAt: (n) =>
    `قطار میں، مقام ${n}۔ موجودہ کاموں کی تکمیل کے بعد چلے گا۔`,

  pendingDrafting: "آپ کی درخواست تیار کی جا رہی ہے۔",
  pendingReading: "صفحہ اور کوڈ پڑھا جا رہا ہے۔",
  pendingAnswering: "جواب لکھا جا رہا ہے۔",

  composerEditTitle: "ترمیم کی درخواست",
  composerChatTitle: "سوال بھیجیں",
  composerEditPlaceholder:
    "مثلاً: لاگ ان / سائن اپ ٹیبز کے درمیان منتقلی کو زیادہ ہموار بنائیں۔ موجودہ ساخت برقرار رکھیں۔",
  composerChatPlaceholder:
    "مثلاً: وضاحت کریں کہ یہ صفحہ اس طرح کیوں برتاؤ کرتا ہے۔ فائلوں کا حوالہ دیں۔",
  composerSendHint: "بھیجنے کے لیے Ctrl/Cmd + Enter",
  composerNotConfigured: "sidecar ابھی پوری طرح ترتیب نہیں دیا گیا۔",
  composerSubmitSend: "بھیجیں",
  composerSubmitRun: "چلائیں",
  composerSubmitSending: "بھیجا جا رہا ہے\u2026",
  composerCancelLabel: "منسوخ",

  modeAsk: "پوچھیں",
  modeEdit: "ترمیم",
  modeLockedTitle: "کام چلنے کے دوران موڈ بند ہے۔",

  toggleOpen: "Pyanchor DevTools کھولیں",
  toggleClose: "Pyanchor DevTools بند کریں",
  toggleTitle: "موجودہ صفحے کے بارے میں پوچھیں یا تبدیلی کی درخواست کریں",

  toastAnswerReceived: "جواب موصول ہوا۔",
  toastEditComplete: "ترمیم مکمل ہوگئی۔",
  toastQuestionSent: "سوال بھیج دیا گیا۔",
  toastEditStarted: "ترمیم شروع ہوگئی۔",
  toastCancelSent: "منسوخی کی درخواست بھیج دی گئی۔",
  toastCancelFailed: "منسوخی کی درخواست ناکام ہوگئی۔",
  toastRequestCanceled: "درخواست منسوخ ہوگئی۔",
  toastFailedToStart: "درخواست شروع کرنے میں ناکامی۔",

  messagesEmpty:
    "سوال پوچھیں یا تبدیلی کی درخواست کریں۔ گفتگو کی تاریخ یہاں ظاہر ہوگی۔",
  roleYou: "آپ",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools رن ٹائم ترتیب نہیں دیا گیا۔",

  composerHeadlineChat: "پوچھیں / وضاحت کریں",
  composerHeadlineEdit: "صفحہ ترمیم کریں",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "موجودہ صفحہ",
  statusYourPosition: (n) => `آپ کی درخواست: مقام ${n}`,

  errorRequestFailed: "درخواست ناکام ہوگئی۔",
  errorJobFailed: "کام ناکام ہو گیا۔",

  kbdShortcutHint: "ٹوگل کے لیے Cmd/Ctrl + Shift + .",
  retryLast: "آخری درخواست دوبارہ آزمائیں",
  copyLast: "کاپی",
  toastCopied: "کلپ بورڈ پر کاپی کیا گیا۔",
  toastCopyFailed: "کاپی ناکام ہوئی۔",

  diagnosticsTitle: "تشخیص",
  diagRuntime: "Runtime",
  diagLocale: "زبان",
  diagAuth: "Auth",
  diagStatus: "صورتحال",
  diagJobId: "کام ID",
  diagMode: "موڈ",
  diagQueue: "قطار",
  diagLastUpdate: "آخری اپڈیٹ",
  diagAuthCookie: "cookie سیشن",
  diagAuthBearer: "Bearer ٹوکن"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("ur", urStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "ur", bundle: urStrings });
  }
}
