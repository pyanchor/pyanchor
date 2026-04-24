/**
 * English CLI strings (default + fallback for missing translations).
 *
 * Keys are dot-namespaced: `<command>.<role>.<id>`. Add new keys
 * here first; locales that don't have them inherit the English
 * fallback automatically (see `i18n.ts`).
 *
 * Coverage policy: every CLI string the operator sees in
 * `doctor` / `init` / `logs` / `agent test` SHOULD eventually
 * land here. The first i18n ship (v0.35.0) covers the high-
 * traffic surface: command headers, group titles, summary
 * lines, init prompts. Per-check `fix:` strings stay inline
 * for now (next ship).
 */

export const strings: Record<string, string> = {
  // ─── shared ─────────────────────────────────────────────
  "common.ok": "ok",
  "common.fail": "fail",
  "common.warn": "warn",

  // ─── doctor ─────────────────────────────────────────────
  "doctor.title": "pyanchor doctor — local config diagnostics",
  "doctor.subtitle":
    "(does not start the sidecar; only inspects what it would observe)",
  "doctor.dotenv.loaded": "loaded: {files} (cwd dotenv autoload)",
  "doctor.group.required": "Required environment variables",
  "doctor.group.fs": "Filesystem",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "Output mode: {mode}",
  "doctor.group.optional": "Optional knobs",
  "doctor.summary.allOk":
    "All required checks passed ({passed}/{total} ok{warnSuffix}). Ready to run `pyanchor`.",
  "doctor.summary.failed":
    "{failed} check(s) failed, {warned} warning(s), {passed} passed (total {total}). Fix the ✗ items above and re-run `pyanchor doctor`.",
  "doctor.summary.warnSuffix": ", {warned} warning{plural}",
  "doctor.summary.accessControlHint":
    "For configuring access control (gate cookie, allowed origins, HMAC actor, production setups), see docs/ACCESS-CONTROL.md.",

  // ─── init ───────────────────────────────────────────────
  "init.title": "pyanchor init — interactive scaffolder",
  "init.detected": "  detected: {summary}",
  "init.error.noPackageJson":
    "\nNo package.json in this directory. Run init from your app's root.",
  "init.prompt.agent": "Which agent do you want to use?",
  "init.prompt.workspaceDir":
    "Workspace dir (scratch space the agent edits before sync-back)",
  "init.prompt.restartApproach":
    "Restart approach (how do you reload your frontend after a successful edit?)",
  "init.prompt.pm2Name": "pm2 process name",
  "init.prompt.systemctlUnit": "systemd unit name",
  "init.prompt.dockerContainer": "docker container name",
  "init.prompt.port": "Sidecar port",
  "init.prompt.portBusy": "Sidecar port ({preferred} was busy — suggesting {suggested})",
  "init.prompt.healthcheckUrl":
    "Healthcheck URL (returns 2xx once your frontend is back up)",
  "init.prompt.requireGate":
    "Enable production gate cookie? (recommended for non-localhost)",
  "init.prompt.outputMode": "Output mode",
  "init.prompt.confirmApply": "Apply these changes?",
  "init.tokenReused":
    "  (reusing existing PYANCHOR_TOKEN from {envFile} — bootstrap snippet below matches what's on disk)",
  "init.plan.header": "Plan:",
  "init.dryRun": "(dry run — no files written)",
  "init.dryRun.nextSteps": "Would-be next steps:",
  "init.aborted": "Aborted — no files written.",
  "init.done.header":
    "Done. Next steps (we don't auto-patch source files — too easy to mangle):",
  "init.done.quickCheck":
    "Quick check (auto-loads the .env we just wrote):",
  "init.done.startSidecar": "Then start the sidecar:",
  "init.done.prodHint":
    "  # (Production: feed the same vars via systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env, etc.)",
  "init.claudeCode.note":
    "\n  note: claude-code uses an in-process SDK (@anthropic-ai/claude-agent-sdk),\n        not a binary. After init, also run:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # or use Claude's OAuth flow\n        `pyanchor doctor` will warn if either is missing.",
  "init.forceWarning.intro":
    "\n⚠️  --force is in effect. PYANCHOR_TOKEN will be regenerated.",
  "init.forceWarning.update":
    "    Update data-pyanchor-token in your bootstrap script tag to the new value below,",
  "init.forceWarning.401":
    "    or your overlay will get 401 on every API call.",

  // ─── logs ───────────────────────────────────────────────
  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log not found at {path}. Set PYANCHOR_AUDIT_LOG=true to start writing one.",

  // ─── agent test ─────────────────────────────────────────
  "agentTest.title": "pyanchor agent test — one-shot adapter ping",
  "agentTest.summary.ok":
    "agent {agent} replied in {ms}ms. Pipeline OK.",
  "agentTest.summary.fail":
    "agent {agent} did not respond cleanly. See output above."
};
