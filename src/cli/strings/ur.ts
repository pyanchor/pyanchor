/** Urdu CLI strings (RTL). Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "ناکام",
  "common.warn": "انتباہ",

  "doctor.title": "pyanchor doctor — مقامی configuration کی تشخیص",
  "doctor.subtitle":
    "(sidecar شروع نہیں کرتا؛ صرف وہ چیز جانچتا ہے جو وہ دیکھے گا)",
  "doctor.dotenv.loaded": "لوڈ ہوا: {files} (cwd dotenv autoload)",
  "doctor.group.required": "ضروری environment variables",
  "doctor.group.fs": "فائل سسٹم",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "آؤٹ پٹ موڈ: {mode}",
  "doctor.group.optional": "اختیاری ترتیبات",
  "doctor.summary.allOk":
    "تمام ضروری چیکس کامیاب ({passed}/{total} ok{warnSuffix}). `pyanchor` چلانے کے لیے تیار۔",
  "doctor.summary.failed":
    "{failed} چیک ناکام، {warned} انتباہ، {passed} کامیاب (کل {total})۔ اوپر دیے گئے ✗ آئٹمز ٹھیک کریں اور `pyanchor doctor` دوبارہ چلائیں۔",
  "doctor.summary.warnSuffix": "، {warned} انتباہ",
  "doctor.summary.accessControlHint":
    "Access control configuration (gate cookie, allowed origins, HMAC actor, production setups) کے لیے docs/ACCESS-CONTROL.md دیکھیں۔",

  "init.title": "pyanchor init — انٹرایکٹو scaffolder",
  "init.detected": "  پہچانا: {summary}",
  "init.error.noPackageJson":
    "\nاس ڈائریکٹری میں package.json نہیں ہے۔ اپنی app کے root سے init چلائیں۔",
  "init.prompt.agent": "آپ کون سا agent استعمال کرنا چاہتے ہیں؟",
  "init.prompt.workspaceDir":
    "Workspace ڈائریکٹری (scratch جگہ جو agent sync-back سے پہلے ایڈٹ کرتا ہے)",
  "init.prompt.restartApproach":
    "Restart کا طریقہ (کامیاب ایڈٹ کے بعد frontend کیسے reload کریں؟)",
  "init.prompt.pm2Name": "pm2 process کا نام",
  "init.prompt.systemctlUnit": "systemd unit کا نام",
  "init.prompt.dockerContainer": "docker container کا نام",
  "init.prompt.port": "Sidecar کا port",
  "init.prompt.portBusy":
    "Sidecar کا port ({preferred} مصروف ہے — تجویز {suggested})",
  "init.prompt.healthcheckUrl":
    "Healthcheck URL (frontend واپس آنے پر 2xx واپس کرتا ہے)",
  "init.prompt.requireGate":
    "Production gate cookie آن کریں؟ (localhost سے باہر تجویز کردہ)",
  "init.prompt.outputMode": "آؤٹ پٹ موڈ",
  "init.prompt.confirmApply": "یہ تبدیلیاں لاگو کریں؟",
  "init.tokenReused":
    "  ({envFile} سے موجودہ PYANCHOR_TOKEN دوبارہ استعمال — نیچے کا bootstrap snippet ڈسک سے میل کھاتا ہے)",
  "init.plan.header": "منصوبہ:",
  "init.dryRun": "(dry run — کوئی فائل نہیں لکھی گئی)",
  "init.dryRun.nextSteps": "درج ذیل اقدامات انجام پائیں گے:",
  "init.aborted": "منسوخ — کوئی فائل نہیں لکھی گئی۔",
  "init.done.header":
    "مکمل۔ اگلے اقدامات (ہم سورس فائلوں کو خودکار طور پر patch نہیں کرتے — بہت خطرناک):",
  "init.done.quickCheck":
    "تیز چیک (ابھی لکھی گئی .env کو خودکار طور پر لوڈ کرتا ہے):",
  "init.done.startSidecar": "پھر sidecar شروع کریں:",
  "init.done.prodHint":
    "  # (Production: وہی vars systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env وغیرہ کے ذریعے inject کریں)",
  "init.claudeCode.note":
    "\n  نوٹ: claude-code in-process SDK (@anthropic-ai/claude-agent-sdk) استعمال کرتا ہے،\n        binary نہیں۔ init کے بعد یہ بھی چلائیں:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # یا Claude OAuth flow استعمال کریں\n        اگر کوئی غائب ہو تو `pyanchor doctor` انتباہ دے گا۔",
  "init.forceWarning.intro":
    "\n⚠️  --force فعال ہے۔ PYANCHOR_TOKEN دوبارہ generate ہوگا۔",
  "init.forceWarning.update":
    "    اپنے bootstrap script tag میں data-pyanchor-token کو نیچے کی نئی قدر سے update کریں،",
  "init.forceWarning.401":
    "    ورنہ آپ کا overlay ہر API call پر 401 وصول کرے گا۔",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "{path} پر audit log نہیں ملا۔ لکھنا شروع کرنے کے لیے PYANCHOR_AUDIT_LOG=true سیٹ کریں۔",

  "agentTest.title": "pyanchor agent test — adapter کا واحد ping",
  "agentTest.summary.ok":
    "agent {agent} نے {ms}ms میں جواب دیا۔ Pipeline OK۔",
  "agentTest.summary.fail":
    "agent {agent} نے صحیح جواب نہیں دیا۔ اوپر آؤٹ پٹ دیکھیں۔"
};
