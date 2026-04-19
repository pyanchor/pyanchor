/**
 * Arabic locale bundle for the overlay (RTL).
 *
 * v0.15.0 — first RTL locale. Activation is the same as the v0.14.x
 * LTR bundles (self-register via `__PyanchorRegisterStrings` if
 * present, else queue push). The directional flip happens in
 * `overlay.ts`: when `activeLocale` is in `RTL_LOCALES`, the root
 * div renders `dir="rtl"` and the v0.15.0 logical CSS properties
 * mirror the trigger position + panel layout.
 *
 * Tone: Modern Standard Arabic, formal but not stiff. Brand
 * "Pyanchor" / "DevTools" left in Latin script (same convention
 * as every other locale).
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const arStrings: Partial<StringTable> = {
  statusReadingChat: "جارٍ قراءة سؤالك.",
  statusReadingEdit: "جارٍ قراءة الصفحة والشيفرة.",
  statusJobFailed: "فشلت المهمة.",
  statusJobCanceled: "أُلغيت المهمة.",
  statusAnswerReady: "الإجابة جاهزة.",
  statusEditComplete: "اكتمل التعديل.",
  statusQueuedAt: (n) =>
    `في قائمة الانتظار، الموضع ${n}. سيُنفَّذ بعد انتهاء المهام الحالية.`,

  pendingDrafting: "جارٍ تجهيز طلبك.",
  pendingReading: "جارٍ قراءة الصفحة والشيفرة.",
  pendingAnswering: "جارٍ كتابة الإجابة.",

  composerEditTitle: "طلب تعديل",
  composerChatTitle: "إرسال سؤال",
  composerEditPlaceholder:
    "مثال: اجعل الانتقال بين علامتَي تبويب تسجيل الدخول / التسجيل أكثر سلاسة. حافظ على البنية الحالية.",
  composerChatPlaceholder:
    "مثال: اشرح لماذا تتصرف هذه الصفحة بهذه الطريقة. اذكر الملفات.",
  composerSendHint: "Ctrl/Cmd + Enter للإرسال",
  composerNotConfigured: "لم يُضبط الـ sidecar بالكامل بعد.",
  composerSubmitSend: "إرسال",
  composerSubmitRun: "تنفيذ",
  composerSubmitSending: "جارٍ الإرسال\u2026",
  composerCancelLabel: "إلغاء",

  modeAsk: "اسأل",
  modeEdit: "عدّل",
  modeLockedTitle: "الوضع مقفل أثناء تنفيذ مهمة.",

  toggleOpen: "فتح Pyanchor DevTools",
  toggleClose: "إغلاق Pyanchor DevTools",
  toggleTitle: "اطرح سؤالاً عن الصفحة الحالية أو اطلب تعديلاً",

  toastAnswerReceived: "تم استلام الإجابة.",
  toastEditComplete: "اكتمل التعديل.",
  toastQuestionSent: "أُرسل السؤال.",
  toastEditStarted: "بدأ التعديل.",
  toastCancelSent: "أُرسل طلب الإلغاء.",
  toastCancelFailed: "فشل طلب الإلغاء.",
  toastRequestCanceled: "أُلغي الطلب.",
  toastFailedToStart: "تعذر بدء الطلب.",

  messagesEmpty:
    "اطرح سؤالاً أو اطلب تعديلاً. سيظهر سجل المحادثة هنا.",
  roleYou: "أنت",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "لم يُضبط Pyanchor devtools runtime.",

  composerHeadlineChat: "اسأل / اشرح",
  composerHeadlineEdit: "تعديل الصفحة",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "الصفحة الحالية",
  statusYourPosition: (n) => `طلبك: الموضع ${n}`,

  errorRequestFailed: "فشل الطلب.",
  errorJobFailed: "فشلت المهمة.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . للتبديل",
  retryLast: "إعادة المحاولة للطلب الأخير",
  copyLast: "نسخ",
  toastCopied: "نُسخ إلى الحافظة.",
  toastCopyFailed: "فشل النسخ.",

  diagnosticsTitle: "التشخيص",
  diagRuntime: "Runtime",
  diagLocale: "اللغة",
  diagAuth: "Auth",
  diagStatus: "الحالة",
  diagJobId: "معرّف المهمة",
  diagMode: "الوضع",
  diagQueue: "قائمة الانتظار",
  diagLastUpdate: "آخر تحديث",
  diagAuthCookie: "جلسة بكوكي",
  diagAuthBearer: "رمز Bearer"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("ar", arStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "ar", bundle: arStrings });
  }
}
