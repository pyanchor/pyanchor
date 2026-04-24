/** Swedish CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "misslyckades",
  "common.warn": "varning",

  "doctor.title": "pyanchor doctor — diagnostik av lokal konfiguration",
  "doctor.subtitle":
    "(startar inte sidecar; inspekterar bara vad den skulle observera)",
  "doctor.dotenv.loaded": "laddat: {files} (cwd dotenv autoload)",
  "doctor.group.required": "Obligatoriska miljövariabler",
  "doctor.group.fs": "Filsystem",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Utdataläge: {mode}",
  "doctor.group.optional": "Valfria inställningar",
  "doctor.summary.allOk":
    "Alla obligatoriska kontroller klarade ({passed}/{total} ok{warnSuffix}). Redo att köra `pyanchor`.",
  "doctor.summary.failed":
    "{failed} kontroll(er) misslyckades, {warned} varning(ar), {passed} klarade (totalt {total}). Åtgärda ✗-posterna ovan och kör `pyanchor doctor` igen.",
  "doctor.summary.warnSuffix": ", {warned} varning{plural}",
  "doctor.summary.accessControlHint":
    "För konfiguration av åtkomstkontroll (gate cookie, allowed origins, HMAC actor, produktionsinställningar), se docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — interaktiv scaffolder",
  "init.detected": "  upptäckt: {summary}",
  "init.error.noPackageJson":
    "\nIngen package.json i denna katalog. Kör init från din apps root.",
  "init.prompt.agent": "Vilken agent vill du använda?",
  "init.prompt.workspaceDir":
    "Workspace-katalog (scratch-utrymme som agenten redigerar före sync-back)",
  "init.prompt.restartApproach":
    "Restart-metod (hur laddar du om frontend efter en lyckad redigering?)",
  "init.prompt.pm2Name": "pm2-processnamn",
  "init.prompt.systemctlUnit": "systemd unit-namn",
  "init.prompt.dockerContainer": "docker-container-namn",
  "init.prompt.port": "Sidecar-port",
  "init.prompt.portBusy":
    "Sidecar-port ({preferred} upptagen — föreslår {suggested})",
  "init.prompt.healthcheckUrl":
    "Healthcheck-URL (returnerar 2xx när frontend är uppe igen)",
  "init.prompt.requireGate":
    "Aktivera production gate cookie? (rekommenderas utanför localhost)",
  "init.prompt.outputMode": "Utdataläge",
  "init.prompt.confirmApply": "Tillämpa dessa ändringar?",
  "init.tokenReused":
    "  (återanvänder befintlig PYANCHOR_TOKEN från {envFile} — bootstrap-snippet nedan matchar disken)",
  "init.plan.header": "Plan:",
  "init.dryRun": "(dry run — inga filer skrivna)",
  "init.dryRun.nextSteps": "Följande steg skulle utföras:",
  "init.aborted": "Avbruten — inga filer skrivna.",
  "init.done.header":
    "Klart. Nästa steg (vi patchar inte källfiler automatiskt — för riskabelt):",
  "init.done.quickCheck":
    "Snabbkontroll (laddar automatiskt den nyligen skrivna .env):",
  "init.done.startSidecar": "Starta sedan sidecar:",
  "init.done.prodHint":
    "  # (Produktion: injicera samma vars via systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env, etc.)",
  "init.claudeCode.note":
    "\n  obs: claude-code använder en in-process SDK (@anthropic-ai/claude-agent-sdk),\n       inte en binary. Efter init, kör även:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # eller använd Claude OAuth\n       `pyanchor doctor` varnar om något saknas.",
  "init.forceWarning.intro":
    "\n⚠️  --force är aktiv. PYANCHOR_TOKEN kommer regenereras.",
  "init.forceWarning.update":
    "    Uppdatera data-pyanchor-token i din bootstrap-script-tagg till det nya värdet nedan,",
  "init.forceWarning.401":
    "    annars får din overlay 401 vid varje API-anrop.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log hittades inte på {path}. Sätt PYANCHOR_AUDIT_LOG=true för att börja skriva.",

  "agentTest.title": "pyanchor agent test — engångsping av adapter",
  "agentTest.summary.ok":
    "agent {agent} svarade på {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} svarade inte korrekt. Se utdata ovan."
};
