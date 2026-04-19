/**
 * Polish locale bundle for the overlay.
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

export const plStrings: Partial<StringTable> = {
  statusReadingChat: "Czytam Twoje pytanie.",
  statusReadingEdit: "Czytam stronę i kod.",
  statusJobFailed: "Zadanie nieudane.",
  statusJobCanceled: "Zadanie anulowane.",
  statusAnswerReady: "Odpowiedź gotowa.",
  statusEditComplete: "Edycja zakończona.",
  statusQueuedAt: (n) =>
    `W kolejce, pozycja ${n}. Uruchomi się po zakończeniu bieżących zadań.`,

  pendingDrafting: "Przygotowuję Twoje żądanie.",
  pendingReading: "Czytam stronę i kod.",
  pendingAnswering: "Piszę odpowiedź.",

  composerEditTitle: "Żądanie edycji",
  composerChatTitle: "Wyślij pytanie",
  composerEditPlaceholder:
    "np. spraw, by przejście między zakładkami logowania / rejestracji było płynniejsze. Zachowaj istniejącą strukturę.",
  composerChatPlaceholder:
    "np. wyjaśnij, dlaczego ta strona zachowuje się w ten sposób. Wskaż pliki.",
  composerSendHint: "Ctrl/Cmd + Enter, aby wysłać",
  composerNotConfigured: "Sidecar nie jest jeszcze w pełni skonfigurowany.",
  composerSubmitSend: "Wyślij",
  composerSubmitRun: "Uruchom",
  composerSubmitSending: "Wysyłanie\u2026",
  composerCancelLabel: "Anuluj",

  modeAsk: "Zapytaj",
  modeEdit: "Edytuj",
  modeLockedTitle: "Tryb jest zablokowany, gdy zadanie jest w toku.",

  toggleOpen: "Otwórz Pyanchor DevTools",
  toggleClose: "Zamknij Pyanchor DevTools",
  toggleTitle: "Zadaj pytanie o bieżącą stronę lub poproś o zmianę",

  toastAnswerReceived: "Odpowiedź otrzymana.",
  toastEditComplete: "Edycja zakończona.",
  toastQuestionSent: "Pytanie wysłane.",
  toastEditStarted: "Edycja rozpoczęta.",
  toastCancelSent: "Żądanie anulowania wysłane.",
  toastCancelFailed: "Żądanie anulowania nieudane.",
  toastRequestCanceled: "Żądanie anulowane.",
  toastFailedToStart: "Nie udało się uruchomić żądania.",

  messagesEmpty:
    "Zadaj pytanie lub poproś o zmianę. Historia rozmowy pojawi się tutaj.",
  roleYou: "Ty",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Środowisko Pyanchor devtools nie jest skonfigurowane.",

  composerHeadlineChat: "Zapytaj / Wyjaśnij",
  composerHeadlineEdit: "Edytuj stronę",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Bieżąca strona",
  statusYourPosition: (n) => `Twoje żądanie: pozycja ${n}`,

  errorRequestFailed: "Żądanie nieudane.",
  errorJobFailed: "Zadanie nieudane.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + ., aby przełączyć",
  retryLast: "Powtórz ostatnie żądanie",
  copyLast: "Kopiuj",
  toastCopied: "Skopiowano do schowka.",
  toastCopyFailed: "Kopiowanie nieudane.",

  diagnosticsTitle: "Diagnostyka",
  diagRuntime: "Runtime",
  diagLocale: "Język",
  diagAuth: "Auth",
  diagStatus: "Status",
  diagJobId: "ID zadania",
  diagMode: "Tryb",
  diagQueue: "Kolejka",
  diagLastUpdate: "Ostatnia aktualizacja",
  diagAuthCookie: "sesja cookie",
  diagAuthBearer: "token Bearer"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("pl", plStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "pl", bundle: plStrings });
  }
}
