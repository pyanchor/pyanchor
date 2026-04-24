/** Persian CLI strings (RTL). Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "ناموفق",
  "common.warn": "هشدار",

  "doctor.title": "pyanchor doctor — تشخیص پیکربندی محلی",
  "doctor.subtitle":
    "(sidecar را شروع نمی‌کند؛ فقط آنچه را که خواهد دید بررسی می‌کند)",
  "doctor.dotenv.loaded": "بارگذاری شد: {files} (autoload cwd dotenv)",
  "doctor.group.required": "متغیرهای محیطی الزامی",
  "doctor.group.fs": "فایل‌سیستم",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "حالت خروجی: {mode}",
  "doctor.group.optional": "تنظیمات اختیاری",
  "doctor.summary.allOk":
    "همه بررسی‌های الزامی موفق ({passed}/{total} ok{warnSuffix}). آماده اجرای `pyanchor`.",
  "doctor.summary.failed":
    "{failed} بررسی ناموفق، {warned} هشدار، {passed} موفق (کل {total}). موارد ✗ بالا را اصلاح کنید و `pyanchor doctor` را دوباره اجرا کنید.",
  "doctor.summary.warnSuffix": "، {warned} هشدار",
  "doctor.summary.accessControlHint":
    "برای پیکربندی کنترل دسترسی (gate cookie, allowed origins, HMAC actor, تنظیمات production) به docs/ACCESS-CONTROL.md مراجعه کنید.",

  "init.title": "pyanchor init — اسکفولدر تعاملی",
  "init.detected": "  شناسایی شد: {summary}",
  "init.error.noPackageJson":
    "\npackage.json در این پوشه وجود ندارد. init را از root برنامه اجرا کنید.",
  "init.prompt.agent": "از کدام agent استفاده می‌کنید؟",
  "init.prompt.workspaceDir":
    "پوشه workspace (فضای scratch که agent قبل از sync-back ویرایش می‌کند)",
  "init.prompt.restartApproach":
    "روش restart (بعد از ویرایش موفق چگونه frontend را reload کنید؟)",
  "init.prompt.pm2Name": "نام پردازش pm2",
  "init.prompt.systemctlUnit": "نام unit در systemd",
  "init.prompt.dockerContainer": "نام container در docker",
  "init.prompt.port": "Port برای sidecar",
  "init.prompt.portBusy":
    "Port برای sidecar ({preferred} مشغول است — پیشنهاد {suggested})",
  "init.prompt.healthcheckUrl":
    "URL برای healthcheck (وقتی frontend برمی‌گردد 2xx برمی‌گرداند)",
  "init.prompt.requireGate":
    "فعال‌سازی production gate cookie؟ (خارج از localhost توصیه می‌شود)",
  "init.prompt.outputMode": "حالت خروجی",
  "init.prompt.confirmApply": "این تغییرات اعمال شود؟",
  "init.tokenReused":
    "  (استفاده مجدد از PYANCHOR_TOKEN موجود در {envFile} — bootstrap snippet زیر با دیسک هم‌خوانی دارد)",
  "init.plan.header": "برنامه:",
  "init.dryRun": "(dry run — فایلی نوشته نشد)",
  "init.dryRun.nextSteps": "مراحل زیر اجرا می‌شدند:",
  "init.aborted": "لغو شد — فایلی نوشته نشد.",
  "init.done.header":
    "تمام. مراحل بعدی (ما به طور خودکار فایل‌های منبع را patch نمی‌کنیم — بسیار پرخطر):",
  "init.done.quickCheck":
    "بررسی سریع (به طور خودکار .env تازه‌نوشته‌شده را بارگذاری می‌کند):",
  "init.done.startSidecar": "سپس sidecar را شروع کنید:",
  "init.done.prodHint":
    "  # (Production: همان متغیرها را از طریق systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env و غیره inject کنید)",
  "init.claudeCode.note":
    "\n  توجه: claude-code از SDK in-process (@anthropic-ai/claude-agent-sdk) استفاده می‌کند،\n         نه binary. بعد از init، این را هم اجرا کنید:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # یا از Claude OAuth flow استفاده کنید\n         اگر یکی از این‌ها وجود نداشته باشد، `pyanchor doctor` هشدار خواهد داد.",
  "init.forceWarning.intro":
    "\n⚠️  --force فعال است. PYANCHOR_TOKEN دوباره تولید می‌شود.",
  "init.forceWarning.update":
    "    data-pyanchor-token را در tag bootstrap script خود به مقدار جدید زیر به‌روزرسانی کنید،",
  "init.forceWarning.401":
    "    در غیر این صورت overlay شما در هر فراخوانی API خطای 401 دریافت خواهد کرد.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log در {path} یافت نشد. PYANCHOR_AUDIT_LOG=true را تنظیم کنید تا نوشتن شروع شود.",

  "agentTest.title": "pyanchor agent test — ping تک‌گانه adapter",
  "agentTest.summary.ok":
    "agent {agent} در {ms}ms پاسخ داد. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} به درستی پاسخ نداد. خروجی بالا را ببینید."
};
