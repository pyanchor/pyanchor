/**
 * Swedish locale bundle for the overlay.
 *
 * Same self-registration pattern as the v0.11.0–v0.13.x bundles.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const svStrings: Partial<StringTable> = {
  statusReadingChat: "Läser din fråga.",
  statusReadingEdit: "Läser sidan och koden.",
  statusJobFailed: "Jobb misslyckades.",
  statusJobCanceled: "Jobb avbrutet.",
  statusAnswerReady: "Svar klart.",
  statusEditComplete: "Redigering klar.",
  statusQueuedAt: (n) =>
    `I kö, position ${n}. Körs efter att aktuella jobb är klara.`,

  pendingDrafting: "Förbereder din begäran.",
  pendingReading: "Läser sida och kod.",
  pendingAnswering: "Skriver svar.",

  composerEditTitle: "Redigeringsbegäran",
  composerChatTitle: "Skicka en fråga",
  composerEditPlaceholder:
    "t.ex. gör övergången mellan inloggnings- / registreringsflikarna mjukare. Behåll befintlig struktur.",
  composerChatPlaceholder:
    "t.ex. förklara varför den här sidan beter sig som den gör. Hänvisa till filerna.",
  composerSendHint: "Ctrl/Cmd + Enter för att skicka",
  composerNotConfigured: "Sidecar är inte fullt konfigurerad än.",
  composerSubmitSend: "Skicka",
  composerSubmitRun: "Kör",
  composerSubmitSending: "Skickar\u2026",
  composerCancelLabel: "Avbryt",

  modeAsk: "Fråga",
  modeEdit: "Redigera",
  modeLockedTitle: "Läget är låst medan ett jobb körs.",

  toggleOpen: "Öppna Pyanchor DevTools",
  toggleClose: "Stäng Pyanchor DevTools",
  toggleTitle: "Fråga om aktuell sida eller begär en ändring",

  toastAnswerReceived: "Svar mottaget.",
  toastEditComplete: "Redigering klar.",
  toastQuestionSent: "Fråga skickad.",
  toastEditStarted: "Redigering startad.",
  toastCancelSent: "Avbrytsbegäran skickad.",
  toastCancelFailed: "Avbrytsbegäran misslyckades.",
  toastRequestCanceled: "Begäran avbruten.",
  toastFailedToStart: "Begäran kunde inte startas.",

  messagesEmpty:
    "Ställ en fråga eller begär en ändring. Konversationshistoriken visas här.",
  roleYou: "Du",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools-runtime är inte konfigurerad.",

  composerHeadlineChat: "Fråga / Förklara",
  composerHeadlineEdit: "Redigera sida",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Aktuell sida",
  statusYourPosition: (n) => `Din begäran: position ${n}`,

  errorRequestFailed: "Begäran misslyckades.",
  errorJobFailed: "Jobb misslyckades.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . för att växla",
  retryLast: "Försök senaste begäran igen",
  copyLast: "Kopiera",
  toastCopied: "Kopierat till urklipp.",
  toastCopyFailed: "Kopiering misslyckades.",

  diagnosticsTitle: "Diagnostik",
  diagRuntime: "Runtime",
  diagLocale: "Språk",
  diagAuth: "Auth",
  diagStatus: "Status",
  diagJobId: "Jobb-ID",
  diagMode: "Läge",
  diagQueue: "Kö",
  diagLastUpdate: "Senast uppdaterad",
  diagAuthCookie: "cookie-session",
  diagAuthBearer: "Bearer-token"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("sv", svStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "sv", bundle: svStrings });
  }
}
