/**
 * Persian (Farsi) locale bundle for the overlay (RTL).
 *
 * v0.16.0 — third RTL locale. Same activation + layout-flip
 * mechanism as v0.15.0 ar. Brand "Pyanchor" / "DevTools" stays
 * in Latin script.
 *
 * Tone: standard Persian (Iran), formal-but-not-stiff dev-tool
 * register. Uses Arabic script glyphs adapted for Persian
 * (e.g. ی + ک, no Arabic ي / ك).
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const faStrings: Partial<StringTable> = {
  statusReadingChat: "در حال خواندن سؤال شما.",
  statusReadingEdit: "در حال خواندن صفحه و کد.",
  statusJobFailed: "کار شکست خورد.",
  statusJobCanceled: "کار لغو شد.",
  statusAnswerReady: "پاسخ آماده است.",
  statusEditComplete: "ویرایش تکمیل شد.",
  statusQueuedAt: (n) =>
    `در صف، موقعیت ${n}. پس از اتمام کارهای فعلی اجرا می‌شود.`,

  pendingDrafting: "در حال آماده‌سازی درخواست شما.",
  pendingReading: "در حال خواندن صفحه و کد.",
  pendingAnswering: "در حال نوشتن پاسخ.",

  composerEditTitle: "درخواست ویرایش",
  composerChatTitle: "ارسال سؤال",
  composerEditPlaceholder:
    "مثال: انتقال بین زبانه‌های ورود / ثبت‌نام را روان‌تر کن. ساختار موجود را حفظ کن.",
  composerChatPlaceholder:
    "مثال: توضیح بده چرا این صفحه این‌طور رفتار می‌کند. به فایل‌ها اشاره کن.",
  composerSendHint: "Ctrl/Cmd + Enter برای ارسال",
  composerNotConfigured: "sidecar هنوز کاملاً پیکربندی نشده است.",
  composerSubmitSend: "ارسال",
  composerSubmitRun: "اجرا",
  composerSubmitSending: "در حال ارسال\u2026",
  composerCancelLabel: "لغو",

  modeAsk: "بپرس",
  modeEdit: "ویرایش",
  modeLockedTitle: "حالت در زمان اجرای یک کار قفل است.",

  toggleOpen: "باز کردن Pyanchor DevTools",
  toggleClose: "بستن Pyanchor DevTools",
  toggleTitle: "درباره صفحه فعلی بپرس یا تغییری درخواست کن",

  toastAnswerReceived: "پاسخ دریافت شد.",
  toastEditComplete: "ویرایش تکمیل شد.",
  toastQuestionSent: "سؤال ارسال شد.",
  toastEditStarted: "ویرایش شروع شد.",
  toastCancelSent: "درخواست لغو ارسال شد.",
  toastCancelFailed: "درخواست لغو ناموفق بود.",
  toastRequestCanceled: "درخواست لغو شد.",
  toastFailedToStart: "شروع درخواست ممکن نشد.",

  messagesEmpty:
    "سؤالی بپرس یا تغییری درخواست کن. تاریخچه گفتگو این‌جا نمایش داده می‌شود.",
  roleYou: "شما",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools runtime پیکربندی نشده است.",

  composerHeadlineChat: "بپرس / توضیح بده",
  composerHeadlineEdit: "ویرایش صفحه",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "صفحه فعلی",
  statusYourPosition: (n) => `درخواست شما: موقعیت ${n}`,

  errorRequestFailed: "درخواست ناموفق بود.",
  errorJobFailed: "کار شکست خورد.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . برای جابه‌جایی",
  retryLast: "تلاش مجدد آخرین درخواست",
  copyLast: "کپی",
  toastCopied: "در کلیپ‌بورد کپی شد.",
  toastCopyFailed: "کپی ناموفق بود.",

  diagnosticsTitle: "تشخیص",
  diagRuntime: "Runtime",
  diagLocale: "زبان",
  diagAuth: "Auth",
  diagStatus: "وضعیت",
  diagJobId: "شناسه کار",
  diagMode: "حالت",
  diagQueue: "صف",
  diagLastUpdate: "آخرین به‌روزرسانی",
  diagAuthCookie: "نشست با کوکی",
  diagAuthBearer: "توکن Bearer"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("fa", faStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "fa", bundle: faStrings });
  }
}
