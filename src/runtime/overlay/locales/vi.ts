/**
 * Vietnamese locale bundle for the overlay.
 *
 * Same self-registration pattern as the v0.11.0 ko / ja / zh-cn
 * bundles: pushes onto `window.__PyanchorPendingLocales` at module
 * load. Bootstrap auto-injects this script before the overlay when
 * `data-pyanchor-locale="vi"` is set.
 */

import type { StringTable } from "../strings";

declare global {
  interface Window {
    __PyanchorPendingLocales?: Array<{ locale: string; bundle: Partial<StringTable> }>;
  }
}

export const viStrings: Partial<StringTable> = {
  statusReadingChat: "Đang đọc câu hỏi của bạn.",
  statusReadingEdit: "Đang đọc trang và mã nguồn.",
  statusJobFailed: "Tác vụ thất bại.",
  statusJobCanceled: "Tác vụ đã hủy.",
  statusAnswerReady: "Câu trả lời đã sẵn sàng.",
  statusEditComplete: "Đã chỉnh sửa xong.",
  statusQueuedAt: (n) =>
    `Đang xếp hàng, vị trí ${n}. Sẽ chạy sau khi các tác vụ hiện tại hoàn thành.`,

  pendingDrafting: "Đang chuẩn bị yêu cầu của bạn.",
  pendingReading: "Đang đọc trang và mã nguồn.",
  pendingAnswering: "Đang soạn câu trả lời.",

  composerEditTitle: "Yêu cầu chỉnh sửa",
  composerChatTitle: "Gửi câu hỏi",
  composerEditPlaceholder:
    "ví dụ: làm chuyển tab đăng nhập / đăng ký mượt hơn. Giữ nguyên cấu trúc hiện có.",
  composerChatPlaceholder:
    "ví dụ: giải thích tại sao trang này hoạt động như vậy. Trích dẫn các tệp.",
  composerSendHint: "Ctrl/Cmd + Enter để gửi",
  composerNotConfigured: "Sidecar chưa được cấu hình đầy đủ.",
  composerSubmitSend: "Gửi",
  composerSubmitRun: "Chạy",
  composerSubmitSending: "Đang gửi\u2026",
  composerCancelLabel: "Hủy",

  modeAsk: "Hỏi",
  modeEdit: "Sửa",
  modeLockedTitle: "Chế độ bị khóa khi đang có tác vụ chạy.",

  toggleOpen: "Mở Pyanchor DevTools",
  toggleClose: "Đóng Pyanchor DevTools",
  toggleTitle: "Hỏi về trang hiện tại hoặc yêu cầu thay đổi",

  toastAnswerReceived: "Đã nhận câu trả lời.",
  toastEditComplete: "Đã chỉnh sửa xong.",
  toastQuestionSent: "Đã gửi câu hỏi.",
  toastEditStarted: "Đã bắt đầu chỉnh sửa.",
  toastCancelSent: "Đã gửi yêu cầu hủy.",
  toastCancelFailed: "Yêu cầu hủy thất bại.",
  toastRequestCanceled: "Yêu cầu đã hủy.",
  toastFailedToStart: "Không thể bắt đầu yêu cầu.",

  messagesEmpty:
    "Đặt câu hỏi hoặc yêu cầu thay đổi. Lịch sử hội thoại sẽ hiển thị ở đây.",
  roleYou: "Bạn",
  rolePyanchor: "Pyanchor",

  errorRuntimeNotConfigured: "Runtime Pyanchor devtools chưa được cấu hình.",

  composerHeadlineChat: "Hỏi / Giải thích",
  composerHeadlineEdit: "Sửa trang",

  panelTitle: "Pyanchor DevTools",
  panelContextLabel: "Trang hiện tại",
  statusYourPosition: (n) => `Yêu cầu của bạn: vị trí ${n}`,

  errorRequestFailed: "Yêu cầu thất bại.",
  errorJobFailed: "Tác vụ thất bại.",

  kbdShortcutHint: "Cmd/Ctrl + Shift + . để mở/đóng",
  retryLast: "Thử lại yêu cầu cuối",
  copyLast: "Sao chép",
  toastCopied: "Đã sao chép vào bộ nhớ tạm.",
  toastCopyFailed: "Sao chép thất bại.",

  diagnosticsTitle: "Chẩn đoán",
  diagRuntime: "Runtime",
  diagLocale: "Ngôn ngữ",
  diagAuth: "Auth",
  diagStatus: "Trạng thái",
  diagJobId: "ID tác vụ",
  diagMode: "Chế độ",
  diagQueue: "Hàng đợi",
  diagLastUpdate: "Cập nhật cuối",
  diagAuthCookie: "phiên cookie",
  diagAuthBearer: "token bearer"
};

if (typeof window !== "undefined") {
  (window.__PyanchorPendingLocales ||= []).push({ locale: "vi", bundle: viStrings });
}
