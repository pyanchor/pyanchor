/**
 * Russian locale bundle for the overlay.
 *
 * Same self-registration pattern as the v0.11.0 / v0.12.0 bundles:
 * if `__PyanchorRegisterStrings` is exposed (overlay already booted),
 * call it directly; otherwise push onto `__PyanchorPendingLocales`
 * for the overlay to drain at boot.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const ruStrings: Partial<StringTable> = {
  statusReadingChat: "Читаю ваш вопрос.",
  statusReadingEdit: "Читаю страницу и код.",
  statusJobFailed: "Задача не выполнена.",
  statusJobCanceled: "Задача отменена.",
  statusAnswerReady: "Ответ готов.",
  statusEditComplete: "Редактирование завершено.",
  statusQueuedAt: (n) =>
    `В очереди, позиция ${n}. Запустится после завершения текущих задач.`,

  pendingDrafting: "Готовлю ваш запрос.",
  pendingReading: "Читаю страницу и код.",
  pendingAnswering: "Составляю ответ.",

  composerEditTitle: "Запрос на редактирование",
  composerChatTitle: "Задать вопрос",
  composerEditPlaceholder:
    "напр. сделайте переход между вкладками входа / регистрации плавнее. Сохраните существующую структуру.",
  composerChatPlaceholder:
    "напр. объясните, почему эта страница так себя ведёт. Укажите файлы.",
  composerSendHint: "Ctrl/Cmd + Enter — отправить",
  composerNotConfigured: "Сайдкар ещё не полностью настроен.",
  composerSubmitSend: "Отправить",
  composerSubmitRun: "Выполнить",
  composerSubmitSending: "Отправка\u2026",
  composerCancelLabel: "Отмена",

  modeAsk: "Спросить",
  modeEdit: "Изменить",
  modeLockedTitle: "Режим заблокирован, пока выполняется задача.",

  toggleOpen: "Открыть Pyanchor DevTools",
  toggleClose: "Закрыть Pyanchor DevTools",
  toggleTitle: "Спросите про текущую страницу или запросите изменение",

  toastAnswerReceived: "Ответ получен.",
  toastEditComplete: "Редактирование завершено.",
  toastQuestionSent: "Вопрос отправлен.",
  toastEditStarted: "Редактирование начато.",
  toastCancelSent: "Запрос на отмену отправлен.",
  toastCancelFailed: "Не удалось отменить запрос.",
  toastRequestCanceled: "Запрос отменён.",
  toastFailedToStart: "Не удалось запустить запрос.",

  messagesEmpty:
    "Задайте вопрос или запросите изменение. История разговора появится здесь.",
  roleYou: "Вы",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Среда выполнения Pyanchor devtools не настроена.",

  composerHeadlineChat: "Спросить / Объяснить",
  composerHeadlineEdit: "Изменить страницу",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Текущая страница",
  statusYourPosition: (n) => `Ваш запрос: позиция ${n}`,

  errorRequestFailed: "Запрос не выполнен.",
  errorJobFailed: "Задача не выполнена.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . — переключить",
  retryLast: "Повторить последний запрос",
  copyLast: "Копировать",
  toastCopied: "Скопировано в буфер обмена.",
  toastCopyFailed: "Не удалось скопировать.",

  diagnosticsTitle: "Диагностика",
  diagRuntime: "Runtime",
  diagLocale: "Язык",
  diagAuth: "Auth",
  diagStatus: "Статус",
  diagJobId: "ID задачи",
  diagMode: "Режим",
  diagQueue: "Очередь",
  diagLastUpdate: "Последнее обновление",
  diagAuthCookie: "сессия по cookie",
  diagAuthBearer: "Bearer-токен"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("ru", ruStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "ru", bundle: ruStrings });
  }
}
