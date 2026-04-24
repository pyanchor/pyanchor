/** Brazilian Portuguese CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "falhou",
  "common.warn": "aviso",

  "doctor.title": "pyanchor doctor — diagnóstico de configuração local",
  "doctor.subtitle":
    "(não inicia o sidecar; só inspeciona o que ele observaria)",
  "doctor.dotenv.loaded": "carregado: {files} (autocarga de cwd dotenv)",
  "doctor.group.required": "Variáveis de ambiente obrigatórias",
  "doctor.group.fs": "Sistema de arquivos",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Modo de saída: {mode}",
  "doctor.group.optional": "Opções",
  "doctor.summary.allOk":
    "Todas as verificações obrigatórias passaram ({passed}/{total} ok{warnSuffix}). Pronto para executar `pyanchor`.",
  "doctor.summary.failed":
    "{failed} verificação(ões) falharam, {warned} aviso(s), {passed} passaram (total {total}). Corrija os itens ✗ acima e execute `pyanchor doctor` novamente.",
  "doctor.summary.warnSuffix": ", {warned} aviso{plural}",
  "doctor.summary.accessControlHint":
    "Para configurar controle de acesso (gate cookie, allowed origins, HMAC actor, configurações de produção), veja docs/ACCESS-CONTROL.md.",

  "init.title": "pyanchor init — assistente interativo",
  "init.detected": "  detectado: {summary}",
  "init.error.noPackageJson":
    "\nSem package.json neste diretório. Execute init na raiz do seu app.",
  "init.prompt.agent": "Qual agent você quer usar?",
  "init.prompt.workspaceDir":
    "Diretório workspace (espaço scratch que o agent edita antes do sync-back)",
  "init.prompt.restartApproach":
    "Método de restart (como recarregar o frontend após uma edição bem-sucedida?)",
  "init.prompt.pm2Name": "nome do processo pm2",
  "init.prompt.systemctlUnit": "nome da unit systemd",
  "init.prompt.dockerContainer": "nome do container docker",
  "init.prompt.port": "Port do sidecar",
  "init.prompt.portBusy":
    "Port do sidecar ({preferred} ocupado — sugerindo {suggested})",
  "init.prompt.healthcheckUrl":
    "URL de healthcheck (retorna 2xx quando o frontend volta)",
  "init.prompt.requireGate":
    "Ativar gate cookie de produção? (recomendado fora de localhost)",
  "init.prompt.outputMode": "Modo de saída",
  "init.prompt.confirmApply": "Aplicar essas mudanças?",
  "init.tokenReused":
    "  (reutilizando PYANCHOR_TOKEN existente de {envFile} — snippet bootstrap abaixo bate com o disco)",
  "init.plan.header": "Plano:",
  "init.dryRun": "(dry run — nenhum arquivo escrito)",
  "init.dryRun.nextSteps": "Os próximos passos seriam:",
  "init.aborted": "Cancelado — nenhum arquivo escrito.",
  "init.done.header":
    "Concluído. Próximos passos (não fazemos patch automático em arquivos fonte — risco de quebrar):",
  "init.done.quickCheck":
    "Verificação rápida (carrega automaticamente o .env recém-escrito):",
  "init.done.startSidecar": "Em seguida inicie o sidecar:",
  "init.done.prodHint":
    "  # (Produção: injete as mesmas vars via systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env, etc.)",
  "init.claudeCode.note":
    "\n  nota: claude-code usa um SDK in-process (@anthropic-ai/claude-agent-sdk),\n        não um binary. Após init, execute também:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # ou use o flow OAuth do Claude\n        `pyanchor doctor` avisa se faltar.",
  "init.forceWarning.intro":
    "\n⚠️  --force está ativo. PYANCHOR_TOKEN será regenerado.",
  "init.forceWarning.update":
    "    Atualize data-pyanchor-token na sua tag bootstrap script com o novo valor abaixo,",
  "init.forceWarning.401":
    "    senão seu overlay receberá 401 em toda chamada API.",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log não encontrado em {path}. Defina PYANCHOR_AUDIT_LOG=true para começar a escrever.",

  "agentTest.title": "pyanchor agent test — ping único do adapter",
  "agentTest.summary.ok":
    "agent {agent} respondeu em {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} não respondeu corretamente. Veja a saída acima."
};
