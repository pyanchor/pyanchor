/**
 * Turkish locale bundle for the overlay.
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

export const trStrings: Partial<StringTable> = {
  statusReadingChat: "Sorunuz okunuyor.",
  statusReadingEdit: "Sayfa ve kod okunuyor.",
  statusJobFailed: "İş başarısız.",
  statusJobCanceled: "İş iptal edildi.",
  statusAnswerReady: "Cevap hazır.",
  statusEditComplete: "Düzenleme tamamlandı.",
  statusQueuedAt: (n) =>
    `Kuyrukta, sıra ${n}. Mevcut işler bittikten sonra çalışacak.`,

  pendingDrafting: "İsteğiniz hazırlanıyor.",
  pendingReading: "Sayfa ve kod okunuyor.",
  pendingAnswering: "Cevap yazılıyor.",

  composerEditTitle: "Düzenleme isteği",
  composerChatTitle: "Soru gönder",
  composerEditPlaceholder:
    "ör. giriş / kayıt sekmeleri arasındaki geçişi daha akıcı yapın. Mevcut yapıyı koruyun.",
  composerChatPlaceholder:
    "ör. bu sayfanın neden böyle davrandığını açıklayın. Dosyaları kaynak gösterin.",
  composerSendHint: "Göndermek için Ctrl/Cmd + Enter",
  composerNotConfigured: "Sidecar henüz tam yapılandırılmadı.",
  composerSubmitSend: "Gönder",
  composerSubmitRun: "Çalıştır",
  composerSubmitSending: "Gönderiliyor\u2026",
  composerCancelLabel: "İptal",

  modeAsk: "Sor",
  modeEdit: "Düzenle",
  modeLockedTitle: "Bir iş çalışırken mod kilitlidir.",

  toggleOpen: "Pyanchor DevTools'u aç",
  toggleClose: "Pyanchor DevTools'u kapat",
  toggleTitle: "Mevcut sayfa hakkında soru sorun veya değişiklik isteyin",

  toastAnswerReceived: "Cevap alındı.",
  toastEditComplete: "Düzenleme tamamlandı.",
  toastQuestionSent: "Soru gönderildi.",
  toastEditStarted: "Düzenleme başladı.",
  toastCancelSent: "İptal isteği gönderildi.",
  toastCancelFailed: "İptal isteği başarısız.",
  toastRequestCanceled: "İstek iptal edildi.",
  toastFailedToStart: "İstek başlatılamadı.",

  messagesEmpty:
    "Bir soru sorun veya değişiklik isteyin. Sohbet geçmişi burada görünecek.",
  roleYou: "Siz",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Pyanchor devtools çalışma zamanı yapılandırılmadı.",

  composerHeadlineChat: "Sor / Açıkla",
  composerHeadlineEdit: "Sayfayı düzenle",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Mevcut sayfa",
  statusYourPosition: (n) => `İsteğiniz: sıra ${n}`,

  errorRequestFailed: "İstek başarısız.",
  errorJobFailed: "İş başarısız.",

  kbdShortcutHint: "Aç/kapat için Cmd/Ctrl + Shift + .",
  retryLast: "Son isteği tekrar dene",
  copyLast: "Kopyala",
  toastCopied: "Panoya kopyalandı.",
  toastCopyFailed: "Kopyalama başarısız.",

  diagnosticsTitle: "Tanılama",
  diagRuntime: "Runtime",
  diagLocale: "Dil",
  diagAuth: "Auth",
  diagStatus: "Durum",
  diagJobId: "İş ID",
  diagMode: "Mod",
  diagQueue: "Kuyruk",
  diagLastUpdate: "Son güncelleme",
  diagAuthCookie: "cookie oturumu",
  diagAuthBearer: "Bearer token"
};

if (typeof window !== "undefined") {
  if (typeof window.__PyanchorRegisterStrings === "function") {
    window.__PyanchorRegisterStrings("tr", trStrings);
  } else {
    (window.__PyanchorPendingLocales ||= []).push({ locale: "tr", bundle: trStrings });
  }
}
