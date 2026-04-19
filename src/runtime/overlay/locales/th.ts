/**
 * Thai locale bundle for the overlay.
 *
 * Tone: concise, no trailing periods (Thai writing convention).
 * Same self-registration pattern as the v0.11.0 / v0.12.0 bundles.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const thStrings: Partial<StringTable> = {
  statusReadingChat: "กำลังอ่านคำถามของคุณ",
  statusReadingEdit: "กำลังอ่านหน้าและโค้ด",
  statusJobFailed: "งานล้มเหลว",
  statusJobCanceled: "งานถูกยกเลิก",
  statusAnswerReady: "คำตอบพร้อมแล้ว",
  statusEditComplete: "แก้ไขเสร็จแล้ว",
  statusQueuedAt: (n) =>
    `อยู่ในคิว ตำแหน่งที่ ${n} จะทำงานหลังจากงานปัจจุบันเสร็จ`,

  pendingDrafting: "กำลังเตรียมคำขอของคุณ",
  pendingReading: "กำลังอ่านหน้าและโค้ด",
  pendingAnswering: "กำลังร่างคำตอบ",

  composerEditTitle: "คำขอแก้ไข",
  composerChatTitle: "ส่งคำถาม",
  composerEditPlaceholder:
    "เช่น ทำให้การเปลี่ยนแท็บล็อกอิน / สมัครนุ่มนวลขึ้น คงโครงสร้างเดิมไว้",
  composerChatPlaceholder:
    "เช่น อธิบายว่าทำไมหน้านี้ทำงานแบบนี้ อ้างอิงไฟล์",
  composerSendHint: "Ctrl/Cmd + Enter เพื่อส่ง",
  composerNotConfigured: "Sidecar ยังตั้งค่าไม่ครบ",
  composerSubmitSend: "ส่ง",
  composerSubmitRun: "เรียกใช้",
  composerSubmitSending: "กำลังส่ง\u2026",
  composerCancelLabel: "ยกเลิก",

  modeAsk: "ถาม",
  modeEdit: "แก้ไข",
  modeLockedTitle: "โหมดถูกล็อกขณะมีงานทำงานอยู่",

  toggleOpen: "เปิด Pyanchor DevTools",
  toggleClose: "ปิด Pyanchor DevTools",
  toggleTitle: "ถามเกี่ยวกับหน้าปัจจุบันหรือขอให้แก้ไข",

  toastAnswerReceived: "ได้รับคำตอบแล้ว",
  toastEditComplete: "แก้ไขเสร็จแล้ว",
  toastQuestionSent: "ส่งคำถามแล้ว",
  toastEditStarted: "เริ่มแก้ไขแล้ว",
  toastCancelSent: "ส่งคำขอยกเลิกแล้ว",
  toastCancelFailed: "คำขอยกเลิกล้มเหลว",
  toastRequestCanceled: "ยกเลิกคำขอแล้ว",
  toastFailedToStart: "เริ่มคำขอไม่สำเร็จ",

  messagesEmpty:
    "ถามคำถามหรือขอให้แก้ไข ประวัติการสนทนาจะแสดงที่นี่",
  roleYou: "คุณ",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools runtime ยังไม่ได้ตั้งค่า",

  composerHeadlineChat: "ถาม / อธิบาย",
  composerHeadlineEdit: "แก้ไขหน้า",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "หน้าปัจจุบัน",
  statusYourPosition: (n) => `คำขอของคุณ: ตำแหน่งที่ ${n}`,

  errorRequestFailed: "คำขอล้มเหลว",
  errorJobFailed: "งานล้มเหลว",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . เพื่อเปิด/ปิด",
  retryLast: "ลองคำขอล่าสุดอีกครั้ง",
  copyLast: "คัดลอก",
  toastCopied: "คัดลอกไปยังคลิปบอร์ดแล้ว",
  toastCopyFailed: "คัดลอกล้มเหลว",

  diagnosticsTitle: "การวินิจฉัย",
  diagRuntime: "Runtime",
  diagLocale: "ภาษา",
  diagAuth: "Auth",
  diagStatus: "สถานะ",
  diagJobId: "Job ID",
  diagMode: "โหมด",
  diagQueue: "คิว",
  diagLastUpdate: "อัปเดตล่าสุด",
  diagAuthCookie: "session cookie",
  diagAuthBearer: "Bearer token"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("th", thStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "th", bundle: thStrings });
  }
}
