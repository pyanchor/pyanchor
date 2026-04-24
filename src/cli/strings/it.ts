/** Italian CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "errore",
  "common.warn": "avviso",

  "doctor.title": "pyanchor doctor — diagnostica della configurazione locale",
  "doctor.subtitle":
    "(non avvia il sidecar; ispeziona solo ciò che osserverebbe)",
  "doctor.dotenv.loaded": "caricato: {files} (autoload di cwd dotenv)",
  "doctor.group.required": "Variabili d'ambiente richieste",
  "doctor.group.fs": "Filesystem",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Modalità output: {mode}",
  "doctor.group.optional": "Opzioni",
  "doctor.summary.allOk":
    "Tutti i controlli richiesti superati ({passed}/{total} ok{warnSuffix}). Pronto per eseguire `pyanchor`.",
  "doctor.summary.failed":
    "{failed} controllo(i) falliti, {warned} avviso(i), {passed} superati (totale {total}). Risolvi gli elementi ✗ sopra e riesegui `pyanchor doctor`.",
  "doctor.summary.warnSuffix": ", {warned} avviso{plural}",
  "doctor.summary.accessControlHint":
    "Per configurare il controllo accessi (gate cookie, allowed origins, HMAC actor, configurazioni di produzione), vedere docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — assistente interattivo",
  "init.detected": "  rilevato: {summary}",
  "init.error.noPackageJson":
    "\nNessun package.json in questa directory. Esegui init dalla root della tua app.",
  "init.prompt.agent": "Quale agent vuoi usare?",
  "init.prompt.workspaceDir":
    "Directory workspace (spazio scratch che l'agent modifica prima del sync-back)",
  "init.prompt.restartApproach":
    "Metodo di restart (come ricaricare il frontend dopo una modifica riuscita?)",
  "init.prompt.pm2Name": "nome processo pm2",
  "init.prompt.systemctlUnit": "nome unit systemd",
  "init.prompt.dockerContainer": "nome container docker",
  "init.prompt.port": "Port del sidecar",
  "init.prompt.portBusy":
    "Port del sidecar ({preferred} occupato — suggerisco {suggested})",
  "init.prompt.healthcheckUrl":
    "URL healthcheck (restituisce 2xx quando il frontend è di nuovo attivo)",
  "init.prompt.requireGate":
    "Abilitare il gate cookie di produzione? (consigliato fuori da localhost)",
  "init.prompt.outputMode": "Modalità output",
  "init.prompt.confirmApply": "Applicare queste modifiche?",
  "init.tokenReused":
    "  (riutilizzo del PYANCHOR_TOKEN esistente in {envFile} — lo snippet bootstrap qui sotto corrisponde al disco)",
  "init.plan.header": "Piano:",
  "init.dryRun": "(dry run — nessun file scritto)",
  "init.dryRun.nextSteps": "Verrebbero eseguiti i seguenti passi:",
  "init.aborted": "Annullato — nessun file scritto.",
  "init.done.header":
    "Fatto. Prossimi passi (non patchiamo automaticamente i file sorgente — troppo rischioso):",
  "init.done.quickCheck":
    "Controllo rapido (carica automaticamente il .env appena scritto):",
  "init.done.startSidecar": "Poi avvia il sidecar:",
  "init.done.prodHint":
    "  # (Produzione: inietta le stesse var via systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env, ecc.)",
  "init.claudeCode.note":
    "\n  nota: claude-code usa un SDK in-process (@anthropic-ai/claude-agent-sdk),\n        non un binary. Dopo init, esegui anche:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # oppure usa il flow OAuth di Claude\n        `pyanchor doctor` avviserà se manca uno dei due.",
  "init.forceWarning.intro":
    "\n⚠️  --force è attivo. PYANCHOR_TOKEN sarà rigenerato.",
  "init.forceWarning.update":
    "    Aggiorna data-pyanchor-token nel tuo tag bootstrap script con il nuovo valore qui sotto,",
  "init.forceWarning.401":
    "    altrimenti il tuo overlay riceverà 401 a ogni chiamata API.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log non trovato in {path}. Imposta PYANCHOR_AUDIT_LOG=true per iniziare a scriverlo.",

  "agentTest.title": "pyanchor agent test — ping singolo dell'adapter",
  "agentTest.summary.ok":
    "agent {agent} ha risposto in {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} non ha risposto correttamente. Vedi l'output sopra."
};
