/**
 * Italian locale bundle for the overlay.
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

export const itStrings: Partial<StringTable> = {
  statusReadingChat: "Sto leggendo la tua domanda.",
  statusReadingEdit: "Sto leggendo la pagina e il codice.",
  statusJobFailed: "Lavoro fallito.",
  statusJobCanceled: "Lavoro annullato.",
  statusAnswerReady: "Risposta pronta.",
  statusEditComplete: "Modifica completata.",
  statusQueuedAt: (n) =>
    `In coda, posizione ${n}. Verrà eseguito al termine dei lavori correnti.`,

  pendingDrafting: "Sto preparando la tua richiesta.",
  pendingReading: "Sto leggendo pagina e codice.",
  pendingAnswering: "Sto scrivendo la risposta.",

  composerEditTitle: "Richiesta di modifica",
  composerChatTitle: "Invia una domanda",
  composerEditPlaceholder:
    "es. rendi più fluido il passaggio tra le schede di accesso / registrazione. Mantieni la struttura esistente.",
  composerChatPlaceholder:
    "es. spiega perché questa pagina si comporta così. Cita i file.",
  composerSendHint: "Ctrl/Cmd + Invio per inviare",
  composerNotConfigured: "Il sidecar non è ancora completamente configurato.",
  composerSubmitSend: "Invia",
  composerSubmitRun: "Esegui",
  composerSubmitSending: "Invio\u2026",
  composerCancelLabel: "Annulla",

  modeAsk: "Chiedi",
  modeEdit: "Modifica",
  modeLockedTitle: "La modalità è bloccata mentre un lavoro è in corso.",

  toggleOpen: "Apri Pyanchor DevTools",
  toggleClose: "Chiudi Pyanchor DevTools",
  toggleTitle: "Fai una domanda sulla pagina corrente o richiedi una modifica",

  toastAnswerReceived: "Risposta ricevuta.",
  toastEditComplete: "Modifica completata.",
  toastQuestionSent: "Domanda inviata.",
  toastEditStarted: "Modifica avviata.",
  toastCancelSent: "Richiesta di annullamento inviata.",
  toastCancelFailed: "Richiesta di annullamento fallita.",
  toastRequestCanceled: "Richiesta annullata.",
  toastFailedToStart: "Impossibile avviare la richiesta.",

  messagesEmpty:
    "Fai una domanda o richiedi una modifica. La cronologia della conversazione apparirà qui.",
  roleYou: "Tu",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Il runtime di Pyanchor devtools non è configurato.",

  composerHeadlineChat: "Chiedi / Spiega",
  composerHeadlineEdit: "Modifica pagina",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Pagina corrente",
  statusYourPosition: (n) => `La tua richiesta: posizione ${n}`,

  errorRequestFailed: "Richiesta fallita.",
  errorJobFailed: "Lavoro fallito.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . per attivare/disattivare",
  retryLast: "Riprova l'ultima richiesta",
  copyLast: "Copia",
  toastCopied: "Copiato negli appunti.",
  toastCopyFailed: "Copia fallita.",

  diagnosticsTitle: "Diagnostica",
  diagRuntime: "Runtime",
  diagLocale: "Lingua",
  diagAuth: "Auth",
  diagStatus: "Stato",
  diagJobId: "ID lavoro",
  diagMode: "Modalità",
  diagQueue: "Coda",
  diagLastUpdate: "Ultimo aggiornamento",
  diagAuthCookie: "sessione cookie",
  diagAuthBearer: "token Bearer"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("it", itStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "it", bundle: itStrings });
  }
}
