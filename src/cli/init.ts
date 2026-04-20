/**
 * `pyanchor init` — interactive scaffolder.
 *
 * Goals:
 *   - Replace the README's 5-step quickstart with one command.
 *   - Detect framework + agent + dev port automatically; prompt only
 *     for things we can't know.
 *   - Write the safe stuff (env file, restart script). Print the
 *     risky stuff (JSX layout patch, next.config rewrite) so the
 *     user can paste — string-based JSX patching is fragile and the
 *     cost of mangling layout.tsx beats the cost of a copy step.
 *   - Idempotent: re-running on an already-initialized project
 *     refuses to clobber files unless --force.
 *   - Non-TTY safe: in CI / piped stdin, every prompt returns its
 *     default so `npx pyanchor init --yes` works headlessly.
 *
 * Phase 1 (this ship, v0.28.0):
 *   - .env.local generation
 *   - restart-frontend.sh generation (4 presets + custom)
 *   - bootstrap snippet + next.config snippet PRINTED, not patched
 *
 * Phase 2 (future):
 *   - Auto-patch layout.tsx via AST (jscodeshift) once we have an
 *     idempotent pattern that survives across user formatting styles.
 *   - Auto-patch next.config.mjs (easier — module.exports / export
 *     default detection is a smaller surface than JSX).
 */

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { detect, summarize, type AgentBin, type Detection, type Framework } from "./detect";
import { ask, confirm, select } from "./prompts";
import {
  renderBootstrapSnippet,
  renderEnv,
  renderNextConfigSnippet,
  renderRestartScript,
  type RestartTemplateInput
} from "./templates";

interface ParsedArgs {
  cwd: string;
  yes: boolean;
  dryRun: boolean;
  force: boolean;
  printHelp: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    cwd: process.cwd(),
    yes: false,
    dryRun: false,
    force: false,
    printHelp: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.printHelp = true;
    else if (arg === "--yes" || arg === "-y") out.yes = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--force") out.force = true;
    else if (arg === "--cwd") {
      const v = argv[i + 1];
      if (!v) throw new Error("--cwd requires a path");
      out.cwd = path.resolve(v);
      i++;
    } else if (arg.startsWith("--cwd=")) {
      out.cwd = path.resolve(arg.slice("--cwd=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}. Try --help.`);
    }
  }
  return out;
}

function helpText(): string {
  return `Usage: pyanchor init [options]

Interactive scaffolder for a new pyanchor integration. Auto-detects
your framework + agent CLI, generates .env.local + restart script,
and prints the bootstrap snippet you copy into your global layout.

Options:
  --cwd <path>   Project root to init (default: current directory)
  --yes, -y      Accept all defaults (headless / CI mode)
  --dry-run      Show what would be written without touching disk
  --force        Overwrite files that already exist
  --help, -h     Show this message

Run from the root of your Next.js / Vite / Astro project.
`;
}

interface PlanAction {
  label: string;
  apply(): void;
}

interface Plan {
  actions: PlanAction[];
  /** Things we deliberately won't auto-do — printed for the user. */
  postSteps: string[];
}

const writeIfMissing = (filePath: string, contents: string, force: boolean, mode?: number): boolean => {
  if (existsSync(filePath) && !force) return false;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, "utf8");
  if (mode !== undefined) chmodSync(filePath, mode);
  return true;
};

interface Answers {
  agent: AgentBin;
  workspaceDir: string;
  restart: RestartTemplateInput;
  port: number;
  healthcheckUrl: string;
  requireGate: boolean;
  outputMode: "apply" | "pr" | "dryrun";
}

const AGENT_ORDER: AgentBin[] = ["claude-code", "openclaw", "codex", "aider", "gemini"];

function pickAgentDefault(d: Detection): AgentBin {
  // Prefer a CLI we actually found on PATH (or in deps for claude-code).
  const available = AGENT_ORDER.find((a) => d.agentBins[a]);
  if (available) return available;
  // Otherwise default to claude-code as the easiest to set up.
  return "claude-code";
}

async function gatherAnswers(d: Detection, args: ParsedArgs): Promise<Answers> {
  const cwdName = path.basename(d.cwd) || "app";
  const agentDefault = pickAgentDefault(d);

  if (args.yes) {
    return {
      agent: agentDefault,
      workspaceDir: path.join("/tmp", `pyanchor-${cwdName}-workspace`),
      restart: { approach: "noop", name: cwdName },
      port: 3010,
      healthcheckUrl: `http://127.0.0.1:${d.defaultDevPort}/`,
      requireGate: false,
      outputMode: "apply"
    };
  }

  const agentChoices = AGENT_ORDER.map((a) => ({
    value: a,
    label: d.agentBins[a] ? "✓ available" : "(not detected — install before running pyanchor)"
  }));
  const agent = (await select("Which agent do you want to use?", agentChoices, agentDefault)) as AgentBin;

  const workspaceDir = await ask(
    "Workspace dir (scratch space the agent edits before sync-back)",
    path.join("/tmp", `pyanchor-${cwdName}-workspace`)
  );

  const approach = (await select(
    "Restart approach (how do you reload your frontend after a successful edit?)",
    [
      { value: "noop", label: "no-op — fine for `next dev` / `vite` (hot reload handles it)" },
      { value: "pm2", label: "pm2 reload <name>" },
      { value: "systemctl", label: "sudo systemctl restart <unit>" },
      { value: "docker", label: "docker restart <container>" },
      { value: "custom", label: "I'll write the script myself later" }
    ],
    "noop"
  )) as RestartTemplateInput["approach"];

  let restartName = cwdName;
  if (approach !== "noop" && approach !== "custom") {
    const suggested =
      approach === "pm2" ? cwdName :
      approach === "systemctl" ? `${cwdName}.service` :
      cwdName;
    restartName = await ask(
      approach === "pm2" ? "pm2 process name" :
      approach === "systemctl" ? "systemd unit name" :
      "docker container name",
      suggested
    );
  }

  const portStr = await ask("Sidecar port", "3010");
  const port = Number.parseInt(portStr, 10) || 3010;

  const healthcheckUrl = await ask(
    "Healthcheck URL (returns 2xx once your frontend is back up)",
    `http://127.0.0.1:${d.defaultDevPort}/`
  );

  const requireGate = await confirm("Enable production gate cookie? (recommended for non-localhost)", false);

  const outputMode = (await select(
    "Output mode",
    [
      { value: "apply", label: "rsync workspace → app + restart (default — fastest dev loop)" },
      { value: "pr", label: "git push + open PR (review before live; needs gh CLI)" },
      { value: "dryrun", label: "build only, no apply (test the agent path)" }
    ],
    "apply"
  )) as "apply" | "pr" | "dryrun";

  return { agent, workspaceDir, restart: { approach, name: restartName }, port, healthcheckUrl, requireGate, outputMode };
}

function buildPlan(d: Detection, args: ParsedArgs, ans: Answers, token: string): Plan {
  const actions: PlanAction[] = [];

  // 1. .env.local (or .env if no Next.js — Vite/Astro use .env)
  const envFileName = d.framework === "nextjs" ? ".env.local" : ".env";
  const envPath = path.join(d.cwd, envFileName);
  const envContents = renderEnv({
    token,
    agent: ans.agent,
    framework: d.framework,
    appDir: d.cwd,
    workspaceDir: ans.workspaceDir,
    restartScript: path.join(d.cwd, "scripts", "pyanchor-restart.sh"),
    healthcheckUrl: ans.healthcheckUrl,
    port: ans.port,
    requireGate: ans.requireGate,
    allowedOrigins: [],
    outputMode: ans.outputMode
  });
  actions.push({
    label: `write ${envFileName} (${existsSync(envPath) && !args.force ? "SKIP — already exists, use --force" : "new file"})`,
    apply: () => writeIfMissing(envPath, envContents, args.force)
  });

  // 2. restart script
  const restartPath = path.join(d.cwd, "scripts", "pyanchor-restart.sh");
  actions.push({
    label: `write scripts/pyanchor-restart.sh (${existsSync(restartPath) && !args.force ? "SKIP — already exists" : "new file, chmod +x"})`,
    apply: () => writeIfMissing(restartPath, renderRestartScript(ans.restart), args.force, 0o755)
  });

  // 3. workspace dir
  actions.push({
    label: `mkdir -p ${ans.workspaceDir}`,
    apply: () => mkdirSync(ans.workspaceDir, { recursive: true })
  });

  // Post steps the user must do themselves.
  const postSteps: string[] = [];

  postSteps.push(renderBootstrapSnippet(d.framework, d.routerKind));

  if (d.framework === "nextjs") {
    postSteps.push("");
    postSteps.push(renderNextConfigSnippet());
  }

  postSteps.push("");
  postSteps.push("To start the sidecar:");
  postSteps.push(`  cd ${d.cwd}`);
  postSteps.push(`  source ${envFileName}; pyanchor`);
  postSteps.push(`  # (or load the env via your process manager / docker)`);

  return { actions, postSteps };
}

export async function runInit(argv: string[]): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`pyanchor init: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  if (args.printHelp) {
    process.stdout.write(helpText());
    return 0;
  }

  console.log("pyanchor init — interactive scaffolder\n");

  const d = detect(args.cwd);
  console.log(`  detected: ${summarize(d)}`);

  if (!d.hasPackageJson) {
    console.error("\nNo package.json in this directory. Run init from your app's root.");
    return 1;
  }

  console.log();
  const answers = await gatherAnswers(d, args);

  const token = randomBytes(32).toString("hex");
  const plan = buildPlan(d, args, answers, token);

  console.log("\nPlan:");
  plan.actions.forEach((a) => console.log(`  - ${a.label}`));

  if (args.dryRun) {
    console.log("\n(dry run — no files written)");
    console.log("\nWould-be next steps:");
    plan.postSteps.forEach((s) => console.log(s));
    return 0;
  }

  const proceed = args.yes ? true : await confirm("Apply these changes?", true);
  if (!proceed) {
    console.log("\nAborted — no files written.");
    return 0;
  }

  for (const action of plan.actions) {
    try {
      action.apply();
      console.log(`  ✓ ${action.label}`);
    } catch (err) {
      console.error(`  ✗ ${action.label}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }

  console.log("\nDone. Next steps (we don't auto-patch source files — too easy to mangle):\n");
  plan.postSteps.forEach((s) => console.log(s));
  console.log();

  return 0;
}
