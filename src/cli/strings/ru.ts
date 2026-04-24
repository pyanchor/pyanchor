/** Russian CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ок",
  "common.fail": "ошибка",
  "common.warn": "предупреждение",

  "doctor.title": "pyanchor doctor — диагностика локальной конфигурации",
  "doctor.subtitle":
    "(не запускает sidecar; только проверяет, что он бы увидел)",
  "doctor.dotenv.loaded": "загружено: {files} (автозагрузка cwd dotenv)",
  "doctor.group.required": "Обязательные переменные окружения",
  "doctor.group.fs": "Файловая система",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Режим вывода: {mode}",
  "doctor.group.optional": "Опциональные настройки",
  "doctor.summary.allOk":
    "Все обязательные проверки пройдены ({passed}/{total} ok{warnSuffix}). Готово к запуску `pyanchor`.",
  "doctor.summary.failed":
    "{failed} проверк(а/и) не прошли, предупреждений: {warned}, пройдено: {passed} (всего {total}). Исправьте пункты ✗ выше и запустите `pyanchor doctor` ещё раз.",
  "doctor.summary.warnSuffix": ", предупреждений: {warned}",
  "doctor.summary.accessControlHint":
    "По настройке контроля доступа (gate cookie, allowed origins, HMAC actor, продакшен) см. docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — интерактивный scaffolder",
  "init.detected": "  обнаружено: {summary}",
  "init.error.noPackageJson":
    "\nВ этой директории нет package.json. Запустите init из корня вашего приложения.",
  "init.prompt.agent": "Какой agent использовать?",
  "init.prompt.workspaceDir":
    "Директория workspace (scratch-пространство, которое agent правит до sync-back)",
  "init.prompt.restartApproach":
    "Способ перезапуска (как перезагрузить frontend после успешной правки?)",
  "init.prompt.pm2Name": "имя процесса pm2",
  "init.prompt.systemctlUnit": "имя unit systemd",
  "init.prompt.dockerContainer": "имя docker-контейнера",
  "init.prompt.port": "Port sidecar",
  "init.prompt.portBusy":
    "Port sidecar ({preferred} занят — предлагаю {suggested})",
  "init.prompt.healthcheckUrl":
    "URL для healthcheck (возвращает 2xx, когда frontend поднялся)",
  "init.prompt.requireGate":
    "Включить production gate cookie? (рекомендуется для не-localhost)",
  "init.prompt.outputMode": "Режим вывода",
  "init.prompt.confirmApply": "Применить эти изменения?",
  "init.tokenReused":
    "  (используется существующий PYANCHOR_TOKEN из {envFile} — bootstrap snippet ниже совпадает с диском)",
  "init.plan.header": "План:",
  "init.dryRun": "(dry run — файлы не записываются)",
  "init.dryRun.nextSteps": "Были бы выполнены следующие шаги:",
  "init.aborted": "Отменено — файлы не записаны.",
  "init.done.header":
    "Готово. Дальше (исходные файлы автоматически не патчим — слишком рискованно):",
  "init.done.quickCheck":
    "Быстрая проверка (автоматически загрузит только что записанный .env):",
  "init.done.startSidecar": "Затем запустите sidecar:",
  "init.done.prodHint":
    "  # (Production: те же переменные через systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env и т.д.)",
  "init.claudeCode.note":
    "\n  заметка: claude-code использует in-process SDK (@anthropic-ai/claude-agent-sdk),\n           не binary. После init также выполните:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # или OAuth-flow Claude\n           `pyanchor doctor` предупредит, если что-то отсутствует.",
  "init.forceWarning.intro":
    "\n⚠️  --force активен. PYANCHOR_TOKEN будет перевыпущен.",
  "init.forceWarning.update":
    "    Обновите data-pyanchor-token в вашем теге bootstrap script на новое значение ниже,",
  "init.forceWarning.401":
    "    иначе ваш overlay будет получать 401 на каждый API-вызов.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log не найден по пути {path}. Установите PYANCHOR_AUDIT_LOG=true, чтобы начать запись.",

  "agentTest.title": "pyanchor agent test — одиночный ping адаптера",
  "agentTest.summary.ok":
    "agent {agent} ответил за {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} ответил некорректно. Смотрите вывод выше."
};
