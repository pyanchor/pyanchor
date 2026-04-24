/** Simplified Chinese CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "正常",
  "common.fail": "失败",
  "common.warn": "警告",

  "doctor.title": "pyanchor doctor — 本地配置诊断",
  "doctor.subtitle":
    "(不会启动 sidecar；只检查启动时会观察到什么)",
  "doctor.dotenv.loaded": "已加载: {files} (cwd dotenv 自动加载)",
  "doctor.group.required": "必需的环境变量",
  "doctor.group.fs": "文件系统",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "输出模式: {mode}",
  "doctor.group.optional": "可选项",
  "doctor.summary.allOk":
    "所有必需检查通过 ({passed}/{total} 正常{warnSuffix})。可以运行 `pyanchor`。",
  "doctor.summary.failed":
    "{failed} 项检查失败、警告 {warned} 项、通过 {passed} 项 (共 {total} 项)。请修复上方 ✗ 项后重新运行 `pyanchor doctor`。",
  "doctor.summary.warnSuffix": "、警告 {warned} 项",
  "doctor.summary.accessControlHint":
    "访问控制 (gate cookie, allowed origins, HMAC actor, 生产配置) 请参考 docs/ACCESS-CONTROL.md。",

  "init.title": "pyanchor init — 交互式脚手架",
  "init.detected": "  检测到: {summary}",
  "init.error.noPackageJson":
    "\n该目录没有 package.json。请在应用 root 目录运行 init。",
  "init.prompt.agent": "想使用哪个 agent?",
  "init.prompt.workspaceDir":
    "Workspace 目录 (sync-back 之前 agent 编辑的 scratch 空间)",
  "init.prompt.restartApproach":
    "Restart 方式 (编辑成功后如何 reload 前端)",
  "init.prompt.pm2Name": "pm2 进程名",
  "init.prompt.systemctlUnit": "systemd unit 名",
  "init.prompt.dockerContainer": "docker 容器名",
  "init.prompt.port": "Sidecar port",
  "init.prompt.portBusy":
    "Sidecar port ({preferred} 已被占用 — 建议 {suggested})",
  "init.prompt.healthcheckUrl":
    "Healthcheck URL (前端恢复后返回 2xx 的 URL)",
  "init.prompt.requireGate":
    "启用生产 gate cookie? (非 localhost 推荐)",
  "init.prompt.outputMode": "输出模式",
  "init.prompt.confirmApply": "应用这些更改?",
  "init.tokenReused":
    "  (复用现有 {envFile} 的 PYANCHOR_TOKEN — 下方 bootstrap snippet 与磁盘一致)",
  "init.plan.header": "计划:",
  "init.dryRun": "(dry run — 不写文件)",
  "init.dryRun.nextSteps": "实际会执行以下步骤:",
  "init.aborted": "已取消 — 没有写入文件。",
  "init.done.header":
    "完成。下一步 (我们不自动 patch 源文件 — 太容易破坏):",
  "init.done.quickCheck":
    "快速检查 (会自动加载刚写入的 .env):",
  "init.done.startSidecar": "然后启动 sidecar:",
  "init.done.prodHint":
    "  # (生产: 通过 systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env 等注入相同的环境变量)",
  "init.claudeCode.note":
    "\n  注意: claude-code 使用 in-process SDK (@anthropic-ai/claude-agent-sdk),\n        不是 binary。init 后还需要:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # 或使用 Claude OAuth\n        缺少任意一个 `pyanchor doctor` 都会警告。",
  "init.forceWarning.intro":
    "\n⚠️  --force 已启用。PYANCHOR_TOKEN 将重新生成。",
  "init.forceWarning.update":
    "    请将 bootstrap script 标签的 data-pyanchor-token 更新为下方的新值,",
  "init.forceWarning.401":
    "    否则所有 overlay API 调用都会返回 401。",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "在 {path} 找不到 audit log。设置 PYANCHOR_AUDIT_LOG=true 即可开始写入。",

  "agentTest.title": "pyanchor agent test — adapter 单次 ping",
  "agentTest.summary.ok":
    "agent {agent} 在 {ms}ms 内响应。流水线正常。",
  "agentTest.summary.fail":
    "agent {agent} 没有正常响应。请查看上方输出。"
};
