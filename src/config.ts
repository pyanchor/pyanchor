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
const optionalNumber = (name: string, fallback: number): number => {
  const value = env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const normalizeBasePath = (value: string | undefined, fallback: string) => {
  const trimmed = (value ?? fallback).trim();
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized === "/" ? fallback : normalized.replace(/\/+$/, "");
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
  model: optionalEnv("PYANCHOR_AGENT_MODEL", "openai-codex/gpt-5.4"),
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

  if (!pathExists(pyanchorConfig.appDir) || !pathExists(pyanchorConfig.restartFrontendScript)) {
    return false;
  }

  // Agent-specific binary check. claude-code uses an npm package and
  // has no binary to verify; we trust the dynamic import to surface
  // missing-dep errors at run time.
  const agentBin = getAgentBin();
  if (agentBin && !pathExists(agentBin)) {
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
    throw new Error(
      `[pyanchor] Missing required environment variables:\n${list}\n\n` +
      `Provide these via your shell, .env file, or process manager.\n` +
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
}
