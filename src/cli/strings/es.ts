/** Spanish CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "error",
  "common.warn": "aviso",

  "doctor.title": "pyanchor doctor — diagnóstico de configuración local",
  "doctor.subtitle":
    "(no inicia el sidecar; solo inspecciona lo que observaría)",
  "doctor.dotenv.loaded": "cargado: {files} (autocarga de cwd dotenv)",
  "doctor.group.required": "Variables de entorno requeridas",
  "doctor.group.fs": "Sistema de archivos",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Modo de salida: {mode}",
  "doctor.group.optional": "Opciones",
  "doctor.summary.allOk":
    "Todas las verificaciones requeridas pasan ({passed}/{total} ok{warnSuffix}). Listo para ejecutar `pyanchor`.",
  "doctor.summary.failed":
    "{failed} verificación(es) fallida(s), {warned} aviso(s), {passed} pasada(s) (total {total}). Corrija los ítems ✗ arriba y vuelva a ejecutar `pyanchor doctor`.",
  "doctor.summary.warnSuffix": ", {warned} aviso{plural}",
  "doctor.summary.accessControlHint":
    "Para configurar el control de acceso (gate cookie, allowed origins, HMAC actor, configuraciones de producción), consulte docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — asistente interactivo",
  "init.detected": "  detectado: {summary}",
  "init.error.noPackageJson":
    "\nNo hay package.json en este directorio. Ejecute init desde la raíz de su app.",
  "init.prompt.agent": "¿Qué agent desea usar?",
  "init.prompt.workspaceDir":
    "Directorio workspace (espacio scratch que el agent edita antes del sync-back)",
  "init.prompt.restartApproach":
    "Método de reinicio (¿cómo recargar el frontend tras una edición exitosa?)",
  "init.prompt.pm2Name": "nombre del proceso pm2",
  "init.prompt.systemctlUnit": "nombre del unit systemd",
  "init.prompt.dockerContainer": "nombre del contenedor docker",
  "init.prompt.port": "Port del sidecar",
  "init.prompt.portBusy":
    "Port del sidecar ({preferred} ocupado — sugerido: {suggested})",
  "init.prompt.healthcheckUrl":
    "URL de healthcheck (devuelve 2xx cuando el frontend vuelve a estar disponible)",
  "init.prompt.requireGate":
    "¿Activar el gate cookie de producción? (recomendado fuera de localhost)",
  "init.prompt.outputMode": "Modo de salida",
  "init.prompt.confirmApply": "¿Aplicar estos cambios?",
  "init.tokenReused":
    "  (reutilizando el PYANCHOR_TOKEN existente de {envFile} — el snippet bootstrap de abajo coincide con el disco)",
  "init.plan.header": "Plan:",
  "init.dryRun": "(dry run — no se escriben archivos)",
  "init.dryRun.nextSteps": "Los siguientes pasos se ejecutarían:",
  "init.aborted": "Cancelado — no se escribieron archivos.",
  "init.done.header":
    "Hecho. Próximos pasos (no parcheamos archivos fuente automáticamente — demasiado riesgo):",
  "init.done.quickCheck":
    "Verificación rápida (carga automáticamente el .env recién escrito):",
  "init.done.startSidecar": "Luego inicie el sidecar:",
  "init.done.prodHint":
    "  # (Producción: inyecte las mismas vars vía systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env, etc.)",
  "init.claudeCode.note":
    "\n  nota: claude-code usa un SDK in-process (@anthropic-ai/claude-agent-sdk),\n        no un binary. Después de init, también ejecute:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # o use el flow OAuth de Claude\n        `pyanchor doctor` avisará si falta alguno.",
  "init.forceWarning.intro":
    "\n⚠️  --force está activo. PYANCHOR_TOKEN se regenerará.",
  "init.forceWarning.update":
    "    Actualice data-pyanchor-token en su tag bootstrap script con el nuevo valor de abajo,",
  "init.forceWarning.401":
    "    de lo contrario su overlay recibirá 401 en cada llamada API.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log no encontrado en {path}. Configure PYANCHOR_AUDIT_LOG=true para empezar a escribirlo.",

  "agentTest.title": "pyanchor agent test — ping único del adapter",
  "agentTest.summary.ok":
    "agent {agent} respondió en {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} no respondió correctamente. Vea la salida de arriba."
};
