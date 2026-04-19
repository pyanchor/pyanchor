/**
 * Hindi locale bundle for the overlay.
 *
 * Same self-registration pattern as the v0.11.0 / v0.12.0 bundles.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const hiStrings: Partial<StringTable> = {
  statusReadingChat: "आपका प्रश्न पढ़ा जा रहा है।",
  statusReadingEdit: "पेज और कोड पढ़े जा रहे हैं।",
  statusJobFailed: "कार्य विफल।",
  statusJobCanceled: "कार्य रद्द किया गया।",
  statusAnswerReady: "उत्तर तैयार।",
  statusEditComplete: "संपादन पूरा।",
  statusQueuedAt: (n) =>
    `कतार में, स्थान ${n}। मौजूदा कार्यों के पूरा होने के बाद चलेगा।`,

  pendingDrafting: "आपका अनुरोध तैयार किया जा रहा है।",
  pendingReading: "पेज और कोड पढ़े जा रहे हैं।",
  pendingAnswering: "उत्तर लिखा जा रहा है।",

  composerEditTitle: "संपादन अनुरोध",
  composerChatTitle: "प्रश्न भेजें",
  composerEditPlaceholder:
    "उदा. लॉगिन / साइनअप टैब के बीच परिवर्तन को सहज बनाइए। मौजूदा संरचना बनाए रखें।",
  composerChatPlaceholder:
    "उदा. समझाइए कि यह पेज इस तरह क्यों व्यवहार करता है। फ़ाइलों का उल्लेख करें।",
  composerSendHint: "भेजने के लिए Ctrl/Cmd + Enter",
  composerNotConfigured: "साइडकार अभी पूरी तरह कॉन्फ़िगर नहीं है।",
  composerSubmitSend: "भेजें",
  composerSubmitRun: "चलाएँ",
  composerSubmitSending: "भेज रहा है\u2026",
  composerCancelLabel: "रद्द करें",

  modeAsk: "पूछें",
  modeEdit: "संपादन",
  modeLockedTitle: "कार्य चलने के दौरान मोड लॉक है।",

  toggleOpen: "Pyanchor DevTools खोलें",
  toggleClose: "Pyanchor DevTools बंद करें",
  toggleTitle: "मौजूदा पेज के बारे में पूछें या बदलाव का अनुरोध करें",

  toastAnswerReceived: "उत्तर प्राप्त हुआ।",
  toastEditComplete: "संपादन पूरा।",
  toastQuestionSent: "प्रश्न भेजा गया।",
  toastEditStarted: "संपादन शुरू हुआ।",
  toastCancelSent: "रद्द करने का अनुरोध भेजा गया।",
  toastCancelFailed: "रद्द करने का अनुरोध विफल।",
  toastRequestCanceled: "अनुरोध रद्द किया गया।",
  toastFailedToStart: "अनुरोध शुरू नहीं हो सका।",

  messagesEmpty:
    "प्रश्न पूछें या बदलाव का अनुरोध करें। बातचीत का इतिहास यहाँ दिखाई देगा।",
  roleYou: "आप",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools रनटाइम कॉन्फ़िगर नहीं है।",

  composerHeadlineChat: "पूछें / समझाएँ",
  composerHeadlineEdit: "पेज संपादित करें",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "मौजूदा पेज",
  statusYourPosition: (n) => `आपका अनुरोध: स्थान ${n}`,

  errorRequestFailed: "अनुरोध विफल।",
  errorJobFailed: "कार्य विफल।",

  kbdShortcutHint: "टॉगल करने के लिए Cmd/Ctrl + Shift + .",
  retryLast: "अंतिम अनुरोध पुनः प्रयास करें",
  copyLast: "कॉपी",
  toastCopied: "क्लिपबोर्ड पर कॉपी किया गया।",
  toastCopyFailed: "कॉपी विफल।",

  diagnosticsTitle: "निदान",
  diagRuntime: "Runtime",
  diagLocale: "भाषा",
  diagAuth: "Auth",
  diagStatus: "स्थिति",
  diagJobId: "कार्य ID",
  diagMode: "मोड",
  diagQueue: "कतार",
  diagLastUpdate: "अंतिम अपडेट",
  diagAuthCookie: "cookie सत्र",
  diagAuthBearer: "Bearer टोकन"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("hi", hiStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "hi", bundle: hiStrings });
  }
}
