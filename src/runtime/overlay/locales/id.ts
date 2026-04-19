/**
 * Indonesian locale bundle for the overlay.
 *
 * Same self-registration pattern as the v0.11.0 ko / ja / zh-cn
 * bundles: pushes onto `window.__PyanchorPendingLocales` at module
 * load. Bootstrap auto-injects this script before the overlay when
 * `data-pyanchor-locale="id"` is set.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
    __PyanchorRegisterStrings?: (locale: string, bundle: Partial<StringTable>) => void;
  }
}

export const idStrings: Partial<StringTable> = {
  statusReadingChat: "Membaca pertanyaan Anda.",
  statusReadingEdit: "Membaca halaman dan kode.",
  statusJobFailed: "Tugas gagal.",
  statusJobCanceled: "Tugas dibatalkan.",
  statusAnswerReady: "Jawaban siap.",
  statusEditComplete: "Pengeditan selesai.",
  statusQueuedAt: (n) =>
    `Dalam antrean, posisi ${n}. Akan dijalankan setelah tugas saat ini selesai.`,

  pendingDrafting: "Menyiapkan permintaan Anda.",
  pendingReading: "Membaca halaman dan kode.",
  pendingAnswering: "Menyusun jawaban.",

  composerEditTitle: "Permintaan edit",
  composerChatTitle: "Kirim pertanyaan",
  composerEditPlaceholder:
    "mis. perhalus transisi tab login / daftar. Pertahankan struktur yang ada.",
  composerChatPlaceholder:
    "mis. jelaskan mengapa halaman ini berperilaku seperti ini. Sebutkan file-nya.",
  composerSendHint: "Ctrl/Cmd + Enter untuk mengirim",
  composerNotConfigured: "Sidecar belum dikonfigurasi sepenuhnya.",
  composerSubmitSend: "Kirim",
  composerSubmitRun: "Jalankan",
  composerSubmitSending: "Mengirim\u2026",
  composerCancelLabel: "Batal",

  modeAsk: "Tanya",
  modeEdit: "Edit",
  modeLockedTitle: "Mode terkunci saat ada tugas berjalan.",

  toggleOpen: "Buka Pyanchor DevTools",
  toggleClose: "Tutup Pyanchor DevTools",
  toggleTitle: "Tanyakan tentang halaman saat ini atau minta perubahan",

  toastAnswerReceived: "Jawaban diterima.",
  toastEditComplete: "Pengeditan selesai.",
  toastQuestionSent: "Pertanyaan terkirim.",
  toastEditStarted: "Pengeditan dimulai.",
  toastCancelSent: "Permintaan pembatalan terkirim.",
  toastCancelFailed: "Permintaan pembatalan gagal.",
  toastRequestCanceled: "Permintaan dibatalkan.",
  toastFailedToStart: "Gagal memulai permintaan.",

  messagesEmpty:
    "Ajukan pertanyaan atau minta perubahan. Riwayat percakapan akan muncul di sini.",
  roleYou: "Anda",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Runtime Pyanchor devtools belum dikonfigurasi.",

  composerHeadlineChat: "Tanya / Jelaskan",
  composerHeadlineEdit: "Edit halaman",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Halaman saat ini",
  statusYourPosition: (n) => `Permintaan Anda: posisi ${n}`,

  errorRequestFailed: "Permintaan gagal.",
  errorJobFailed: "Tugas gagal.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . untuk membuka/menutup",
  retryLast: "Coba lagi permintaan terakhir",
  copyLast: "Salin",
  toastCopied: "Disalin ke clipboard.",
  toastCopyFailed: "Gagal menyalin.",

  diagnosticsTitle: "Diagnostik",
  diagRuntime: "Runtime",
  diagLocale: "Bahasa",
  diagAuth: "Auth",
  diagStatus: "Status",
  diagJobId: "ID tugas",
  diagMode: "Mode",
  diagQueue: "Antrean",
  diagLastUpdate: "Pembaruan terakhir",
  diagAuthCookie: "sesi cookie",
  diagAuthBearer: "token bearer"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("id", idStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "id", bundle: idStrings });
  }
}
