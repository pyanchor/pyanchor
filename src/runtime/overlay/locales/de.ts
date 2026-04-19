/**
 * German locale bundle for the overlay.
 *
 * Same self-registration pattern as the v0.11.0 ko / ja / zh-cn
 * bundles: pushes onto `window.__PyanchorPendingLocales` at module
 * load. Bootstrap auto-injects this script before the overlay when
 * `data-pyanchor-locale="de"` is set.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
  }
}

export const deStrings: Partial<StringTable> = {
  statusReadingChat: "Lese deine Frage.",
  statusReadingEdit: "Lese die Seite und den Code.",
  statusJobFailed: "Job fehlgeschlagen.",
  statusJobCanceled: "Job abgebrochen.",
  statusAnswerReady: "Antwort bereit.",
  statusEditComplete: "Bearbeitung abgeschlossen.",
  statusQueuedAt: (n) =>
    `In der Warteschlange, Position ${n}. Wird ausgeführt, sobald die aktuellen Jobs fertig sind.`,

  pendingDrafting: "Bereite deine Anfrage vor.",
  pendingReading: "Lese Seite und Code.",
  pendingAnswering: "Verfasse Antwort.",

  composerEditTitle: "Bearbeitungsanfrage",
  composerChatTitle: "Frage senden",
  composerEditPlaceholder:
    "z. B. den Übergang zwischen Login- und Registrierungs-Tabs flüssiger machen. Bestehende Struktur beibehalten.",
  composerChatPlaceholder:
    "z. B. erkläre, warum sich diese Seite so verhält. Zitiere die Dateien.",
  composerSendHint: "Strg/Cmd + Enter zum Senden",
  composerNotConfigured: "Sidecar ist noch nicht vollständig konfiguriert.",
  composerSubmitSend: "Senden",
  composerSubmitRun: "Ausführen",
  composerSubmitSending: "Sende\u2026",
  composerCancelLabel: "Abbrechen",

  modeAsk: "Fragen",
  modeEdit: "Bearbeiten",
  modeLockedTitle: "Modus ist gesperrt, während ein Job läuft.",

  toggleOpen: "Pyanchor DevTools öffnen",
  toggleClose: "Pyanchor DevTools schließen",
  toggleTitle: "Frage zur aktuellen Seite stellen oder eine Änderung anfordern",

  toastAnswerReceived: "Antwort erhalten.",
  toastEditComplete: "Bearbeitung abgeschlossen.",
  toastQuestionSent: "Frage gesendet.",
  toastEditStarted: "Bearbeitung gestartet.",
  toastCancelSent: "Abbruchanfrage gesendet.",
  toastCancelFailed: "Abbruchanfrage fehlgeschlagen.",
  toastRequestCanceled: "Anfrage abgebrochen.",
  toastFailedToStart: "Anfrage konnte nicht gestartet werden.",

  messagesEmpty:
    "Stelle eine Frage oder fordere eine Änderung an. Der Verlauf erscheint hier.",
  roleYou: "Du",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor-Devtools-Runtime ist nicht konfiguriert.",

  composerHeadlineChat: "Fragen / Erklären",
  composerHeadlineEdit: "Seite bearbeiten",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Aktuelle Seite",
  statusYourPosition: (n) => `Deine Anfrage: Position ${n}`,

  errorRequestFailed: "Anfrage fehlgeschlagen.",
  errorJobFailed: "Job fehlgeschlagen.",

  kbdShortcutHint: "Cmd/Strg + Shift + . zum Umschalten",
  retryLast: "Letzte Anfrage wiederholen",
  copyLast: "Kopieren",
  toastCopied: "In Zwischenablage kopiert.",
  toastCopyFailed: "Kopieren fehlgeschlagen.",

  diagnosticsTitle: "Diagnose",
  diagRuntime: "Runtime",
  diagLocale: "Sprache",
  diagAuth: "Auth",
  diagStatus: "Status",
  diagJobId: "Job-ID",
  diagMode: "Modus",
  diagQueue: "Warteschlange",
  diagLastUpdate: "Letzte Aktualisierung",
  diagAuthCookie: "Cookie-Sitzung",
  diagAuthBearer: "Bearer-Token"
};

if (typeof window !== "undefined") {
  (window.__PyanchorPendingLocales ||= []).push({ locale: "de", bundle: deStrings });
}
