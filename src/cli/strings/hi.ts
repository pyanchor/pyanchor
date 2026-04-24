/** Hindi CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ठीक",
  "common.fail": "विफल",
  "common.warn": "चेतावनी",

  "doctor.title": "pyanchor doctor — स्थानीय कॉन्फ़िगरेशन निदान",
  "doctor.subtitle":
    "(sidecar शुरू नहीं करता; केवल जो वह देखेगा उसका निरीक्षण करता है)",
  "doctor.dotenv.loaded": "लोड किया गया: {files} (cwd dotenv ऑटोलोड)",
  "doctor.group.required": "आवश्यक environment variables",
  "doctor.group.fs": "फ़ाइल सिस्टम",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "आउटपुट मोड: {mode}",
  "doctor.group.optional": "वैकल्पिक सेटिंग्स",
  "doctor.summary.allOk":
    "सभी आवश्यक जाँच पास हुईं ({passed}/{total} ok{warnSuffix})। `pyanchor` चलाने के लिए तैयार।",
  "doctor.summary.failed":
    "{failed} जाँच विफल, {warned} चेतावनी, {passed} पास (कुल {total})। ऊपर दिए गए ✗ आइटम ठीक करके `pyanchor doctor` फिर से चलाएँ।",
  "doctor.summary.warnSuffix": ", {warned} चेतावनी",
  "doctor.summary.accessControlHint":
    "एक्सेस कंट्रोल कॉन्फ़िगरेशन (gate cookie, allowed origins, HMAC actor, production setups) के लिए docs/ACCESS-CONTROL.md देखें।",

  "init.title": "pyanchor init — इंटरैक्टिव scaffolder",
  "init.detected": "  पहचाना: {summary}",
  "init.error.noPackageJson":
    "\nइस डायरेक्ट्री में package.json नहीं है। अपने ऐप के root से init चलाएँ।",
  "init.prompt.agent": "किस agent का उपयोग करना चाहते हैं?",
  "init.prompt.workspaceDir":
    "Workspace डायरेक्ट्री (sync-back से पहले agent जो scratch space एडिट करता है)",
  "init.prompt.restartApproach":
    "Restart विधि (सफल एडिट के बाद frontend को कैसे reload करें?)",
  "init.prompt.pm2Name": "pm2 प्रोसेस नाम",
  "init.prompt.systemctlUnit": "systemd unit नाम",
  "init.prompt.dockerContainer": "docker कंटेनर नाम",
  "init.prompt.port": "Sidecar port",
  "init.prompt.portBusy":
    "Sidecar port ({preferred} व्यस्त — {suggested} सुझाव)",
  "init.prompt.healthcheckUrl":
    "Healthcheck URL (frontend वापस आने पर 2xx लौटाता है)",
  "init.prompt.requireGate":
    "Production gate cookie सक्षम करें? (localhost के बाहर अनुशंसित)",
  "init.prompt.outputMode": "आउटपुट मोड",
  "init.prompt.confirmApply": "ये परिवर्तन लागू करें?",
  "init.tokenReused":
    "  ({envFile} से मौजूदा PYANCHOR_TOKEN पुनः उपयोग — नीचे bootstrap snippet डिस्क से मेल खाता है)",
  "init.plan.header": "योजना:",
  "init.dryRun": "(dry run — कोई फ़ाइल नहीं लिखी गई)",
  "init.dryRun.nextSteps": "ये चरण निष्पादित होते:",
  "init.aborted": "रद्द — कोई फ़ाइल नहीं लिखी गई।",
  "init.done.header":
    "पूर्ण। अगले चरण (हम स्रोत फ़ाइलें स्वचालित रूप से patch नहीं करते — बहुत जोखिम भरा है):",
  "init.done.quickCheck":
    "त्वरित जाँच (अभी लिखी गई .env स्वचालित रूप से लोड होती है):",
  "init.done.startSidecar": "फिर sidecar शुरू करें:",
  "init.done.prodHint":
    "  # (Production: वही vars systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env आदि के माध्यम से inject करें)",
  "init.claudeCode.note":
    "\n  ध्यान दें: claude-code in-process SDK (@anthropic-ai/claude-agent-sdk) उपयोग करता है,\n             binary नहीं। init के बाद यह भी चलाएँ:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # या Claude OAuth flow\n             किसी एक के गायब होने पर `pyanchor doctor` चेतावनी देगा।",
  "init.forceWarning.intro":
    "\n⚠️  --force सक्रिय है। PYANCHOR_TOKEN फिर से जेनरेट होगा।",
  "init.forceWarning.update":
    "    अपने bootstrap script टैग में data-pyanchor-token को नीचे दिए गए नए मान पर अपडेट करें,",
  "init.forceWarning.401":
    "    अन्यथा आपका overlay हर API कॉल पर 401 प्राप्त करेगा।",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "{path} पर audit log नहीं मिला। लिखना शुरू करने के लिए PYANCHOR_AUDIT_LOG=true सेट करें।",

  "agentTest.title": "pyanchor agent test — adapter एकल ping",
  "agentTest.summary.ok":
    "agent {agent} ने {ms}ms में जवाब दिया। Pipeline OK।",
  "agentTest.summary.fail":
    "agent {agent} ने सही ढंग से जवाब नहीं दिया। ऊपर का आउटपुट देखें।"
};
