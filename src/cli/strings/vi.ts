/** Vietnamese CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "thất bại",
  "common.warn": "cảnh báo",

  "doctor.title": "pyanchor doctor — chẩn đoán cấu hình cục bộ",
  "doctor.subtitle":
    "(không khởi động sidecar; chỉ kiểm tra những gì nó sẽ thấy)",
  "doctor.dotenv.loaded": "đã tải: {files} (cwd dotenv autoload)",
  "doctor.group.required": "Biến môi trường bắt buộc",
  "doctor.group.fs": "Hệ thống tệp",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Chế độ output: {mode}",
  "doctor.group.optional": "Tùy chọn",
  "doctor.summary.allOk":
    "Tất cả kiểm tra bắt buộc đều qua ({passed}/{total} ok{warnSuffix}). Sẵn sàng chạy `pyanchor`.",
  "doctor.summary.failed":
    "{failed} kiểm tra thất bại, {warned} cảnh báo, {passed} qua (tổng {total}). Sửa các mục ✗ ở trên và chạy lại `pyanchor doctor`.",
  "doctor.summary.warnSuffix": ", {warned} cảnh báo",
  "doctor.summary.accessControlHint":
    "Để cấu hình kiểm soát truy cập (gate cookie, allowed origins, HMAC actor, thiết lập production), xem docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — scaffolder tương tác",
  "init.detected": "  phát hiện: {summary}",
  "init.error.noPackageJson":
    "\nKhông có package.json trong thư mục này. Chạy init từ root của ứng dụng.",
  "init.prompt.agent": "Bạn muốn sử dụng agent nào?",
  "init.prompt.workspaceDir":
    "Thư mục workspace (không gian scratch mà agent chỉnh sửa trước khi sync-back)",
  "init.prompt.restartApproach":
    "Phương thức restart (làm thế nào để reload frontend sau khi chỉnh sửa thành công?)",
  "init.prompt.pm2Name": "tên process pm2",
  "init.prompt.systemctlUnit": "tên unit systemd",
  "init.prompt.dockerContainer": "tên container docker",
  "init.prompt.port": "Port của sidecar",
  "init.prompt.portBusy":
    "Port của sidecar ({preferred} đang bận — đề xuất {suggested})",
  "init.prompt.healthcheckUrl":
    "URL healthcheck (trả về 2xx khi frontend khởi động lại)",
  "init.prompt.requireGate":
    "Bật gate cookie production? (khuyến nghị ngoài localhost)",
  "init.prompt.outputMode": "Chế độ output",
  "init.prompt.confirmApply": "Áp dụng các thay đổi này?",
  "init.tokenReused":
    "  (sử dụng lại PYANCHOR_TOKEN hiện có từ {envFile} — bootstrap snippet bên dưới khớp với đĩa)",
  "init.plan.header": "Kế hoạch:",
  "init.dryRun": "(dry run — không file nào được ghi)",
  "init.dryRun.nextSteps": "Các bước sau sẽ được thực hiện:",
  "init.aborted": "Đã hủy — không file nào được ghi.",
  "init.done.header":
    "Hoàn tất. Bước tiếp theo (chúng tôi không tự động patch file nguồn — quá rủi ro):",
  "init.done.quickCheck":
    "Kiểm tra nhanh (tự động tải .env vừa ghi):",
  "init.done.startSidecar": "Sau đó khởi động sidecar:",
  "init.done.prodHint":
    "  # (Production: inject các vars tương tự qua systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env, v.v.)",
  "init.claudeCode.note":
    "\n  lưu ý: claude-code dùng SDK in-process (@anthropic-ai/claude-agent-sdk),\n         không phải binary. Sau init, chạy thêm:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # hoặc dùng Claude OAuth flow\n         `pyanchor doctor` sẽ cảnh báo nếu thiếu cái nào.",
  "init.forceWarning.intro":
    "\n⚠️  --force đang bật. PYANCHOR_TOKEN sẽ được tạo lại.",
  "init.forceWarning.update":
    "    Cập nhật data-pyanchor-token trong tag bootstrap script với giá trị mới bên dưới,",
  "init.forceWarning.401":
    "    nếu không overlay sẽ nhận 401 trên mỗi cuộc gọi API.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "không tìm thấy audit log tại {path}. Đặt PYANCHOR_AUDIT_LOG=true để bắt đầu ghi.",

  "agentTest.title": "pyanchor agent test — ping đơn của adapter",
  "agentTest.summary.ok":
    "agent {agent} đã phản hồi trong {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} không phản hồi đúng. Xem output ở trên."
};
