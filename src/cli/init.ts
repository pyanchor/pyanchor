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
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

import { detect, summarize, type AgentBin, type Detection, type Framework } from "./detect";
import { ask, confirm, select } from "./prompts";
import {
  renderBootstrapSnippet,
  renderEnv,
  renderNextConfigSnippet,
  renderRestartScript,
  shellQuote,
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

/**
 * v0.33.3 — pick a sidecar PORT that's actually free on this host.
 * Pre-fix `init` always defaulted to 3010 even when something else
 * (studio next dev, an old pyanchor instance, another service) was
 * already listening there. The user accepted the default, started
 * the sidecar, and got an immediate EADDRINUSE → confusion.
 *
 * Walk the candidate range (3010 → 3019, then 4710 → 4799 to dodge
 * the 3xxx zone where dev servers usually live). Return the first
 * one a TCP `listen` test succeeds on. Bind to 127.0.0.1 (the
 * sidecar's default `host`) so the test reflects what the sidecar
 * itself will see. Falls back to 3010 if every candidate is busy
 * (rare; user can override after).
 */
/**
 * v0.33.3 — per-backend label hint for the agent picker. The base
 * "✓ available / not detected" check still applies for the four
 * shell-out adapters; claude-code uses an SDK so we annotate it
 * separately.
 */
function agentChoiceLabel(a: AgentBin, d: Detection): string {
  if (a === "claude-code") {
    return "(uses @anthropic-ai/claude-agent-sdk — install separately + ANTHROPIC_API_KEY)";
  }
  return d.agentBins[a]
    ? "✓ available"
    : "(not detected — install before running pyanchor)";
}

async function findFreePort(preferred: number = 3010): Promise<number> {
  const candidates = [
    preferred,
    ...Array.from({ length: 9 }, (_, i) => preferred + i + 1),
    ...Array.from({ length: 90 }, (_, i) => 4710 + i)
  ];
  for (const candidate of candidates) {
    const free = await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.unref();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      try {
        server.listen(candidate, "127.0.0.1");
      } catch {
        resolve(false);
      }
    });
    if (free) return candidate;
  }
  return preferred; // worst case — caller can override
}

// v0.32.7 — read PYANCHOR_TOKEN (or NEXT_PUBLIC_PYANCHOR_TOKEN as
// fallback for Next.js .env.local files) from an existing env file
// so re-running init without --force keeps the on-disk token in
// sync with the printed bootstrap snippet. Returns null if the
// file isn't readable or has neither key.
function readExistingToken(envPath: string): string | null {
  let content: string;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return null;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const stripped = trimmed.startsWith("export ") ? trimmed.slice(7).trimStart() : trimmed;
    const m = stripped.match(/^(?:NEXT_PUBLIC_)?PYANCHOR_TOKEN\s*=\s*(.+)$/);
    if (m && m[1]) {
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      // Strip an inline `# comment` after whitespace (URL frags survive).
      const cm = v.match(/\s+#.*$/);
      if (cm) v = v.slice(0, v.length - cm[0].length).trim();
      if (v) return v;
    }
  }
  return null;
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
    // v0.33.3 — also auto-detect a free port in headless mode.
    // The interactive path got the same treatment.
    const headlessPort = await findFreePort(3010);
    return {
      agent: agentDefault,
      workspaceDir: path.join("/tmp", `pyanchor-${cwdName}-workspace`),
      restart: { approach: "noop", name: cwdName },
      port: headlessPort,
      healthcheckUrl: `http://127.0.0.1:${d.defaultDevPort}/`,
      requireGate: false,
      outputMode: "apply"
    };
  }

  // v0.33.3 — agent labels carry per-backend install hints. The
  // reviewer-sim (audit harness) flagged claude-code in particular:
  // its npm peer dep + ANTHROPIC_API_KEY / OAuth setup wasn't
  // surfaced at init time, so users only learned about it when the
  // first edit failed at the SDK import step.
  const agentChoices = AGENT_ORDER.map((a) => ({
    value: a,
    label: agentChoiceLabel(a, d)
  }));
  const agent = (await select("Which agent do you want to use?", agentChoices, agentDefault)) as AgentBin;

  if (agent === "claude-code") {
    console.log(
      `\n  note: claude-code uses an in-process SDK (@anthropic-ai/claude-agent-sdk),\n` +
        `        not a binary. After init, also run:\n` +
        `          npm install @anthropic-ai/claude-agent-sdk\n` +
        `          export ANTHROPIC_API_KEY=<key>   # or use Claude's OAuth flow\n` +
        `        \`pyanchor doctor\` will warn if either is missing.`
    );
  }

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

  // v0.33.3 — auto-detect a free port. Pre-fix the default was a
  // hard-coded 3010; on hosts where studio/another dev server
  // already owns 3010 the user accepted the default, started the
  // sidecar, and immediately hit EADDRINUSE.
  const suggestedPort = await findFreePort(3010);
  const portLabel =
    suggestedPort === 3010
      ? "Sidecar port"
      : `Sidecar port (3010 was busy — suggesting ${suggestedPort})`;
  const portStr = await ask(portLabel, String(suggestedPort));
  const port = Number.parseInt(portStr, 10) || suggestedPort;

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
    outputMode: ans.outputMode,
    // v0.29.0 — for Next.js, also emit NEXT_PUBLIC_PYANCHOR_TOKEN
    // so the bootstrap script tag's `data-pyanchor-token={process.env
    // .NEXT_PUBLIC_PYANCHOR_TOKEN}` resolves automatically without
    // an extra paste step.
    nextPublicToken: d.framework === "nextjs"
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

  postSteps.push(renderBootstrapSnippet(d.framework, d.routerKind, ans.port, token));

  if (d.framework === "nextjs") {
    postSteps.push("");
    postSteps.push(renderNextConfigSnippet(ans.port));
  }

  postSteps.push("");
  postSteps.push("Quick check (auto-loads the .env we just wrote):");
  postSteps.push(`  cd ${shellQuote(d.cwd)}`);
  postSteps.push(`  npx pyanchor doctor`);
  postSteps.push("");
  postSteps.push("Then start the sidecar:");
  postSteps.push(`  npx pyanchor`);
  postSteps.push(
    `  # (Production: feed the same vars via systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env, etc.)`
  );

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

  // v0.32.7 — when re-running init without --force and an env file
  // already exists, REUSE its PYANCHOR_TOKEN instead of generating
  // a fresh one. Pre-v0.32.7 init always rolled a new token but
  // skipped the env write if the file existed; the printed
  // bootstrap snippet then carried a token that wasn't anywhere on
  // disk, and pasting it into layout.tsx made every overlay call
  // 401. Caught by the codex audit harness (C2). Force still
  // rolls a new token (existing behavior with the warning above).
  const envFileNameEarly = d.framework === "nextjs" ? ".env.local" : ".env";
  const existingEnvPath = path.join(d.cwd, envFileNameEarly);
  let token: string;
  let tokenReused = false;
  if (!args.force && existsSync(existingEnvPath)) {
    const reused = readExistingToken(existingEnvPath);
    if (reused) {
      token = reused;
      tokenReused = true;
    } else {
      // env file exists but no PYANCHOR_TOKEN line — generate fresh
      // (writeIfMissing will then SKIP the env write, so the user
      // still gets a snippet that matches… nothing. Surface that.)
      token = randomBytes(32).toString("hex");
    }
  } else {
    token = randomBytes(32).toString("hex");
  }
  const plan = buildPlan(d, args, answers, token);
  if (tokenReused) {
    console.log(
      `\n  (reusing existing PYANCHOR_TOKEN from ${envFileNameEarly} — ` +
        `bootstrap snippet below matches what's on disk)`
    );
  }

  // v0.29.0 — round 18 recommendation 6: --force re-rolls the token
  // (every init invocation calls randomBytes(32)), which silently
  // desyncs from any data-pyanchor-token already pasted into
  // layout.tsx. Surface this loud-and-early so the user knows to
  // update the bootstrap snippet too.
  const envFileNameForWarn = d.framework === "nextjs" ? ".env.local" : ".env";
  if (args.force && existsSync(path.join(d.cwd, envFileNameForWarn))) {
    console.warn(
      `\n⚠️  --force is in effect. PYANCHOR_TOKEN will be regenerated.`
    );
    console.warn(
      `    Update data-pyanchor-token in your bootstrap script tag to the new value below,`
    );
    console.warn(
      `    or your overlay will get 401 on every API call.`
    );
  }

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
