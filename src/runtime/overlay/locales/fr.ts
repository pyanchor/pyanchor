/**
 * French locale bundle for the overlay.
 *
 * Same self-registration pattern as the v0.11.0 ko / ja / zh-cn
 * bundles: pushes onto `window.__PyanchorPendingLocales` at module
 * load. Bootstrap auto-injects this script before the overlay when
 * `data-pyanchor-locale="fr"` is set.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
  }
}

export const frStrings: Partial<StringTable> = {
  statusReadingChat: "Lecture de votre question.",
  statusReadingEdit: "Lecture de la page et du code.",
  statusJobFailed: "Échec de la tâche.",
  statusJobCanceled: "Tâche annulée.",
  statusAnswerReady: "Réponse prête.",
  statusEditComplete: "Édition terminée.",
  statusQueuedAt: (n) =>
    `En file d'attente, position ${n}. S'exécutera après les tâches en cours.`,

  pendingDrafting: "Préparation de votre demande.",
  pendingReading: "Lecture de la page et du code.",
  pendingAnswering: "Rédaction de la réponse.",

  composerEditTitle: "Demande d'édition",
  composerChatTitle: "Envoyer une question",
  composerEditPlaceholder:
    "ex. : améliore la transition entre les onglets connexion / inscription. Conserve la structure existante.",
  composerChatPlaceholder:
    "ex. : explique pourquoi cette page se comporte ainsi. Cite les fichiers.",
  composerSendHint: "Ctrl/Cmd + Entrée pour envoyer",
  composerNotConfigured: "Le sidecar n'est pas encore entièrement configuré.",
  composerSubmitSend: "Envoyer",
  composerSubmitRun: "Exécuter",
  composerSubmitSending: "Envoi\u2026",
  composerCancelLabel: "Annuler",

  modeAsk: "Demander",
  modeEdit: "Éditer",
  modeLockedTitle: "Le mode est verrouillé pendant qu'une tâche est en cours.",

  toggleOpen: "Ouvrir Pyanchor DevTools",
  toggleClose: "Fermer Pyanchor DevTools",
  toggleTitle: "Posez une question sur la page actuelle ou demandez une modification",

  toastAnswerReceived: "Réponse reçue.",
  toastEditComplete: "Édition terminée.",
  toastQuestionSent: "Question envoyée.",
  toastEditStarted: "Édition lancée.",
  toastCancelSent: "Demande d'annulation envoyée.",
  toastCancelFailed: "Échec de la demande d'annulation.",
  toastRequestCanceled: "Demande annulée.",
  toastFailedToStart: "Impossible de démarrer la demande.",

  messagesEmpty:
    "Posez une question ou demandez une modification. L'historique apparaîtra ici.",
  roleYou: "Vous",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Le runtime Pyanchor devtools n'est pas configuré.",

  composerHeadlineChat: "Demander / Expliquer",
  composerHeadlineEdit: "Éditer la page",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Page actuelle",
  statusYourPosition: (n) => `Votre demande : position ${n}`,

  errorRequestFailed: "Échec de la demande.",
  errorJobFailed: "Échec de la tâche.",

  kbdShortcutHint: "Cmd/Ctrl + Maj + . pour basculer",
  retryLast: "Réessayer la dernière demande",
  copyLast: "Copier",
  toastCopied: "Copié dans le presse-papiers.",
  toastCopyFailed: "Échec de la copie.",

  diagnosticsTitle: "Diagnostic",
  diagRuntime: "Runtime",
  diagLocale: "Langue",
  diagAuth: "Auth",
  diagStatus: "Statut",
  diagJobId: "ID de tâche",
  diagMode: "Mode",
  diagQueue: "File",
  diagLastUpdate: "Dernière mise à jour",
  diagAuthCookie: "session cookie",
  diagAuthBearer: "jeton bearer"
};

if (typeof window !== "undefined") {
  (window.__PyanchorPendingLocales ||= []).push({ locale: "fr", bundle: frStrings });
}
