/** Dutch CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "mislukt",
  "common.warn": "waarschuwing",

  "doctor.title": "pyanchor doctor — diagnose lokale configuratie",
  "doctor.subtitle":
    "(start de sidecar niet; controleert alleen wat hij zou waarnemen)",
  "doctor.dotenv.loaded": "geladen: {files} (autoload van cwd dotenv)",
  "doctor.group.required": "Vereiste omgevingsvariabelen",
  "doctor.group.fs": "Bestandssysteem",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Output-modus: {mode}",
  "doctor.group.optional": "Optionele instellingen",
  "doctor.summary.allOk":
    "Alle vereiste controles geslaagd ({passed}/{total} ok{warnSuffix}). Klaar om `pyanchor` uit te voeren.",
  "doctor.summary.failed":
    "{failed} controle(s) mislukt, {warned} waarschuwing(en), {passed} geslaagd (totaal {total}). Los de ✗-items hierboven op en voer `pyanchor doctor` opnieuw uit.",
  "doctor.summary.warnSuffix": ", {warned} waarschuwing{plural}",
  "doctor.summary.accessControlHint":
    "Voor toegangscontrole-configuratie (gate cookie, allowed origins, HMAC actor, productie-instellingen), zie docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — interactieve scaffolder",
  "init.detected": "  gedetecteerd: {summary}",
  "init.error.noPackageJson":
    "\nGeen package.json in deze map. Voer init uit vanuit de root van je app.",
  "init.prompt.agent": "Welke agent wil je gebruiken?",
  "init.prompt.workspaceDir":
    "Workspace-map (scratch-ruimte die de agent bewerkt vóór sync-back)",
  "init.prompt.restartApproach":
    "Restart-methode (hoe herlaad je het frontend na een geslaagde edit?)",
  "init.prompt.pm2Name": "pm2-procesnaam",
  "init.prompt.systemctlUnit": "systemd-unitnaam",
  "init.prompt.dockerContainer": "docker-containernaam",
  "init.prompt.port": "Sidecar-port",
  "init.prompt.portBusy":
    "Sidecar-port ({preferred} bezet — voorstel {suggested})",
  "init.prompt.healthcheckUrl":
    "Healthcheck-URL (geeft 2xx terug zodra het frontend weer draait)",
  "init.prompt.requireGate":
    "Production gate cookie inschakelen? (aanbevolen buiten localhost)",
  "init.prompt.outputMode": "Output-modus",
  "init.prompt.confirmApply": "Deze wijzigingen toepassen?",
  "init.tokenReused":
    "  (bestaande PYANCHOR_TOKEN uit {envFile} hergebruikt — bootstrap-snippet hieronder komt overeen met de schijf)",
  "init.plan.header": "Plan:",
  "init.dryRun": "(dry run — geen bestanden geschreven)",
  "init.dryRun.nextSteps": "De volgende stappen zouden worden uitgevoerd:",
  "init.aborted": "Geannuleerd — geen bestanden geschreven.",
  "init.done.header":
    "Klaar. Volgende stappen (we patchen broncode niet automatisch — te risicovol):",
  "init.done.quickCheck":
    "Snelle controle (laadt automatisch de zojuist geschreven .env):",
  "init.done.startSidecar": "Start vervolgens de sidecar:",
  "init.done.prodHint":
    "  # (Productie: injecteer dezelfde vars via systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env, enz.)",
  "init.claudeCode.note":
    "\n  let op: claude-code gebruikt een in-process SDK (@anthropic-ai/claude-agent-sdk),\n          geen binary. Voer na init ook uit:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # of gebruik Claude OAuth\n          `pyanchor doctor` waarschuwt als één ervan ontbreekt.",
  "init.forceWarning.intro":
    "\n⚠️  --force is actief. PYANCHOR_TOKEN wordt opnieuw gegenereerd.",
  "init.forceWarning.update":
    "    Werk data-pyanchor-token in je bootstrap-script-tag bij naar de nieuwe waarde hieronder,",
  "init.forceWarning.401":
    "    anders krijgt je overlay 401 op elke API-aanroep.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log niet gevonden op {path}. Stel PYANCHOR_AUDIT_LOG=true in om te beginnen met schrijven.",

  "agentTest.title": "pyanchor agent test — eenmalige adapter-ping",
  "agentTest.summary.ok":
    "agent {agent} reageerde in {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} reageerde niet correct. Zie output hierboven."
};
