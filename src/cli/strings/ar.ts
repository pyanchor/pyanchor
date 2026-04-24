/** Arabic CLI strings (RTL). Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "فشل",
  "common.warn": "تحذير",

  "doctor.title": "pyanchor doctor — تشخيص الإعدادات المحلية",
  "doctor.subtitle":
    "(لا يبدأ تشغيل sidecar؛ يفحص فقط ما سيراه عند البدء)",
  "doctor.dotenv.loaded": "تم التحميل: {files} (تحميل cwd dotenv التلقائي)",
  "doctor.group.required": "متغيرات البيئة المطلوبة",
  "doctor.group.fs": "نظام الملفات",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "وضع الإخراج: {mode}",
  "doctor.group.optional": "إعدادات اختيارية",
  "doctor.summary.allOk":
    "نجحت جميع الفحوصات المطلوبة ({passed}/{total} ok{warnSuffix}). جاهز لتشغيل `pyanchor`.",
  "doctor.summary.failed":
    "فشل {failed} فحص، {warned} تحذير، {passed} ناجح (الإجمالي {total}). أصلح عناصر ✗ أعلاه وأعد تشغيل `pyanchor doctor`.",
  "doctor.summary.warnSuffix": "، {warned} تحذير",
  "doctor.summary.accessControlHint":
    "لإعداد التحكم في الوصول (gate cookie, allowed origins, HMAC actor, إعدادات الإنتاج) راجع docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — مساعد تفاعلي",
  "init.detected": "  تم اكتشاف: {summary}",
  "init.error.noPackageJson":
    "\nلا يوجد package.json في هذا المجلد. شغّل init من جذر تطبيقك.",
  "init.prompt.agent": "أي agent تريد استخدامه؟",
  "init.prompt.workspaceDir":
    "مجلد Workspace (مساحة scratch يحررها agent قبل sync-back)",
  "init.prompt.restartApproach":
    "طريقة إعادة التشغيل (كيف تعيد تحميل frontend بعد تعديل ناجح؟)",
  "init.prompt.pm2Name": "اسم عملية pm2",
  "init.prompt.systemctlUnit": "اسم unit systemd",
  "init.prompt.dockerContainer": "اسم حاوية docker",
  "init.prompt.port": "Port الـ sidecar",
  "init.prompt.portBusy":
    "Port الـ sidecar ({preferred} مشغول — اقتراح {suggested})",
  "init.prompt.healthcheckUrl":
    "URL الـ healthcheck (يعيد 2xx عند عودة frontend)",
  "init.prompt.requireGate":
    "تفعيل gate cookie للإنتاج؟ (موصى به خارج localhost)",
  "init.prompt.outputMode": "وضع الإخراج",
  "init.prompt.confirmApply": "تطبيق هذه التغييرات؟",
  "init.tokenReused":
    "  (إعادة استخدام PYANCHOR_TOKEN الحالي من {envFile} — bootstrap snippet أدناه يطابق القرص)",
  "init.plan.header": "الخطة:",
  "init.dryRun": "(dry run — لا توجد ملفات مكتوبة)",
  "init.dryRun.nextSteps": "الخطوات التالية كانت ستنفذ:",
  "init.aborted": "ملغى — لم تكتب أي ملفات.",
  "init.done.header":
    "تم. الخطوات التالية (لا نعدّل ملفات المصدر تلقائياً — مخاطرة كبيرة):",
  "init.done.quickCheck":
    "فحص سريع (يحمّل تلقائياً .env المكتوب للتو):",
  "init.done.startSidecar": "ثم ابدأ sidecar:",
  "init.done.prodHint":
    "  # (الإنتاج: حقن نفس المتغيرات عبر systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env إلخ)",
  "init.claudeCode.note":
    "\n  ملاحظة: claude-code يستخدم SDK داخل العملية (@anthropic-ai/claude-agent-sdk)،\n         وليس binary. بعد init، شغّل أيضاً:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # أو استخدم Claude OAuth flow\n         سيحذّر `pyanchor doctor` إذا كان أي منهما مفقوداً.",
  "init.forceWarning.intro":
    "\n⚠️  --force نشط. سيُعاد توليد PYANCHOR_TOKEN.",
  "init.forceWarning.update":
    "    حدّث data-pyanchor-token في tag bootstrap script بالقيمة الجديدة أدناه،",
  "init.forceWarning.401":
    "    وإلا فسيستلم overlay الخاص بك 401 في كل استدعاء API.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log غير موجود في {path}. اضبط PYANCHOR_AUDIT_LOG=true لبدء الكتابة.",

  "agentTest.title": "pyanchor agent test — ping واحد للـ adapter",
  "agentTest.summary.ok":
    "agent {agent} استجاب في {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} لم يستجب بشكل صحيح. راجع الإخراج أعلاه."
};
