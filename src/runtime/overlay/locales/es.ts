/**
 * Spanish locale bundle for the overlay (Latin-neutral / Castilian).
 *
 * Same self-registration pattern as the v0.11.0 ko / ja / zh-cn
 * bundles: pushes onto `window.__PyanchorPendingLocales` at module
 * load. Bootstrap auto-injects this script before the overlay when
 * `data-pyanchor-locale="es"` is set.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const esStrings: Partial<StringTable> = {
  statusReadingChat: "Leyendo tu pregunta.",
  statusReadingEdit: "Leyendo la página y el código.",
  statusJobFailed: "El trabajo falló.",
  statusJobCanceled: "Trabajo cancelado.",
  statusAnswerReady: "Respuesta lista.",
  statusEditComplete: "Edición completa.",
  statusQueuedAt: (n) =>
    `En cola, posición ${n}. Se ejecutará cuando terminen los trabajos actuales.`,

  pendingDrafting: "Preparando tu solicitud.",
  pendingReading: "Leyendo página y código.",
  pendingAnswering: "Redactando respuesta.",

  composerEditTitle: "Solicitud de edición",
  composerChatTitle: "Enviar una pregunta",
  composerEditPlaceholder:
    "ej. mejora la transición entre las pestañas de inicio de sesión / registro. Mantén la estructura existente.",
  composerChatPlaceholder:
    "ej. explica por qué esta página se comporta así. Cita los archivos.",
  composerSendHint: "Ctrl/Cmd + Enter para enviar",
  composerNotConfigured: "El sidecar aún no está completamente configurado.",
  composerSubmitSend: "Enviar",
  composerSubmitRun: "Ejecutar",
  composerSubmitSending: "Enviando\u2026",
  composerCancelLabel: "Cancelar",

  modeAsk: "Preguntar",
  modeEdit: "Editar",
  modeLockedTitle: "El modo está bloqueado mientras hay un trabajo en curso.",

  toggleOpen: "Abrir Pyanchor DevTools",
  toggleClose: "Cerrar Pyanchor DevTools",
  toggleTitle: "Pregunta sobre la página actual o solicita un cambio",

  toastAnswerReceived: "Respuesta recibida.",
  toastEditComplete: "Edición completa.",
  toastQuestionSent: "Pregunta enviada.",
  toastEditStarted: "Edición iniciada.",
  toastCancelSent: "Solicitud de cancelación enviada.",
  toastCancelFailed: "Falló la solicitud de cancelación.",
  toastRequestCanceled: "Solicitud cancelada.",
  toastFailedToStart: "No se pudo iniciar la solicitud.",

  messagesEmpty:
    "Haz una pregunta o solicita un cambio. El historial de la conversación aparecerá aquí.",
  roleYou: "Tú",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "El runtime de Pyanchor devtools no está configurado.",

  composerHeadlineChat: "Preguntar / Explicar",
  composerHeadlineEdit: "Editar página",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Página actual",
  statusYourPosition: (n) => `Tu solicitud: posición ${n}`,

  errorRequestFailed: "La solicitud falló.",
  errorJobFailed: "El trabajo falló.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . para alternar",
  retryLast: "Reintentar la última solicitud",
  copyLast: "Copiar",
  toastCopied: "Copiado al portapapeles.",
  toastCopyFailed: "Falló la copia.",

  diagnosticsTitle: "Diagnóstico",
  diagRuntime: "Runtime",
  diagLocale: "Idioma",
  diagAuth: "Auth",
  diagStatus: "Estado",
  diagJobId: "ID de trabajo",
  diagMode: "Modo",
  diagQueue: "Cola",
  diagLastUpdate: "Última actualización",
  diagAuthCookie: "sesión por cookie",
  diagAuthBearer: "token bearer"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("es", esStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "es", bundle: esStrings });
  }
}
