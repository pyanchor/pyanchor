/**
 * Dutch locale bundle for the overlay.
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

export const nlStrings: Partial<StringTable> = {
  statusReadingChat: "Je vraag wordt gelezen.",
  statusReadingEdit: "De pagina en code worden gelezen.",
  statusJobFailed: "Taak mislukt.",
  statusJobCanceled: "Taak geannuleerd.",
  statusAnswerReady: "Antwoord klaar.",
  statusEditComplete: "Bewerking voltooid.",
  statusQueuedAt: (n) =>
    `In de wachtrij, positie ${n}. Wordt uitgevoerd nadat de huidige taken klaar zijn.`,

  pendingDrafting: "Je verzoek wordt voorbereid.",
  pendingReading: "Pagina en code worden gelezen.",
  pendingAnswering: "Antwoord wordt opgesteld.",

  composerEditTitle: "Bewerkingsverzoek",
  composerChatTitle: "Stel een vraag",
  composerEditPlaceholder:
    "bv. maak de overgang tussen de inlog- / registratie-tabbladen vloeiender. Behoud de bestaande structuur.",
  composerChatPlaceholder:
    "bv. leg uit waarom deze pagina zich zo gedraagt. Verwijs naar de bestanden.",
  composerSendHint: "Ctrl/Cmd + Enter om te verzenden",
  composerNotConfigured: "Sidecar is nog niet volledig geconfigureerd.",
  composerSubmitSend: "Verzenden",
  composerSubmitRun: "Uitvoeren",
  composerSubmitSending: "Verzenden\u2026",
  composerCancelLabel: "Annuleren",

  modeAsk: "Vragen",
  modeEdit: "Bewerken",
  modeLockedTitle: "Modus is vergrendeld terwijl een taak loopt.",

  toggleOpen: "Pyanchor DevTools openen",
  toggleClose: "Pyanchor DevTools sluiten",
  toggleTitle: "Stel een vraag over de huidige pagina of vraag een wijziging",

  toastAnswerReceived: "Antwoord ontvangen.",
  toastEditComplete: "Bewerking voltooid.",
  toastQuestionSent: "Vraag verzonden.",
  toastEditStarted: "Bewerking gestart.",
  toastCancelSent: "Annuleringsverzoek verzonden.",
  toastCancelFailed: "Annuleringsverzoek mislukt.",
  toastRequestCanceled: "Verzoek geannuleerd.",
  toastFailedToStart: "Verzoek kon niet worden gestart.",

  messagesEmpty:
    "Stel een vraag of vraag een wijziging. De gespreksgeschiedenis verschijnt hier.",
  roleYou: "Jij",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools-runtime is niet geconfigureerd.",

  composerHeadlineChat: "Vragen / Uitleggen",
  composerHeadlineEdit: "Pagina bewerken",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Huidige pagina",
  statusYourPosition: (n) => `Jouw verzoek: positie ${n}`,

  errorRequestFailed: "Verzoek mislukt.",
  errorJobFailed: "Taak mislukt.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . om te wisselen",
  retryLast: "Laatste verzoek opnieuw proberen",
  copyLast: "Kopiëren",
  toastCopied: "Naar klembord gekopieerd.",
  toastCopyFailed: "Kopiëren mislukt.",

  diagnosticsTitle: "Diagnose",
  diagRuntime: "Runtime",
  diagLocale: "Taal",
  diagAuth: "Auth",
  diagStatus: "Status",
  diagJobId: "Taak-ID",
  diagMode: "Modus",
  diagQueue: "Wachtrij",
  diagLastUpdate: "Laatst bijgewerkt",
  diagAuthCookie: "cookie-sessie",
  diagAuthBearer: "Bearer-token"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("nl", nlStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "nl", bundle: nlStrings });
  }
}
