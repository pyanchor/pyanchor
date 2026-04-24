/** Hebrew CLI strings (RTL). Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "נכשל",
  "common.warn": "אזהרה",

  "doctor.title": "pyanchor doctor — אבחון תצורה מקומית",
  "doctor.subtitle":
    "(לא מפעיל את ה-sidecar; רק בודק מה שהוא היה רואה)",
  "doctor.dotenv.loaded": "נטען: {files} (טעינה אוטומטית של cwd dotenv)",
  "doctor.group.required": "משתני סביבה נדרשים",
  "doctor.group.fs": "מערכת קבצים",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "מצב פלט: {mode}",
  "doctor.group.optional": "הגדרות אופציונליות",
  "doctor.summary.allOk":
    "כל הבדיקות הנדרשות עברו ({passed}/{total} ok{warnSuffix}). מוכן להריץ `pyanchor`.",
  "doctor.summary.failed":
    "{failed} בדיקות נכשלו, {warned} אזהרות, {passed} עברו (סך הכל {total}). תקן את פריטי ה-✗ למעלה והרץ `pyanchor doctor` שוב.",
  "doctor.summary.warnSuffix": ", {warned} אזהרות",
  "doctor.summary.accessControlHint":
    "להגדרת בקרת גישה (gate cookie, allowed origins, HMAC actor, הגדרות production) ראה docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — מסייע אינטראקטיבי",
  "init.detected": "  זוהה: {summary}",
  "init.error.noPackageJson":
    "\nאין package.json בתיקייה הזו. הרץ init מה-root של האפליקציה שלך.",
  "init.prompt.agent": "באיזה agent ברצונך להשתמש?",
  "init.prompt.workspaceDir":
    "תיקיית workspace (מרחב scratch ש-agent עורך לפני sync-back)",
  "init.prompt.restartApproach":
    "שיטת restart (איך לטעון מחדש את ה-frontend לאחר עריכה מוצלחת?)",
  "init.prompt.pm2Name": "שם תהליך pm2",
  "init.prompt.systemctlUnit": "שם unit של systemd",
  "init.prompt.dockerContainer": "שם container של docker",
  "init.prompt.port": "Port של ה-sidecar",
  "init.prompt.portBusy":
    "Port של ה-sidecar ({preferred} תפוס — מוצע {suggested})",
  "init.prompt.healthcheckUrl":
    "URL של healthcheck (מחזיר 2xx כש-frontend חוזר לעבוד)",
  "init.prompt.requireGate":
    "להפעיל gate cookie של production? (מומלץ מחוץ ל-localhost)",
  "init.prompt.outputMode": "מצב פלט",
  "init.prompt.confirmApply": "להחיל שינויים אלה?",
  "init.tokenReused":
    "  (שימוש חוזר ב-PYANCHOR_TOKEN הקיים מ-{envFile} — bootstrap snippet למטה תואם לדיסק)",
  "init.plan.header": "תוכנית:",
  "init.dryRun": "(dry run — לא נכתבו קבצים)",
  "init.dryRun.nextSteps": "השלבים הבאים היו מתבצעים:",
  "init.aborted": "בוטל — לא נכתבו קבצים.",
  "init.done.header":
    "סיים. השלבים הבאים (איננו עושים patch אוטומטי לקבצי מקור — מסוכן מדי):",
  "init.done.quickCheck":
    "בדיקה מהירה (טוען אוטומטית את ה-.env החדש שנכתב):",
  "init.done.startSidecar": "אז הפעל את ה-sidecar:",
  "init.done.prodHint":
    "  # (Production: הזרק את אותם משתנים דרך systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env וכו')",
  "init.claudeCode.note":
    "\n  הערה: claude-code משתמש ב-SDK in-process (@anthropic-ai/claude-agent-sdk),\n        ולא ב-binary. אחרי init, הרץ גם:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # או השתמש ב-Claude OAuth\n        `pyanchor doctor` יזהיר אם משהו חסר.",
  "init.forceWarning.intro":
    "\n⚠️  --force פעיל. PYANCHOR_TOKEN יוחל מחדש.",
  "init.forceWarning.update":
    "    עדכן את data-pyanchor-token ב-tag של bootstrap script שלך לערך החדש למטה,",
  "init.forceWarning.401":
    "    אחרת ה-overlay שלך יקבל 401 בכל קריאת API.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log לא נמצא ב-{path}. הגדר PYANCHOR_AUDIT_LOG=true כדי להתחיל לכתוב.",

  "agentTest.title": "pyanchor agent test — ping בודד של adapter",
  "agentTest.summary.ok":
    "agent {agent} ענה ב-{ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} לא ענה כראוי. ראה את הפלט למעלה."
};
