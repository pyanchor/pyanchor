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

  // ─── agent: shared knobs ───────────────────────────────────────
  agentId: optionalEnv("PYANCHOR_AGENT_ID", "pyanchor"),
  model: optionalEnv("PYANCHOR_AGENT_MODEL", "openai-codex/gpt-5.4"),
  thinking: optionalEnv("PYANCHOR_AGENT_THINKING", "medium"),

  // ─── agent: OpenClaw-specific knobs ────────────────────────────
  openClawBin: optionalEnv("PYANCHOR_OPENCLAW_BIN", "openclaw"),
  openClawUser: optionalEnv("PYANCHOR_OPENCLAW_USER", currentUser),

  // ─── agent: shell-out adapters (codex, aider) ──────────────────
  // Path or basename of the OpenAI Codex CLI binary. Default: `codex` on PATH.
  // Install: `npm i -g @openai/codex`.
  codexBin: optionalEnv("PYANCHOR_CODEX_BIN", "codex"),
  // Path or basename of the aider-chat CLI binary. Default: `aider` on PATH.
  // Install: `pip install aider-chat`.
  aiderBin: optionalEnv("PYANCHOR_AIDER_BIN", "aider"),

  // ─── cross-user / file ownership (default: same user) ──────────
  appDirOwner: optionalEnv("PYANCHOR_APP_DIR_OWNER", `${currentUser}:${currentUser}`),
  pm2ProcessName: optionalEnv("PYANCHOR_FRONTEND_PM2_NAME", ""),

  // ─── timeouts ──────────────────────────────────────────────────
  agentTimeoutSeconds: optionalNumber("PYANCHOR_AGENT_TIMEOUT_S", 900),
  installTimeoutMs: optionalNumber("PYANCHOR_INSTALL_TIMEOUT_MS", 600_000),
  buildTimeoutMs: optionalNumber("PYANCHOR_BUILD_TIMEOUT_MS", 900_000),

  // ─── dev ergonomics ────────────────────────────────────────────
  // When true: skip workspace install + next build + frontend restart;
  // rsync alone triggers Next.js HMR. Drops edit cycle from ~30s-3min
  // to ~1-2s. ONLY safe when the host page is `next dev`-served.
  fastReload: optionalBool("PYANCHOR_FAST_RELOAD", false),

  // ─── server ────────────────────────────────────────────────────
  port: optionalNumber("PYANCHOR_PORT", 3010),
  host: optionalEnv("PYANCHOR_HOST", "127.0.0.1"),
  runtimeBasePath: normalizeBasePath(env.PYANCHOR_RUNTIME_BASE_PATH, "/_pyanchor"),
  runtimeAliasPath: normalizeBasePath(env.PYANCHOR_RUNTIME_ALIAS_PATH, "/runtime"),
  allowedOrigins: (env.PYANCHOR_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),

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

export function isPyanchorConfigured() {
  return (
    pyanchorConfig.appDir !== PLACEHOLDER &&
    pyanchorConfig.restartFrontendScript !== PLACEHOLDER &&
    pyanchorConfig.healthcheckUrl !== PLACEHOLDER &&
    pyanchorConfig.workspaceDir !== PLACEHOLDER &&
    pathExists(pyanchorConfig.appDir) &&
    pathExists(pyanchorConfig.openClawBin) &&
    pathExists(pyanchorConfig.restartFrontendScript)
  );
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
}
