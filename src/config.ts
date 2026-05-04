import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, userInfo } from "node:os";
import path from "node:path";

const isLinux = process.platform === "linux";
const env = process.env;

export const REQUIRED_PLACEHOLDER = "__PYANCHOR_NOT_SET__";
const PLACEHOLDER = REQUIRED_PLACEHOLDER;

const requireEnv = (name: string): string => env[name]?.trim() || PLACEHOLDER;
const optionalEnv = (name: string, fallback: string): string => env[name]?.trim() || fallback;
// v0.32.7 — invalid env values are collected here and surfaced by
// validateConfig() so the failure mode matches the missing-required
// path (clean exit + actionable message instead of an uncaught
// throw at module load time, which would print a stack trace before
// our message). Exported for `pyanchor doctor` to surface the same
// errors without booting the sidecar.
export const numericEnvErrors: string[] = [];

const optionalNumber = (name: string, fallback: number): number => {
  const value = env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    // Caught by codex audit (C12). Pre-fix `PYANCHOR_PORT=not-a-
    // number` silently resolved to the default 3010, surprising
    // operators with collisions and bad reverse-proxy targets.
    numericEnvErrors.push(
      `${name}=${JSON.stringify(value)} is not a valid number ` +
        `(remove it to use the default ${fallback}, or set a numeric value)`
    );
    return fallback;
  }
  return parsed;
};
const optionalBool = (name: string, fallback: boolean): boolean => {
  const value = env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true" || value === "1" || value === "yes" || value === "on") return true;
  if (value === "false" || value === "0" || value === "no" || value === "off") return false;
  return fallback;
};

const resolveServiceRoot = () => {
  if (env.PYANCHOR_SERVICE_ROOT) {
    return env.PYANCHOR_SERVICE_ROOT;
  }

  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "build.mjs")) && existsSync(path.join(cwd, "src"))) {
    return cwd;
  }

  const nested = path.join(cwd, "node_modules", "pyanchor");
  if (existsSync(nested)) {
    return nested;
  }

  return path.resolve(__dirname, "..");
};

const serviceRoot = resolveServiceRoot();
const currentUser = userInfo().username;

// v0.33.0 — strict allowlist for runtime base/alias paths. Pre-fix
// the only constraint was a leading slash, so a malicious
// PYANCHOR_RUNTIME_BASE_PATH could include quote/control characters
// that broke out of the admin page's <a href="..."> attribute. The
// admin route is token-gated so this isn't a remote anonymous XSS,
// but it IS a config-origin sink. Caught by codex static audit.
const BASE_PATH_RE = /^\/[A-Za-z0-9._~/-]+$/;
const normalizeBasePath = (value: string | undefined, fallback: string) => {
  const trimmed = (value ?? fallback).trim();
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const stripped = normalized === "/" ? fallback : normalized.replace(/\/+$/, "");
  if (!BASE_PATH_RE.test(stripped)) {
    // Use the same numericEnvErrors-style deferred surfacing so the
    // failure shows up in validateConfig() / doctor instead of
    // throwing at module load with a stack trace.
    numericEnvErrors.push(
      `runtime base/alias path ${JSON.stringify(stripped)} is not URL-path-shaped ` +
        `(allowed: leading "/" + [A-Za-z0-9._~/-]+). Falling back to "${fallback}".`
    );
    return fallback;
  }
  return stripped;
};

const stateDir = env.PYANCHOR_STATE_DIR?.trim() || path.join(homedir(), ".pyanchor");

export const pyanchorConfig = {
  // ─── required: target Next.js app integration ──────────────────
  appDir: requireEnv("PYANCHOR_APP_DIR"),
  restartFrontendScript: requireEnv("PYANCHOR_RESTART_SCRIPT"),
  healthcheckUrl: requireEnv("PYANCHOR_HEALTHCHECK_URL"),

  // ─── required: agent workspace ─────────────────────────────────
  workspaceDir: requireEnv("PYANCHOR_WORKSPACE_DIR"),

  // ─── required: auth ────────────────────────────────────────────
  // Bearer token for the runtime + admin API. Generate ≥32 random bytes.
  token: requireEnv("PYANCHOR_TOKEN"),

  // ─── agent backend selection ───────────────────────────────────
  // Which adapter handles the AI step. Must match an entry in src/agents/.
  agent: optionalEnv("PYANCHOR_AGENT", "openclaw"),

  // ─── framework profile ─────────────────────────────────────────
  // Which framework profile drives the default install/build commands,
  // workspace excludes, and route hints. Built-in: nextjs (default),
  // vite. Unknown values fall back to nextjs with a warning. Override
  // the install/build commands directly via PYANCHOR_INSTALL_COMMAND /
  // PYANCHOR_BUILD_COMMAND if you need a third-party stack (Astro,
  // Remix, SvelteKit, etc.) — those two envs alone are usually enough.
  framework: optionalEnv("PYANCHOR_FRAMEWORK", "nextjs"),

  // Shell command to install workspace dependencies. Empty string =
  // use the framework profile's default. Runs in the workspace dir
  // via `bash -lc` as the agent user. Example overrides:
  //   "pnpm install --frozen-lockfile"
  //   "npm ci"
  //   "bun install --frozen-lockfile"
  installCommand: optionalEnv("PYANCHOR_INSTALL_COMMAND", ""),

  // Shell command to validate the workspace builds before sync-back.
  // Empty string = use the framework profile's default. Runs in the
  // workspace dir via `bash -lc`. Example overrides:
  //   "pnpm run build"
  //   "vite build"
  //   "astro check && astro build"
  buildCommand: optionalEnv("PYANCHOR_BUILD_COMMAND", ""),

  // ─── agent: shared knobs ───────────────────────────────────────
  agentId: optionalEnv("PYANCHOR_AGENT_ID", "pyanchor"),
  // v0.32.3 — empty default. Pre-v0.32.3 the default was
  // "openai-codex/gpt-5.4" (an openclaw-shaped routing prefix), which
  // got forwarded as `-m` to codex / aider / claude-code adapters
  // and broke every first-time edit on those backends because the
  // model name isn't valid for the underlying CLI. Gemini already
  // had a per-adapter workaround (v0.25.1); codex / aider / claude
  // -code did not. Now: empty string flows through as falsy → those
  // adapters skip `-m` entirely → CLI uses its own default. OpenClaw
  // keeps a self-contained fallback so behavior there is unchanged.
  model: optionalEnv("PYANCHOR_AGENT_MODEL", ""),
  thinking: optionalEnv("PYANCHOR_AGENT_THINKING", "medium"),

  // ─── agent: OpenClaw-specific knobs ────────────────────────────
  openClawBin: optionalEnv("PYANCHOR_OPENCLAW_BIN", "openclaw"),
  openClawUser: optionalEnv("PYANCHOR_OPENCLAW_USER", currentUser),

  // ─── workspace command overrides (advanced) ────────────────────
  // Override the binaries the worker uses to wrap workspace ops.
  // The defaults (`/usr/bin/sudo`, `/usr/bin/flock`) match the
  // production deployment model where the worker runs as a system
  // user and shells out under sudo. Override to point at no-op
  // wrappers in test sandboxes (e.g. `/bin/true`) or to relocated
  // binaries on non-standard distros.
  // PYANCHOR_SUDO_BIN=/usr/bin/sudo
  sudoBin: optionalEnv("PYANCHOR_SUDO_BIN", "/usr/bin/sudo"),
  // PYANCHOR_FLOCK_BIN=/usr/bin/flock
  flockBin: optionalEnv("PYANCHOR_FLOCK_BIN", "/usr/bin/flock"),

  // ─── agent: shell-out adapters (codex, aider, gemini) ─────────
  // Path or basename of the OpenAI Codex CLI binary. Default: `codex` on PATH.
  // Install: `npm i -g @openai/codex`.
  codexBin: optionalEnv("PYANCHOR_CODEX_BIN", "codex"),
  // Path or basename of the aider-chat CLI binary. Default: `aider` on PATH.
  // Install: `pip install aider-chat`.
  aiderBin: optionalEnv("PYANCHOR_AIDER_BIN", "aider"),
  // Path or basename of the Google Gemini CLI binary. Default: `gemini`
  // on PATH. Install: `npm i -g @google/gemini-cli`.
  // Auth: `export GEMINI_API_KEY=...` (from aistudio.google.com), OR
  // `gemini auth login` (OAuth, persists), OR Vertex AI via
  // GOOGLE_API_KEY + GOOGLE_GENAI_USE_VERTEXAI=true.
  geminiBin: optionalEnv("PYANCHOR_GEMINI_BIN", "gemini"),

  // ─── cross-user / file ownership (default: same user) ──────────
  appDirOwner: optionalEnv("PYANCHOR_APP_DIR_OWNER", `${currentUser}:${currentUser}`),
  pm2ProcessName: optionalEnv("PYANCHOR_FRONTEND_PM2_NAME", ""),

  // ─── timeouts ──────────────────────────────────────────────────
  agentTimeoutSeconds: optionalNumber("PYANCHOR_AGENT_TIMEOUT_S", 900),
  installTimeoutMs: optionalNumber("PYANCHOR_INSTALL_TIMEOUT_MS", 600_000),
  buildTimeoutMs: optionalNumber("PYANCHOR_BUILD_TIMEOUT_MS", 900_000),

  // ─── retention / quotas ────────────────────────────────────────
  // How many recent messages and activity-log lines to keep in
  // state.json. Old entries are dropped from the head when the
  // limit is exceeded. Default keeps the in-page overlay snappy
  // for short-lived dev sessions; raise if you need longer
  // forensic context.
  maxMessages: optionalNumber("PYANCHOR_MAX_MESSAGES", 24),
  maxActivityLog: optionalNumber("PYANCHOR_MAX_ACTIVITY_LOG", 80),
  // Max characters accepted in a single user prompt. The Express
  // body parser already caps at 128KB; this is a semantic cap on
  // top of that for cost / agent-context-window control.
  promptMaxLength: optionalNumber("PYANCHOR_PROMPT_MAX_LENGTH", 8000),

  // ─── dev ergonomics ────────────────────────────────────────────
  // When true: skip workspace install + next build + frontend restart;
  // rsync alone triggers Next.js HMR. Drops edit cycle from ~30s-3min
  // to ~1-2s. ONLY safe when the host page is `next dev`-served.
  fastReload: optionalBool("PYANCHOR_FAST_RELOAD", false),

  // ─── workspace strategy ────────────────────────────────────────
  // When true (legacy v0.1.0 behavior): rm -rf the workspace before
  // every job. Costs a full yarn install + next build every cycle.
  // When false (default in v0.2.3+): keep the workspace persistent
  // across jobs; rsync only updates changed files; node_modules and
  // .next caches survive, making yarn install / next build incremental.
  // Flip back to true if you suspect stale workspace state is breaking
  // a run.
  freshWorkspace: optionalBool("PYANCHOR_FRESH_WORKSPACE", false),

  // ─── server ────────────────────────────────────────────────────
  port: optionalNumber("PYANCHOR_PORT", 3010),
  host: optionalEnv("PYANCHOR_HOST", "127.0.0.1"),
  runtimeBasePath: normalizeBasePath(env.PYANCHOR_RUNTIME_BASE_PATH, "/_pyanchor"),
  runtimeAliasPath: normalizeBasePath(env.PYANCHOR_RUNTIME_ALIAS_PATH, "/runtime"),
  allowedOrigins: (env.PYANCHOR_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),

  // Express trust-proxy preset. Default "loopback" trusts only
  // 127.0.0.0/8 and ::1 — safe when pyanchor is behind nginx on the
  // same host. Use "uniquelocal" for private LAN proxies, a CSV of
  // CIDRs for explicit lists, or "true"/"false" for the all-or-none
  // extremes. v0.2.5 used true unconditionally, which trusted any
  // upstream X-Forwarded-* header — exploitable if the sidecar was
  // ever exposed to the open internet.
  trustProxy: optionalEnv("PYANCHOR_TRUST_PROXY", "loopback"),

  // Accept the deprecated `?token=<...>` query param (true) or reject
  // it (false, default since v0.2.6). Query tokens leak via proxy
  // logs and browser history; prefer the Authorization header or the
  // session cookie. Flip this on only for legacy callers you control.
  allowQueryToken: optionalBool("PYANCHOR_ALLOW_QUERY_TOKEN", false),

  // ─── PR mode (v0.19.0) ──────────────────────────────────────────
  // Used when PYANCHOR_OUTPUT_MODE=pr. Edits land as a reviewable PR
  // instead of being rsynced to the live app dir. Requires `git` and
  // `gh` (GitHub CLI) on the worker user's PATH, and a workspace that
  // contains a .git working tree (auto-included from rsync when
  // outputMode === "pr"; see workspace.ts).
  gitBin: optionalEnv("PYANCHOR_GIT_BIN", "git"),
  ghBin: optionalEnv("PYANCHOR_GH_BIN", "gh"),
  gitRemote: optionalEnv("PYANCHOR_GIT_REMOTE", "origin"),
  gitBaseBranch: optionalEnv("PYANCHOR_GIT_BASE_BRANCH", "main"),
  gitBranchPrefix: optionalEnv("PYANCHOR_GIT_BRANCH_PREFIX", "pyanchor/"),

  // ─── output mode (v0.18.0) ──────────────────────────────────────
  // What happens AFTER the agent finishes editing the workspace.
  //   "apply"  — current behavior: rsync workspace → app, restart.
  //   "pr"     — v0.19+: git commit + push + open PR. No rsync, no
  //              restart. The agent's edits land as a reviewable PR
  //              instead of going straight to prod.
  //   "dryrun" — skip both. Useful for testing the agent path without
  //              touching the live app.
  outputMode: optionalEnv("PYANCHOR_OUTPUT_MODE", "apply") as "apply" | "pr" | "dryrun",

  // ─── webhooks (v0.20.0) ─────────────────────────────────────────
  // Fire-and-forget POST notifications mirrored from the audit
  // events. Empty value = no dispatch for that event. Auto-detects
  // Slack / Discord formatting from the URL host; pass FORMAT=raw
  // to send the generic JSON payload instead.
  webhookEditRequestedUrl: optionalEnv("PYANCHOR_WEBHOOK_EDIT_REQUESTED_URL", ""),
  webhookEditAppliedUrl: optionalEnv("PYANCHOR_WEBHOOK_EDIT_APPLIED_URL", ""),
  webhookPrOpenedUrl: optionalEnv("PYANCHOR_WEBHOOK_PR_OPENED_URL", ""),
  webhookEditRequestedFormat: optionalEnv("PYANCHOR_WEBHOOK_EDIT_REQUESTED_FORMAT", "auto"),
  webhookEditAppliedFormat: optionalEnv("PYANCHOR_WEBHOOK_EDIT_APPLIED_FORMAT", "auto"),
  webhookPrOpenedFormat: optionalEnv("PYANCHOR_WEBHOOK_PR_OPENED_FORMAT", "auto"),

  // ─── actor header signing (v0.27.0, opt-in) ─────────────────────
  // When set, X-Pyanchor-Actor must be `<actor>.<hex-sha256-hmac>` —
  // values without a valid signature for this secret are silently
  // dropped from the audit trail (the edit still proceeds; we just
  // don't trust the actor field). When unset (default), behavior is
  // unchanged: header value is taken at face, capped at 256 chars,
  // recorded as-is. See src/actor.ts for the rationale and the
  // `signActor()` helper hosts can call to mint header values.
  actorSigningSecret: optionalEnv("PYANCHOR_ACTOR_SIGNING_SECRET", ""),

  // ─── audit log (v0.18.0) ────────────────────────────────────────
  // Append-only JSON-lines log of every edit outcome. Disabled by
  // default in current ergonomics so existing setups don't grow a
  // new file silently; enable with PYANCHOR_AUDIT_LOG=true.
  // The schema is documented in src/audit.ts (AuditEvent type).
  auditLogEnabled: optionalBool("PYANCHOR_AUDIT_LOG", false),
  auditLogFile: optionalEnv("PYANCHOR_AUDIT_LOG_FILE", path.join(stateDir, "audit.jsonl")),

  // ─── production gating (defense in depth, v0.17.0) ─────────────
  // When `requireGateCookie` is true, the sidecar requires a
  // host-set cookie (default name `pyanchor_dev`) on every API +
  // static-asset request BEFORE doing the token / session check.
  // The cookie is set by the host app's middleware after some
  // human-gated step (magic-word URL, OAuth, IP allowlist, etc.)
  // so anonymous public-traffic visitors can't even load the
  // bootstrap.js asset.
  //
  // The bootstrap script also reads this cookie via
  // `data-pyanchor-require-gate-cookie="<name>"` so a host that
  // accidentally renders the script tag unconditionally still
  // skips the overlay mount when the cookie is absent.
  //
  // Default: off (loopback dev workflow doesn't need it).
  requireGateCookie: optionalBool("PYANCHOR_REQUIRE_GATE_COOKIE", false),
  gateCookieName: optionalEnv("PYANCHOR_GATE_COOKIE_NAME", "pyanchor_dev"),

  // ─── gate cookie HMAC mode (v0.37.0) ───────────────────────────
  // When PYANCHOR_GATE_COOKIE_HMAC_SECRET is set, the gate-cookie
  // value is verified as an HS256 JWT (see src/gate-jwt.ts) instead
  // of being treated as a presence-only marker. A forged cookie
  // ("=1" from devtools console) is rejected with 403.
  //
  // Pre-v0.37 behavior (presence-only) is preserved when the secret
  // is empty — same env, no migration required, hosts opt in by
  // setting the secret + having their issuer (own middleware OR the
  // /_pyanchor/unlock endpoint below) emit JWT cookies.
  //
  // Recommended secret: 64 random bytes hex-encoded.
  gateCookieHmacSecret: optionalEnv("PYANCHOR_GATE_COOKIE_HMAC_SECRET", ""),

  // ─── optional sidecar-side unlock endpoint (v0.37.0) ───────────
  // Some deployments (static-build + nginx in front) have nowhere
  // natural to issue a signed cookie — there is no live host-app
  // middleware. Set both PYANCHOR_UNLOCK_SECRET and
  // PYANCHOR_GATE_COOKIE_HMAC_SECRET to enable a sidecar route at
  // PYANCHOR_UNLOCK_PATH (default /_pyanchor/unlock):
  //
  //   GET /_pyanchor/unlock?secret=<UNLOCK_SECRET>
  //     → 302 / + Set-Cookie: <gateCookieName>=<HS256-JWT>
  //   wrong/missing secret → 404 (don't leak the endpoint's existence)
  //
  // The endpoint is NOT registered when either env is empty, so
  // existing deployments are unaffected.
  unlockSecret: optionalEnv("PYANCHOR_UNLOCK_SECRET", ""),
  unlockPath: optionalEnv("PYANCHOR_UNLOCK_PATH", "/_pyanchor/unlock"),
  // TTL (seconds) of the JWT cookie issued by the unlock endpoint.
  // Default 30 days, matches the demo cookie's pre-v0.37 Max-Age.
  unlockCookieTtlSec: optionalNumber("PYANCHOR_UNLOCK_COOKIE_TTL_S", 60 * 60 * 24 * 30),

  // ─── paths (derived / overridable) ─────────────────────────────
  stateDir,
  stateFile: path.join(stateDir, "state.json"),
  appDirLock: optionalEnv("PYANCHOR_APP_DIR_LOCK", path.join(stateDir, "app-dir.lock")),
  peerStateFile: env.PYANCHOR_PEER_STATE_FILE?.trim() || null,
  workerScript: optionalEnv("PYANCHOR_WORKER_SCRIPT", path.join(serviceRoot, "dist", "worker", "runner.cjs")),
  staticDir: optionalEnv("PYANCHOR_STATIC_DIR", path.join(serviceRoot, "dist", "public"))
};

export type PyanchorConfig = typeof pyanchorConfig;

export function pathExists(targetPath: string) {
  if (!targetPath) {
    return false;
  }

  if (!isLinux) {
    return existsSync(targetPath);
  }

  if (existsSync(targetPath)) {
    return true;
  }

  return spawnSync("sudo", ["test", "-e", targetPath], { stdio: "ignore" }).status === 0;
}

/**
 * v0.28.1 — resolve an executable name to a real binary on PATH (or
 * verify a path-shaped value points at an actually-executable file).
 *
 * Round 18 P1 fix: pre-v0.28.1 `isPyanchorConfigured()` checked
 * `pathExists(agentBin)` against bare names like `codex` / `gemini`
 * which only succeeds if the cwd happens to contain that file. Bare
 * binary names need a PATH lookup; absolute paths still go through
 * pathExists. Returns true if the binary is callable.
 */
export function commandExists(command: string) {
  if (!command) return false;
  if (command.includes("/") || command.includes("\\")) {
    // Path-shaped — must both exist AND be executable.
    return executablePathExists(command);
  }
  // v0.33.0 — strict allowlist for bare-name lookups + no shell.
  // Pre-fix this path used `spawnSync("command", ["-v", X], { shell: true })`,
  // which combined with the v0.32.2 cwd .env autoload meant an
  // untrusted repo could set `PYANCHOR_CODEX_BIN=codex; touch /tmp/pwned`
  // and the doctor / sidecar boot would execute it through the shell.
  // Caught by the codex static audit.
  //
  // Now: reject anything that isn't a plain CLI-name token. Real
  // bin names are word-shaped (letters / digits / dot / dash /
  // underscore). Anything outside that is either a path (handled
  // above) or an attacker payload — refuse without spawning.
  if (!/^[A-Za-z0-9._-]+$/.test(command)) return false;
  if (process.platform === "win32") {
    return spawnSync("where", [command], { stdio: "ignore" }).status === 0;
  }
  // No shell. POSIX `command -v` is itself a shell builtin, so we
  // wrap with `/bin/sh -c` BUT pass the value as a positional arg
  // so the shell can't word-split it.
  return spawnSync("/bin/sh", ["-c", 'command -v -- "$1"', "sh", command], {
    stdio: "ignore"
  }).status === 0;
}

/**
 * v0.28.1 — verify a path exists AND has the executable bit set.
 * Used by isPyanchorConfigured() for the restart script and for the
 * absolute-path branch of commandExists().
 *
 * Round 18 P1 fix: pre-v0.28.1 the restart script was checked with
 * `pathExists()` only, so a `chmod 0644` script silently passed
 * /readyz but failed at job execution time.
 */
export function executablePathExists(targetPath: string) {
  if (!pathExists(targetPath)) return false;
  if (process.platform === "win32") return true; // Windows: presence implies callable
  if (spawnSync("test", ["-x", targetPath], { stdio: "ignore" }).status === 0) return true;
  // Linux: fall back to a sudo probe in case the file is owned by the
  // agent user but readable from elsewhere (matches pathExists pattern).
  return isLinux && spawnSync("sudo", ["test", "-x", targetPath], { stdio: "ignore" }).status === 0;
}

/**
 * Returns the binary that the configured agent shells out to, or `null`
 * for agents that don't need one on PATH (e.g. claude-code uses an
 * npm package). Used by isPyanchorConfigured to skip the binary
 * presence check for non-CLI backends.
 */
function getAgentBin(): string | null {
  switch (pyanchorConfig.agent.toLowerCase()) {
    case "openclaw":
      return pyanchorConfig.openClawBin;
    case "codex":
      return pyanchorConfig.codexBin;
    case "aider":
      return pyanchorConfig.aiderBin;
    case "gemini":
      return pyanchorConfig.geminiBin;
    case "claude-code":
      return null;
    default:
      return null;
  }
}

export function isPyanchorConfigured() {
  if (
    pyanchorConfig.appDir === PLACEHOLDER ||
    pyanchorConfig.restartFrontendScript === PLACEHOLDER ||
    pyanchorConfig.healthcheckUrl === PLACEHOLDER ||
    pyanchorConfig.workspaceDir === PLACEHOLDER
  ) {
    return false;
  }

  // v0.28.1 — round 18 P1 fix: contract docs ("workspace + app dir
  // + restart script + agent CLI all resolvable") now actually checks
  // all four. Pre-v0.28.1 silently skipped workspace and accepted a
  // non-executable restart script.
  if (
    !pathExists(pyanchorConfig.workspaceDir) ||
    !pathExists(pyanchorConfig.appDir) ||
    !executablePathExists(pyanchorConfig.restartFrontendScript)
  ) {
    return false;
  }

  // Agent-specific binary check. claude-code uses an npm package and
  // has no binary to verify; we trust the dynamic import to surface
  // missing-dep errors at run time. For the shell-out adapters
  // (openclaw / codex / aider / gemini), use commandExists so that a
  // bare binary name like "codex" is resolved via PATH (the
  // historical pathExists check only worked for absolute paths).
  const agentBin = getAgentBin();
  if (agentBin && !commandExists(agentBin)) {
    return false;
  }

  return true;
}

/**
 * Validates that all required env vars are present.
 * Call once at server startup, before `app.listen`.
 * Throws with a single grouped error listing every missing variable.
 */
export function validateConfig(): void {
  // v0.32.7 — surface numeric env parse errors first. These are
  // operator typos that would otherwise silently fall back and
  // bind the wrong port / set the wrong timeout.
  if (numericEnvErrors.length > 0) {
    const list = numericEnvErrors.map((m) => `  - ${m}`).join("\n");
    throw new Error(
      `[pyanchor] Invalid numeric environment variables:\n${list}\n\n` +
        `Fix the values above and re-run \`npx pyanchor\`.`
    );
  }

  const required: Record<string, string> = {
    PYANCHOR_APP_DIR: pyanchorConfig.appDir,
    PYANCHOR_RESTART_SCRIPT: pyanchorConfig.restartFrontendScript,
    PYANCHOR_HEALTHCHECK_URL: pyanchorConfig.healthcheckUrl,
    PYANCHOR_WORKSPACE_DIR: pyanchorConfig.workspaceDir,
    PYANCHOR_TOKEN: pyanchorConfig.token
  };

  const missing = Object.entries(required)
    .filter(([, value]) => value === PLACEHOLDER)
    .map(([name]) => name);

  if (missing.length > 0) {
    const list = missing.map((name) => `  - ${name}`).join("\n");
    // v0.32.7 — include a paste-ready next step. Pre-v0.32.7 this
    // error reached the user as a Node uncaught exception with a
    // full stack trace before the actual message; the trace was
    // noise. server.ts now catches and prints just the message.
    throw new Error(
      `[pyanchor] Missing required environment variables:\n${list}\n\n` +
      `Run \`npx pyanchor init\` from your app root to scaffold them, ` +
      `then \`npx pyanchor doctor\` to verify, then \`npx pyanchor\` to start.\n` +
      `Or provide them via your shell / .env file / process manager directly. ` +
      `See .env.example in the repository root for documented values.`
    );
  }

  if (pyanchorConfig.token.length < 24) {
    console.warn(
      `[pyanchor] PYANCHOR_TOKEN is only ${pyanchorConfig.token.length} characters. ` +
        `Use at least 32 random bytes (e.g. \`openssl rand -hex 32\`).`
    );
  }

  // v0.18.0 fail-closed: binding to anything other than loopback
  // (127.0.0.1 / ::1) without an explicit origin allowlist exposes
  // /api/edit + /api/cancel to any origin presenting a token. The
  // SameSite=Strict cookie blocks most browser-driven cross-site
  // attacks, but a deliberately-crafted curl from any host with the
  // token in hand goes through. Refuse to start instead of warning.
  const isLoopback =
    pyanchorConfig.host === "127.0.0.1" ||
    pyanchorConfig.host === "::1" ||
    pyanchorConfig.host === "localhost" ||
    pyanchorConfig.host === "[::1]";
  if (!isLoopback && pyanchorConfig.allowedOrigins.length === 0) {
    throw new Error(
      `[pyanchor] Refusing to bind to non-loopback host "${pyanchorConfig.host}" ` +
        `without PYANCHOR_ALLOWED_ORIGINS set. The cookie-session path admits ` +
        `cross-origin token-bearing requests; set PYANCHOR_ALLOWED_ORIGINS to a ` +
        `CSV of trusted origins (e.g. https://app.example.com) before publishing ` +
        `pyanchor on this host. See docs/SECURITY.md and docs/PRODUCTION-HARDENING.md.`
    );
  }

  // v0.33.0 — destructive path safety. Pre-fix the worker would
  // happily run `sudo rm -rf "$PYANCHOR_WORKSPACE_DIR"` (when fresh
  // workspace is enabled), `rsync --delete ws/ -> appDir`, and
  // `sudo chown -R appDirOwner appDir` against any path the operator
  // typed. A `.env` typo of `PYANCHOR_WORKSPACE_DIR=/` would be
  // catastrophic. Caught by codex static audit.
  //
  // We only fail-closed on system-dir matches here (the unrecoverable
  // category). workspaceDir==appDir + parent-overlap shapes are
  // warn-only at boot — the worker re-checks them right before any
  // destructive op (rm -rf / rsync --delete). That keeps "in-place
  // dev" setups (some operators intentionally run with workspace
  // == app, with apply mode disabled) workable.
  assertSafeMutablePath("PYANCHOR_WORKSPACE_DIR", pyanchorConfig.workspaceDir);
  assertSafeMutablePath("PYANCHOR_APP_DIR", pyanchorConfig.appDir);
  const wsResolved = path.resolve(pyanchorConfig.workspaceDir);
  const appResolved = path.resolve(pyanchorConfig.appDir);
  if (wsResolved === appResolved) {
    console.warn(
      `[pyanchor] PYANCHOR_WORKSPACE_DIR and PYANCHOR_APP_DIR resolve to the ` +
        `same path (${wsResolved}). Apply-mode sync-back will refuse to run ` +
        `(rsync into itself). For dryrun / chat mode this is fine.`
    );
  } else if (
    wsResolved.startsWith(appResolved + path.sep) ||
    appResolved.startsWith(wsResolved + path.sep)
  ) {
    console.warn(
      `[pyanchor] PYANCHOR_WORKSPACE_DIR (${wsResolved}) and PYANCHOR_APP_DIR ` +
        `(${appResolved}) overlap (one is a parent of the other). Apply-mode ` +
        `sync-back may corrupt the parent — pyanchor will refuse the destructive ` +
        `op at runtime. Recommended: use sibling directories.`
    );
  }
}

/**
 * v0.33.0 — refuse paths that are clearly unsafe for `rm -rf`,
 * `rsync --delete`, or `chown -R`. Caught by codex static audit.
 *
 * Rejects:
 *   - `/`, `/home`, `/var`, `/usr`, `/etc`, `/opt`, `/srv`, `/tmp` (the dir
 *     itself, not children)
 *   - the operator's home directory itself
 *   - the pyanchor stateDir or its parent
 *   - relative paths (must be absolute)
 *
 * Allows children of those (e.g. `/tmp/pyanchor-ws-xyz` is fine,
 * `/home/alice/pyanchor-ws` is fine). Symlink-resolved comparison
 * uses the resolved absolute path.
 */
function assertSafeMutablePath(envName: string, value: string): void {
  if (!value || value === REQUIRED_PLACEHOLDER) return; // already covered above
  if (!path.isAbsolute(value)) {
    throw new Error(
      `[pyanchor] ${envName}=${JSON.stringify(value)} is not an absolute path. ` +
        `Destructive workspace operations need an absolute path you intend to fully own.`
    );
  }
  const resolved = path.resolve(value);
  const FORBIDDEN_DIRS = new Set([
    "/",
    "/home",
    "/var",
    "/var/lib",
    "/usr",
    "/usr/local",
    "/etc",
    "/opt",
    "/srv",
    "/tmp",
    "/root",
    "/bin",
    "/sbin",
    "/lib",
    "/boot"
  ]);
  if (FORBIDDEN_DIRS.has(resolved)) {
    throw new Error(
      `[pyanchor] ${envName}=${JSON.stringify(resolved)} is a system directory. ` +
        `Refusing to start — an operator-side typo could lead to data loss when the ` +
        `worker runs sudo rm -rf / rsync --delete / chown -R against it. ` +
        `Use a dedicated child directory (e.g. /var/lib/pyanchor or /tmp/pyanchor-ws).`
    );
  }
  if (resolved === homedir()) {
    throw new Error(
      `[pyanchor] ${envName}=${JSON.stringify(resolved)} is the operator's home ` +
        `directory itself. Use a child directory.`
    );
  }
  // stateDir: pyanchor's own state file lives here. Don't mutate it.
  const stateDirResolved = path.resolve(stateDir);
  if (resolved === stateDirResolved || stateDirResolved.startsWith(resolved + path.sep)) {
    throw new Error(
      `[pyanchor] ${envName}=${JSON.stringify(resolved)} contains pyanchor's own ` +
        `state directory (${stateDirResolved}). The worker would clobber its own state.`
    );
  }
}
