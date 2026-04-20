/**
 * `pyanchor doctor` — local config diagnostics (v0.29.0+).
 *
 * Sister to `pyanchor init`. Where init helps you set up a config,
 * doctor tells you why your existing config isn't working. Replaces
 * the "stare at /readyz returning 503 and guess what's wrong" loop
 * with a single command that lists every check that ran, what
 * passed, what failed, and what to do about it.
 *
 * Why a separate CLI command instead of /api/admin/doctor?
 *   - /readyz must stay anonymous + boolean (k8s probe pattern).
 *     Detailed failure reasons in an HTTP response would either
 *     leak operator config or duplicate auth surface.
 *   - Doctor needs *local* fs + PATH visibility to be useful (e.g.
 *     "your restart script is mode 644, chmod +x it"). Running it
 *     in-process on the local machine where the sidecar will run
 *     is the right boundary.
 *   - It's also useful in CI or in a Dockerfile RUN to catch a
 *     misconfig before the sidecar even tries to listen.
 *
 * Doctor does NOT start the sidecar, doesn't touch state.json,
 * doesn't probe the healthcheck URL (the sidecar isn't running
 * yet — that probe would always 503). It only inspects what
 * `pyanchor` would observe at startup.
 *
 * Exit code: 0 if all checks pass, 1 if any failed (so
 * `pyanchor doctor && pyanchor` works).
 */

import { existsSync, accessSync, constants, statSync } from "node:fs";
import path from "node:path";

import {
  REQUIRED_PLACEHOLDER,
  commandExists,
  executablePathExists,
  pathExists,
  pyanchorConfig
} from "../config";

interface CheckResult {
  /** What was checked (display name). */
  name: string;
  /** ok | fail | warn — warnings don't fail the doctor exit code. */
  status: "ok" | "fail" | "warn";
  /** Optional detail line (file path, value, etc). */
  detail?: string;
  /** Suggested fix when status === "fail" / "warn". */
  fix?: string;
}

interface CheckGroup {
  title: string;
  checks: CheckResult[];
}

const symbolFor = (status: CheckResult["status"]): string => {
  switch (status) {
    case "ok":
      return "✓";
    case "fail":
      return "✗";
    case "warn":
      return "!";
  }
};

const colorize = (color: "green" | "red" | "yellow" | "dim", text: string): string => {
  // Honor NO_COLOR / non-TTY without pulling in chalk. The tests
  // that scrape doctor output set NO_COLOR=1 so they don't have to
  // strip ANSI.
  if (process.env.NO_COLOR || !process.stdout.isTTY) return text;
  const code = color === "green" ? 32 : color === "red" ? 31 : color === "yellow" ? 33 : 90;
  return `\x1b[${code}m${text}\x1b[0m`;
};

const colorFor = (status: CheckResult["status"]): "green" | "red" | "yellow" =>
  status === "ok" ? "green" : status === "fail" ? "red" : "yellow";

/** Required env vars — must be present (not the not-set placeholder). */
function checkRequiredEnv(): CheckGroup {
  const required: Array<{ name: string; value: string }> = [
    { name: "PYANCHOR_TOKEN", value: pyanchorConfig.token },
    { name: "PYANCHOR_APP_DIR", value: pyanchorConfig.appDir },
    { name: "PYANCHOR_WORKSPACE_DIR", value: pyanchorConfig.workspaceDir },
    { name: "PYANCHOR_RESTART_SCRIPT", value: pyanchorConfig.restartFrontendScript },
    { name: "PYANCHOR_HEALTHCHECK_URL", value: pyanchorConfig.healthcheckUrl }
  ];

  return {
    title: "Required environment variables",
    checks: required.map(({ name, value }): CheckResult => {
      if (value === REQUIRED_PLACEHOLDER) {
        return {
          name,
          status: "fail",
          fix: `Set ${name} in your environment (see .env.example or run \`pyanchor init\`).`
        };
      }
      // Mask the token in output — paranoid against accidentally
      // capturing doctor output into a Slack channel.
      const detail =
        name === "PYANCHOR_TOKEN" ? `set (${value.length} chars)` : value;
      return { name, status: "ok", detail };
    })
  };
}

function isWritable(target: string): boolean {
  try {
    accessSync(target, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function fileMode(target: string): string {
  try {
    return (statSync(target).mode & 0o777).toString(8).padStart(3, "0");
  } catch {
    return "?";
  }
}

/** Filesystem prerequisites — paths exist and have the right modes. */
function checkFilesystem(): CheckGroup {
  const checks: CheckResult[] = [];

  // App dir
  if (pyanchorConfig.appDir === REQUIRED_PLACEHOLDER) {
    checks.push({ name: "app dir", status: "fail", fix: "PYANCHOR_APP_DIR not set." });
  } else if (!pathExists(pyanchorConfig.appDir)) {
    checks.push({
      name: "app dir exists",
      status: "fail",
      detail: pyanchorConfig.appDir,
      fix: `mkdir -p ${pyanchorConfig.appDir}` +
        " — or point PYANCHOR_APP_DIR at the actual deployed app path."
    });
  } else {
    checks.push({ name: "app dir exists", status: "ok", detail: pyanchorConfig.appDir });
    if (pyanchorConfig.outputMode === "apply" && !isWritable(pyanchorConfig.appDir)) {
      checks.push({
        name: "app dir writable (apply mode)",
        status: "fail",
        detail: `mode ${fileMode(pyanchorConfig.appDir)}`,
        fix:
          `Apply-mode rsync needs write access to ${pyanchorConfig.appDir}. ` +
          `chown / chmod it for the pyanchor user, or switch to PYANCHOR_OUTPUT_MODE=pr.`
      });
    } else {
      checks.push({ name: "app dir writable", status: "ok" });
    }
  }

  // Workspace dir
  if (pyanchorConfig.workspaceDir === REQUIRED_PLACEHOLDER) {
    checks.push({ name: "workspace dir", status: "fail", fix: "PYANCHOR_WORKSPACE_DIR not set." });
  } else if (!pathExists(pyanchorConfig.workspaceDir)) {
    checks.push({
      name: "workspace exists",
      status: "fail",
      detail: pyanchorConfig.workspaceDir,
      fix: `mkdir -p ${pyanchorConfig.workspaceDir}`
    });
  } else {
    checks.push({ name: "workspace exists", status: "ok", detail: pyanchorConfig.workspaceDir });
    if (!isWritable(pyanchorConfig.workspaceDir)) {
      checks.push({
        name: "workspace writable",
        status: "fail",
        detail: `mode ${fileMode(pyanchorConfig.workspaceDir)}`,
        fix: `Workspace must be writable for the pyanchor user (the agent edits there).`
      });
    } else {
      checks.push({ name: "workspace writable", status: "ok" });
    }
  }

  // Restart script
  if (pyanchorConfig.restartFrontendScript === REQUIRED_PLACEHOLDER) {
    checks.push({ name: "restart script", status: "fail", fix: "PYANCHOR_RESTART_SCRIPT not set." });
  } else if (!pathExists(pyanchorConfig.restartFrontendScript)) {
    checks.push({
      name: "restart script exists",
      status: "fail",
      detail: pyanchorConfig.restartFrontendScript,
      fix: `Create the restart script (or run \`pyanchor init\` for a stub).`
    });
  } else if (!executablePathExists(pyanchorConfig.restartFrontendScript)) {
    checks.push({
      name: "restart script executable",
      status: "fail",
      detail: `mode ${fileMode(pyanchorConfig.restartFrontendScript)}`,
      fix: `chmod +x ${pyanchorConfig.restartFrontendScript}`
    });
  } else {
    checks.push({
      name: "restart script executable",
      status: "ok",
      detail: `${pyanchorConfig.restartFrontendScript} (mode ${fileMode(pyanchorConfig.restartFrontendScript)})`
    });
  }

  return { title: "Filesystem", checks };
}

/** Agent CLI presence + auth-state hints. */
function checkAgent(): CheckGroup {
  const checks: CheckResult[] = [];
  const agent = pyanchorConfig.agent.toLowerCase();
  checks.push({ name: "PYANCHOR_AGENT", status: "ok", detail: agent });

  if (agent === "claude-code") {
    // claude-code uses an npm peer dep (@anthropic-ai/claude-agent-sdk),
    // not a binary. We can't tell from the sidecar process whether the
    // host installed it; that error surfaces at first edit instead.
    checks.push({
      name: "claude-code agent",
      status: "warn",
      detail: "uses @anthropic-ai/claude-agent-sdk peer dep",
      fix:
        `Verify the host project has \`@anthropic-ai/claude-agent-sdk\` ` +
        `installed and ANTHROPIC_API_KEY exported. Doctor can't probe this from ` +
        `the sidecar process.`
    });
    return { title: "Agent", checks };
  }

  const binMap: Record<string, string> = {
    openclaw: pyanchorConfig.openClawBin,
    codex: pyanchorConfig.codexBin,
    aider: pyanchorConfig.aiderBin,
    gemini: pyanchorConfig.geminiBin
  };
  const bin = binMap[agent];
  if (!bin) {
    checks.push({
      name: "agent backend known",
      status: "fail",
      detail: agent,
      fix:
        `PYANCHOR_AGENT="${agent}" doesn't match any built-in adapter. ` +
        `Use one of: openclaw, claude-code, codex, aider, gemini.`
    });
    return { title: "Agent", checks };
  }

  if (commandExists(bin)) {
    checks.push({ name: `${agent} CLI resolves`, status: "ok", detail: bin });
  } else {
    checks.push({
      name: `${agent} CLI resolves`,
      status: "fail",
      detail: bin,
      fix:
        `\`${bin}\` not found on PATH. Install it (see docs/${agent}-setup.md ` +
        `or the agent's upstream README) and verify with \`command -v ${bin}\`. ` +
        `Or set PYANCHOR_${agent.toUpperCase().replace(/-/g, "_")}_BIN=/abs/path/to/${bin}.`
    });
  }

  return { title: "Agent", checks };
}

/** Output-mode-specific checks. */
function checkOutputMode(): CheckGroup {
  const mode = pyanchorConfig.outputMode;
  const checks: CheckResult[] = [];
  checks.push({ name: "PYANCHOR_OUTPUT_MODE", status: "ok", detail: mode });

  if (mode === "apply") {
    // Already covered by the writability check above + restart script
    // executability. Add a note.
    checks.push({
      name: "apply mode prerequisites",
      status: "ok",
      detail: "rsync workspace → app dir + restart script after build"
    });
  } else if (mode === "pr") {
    if (!commandExists(pyanchorConfig.gitBin)) {
      checks.push({
        name: "git on PATH",
        status: "fail",
        detail: pyanchorConfig.gitBin,
        fix: `Install git or set PYANCHOR_GIT_BIN=/abs/path/to/git.`
      });
    } else {
      checks.push({ name: "git on PATH", status: "ok", detail: pyanchorConfig.gitBin });
    }
    if (!commandExists(pyanchorConfig.ghBin)) {
      checks.push({
        name: "gh (GitHub CLI) on PATH",
        status: "fail",
        detail: pyanchorConfig.ghBin,
        fix:
          `Install gh (https://cli.github.com/) and run \`gh auth login\` as ` +
          `the pyanchor user, or set PYANCHOR_GH_BIN=/abs/path/to/gh.`
      });
    } else {
      checks.push({ name: "gh on PATH", status: "ok", detail: pyanchorConfig.ghBin });
    }
    // Workspace .git/ presence — PR mode requires a git working tree.
    if (
      pyanchorConfig.workspaceDir !== REQUIRED_PLACEHOLDER &&
      pathExists(pyanchorConfig.workspaceDir)
    ) {
      const gitDir = path.join(pyanchorConfig.workspaceDir, ".git");
      if (existsSync(gitDir)) {
        checks.push({ name: "workspace is a git repo", status: "ok", detail: gitDir });
      } else {
        checks.push({
          name: "workspace is a git repo",
          status: "fail",
          detail: pyanchorConfig.workspaceDir,
          fix:
            `PR mode requires the workspace to be a git clone of your app repo. ` +
            `Run: git clone <your-app-remote> ${pyanchorConfig.workspaceDir}`
        });
      }
    }
  } else if (mode === "dryrun") {
    checks.push({
      name: "dryrun mode",
      status: "ok",
      detail: "agent edits stay in workspace; no rsync / restart / push"
    });
  } else {
    checks.push({
      name: "output mode known",
      status: "fail",
      detail: mode,
      fix: `Unknown PYANCHOR_OUTPUT_MODE="${mode}". Use apply, pr, or dryrun.`
    });
  }

  return { title: `Output mode: ${mode}`, checks };
}

/** Optional but commonly important knobs — flagged as warn (not fail). */
function checkOptional(): CheckGroup {
  const checks: CheckResult[] = [];

  if (pyanchorConfig.allowedOrigins.length === 0) {
    checks.push({
      name: "PYANCHOR_ALLOWED_ORIGINS",
      status: "warn",
      detail: "(empty)",
      fix:
        "Production deployments should set this to a CSV of trusted origins " +
        "(e.g. https://app.example.com). Empty allowlist + cookie session = CSRF risk."
    });
  } else {
    checks.push({
      name: "PYANCHOR_ALLOWED_ORIGINS",
      status: "ok",
      detail: pyanchorConfig.allowedOrigins.join(", ")
    });
  }

  checks.push({
    name: "PYANCHOR_REQUIRE_GATE_COOKIE",
    status: pyanchorConfig.requireGateCookie ? "ok" : "warn",
    detail: pyanchorConfig.requireGateCookie ? "true" : "false",
    fix: pyanchorConfig.requireGateCookie
      ? undefined
      : "Off by default. Set true for production gating (see docs/SECURITY.md)."
  });

  checks.push({
    name: "PYANCHOR_AUDIT_LOG",
    status: pyanchorConfig.auditLogEnabled ? "ok" : "warn",
    detail: pyanchorConfig.auditLogEnabled
      ? `enabled (${pyanchorConfig.auditLogFile})`
      : "disabled",
    fix: pyanchorConfig.auditLogEnabled
      ? undefined
      : "Recommended for any team / production deploy."
  });

  if (pyanchorConfig.actorSigningSecret) {
    checks.push({
      name: "PYANCHOR_ACTOR_SIGNING_SECRET",
      status: "ok",
      detail: `set (${pyanchorConfig.actorSigningSecret.length} chars)`
    });
  }

  return { title: "Optional knobs", checks };
}

/** Render one group to stdout. */
function renderGroup(group: CheckGroup): void {
  console.log(`\n${group.title}`);
  for (const c of group.checks) {
    const sym = colorize(colorFor(c.status), symbolFor(c.status));
    const line = `  ${sym} ${c.name.padEnd(34)} ${c.detail ?? ""}`;
    console.log(line);
    if (c.fix && c.status !== "ok") {
      console.log(colorize("dim", `      → ${c.fix}`));
    }
  }
}

export interface DoctorReport {
  groups: CheckGroup[];
  failed: number;
  warned: number;
  passed: number;
  exitCode: 0 | 1;
}

/**
 * Parse `pyanchor doctor` arguments. Supported:
 *   --json    Emit machine-readable JSON instead of the human report.
 *             Exit code is the same; stderr stays empty for clean piping.
 */
interface DoctorArgs {
  json: boolean;
  printHelp: boolean;
}

function parseDoctorArgs(argv: string[]): DoctorArgs {
  const out: DoctorArgs = { json: false, printHelp: false };
  for (const a of argv) {
    if (a === "--help" || a === "-h") out.printHelp = true;
    else if (a === "--json") out.json = true;
    else throw new Error(`Unknown argument: ${a}. Try --help.`);
  }
  return out;
}

function doctorHelp(): string {
  return `Usage: pyanchor doctor [options]

Local config diagnostics. Runs every check the sidecar would do at
startup and prints what passed, what failed, and what to do about
each failure.

Options:
  --json     Emit JSON (one object) instead of the human report.
             Useful for monitoring (Datadog/Splunk, k8s sidecar
             readiness scripts) and CI gates.
  --help     This message.

Exit code: 0 if all required checks passed, 1 otherwise.
`;
}

/** Run all checks and print a report. Returns the report for tests. */
export function runDoctor(argv: string[] = []): DoctorReport {
  let args: DoctorArgs;
  try {
    args = parseDoctorArgs(argv);
  } catch (err) {
    console.error(`pyanchor doctor: ${err instanceof Error ? err.message : String(err)}`);
    return { groups: [], passed: 0, failed: 0, warned: 0, exitCode: 1 };
  }

  if (args.printHelp) {
    process.stdout.write(doctorHelp());
    return { groups: [], passed: 0, failed: 0, warned: 0, exitCode: 0 };
  }

  const groups: CheckGroup[] = [
    checkRequiredEnv(),
    checkFilesystem(),
    checkAgent(),
    checkOutputMode(),
    checkOptional()
  ];

  let passed = 0;
  let failed = 0;
  let warned = 0;
  for (const g of groups) {
    for (const c of g.checks) {
      if (c.status === "ok") passed++;
      else if (c.status === "fail") failed++;
      else warned++;
    }
  }
  const exitCode: 0 | 1 = failed > 0 ? 1 : 0;

  if (args.json) {
    // Stable JSON shape (Stable @ 1.0). Renaming or removing keys
    // is a major bump. Adding new keys is non-breaking.
    const report = {
      ts: new Date().toISOString(),
      summary: { passed, failed, warned, total: passed + failed + warned, exitCode },
      groups: groups.map((g) => ({
        title: g.title,
        checks: g.checks.map((c) => ({
          name: c.name,
          status: c.status,
          ...(c.detail !== undefined ? { detail: c.detail } : {}),
          ...(c.fix !== undefined ? { fix: c.fix } : {})
        }))
      }))
    };
    // process.stdout.write so the JSON is the entire output (no
    // trailing extras from console.log). Newline at end so tools
    // that expect line-delimited input cope.
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return { groups, passed, failed, warned, exitCode };
  }

  // Human-readable rendering (the v0.29.0 path, unchanged).
  console.log("pyanchor doctor — local config diagnostics");
  console.log(colorize("dim", "  (does not start the sidecar; only inspects what it would observe)"));
  for (const g of groups) {
    renderGroup(g);
  }

  const total = passed + failed + warned;
  console.log("");
  if (failed === 0) {
    console.log(
      colorize("green", `All required checks passed`) +
        ` (${passed}/${total} ok` +
        (warned > 0 ? `, ${warned} warning${warned === 1 ? "" : "s"}` : "") +
        `). Ready to run \`pyanchor\`.`
    );
  } else {
    console.log(
      colorize("red", `${failed} check(s) failed`) +
        `, ${warned} warning(s), ${passed} passed (total ${total}). ` +
        `Fix the ✗ items above and re-run \`pyanchor doctor\`.`
    );
  }

  // v0.29.2 — point operators at the access-control reference
  // when warnings show optional security knobs are off. Doctor
  // tells you "the sidecar will boot"; the access-control doc
  // tells you "the sidecar will reject the right requests".
  if (warned > 0 || failed > 0) {
    console.log(
      colorize(
        "dim",
        `For configuring access control (gate cookie, allowed origins, HMAC actor, ` +
          `production setups), see docs/ACCESS-CONTROL.md.`
      )
    );
  }

  return { groups, passed, failed, warned, exitCode };
}
