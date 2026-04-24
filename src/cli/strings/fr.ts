/** French CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "échec",
  "common.warn": "avertissement",

  "doctor.title": "pyanchor doctor — diagnostic de configuration locale",
  "doctor.subtitle":
    "(ne démarre pas le sidecar ; n'inspecte que ce qu'il observerait)",
  "doctor.dotenv.loaded": "chargé : {files} (cwd dotenv autoload)",
  "doctor.group.required": "Variables d'environnement requises",
  "doctor.group.fs": "Système de fichiers",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Mode de sortie : {mode}",
  "doctor.group.optional": "Options",
  "doctor.summary.allOk":
    "Toutes les vérifications requises passent ({passed}/{total} ok{warnSuffix}). Prêt à exécuter `pyanchor`.",
  "doctor.summary.failed":
    "{failed} vérification(s) échouée(s), {warned} avertissement(s), {passed} réussie(s) (total {total}). Corrigez les éléments ✗ ci-dessus et relancez `pyanchor doctor`.",
  "doctor.summary.warnSuffix": ", {warned} avertissement{plural}",
  "doctor.summary.accessControlHint":
    "Pour configurer le contrôle d'accès (gate cookie, allowed origins, HMAC actor, configurations de production), voir docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — assistant interactif",
  "init.detected": "  détecté : {summary}",
  "init.error.noPackageJson":
    "\nAucun package.json dans ce répertoire. Lancez init depuis la racine de votre app.",
  "init.prompt.agent": "Quel agent souhaitez-vous utiliser ?",
  "init.prompt.workspaceDir":
    "Répertoire workspace (espace scratch que l'agent édite avant le sync-back)",
  "init.prompt.restartApproach":
    "Méthode de redémarrage (comment recharger le frontend après une édition réussie ?)",
  "init.prompt.pm2Name": "nom du processus pm2",
  "init.prompt.systemctlUnit": "nom de l'unité systemd",
  "init.prompt.dockerContainer": "nom du conteneur docker",
  "init.prompt.port": "Port du sidecar",
  "init.prompt.portBusy":
    "Port du sidecar ({preferred} occupé — proposition : {suggested})",
  "init.prompt.healthcheckUrl":
    "URL de healthcheck (renvoie 2xx une fois le frontend redémarré)",
  "init.prompt.requireGate":
    "Activer le gate cookie de production ? (recommandé hors localhost)",
  "init.prompt.outputMode": "Mode de sortie",
  "init.prompt.confirmApply": "Appliquer ces changements ?",
  "init.tokenReused":
    "  (réutilisation du PYANCHOR_TOKEN existant dans {envFile} — le snippet bootstrap ci-dessous correspond au disque)",
  "init.plan.header": "Plan :",
  "init.dryRun": "(dry run — aucun fichier écrit)",
  "init.dryRun.nextSteps": "Étapes qui seraient exécutées :",
  "init.aborted": "Annulé — aucun fichier écrit.",
  "init.done.header":
    "Terminé. Étapes suivantes (les fichiers source ne sont pas patchés automatiquement — trop risqué) :",
  "init.done.quickCheck":
    "Vérification rapide (charge automatiquement le .env qu'on vient d'écrire) :",
  "init.done.startSidecar": "Puis démarrer le sidecar :",
  "init.done.prodHint":
    "  # (Production : injecter les mêmes vars via systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env, etc.)",
  "init.claudeCode.note":
    "\n  note : claude-code utilise un SDK in-process (@anthropic-ai/claude-agent-sdk),\n         pas un binary. Après init, lancez aussi :\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # ou utilisez le flow OAuth de Claude\n         `pyanchor doctor` avertira si l'un manque.",
  "init.forceWarning.intro":
    "\n⚠️  --force est actif. PYANCHOR_TOKEN sera régénéré.",
  "init.forceWarning.update":
    "    Mettez à jour data-pyanchor-token dans votre balise bootstrap script avec la nouvelle valeur ci-dessous,",
  "init.forceWarning.401":
    "    sinon votre overlay recevra 401 sur chaque appel API.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log introuvable à {path}. Définissez PYANCHOR_AUDIT_LOG=true pour commencer à l'écrire.",

  "agentTest.title": "pyanchor agent test — ping unique de l'adapter",
  "agentTest.summary.ok":
    "L'agent {agent} a répondu en {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "L'agent {agent} n'a pas répondu correctement. Voir la sortie ci-dessus."
};
