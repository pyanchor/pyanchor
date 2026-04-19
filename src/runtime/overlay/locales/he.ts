/**
 * Hebrew locale bundle for the overlay (RTL).
 *
 * v0.16.0 — second RTL locale. Same activation + layout-flip
 * mechanism as v0.15.0 ar. Brand "Pyanchor" / "DevTools" stays
 * in Latin script.
 *
 * Tone: modern Israeli Hebrew, informal-direct (matches the
 * dev-tool register the LTR bundles established).
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const heStrings: Partial<StringTable> = {
  statusReadingChat: "קורא את השאלה שלך.",
  statusReadingEdit: "קורא את הדף ואת הקוד.",
  statusJobFailed: "המשימה נכשלה.",
  statusJobCanceled: "המשימה בוטלה.",
  statusAnswerReady: "התשובה מוכנה.",
  statusEditComplete: "העריכה הושלמה.",
  statusQueuedAt: (n) =>
    `בתור, מיקום ${n}. ירוץ אחרי שהמשימות הנוכחיות יסתיימו.`,

  pendingDrafting: "מכין את הבקשה שלך.",
  pendingReading: "קורא דף וקוד.",
  pendingAnswering: "מנסח תשובה.",

  composerEditTitle: "בקשת עריכה",
  composerChatTitle: "שלח שאלה",
  composerEditPlaceholder:
    "למשל: הפוך את המעבר בין לשוניות התחברות / הרשמה לחלק יותר. שמור על המבנה הקיים.",
  composerChatPlaceholder:
    "למשל: הסבר למה הדף הזה מתנהג כך. צטט את הקבצים.",
  composerSendHint: "Ctrl/Cmd + Enter כדי לשלוח",
  composerNotConfigured: "ה-sidecar עדיין לא מוגדר במלואו.",
  composerSubmitSend: "שלח",
  composerSubmitRun: "הרץ",
  composerSubmitSending: "שולח\u2026",
  composerCancelLabel: "ביטול",

  modeAsk: "שאל",
  modeEdit: "ערוך",
  modeLockedTitle: "המצב נעול בזמן שמשימה רצה.",

  toggleOpen: "פתח את Pyanchor DevTools",
  toggleClose: "סגור את Pyanchor DevTools",
  toggleTitle: "שאל על הדף הנוכחי או בקש שינוי",

  toastAnswerReceived: "התשובה התקבלה.",
  toastEditComplete: "העריכה הושלמה.",
  toastQuestionSent: "השאלה נשלחה.",
  toastEditStarted: "העריכה התחילה.",
  toastCancelSent: "בקשת הביטול נשלחה.",
  toastCancelFailed: "בקשת הביטול נכשלה.",
  toastRequestCanceled: "הבקשה בוטלה.",
  toastFailedToStart: "לא ניתן היה להתחיל את הבקשה.",

  messagesEmpty:
    "שאל שאלה או בקש שינוי. היסטוריית השיחה תופיע כאן.",
  roleYou: "אתה",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools runtime לא מוגדר.",

  composerHeadlineChat: "שאל / הסבר",
  composerHeadlineEdit: "ערוך דף",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "הדף הנוכחי",
  statusYourPosition: (n) => `הבקשה שלך: מיקום ${n}`,

  errorRequestFailed: "הבקשה נכשלה.",
  errorJobFailed: "המשימה נכשלה.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . כדי להחליף",
  retryLast: "נסה שוב את הבקשה האחרונה",
  copyLast: "העתק",
  toastCopied: "הועתק ללוח.",
  toastCopyFailed: "ההעתקה נכשלה.",

  diagnosticsTitle: "אבחון",
  diagRuntime: "Runtime",
  diagLocale: "שפה",
  diagAuth: "Auth",
  diagStatus: "סטטוס",
  diagJobId: "מזהה משימה",
  diagMode: "מצב",
  diagQueue: "תור",
  diagLastUpdate: "עדכון אחרון",
  diagAuthCookie: "סשן בקוקי",
  diagAuthBearer: "אסימון Bearer"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("he", heStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "he", bundle: heStrings });
  }
}
