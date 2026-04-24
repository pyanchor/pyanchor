/** Japanese CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "正常",
  "common.fail": "失敗",
  "common.warn": "警告",

  "doctor.title": "pyanchor doctor — ローカル設定の診断",
  "doctor.subtitle":
    "(サイドカーは起動しません。起動時に何を見るかだけを点検します)",
  "doctor.dotenv.loaded": "読み込み: {files} (cwd dotenv 自動読み込み)",
  "doctor.group.required": "必須環境変数",
  "doctor.group.fs": "ファイルシステム",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "出力モード: {mode}",
  "doctor.group.optional": "オプション設定",
  "doctor.summary.allOk":
    "必須チェックすべて通過 ({passed}/{total} 正常{warnSuffix})。`pyanchor` 実行可能。",
  "doctor.summary.failed":
    "{failed} 件のチェック失敗、警告 {warned} 件、正常 {passed} 件 (合計 {total} 件)。上の ✗ 項目を修正して `pyanchor doctor` を再実行してください。",
  "doctor.summary.warnSuffix": "、警告 {warned} 件",
  "doctor.summary.accessControlHint":
    "アクセス制御 (gate cookie, allowed origins, HMAC actor, 本番設定) は docs/ACCESS-CONTROL.md を参照。",

  "init.title": "pyanchor init — 対話型スキャフォルダー",
  "init.detected": "  検出: {summary}",
  "init.error.noPackageJson":
    "\nこのディレクトリに package.json がありません。アプリの root で init を実行してください。",
  "init.prompt.agent": "どの agent を使用しますか?",
  "init.prompt.workspaceDir":
    "Workspace ディレクトリ (sync-back 前に agent が編集する scratch 領域)",
  "init.prompt.restartApproach":
    "Restart 方式 (編集成功後にフロントエンドをどう reload するか)",
  "init.prompt.pm2Name": "pm2 プロセス名",
  "init.prompt.systemctlUnit": "systemd unit 名",
  "init.prompt.dockerContainer": "docker コンテナ名",
  "init.prompt.port": "サイドカーの port",
  "init.prompt.portBusy":
    "サイドカーの port ({preferred} は使用中 — {suggested} を提案)",
  "init.prompt.healthcheckUrl":
    "Healthcheck URL (フロントエンドが復帰した時に 2xx を返す URL)",
  "init.prompt.requireGate":
    "本番用 gate cookie を有効化しますか? (localhost 以外で推奨)",
  "init.prompt.outputMode": "出力モード",
  "init.prompt.confirmApply": "この変更を適用しますか?",
  "init.tokenReused":
    "  (既存の {envFile} の PYANCHOR_TOKEN を再利用 — 下の bootstrap snippet はディスクと一致)",
  "init.plan.header": "計画:",
  "init.dryRun": "(dry run — ファイルは書きません)",
  "init.dryRun.nextSteps": "実際には次のステップが進みます:",
  "init.aborted": "中止 — ファイルを書きませんでした。",
  "init.done.header":
    "完了。次のステップ (ソースファイルは自動 patch しません — 壊すリスクが大きい):",
  "init.done.quickCheck":
    "クイックチェック (作成した .env が自動読み込みされます):",
  "init.done.startSidecar": "次にサイドカーを起動:",
  "init.done.prodHint":
    "  # (本番: 同じ環境変数を systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env などで注入してください)",
  "init.claudeCode.note":
    "\n  注意: claude-code は in-process SDK (@anthropic-ai/claude-agent-sdk) を使います。\n        binary ではなく SDK です。init 後に追加で:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # または Claude OAuth\n        どちらも無いと `pyanchor doctor` が警告します。",
  "init.forceWarning.intro":
    "\n⚠️  --force が有効です。PYANCHOR_TOKEN が再生成されます。",
  "init.forceWarning.update":
    "    bootstrap script タグの data-pyanchor-token も下の新しい値に更新してください。",
  "init.forceWarning.401":
    "    そうしないと、すべての overlay API 呼び出しが 401 になります。",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log が {path} に見つかりません。PYANCHOR_AUDIT_LOG=true を設定すると書き込みが始まります。",

  "agentTest.title": "pyanchor agent test — adapter 1回 ping",
  "agentTest.summary.ok":
    "agent {agent} が {ms}ms で応答しました。パイプライン正常。",
  "agentTest.summary.fail":
    "agent {agent} が正常に応答しませんでした。上の出力を確認してください。"
};
