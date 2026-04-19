/**
 * Simplified Chinese locale bundle for the overlay (v0.10.0;
 * module-split in v0.11.0).
 *
 * Tone: direct + concise, half-width punctuation in technical
 * contexts (e.g. "Cmd/Ctrl + Shift + ."), full-width in sentence
 * flow (e.g. "你的请求：第 N 位"). Brand "Pyanchor" / "DevTools"
 * left as-is.
 *
 * Loaded on demand by bootstrap when `data-pyanchor-locale="zh-cn"`
 * is set.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
  }
}

export const zhCNStrings: Partial<StringTable> = {
  statusReadingChat: "正在阅读问题。",
  statusReadingEdit: "正在阅读页面和代码。",
  statusJobFailed: "任务失败。",
  statusJobCanceled: "任务已取消。",
  statusAnswerReady: "回答已就绪。",
  statusEditComplete: "编辑完成。",
  statusQueuedAt: (n) => `队列第 ${n} 位。当前任务结束后开始执行。`,

  pendingDrafting: "正在整理请求。",
  pendingReading: "正在阅读页面和代码。",
  pendingAnswering: "正在撰写回答。",

  composerEditTitle: "编辑请求",
  composerChatTitle: "发送问题",
  composerEditPlaceholder:
    "示例：让登录/注册标签页切换更流畅。保留现有结构。",
  composerChatPlaceholder:
    "示例：解释为什么这个页面会这样表现。引用文件路径。",
  composerSendHint: "Ctrl/Cmd + Enter 发送",
  composerNotConfigured: "Sidecar 尚未完全配置。",
  composerSubmitSend: "发送",
  composerSubmitRun: "执行",
  composerSubmitSending: "发送中\u2026",
  composerCancelLabel: "取消",

  modeAsk: "提问",
  modeEdit: "编辑",
  modeLockedTitle: "任务进行中无法切换模式。",

  toggleOpen: "打开 Pyanchor DevTools",
  toggleClose: "关闭 Pyanchor DevTools",
  toggleTitle: "对当前页面提问或请求更改",

  toastAnswerReceived: "已收到回答。",
  toastEditComplete: "编辑已完成。",
  toastQuestionSent: "问题已发送。",
  toastEditStarted: "编辑已开始。",
  toastCancelSent: "已发送取消请求。",
  toastCancelFailed: "取消请求失败。",
  toastRequestCanceled: "请求已取消。",
  toastFailedToStart: "请求启动失败。",

  messagesEmpty: "提问或请求更改后，对话历史将显示在这里。",
  roleYou: "你",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools 运行时未配置。",

  composerHeadlineChat: "提问 / 解释",
  composerHeadlineEdit: "编辑页面",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "当前页面",
  statusYourPosition: (n) => `你的请求：第 ${n} 位`,

  errorRequestFailed: "请求失败。",
  errorJobFailed: "任务失败。",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . 切换",
  retryLast: "重试上次请求",
  copyLast: "复制",
  toastCopied: "已复制到剪贴板。",
  toastCopyFailed: "复制失败。",

  diagnosticsTitle: "诊断",
  diagRuntime: "运行时",
  diagLocale: "区域",
  diagAuth: "认证",
  diagStatus: "状态",
  diagJobId: "任务 ID",
  diagMode: "模式",
  diagQueue: "队列",
  diagLastUpdate: "最近更新",
  diagAuthCookie: "Cookie 会话",
  diagAuthBearer: "Bearer 令牌"
};

if (typeof window !== "undefined") {
  (window.__PyanchorPendingLocales ||= []).push({ locale: "zh-cn", bundle: zhCNStrings });
}
