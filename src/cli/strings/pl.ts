/** Polish CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "błąd",
  "common.warn": "ostrzeżenie",

  "doctor.title": "pyanchor doctor — diagnostyka lokalnej konfiguracji",
  "doctor.subtitle":
    "(nie uruchamia sidecar; tylko sprawdza, co by zaobserwował)",
  "doctor.dotenv.loaded": "wczytano: {files} (autoload cwd dotenv)",
  "doctor.group.required": "Wymagane zmienne środowiskowe",
  "doctor.group.fs": "System plików",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Tryb wyjścia: {mode}",
  "doctor.group.optional": "Opcje",
  "doctor.summary.allOk":
    "Wszystkie wymagane sprawdzenia przeszły ({passed}/{total} ok{warnSuffix}). Gotowe do uruchomienia `pyanchor`.",
  "doctor.summary.failed":
    "{failed} sprawdzenie(a) nieudane, {warned} ostrzeżenie(a), {passed} przeszło (łącznie {total}). Popraw pozycje ✗ powyżej i uruchom `pyanchor doctor` ponownie.",
  "doctor.summary.warnSuffix": ", {warned} ostrzeżenie{plural}",
  "doctor.summary.accessControlHint":
    "Konfiguracja kontroli dostępu (gate cookie, allowed origins, HMAC actor, ustawienia produkcyjne) — patrz docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — interaktywny scaffolder",
  "init.detected": "  wykryto: {summary}",
  "init.error.noPackageJson":
    "\nBrak package.json w tym katalogu. Uruchom init z roota swojej aplikacji.",
  "init.prompt.agent": "Którego agenta chcesz użyć?",
  "init.prompt.workspaceDir":
    "Katalog workspace (przestrzeń scratch, którą agent edytuje przed sync-back)",
  "init.prompt.restartApproach":
    "Metoda restartu (jak przeładować frontend po udanej edycji?)",
  "init.prompt.pm2Name": "nazwa procesu pm2",
  "init.prompt.systemctlUnit": "nazwa unitu systemd",
  "init.prompt.dockerContainer": "nazwa kontenera docker",
  "init.prompt.port": "Port sidecar",
  "init.prompt.portBusy":
    "Port sidecar ({preferred} zajęty — proponuję {suggested})",
  "init.prompt.healthcheckUrl":
    "URL healthcheck (zwraca 2xx, gdy frontend wraca do działania)",
  "init.prompt.requireGate":
    "Włączyć production gate cookie? (zalecane poza localhost)",
  "init.prompt.outputMode": "Tryb wyjścia",
  "init.prompt.confirmApply": "Zastosować te zmiany?",
  "init.tokenReused":
    "  (używam istniejącego PYANCHOR_TOKEN z {envFile} — bootstrap snippet poniżej zgadza się z dyskiem)",
  "init.plan.header": "Plan:",
  "init.dryRun": "(dry run — żadne pliki nie są zapisywane)",
  "init.dryRun.nextSteps": "Następujące kroki zostałyby wykonane:",
  "init.aborted": "Anulowano — żadne pliki nie zostały zapisane.",
  "init.done.header":
    "Gotowe. Następne kroki (nie patchujemy plików źródłowych automatycznie — zbyt ryzykowne):",
  "init.done.quickCheck":
    "Szybkie sprawdzenie (automatycznie wczyta świeżo zapisane .env):",
  "init.done.startSidecar": "Następnie uruchom sidecar:",
  "init.done.prodHint":
    "  # (Produkcja: te same zmienne przez systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env itp.)",
  "init.claudeCode.note":
    "\n  uwaga: claude-code używa in-process SDK (@anthropic-ai/claude-agent-sdk),\n         a nie binary. Po init wykonaj też:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # lub flow OAuth Claude\n         `pyanchor doctor` ostrzeże, jeśli czegoś brakuje.",
  "init.forceWarning.intro":
    "\n⚠️  --force jest aktywne. PYANCHOR_TOKEN zostanie wygenerowany na nowo.",
  "init.forceWarning.update":
    "    Zaktualizuj data-pyanchor-token w swoim tagu bootstrap script na nową wartość poniżej,",
  "init.forceWarning.401":
    "    inaczej Twój overlay otrzyma 401 przy każdym wywołaniu API.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log nie znaleziony pod {path}. Ustaw PYANCHOR_AUDIT_LOG=true, aby zacząć zapisywać.",

  "agentTest.title": "pyanchor agent test — pojedynczy ping adaptera",
  "agentTest.summary.ok":
    "agent {agent} odpowiedział w {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} nie odpowiedział poprawnie. Zobacz wyjście powyżej."
};
