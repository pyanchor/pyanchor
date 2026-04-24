/** German CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "fehlgeschlagen",
  "common.warn": "warnung",

  "doctor.title": "pyanchor doctor — lokale Konfigurationsdiagnose",
  "doctor.subtitle":
    "(startet den Sidecar nicht; prüft nur, was er beobachten würde)",
  "doctor.dotenv.loaded": "geladen: {files} (cwd dotenv autoload)",
  "doctor.group.required": "Erforderliche Umgebungsvariablen",
  "doctor.group.fs": "Dateisystem",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Ausgabemodus: {mode}",
  "doctor.group.optional": "Optionale Einstellungen",
  "doctor.summary.allOk":
    "Alle erforderlichen Prüfungen bestanden ({passed}/{total} ok{warnSuffix}). Bereit, `pyanchor` auszuführen.",
  "doctor.summary.failed":
    "{failed} Prüfung(en) fehlgeschlagen, {warned} Warnung(en), {passed} bestanden (insgesamt {total}). Beheben Sie die ✗-Punkte oben und führen Sie `pyanchor doctor` erneut aus.",
  "doctor.summary.warnSuffix": ", {warned} Warnung{plural}",
  "doctor.summary.accessControlHint":
    "Zur Konfiguration der Zugangskontrolle (gate cookie, allowed origins, HMAC actor, Produktionseinstellungen), siehe docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — interaktiver Scaffolder",
  "init.detected": "  erkannt: {summary}",
  "init.error.noPackageJson":
    "\nKeine package.json in diesem Verzeichnis. Führen Sie init im Root Ihrer App aus.",
  "init.prompt.agent": "Welchen agent möchten Sie verwenden?",
  "init.prompt.workspaceDir":
    "Workspace-Verzeichnis (Scratch-Bereich, in dem der Agent vor dem Sync-back bearbeitet)",
  "init.prompt.restartApproach":
    "Restart-Methode (wie wird das Frontend nach erfolgreicher Bearbeitung neu geladen?)",
  "init.prompt.pm2Name": "pm2-Prozessname",
  "init.prompt.systemctlUnit": "systemd-Unit-Name",
  "init.prompt.dockerContainer": "docker-Containername",
  "init.prompt.port": "Sidecar-Port",
  "init.prompt.portBusy":
    "Sidecar-Port ({preferred} ist belegt — Vorschlag: {suggested})",
  "init.prompt.healthcheckUrl":
    "Healthcheck-URL (gibt 2xx zurück, sobald das Frontend wieder verfügbar ist)",
  "init.prompt.requireGate":
    "Production gate cookie aktivieren? (außerhalb von localhost empfohlen)",
  "init.prompt.outputMode": "Ausgabemodus",
  "init.prompt.confirmApply": "Diese Änderungen anwenden?",
  "init.tokenReused":
    "  (vorhandener PYANCHOR_TOKEN aus {envFile} wird wiederverwendet — bootstrap snippet unten passt zur Datei auf der Festplatte)",
  "init.plan.header": "Plan:",
  "init.dryRun": "(dry run — keine Dateien geschrieben)",
  "init.dryRun.nextSteps": "Folgende Schritte würden ausgeführt:",
  "init.aborted": "Abgebrochen — keine Dateien geschrieben.",
  "init.done.header":
    "Fertig. Nächste Schritte (Quelldateien werden nicht automatisch gepatcht — zu riskant):",
  "init.done.quickCheck":
    "Schnellprüfung (lädt automatisch die gerade geschriebene .env):",
  "init.done.startSidecar": "Dann den Sidecar starten:",
  "init.done.prodHint":
    "  # (Produktion: dieselben Variablen via systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env etc. injizieren)",
  "init.claudeCode.note":
    "\n  Hinweis: claude-code verwendet ein In-Process-SDK (@anthropic-ai/claude-agent-sdk),\n           kein Binary. Nach init zusätzlich ausführen:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # oder Claude OAuth-Flow\n           `pyanchor doctor` warnt, wenn eines fehlt.",
  "init.forceWarning.intro":
    "\n⚠️  --force ist aktiv. PYANCHOR_TOKEN wird neu generiert.",
  "init.forceWarning.update":
    "    Aktualisieren Sie data-pyanchor-token in Ihrem bootstrap script tag mit dem neuen Wert unten,",
  "init.forceWarning.401":
    "    sonst erhält Ihr Overlay 401 bei jedem API-Aufruf.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log nicht gefunden unter {path}. Setzen Sie PYANCHOR_AUDIT_LOG=true, um mit dem Schreiben zu beginnen.",

  "agentTest.title": "pyanchor agent test — Einmaliger Adapter-Ping",
  "agentTest.summary.ok":
    "Agent {agent} hat in {ms}ms geantwortet. Pipeline OK.",
  "agentTest.summary.fail":
    "Agent {agent} hat nicht sauber geantwortet. Siehe Ausgabe oben."
};
