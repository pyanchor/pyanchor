/**
 * Brazilian Portuguese locale bundle for the overlay.
 *
 * Same self-registration pattern as the v0.11.0 ko / ja / zh-cn
 * bundles: pushes onto `window.__PyanchorPendingLocales` at module
 * load. Bootstrap auto-injects this script before the overlay when
 * `data-pyanchor-locale="pt-br"` is set.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const ptBRStrings: Partial<StringTable> = {
  statusReadingChat: "Lendo sua pergunta.",
  statusReadingEdit: "Lendo a página e o código.",
  statusJobFailed: "Job falhou.",
  statusJobCanceled: "Job cancelado.",
  statusAnswerReady: "Resposta pronta.",
  statusEditComplete: "Edição concluída.",
  statusQueuedAt: (n) =>
    `Na fila, posição ${n}. Será executado após o término dos jobs atuais.`,

  pendingDrafting: "Preparando sua solicitação.",
  pendingReading: "Lendo página e código.",
  pendingAnswering: "Redigindo resposta.",

  composerEditTitle: "Solicitação de edição",
  composerChatTitle: "Enviar uma pergunta",
  composerEditPlaceholder:
    "ex.: melhore a transição entre as abas de login / cadastro. Mantenha a estrutura atual.",
  composerChatPlaceholder:
    "ex.: explique por que esta página se comporta assim. Cite os arquivos.",
  composerSendHint: "Ctrl/Cmd + Enter para enviar",
  composerNotConfigured: "O sidecar ainda não está totalmente configurado.",
  composerSubmitSend: "Enviar",
  composerSubmitRun: "Executar",
  composerSubmitSending: "Enviando\u2026",
  composerCancelLabel: "Cancelar",

  modeAsk: "Perguntar",
  modeEdit: "Editar",
  modeLockedTitle: "O modo está bloqueado enquanto um job está em execução.",

  toggleOpen: "Abrir Pyanchor DevTools",
  toggleClose: "Fechar Pyanchor DevTools",
  toggleTitle: "Pergunte sobre a página atual ou solicite uma alteração",

  toastAnswerReceived: "Resposta recebida.",
  toastEditComplete: "Edição concluída.",
  toastQuestionSent: "Pergunta enviada.",
  toastEditStarted: "Edição iniciada.",
  toastCancelSent: "Solicitação de cancelamento enviada.",
  toastCancelFailed: "Falha na solicitação de cancelamento.",
  toastRequestCanceled: "Solicitação cancelada.",
  toastFailedToStart: "Falha ao iniciar a solicitação.",

  messagesEmpty:
    "Faça uma pergunta ou solicite uma alteração. O histórico aparecerá aqui.",
  roleYou: "Você",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "O runtime do Pyanchor devtools não está configurado.",

  composerHeadlineChat: "Perguntar / Explicar",
  composerHeadlineEdit: "Editar página",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Página atual",
  statusYourPosition: (n) => `Sua solicitação: posição ${n}`,

  errorRequestFailed: "Solicitação falhou.",
  errorJobFailed: "Job falhou.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . para alternar",
  retryLast: "Repetir última solicitação",
  copyLast: "Copiar",
  toastCopied: "Copiado para a área de transferência.",
  toastCopyFailed: "Falha ao copiar.",

  diagnosticsTitle: "Diagnóstico",
  diagRuntime: "Runtime",
  diagLocale: "Idioma",
  diagAuth: "Auth",
  diagStatus: "Status",
  diagJobId: "ID do job",
  diagMode: "Modo",
  diagQueue: "Fila",
  diagLastUpdate: "Última atualização",
  diagAuthCookie: "sessão de cookie",
  diagAuthBearer: "token bearer"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("pt-br", ptBRStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "pt-br", bundle: ptBRStrings });
  }
}
