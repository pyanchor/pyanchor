/** Indonesian CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "gagal",
  "common.warn": "peringatan",

  "doctor.title": "pyanchor doctor — diagnosa konfigurasi lokal",
  "doctor.subtitle":
    "(tidak menjalankan sidecar; hanya memeriksa apa yang akan diamati)",
  "doctor.dotenv.loaded": "dimuat: {files} (cwd dotenv autoload)",
  "doctor.group.required": "Variabel lingkungan wajib",
  "doctor.group.fs": "Sistem berkas",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Mode output: {mode}",
  "doctor.group.optional": "Pengaturan opsional",
  "doctor.summary.allOk":
    "Semua pemeriksaan wajib lulus ({passed}/{total} ok{warnSuffix}). Siap menjalankan `pyanchor`.",
  "doctor.summary.failed":
    "{failed} pemeriksaan gagal, {warned} peringatan, {passed} lulus (total {total}). Perbaiki item ✗ di atas dan jalankan `pyanchor doctor` lagi.",
  "doctor.summary.warnSuffix": ", {warned} peringatan",
  "doctor.summary.accessControlHint":
    "Untuk konfigurasi kontrol akses (gate cookie, allowed origins, HMAC actor, pengaturan produksi), lihat docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — scaffolder interaktif",
  "init.detected": "  terdeteksi: {summary}",
  "init.error.noPackageJson":
    "\nTidak ada package.json di direktori ini. Jalankan init dari root aplikasi Anda.",
  "init.prompt.agent": "Agent mana yang ingin Anda gunakan?",
  "init.prompt.workspaceDir":
    "Direktori workspace (ruang scratch yang diedit agent sebelum sync-back)",
  "init.prompt.restartApproach":
    "Metode restart (bagaimana memuat ulang frontend setelah edit berhasil?)",
  "init.prompt.pm2Name": "nama proses pm2",
  "init.prompt.systemctlUnit": "nama unit systemd",
  "init.prompt.dockerContainer": "nama container docker",
  "init.prompt.port": "Port sidecar",
  "init.prompt.portBusy":
    "Port sidecar ({preferred} sibuk — disarankan {suggested})",
  "init.prompt.healthcheckUrl":
    "URL healthcheck (mengembalikan 2xx ketika frontend kembali aktif)",
  "init.prompt.requireGate":
    "Aktifkan gate cookie produksi? (disarankan di luar localhost)",
  "init.prompt.outputMode": "Mode output",
  "init.prompt.confirmApply": "Terapkan perubahan ini?",
  "init.tokenReused":
    "  (menggunakan kembali PYANCHOR_TOKEN yang ada dari {envFile} — bootstrap snippet di bawah cocok dengan disk)",
  "init.plan.header": "Rencana:",
  "init.dryRun": "(dry run — tidak ada file yang ditulis)",
  "init.dryRun.nextSteps": "Langkah berikut akan dijalankan:",
  "init.aborted": "Dibatalkan — tidak ada file yang ditulis.",
  "init.done.header":
    "Selesai. Langkah berikutnya (kami tidak melakukan patch otomatis pada file sumber — terlalu berisiko):",
  "init.done.quickCheck":
    "Pemeriksaan cepat (otomatis memuat .env yang baru ditulis):",
  "init.done.startSidecar": "Lalu jalankan sidecar:",
  "init.done.prodHint":
    "  # (Produksi: inject vars yang sama melalui systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env, dll.)",
  "init.claudeCode.note":
    "\n  catatan: claude-code menggunakan SDK in-process (@anthropic-ai/claude-agent-sdk),\n           bukan binary. Setelah init, jalankan juga:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # atau gunakan Claude OAuth flow\n           `pyanchor doctor` akan memperingatkan jika ada yang hilang.",
  "init.forceWarning.intro":
    "\n⚠️  --force aktif. PYANCHOR_TOKEN akan dibuat ulang.",
  "init.forceWarning.update":
    "    Perbarui data-pyanchor-token di tag bootstrap script Anda dengan nilai baru di bawah,",
  "init.forceWarning.401":
    "    jika tidak overlay Anda akan menerima 401 pada setiap panggilan API.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log tidak ditemukan di {path}. Setel PYANCHOR_AUDIT_LOG=true untuk mulai menulis.",

  "agentTest.title": "pyanchor agent test — ping tunggal adapter",
  "agentTest.summary.ok":
    "agent {agent} merespons dalam {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} tidak merespons dengan benar. Lihat output di atas."
};
