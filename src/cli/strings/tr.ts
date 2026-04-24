/** Turkish CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "başarısız",
  "common.warn": "uyarı",

  "doctor.title": "pyanchor doctor — yerel yapılandırma teşhisi",
  "doctor.subtitle":
    "(sidecar'ı başlatmaz; sadece neyi gözlemleyeceğini denetler)",
  "doctor.dotenv.loaded": "yüklendi: {files} (cwd dotenv otomatik yükleme)",
  "doctor.group.required": "Gerekli ortam değişkenleri",
  "doctor.group.fs": "Dosya sistemi",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Çıktı modu: {mode}",
  "doctor.group.optional": "Opsiyonel ayarlar",
  "doctor.summary.allOk":
    "Tüm gerekli kontroller geçti ({passed}/{total} ok{warnSuffix}). `pyanchor` çalıştırılmaya hazır.",
  "doctor.summary.failed":
    "{failed} kontrol başarısız, {warned} uyarı, {passed} geçti (toplam {total}). Yukarıdaki ✗ öğelerini düzeltip `pyanchor doctor`'ı tekrar çalıştırın.",
  "doctor.summary.warnSuffix": ", {warned} uyarı",
  "doctor.summary.accessControlHint":
    "Erişim kontrolü yapılandırması (gate cookie, allowed origins, HMAC actor, üretim ayarları) için docs/ACCESS-CONTROL.md'ye bakın.",

  "init.title": "pyanchor init — etkileşimli scaffolder",
  "init.detected": "  algılandı: {summary}",
  "init.error.noPackageJson":
    "\nBu dizinde package.json yok. init'i uygulamanızın root'undan çalıştırın.",
  "init.prompt.agent": "Hangi agent'ı kullanmak istiyorsunuz?",
  "init.prompt.workspaceDir":
    "Workspace dizini (sync-back öncesi agent'ın düzenlediği scratch alanı)",
  "init.prompt.restartApproach":
    "Restart yöntemi (başarılı düzenlemeden sonra frontend nasıl yeniden yüklenir?)",
  "init.prompt.pm2Name": "pm2 süreç adı",
  "init.prompt.systemctlUnit": "systemd unit adı",
  "init.prompt.dockerContainer": "docker konteyner adı",
  "init.prompt.port": "Sidecar port",
  "init.prompt.portBusy":
    "Sidecar port ({preferred} meşgul — {suggested} öneriliyor)",
  "init.prompt.healthcheckUrl":
    "Healthcheck URL (frontend yeniden ayağa kalktığında 2xx döndürür)",
  "init.prompt.requireGate":
    "Üretim gate cookie'si etkinleştirilsin mi? (localhost dışında önerilir)",
  "init.prompt.outputMode": "Çıktı modu",
  "init.prompt.confirmApply": "Bu değişiklikler uygulansın mı?",
  "init.tokenReused":
    "  ({envFile} içindeki mevcut PYANCHOR_TOKEN yeniden kullanılıyor — aşağıdaki bootstrap snippet'i diskle eşleşiyor)",
  "init.plan.header": "Plan:",
  "init.dryRun": "(dry run — dosya yazılmıyor)",
  "init.dryRun.nextSteps": "Şu adımlar gerçekleştirilecekti:",
  "init.aborted": "İptal edildi — dosya yazılmadı.",
  "init.done.header":
    "Tamamlandı. Sonraki adımlar (kaynak dosyaları otomatik patch'lemiyoruz — çok riskli):",
  "init.done.quickCheck":
    "Hızlı kontrol (yeni yazılan .env'i otomatik yükler):",
  "init.done.startSidecar": "Sonra sidecar'ı başlatın:",
  "init.done.prodHint":
    "  # (Üretim: aynı değişkenleri systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env vb. ile enjekte edin)",
  "init.claudeCode.note":
    "\n  not: claude-code bir in-process SDK (@anthropic-ai/claude-agent-sdk) kullanır,\n       binary değil. init'ten sonra ek olarak çalıştırın:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # veya Claude OAuth flow'u\n       Biri eksikse `pyanchor doctor` uyarır.",
  "init.forceWarning.intro":
    "\n⚠️  --force etkin. PYANCHOR_TOKEN yeniden oluşturulacak.",
  "init.forceWarning.update":
    "    bootstrap script tag'inizdeki data-pyanchor-token'ı aşağıdaki yeni değerle güncelleyin,",
  "init.forceWarning.401":
    "    aksi takdirde overlay'iniz her API çağrısında 401 alacak.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log {path} konumunda bulunamadı. Yazmaya başlamak için PYANCHOR_AUDIT_LOG=true ayarlayın.",

  "agentTest.title": "pyanchor agent test — adapter tek seferlik ping",
  "agentTest.summary.ok":
    "agent {agent} {ms}ms içinde yanıt verdi. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} düzgün yanıt vermedi. Yukarıdaki çıktıya bakın."
};
