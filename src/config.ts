import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const isLinux = process.platform === "linux";

const resolveServiceRoot = () => {
  if (process.env.AIG_AI_EDIT_SERVICE_ROOT) {
    return process.env.AIG_AI_EDIT_SERVICE_ROOT;
  }

  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "build.mjs")) && existsSync(path.join(cwd, "src"))) {
    return cwd;
  }

  const nested = path.join(cwd, "services", "ai-edit-sidecar");
  if (existsSync(nested)) {
    return nested;
  }

  return path.resolve(__dirname, "..");
};

const serviceRoot = resolveServiceRoot();

const normalizeBasePath = (value: string | undefined, fallback: string) => {
  const trimmed = (value ?? fallback).trim();
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized === "/" ? fallback : normalized.replace(/\/+$/, "");
};

const defaultStateDir = () => {
  if (process.env.AIG_AI_EDIT_STATE_DIR) {
    return process.env.AIG_AI_EDIT_STATE_DIR;
  }

  if (isLinux && existsSync("/home/studio/logs")) {
    return "/home/studio/logs/ai-edit";
  }

  return path.join(process.cwd(), ".ai-edit-runtime");
};

export const aiEditConfig = {
  appDir: process.env.AIG_WORKSHOP_FRONTEND_APP_DIR ?? "/home/studio/apps/Free-D103-Frontend",
  appDirOwner: process.env.AIG_WORKSHOP_APP_DIR_OWNER ?? "studio:studio",
  pm2ProcessName: process.env.AIG_FRONTEND_PM2_NAME ?? "studio-pyan-frontend",
  openClawBin: process.env.AIG_WORKSHOP_OPENCLAW_BIN ?? "/home/openclaw-studio/.openclaw/bin/openclaw",
  openClawUser: process.env.AIG_WORKSHOP_OPENCLAW_USER ?? "openclaw-studio",
  restartFrontendScript: process.env.AIG_WORKSHOP_RESTART_SCRIPT ?? "/home/studio/deploy/restart-frontend.sh",
  workspaceDir: process.env.AIG_AI_EDIT_WORKSPACE ?? "/home/openclaw-studio/ai-edit-workspace",
  model: process.env.AIG_AI_EDIT_MODEL ?? "openai-codex/gpt-5.4",
  thinking: process.env.AIG_AI_EDIT_THINKING ?? "medium",
  agentTimeoutSeconds: Number(process.env.AIG_AI_EDIT_TIMEOUT ?? "900"),
  installTimeoutMs: Number(process.env.AIG_AI_EDIT_INSTALL_TIMEOUT_MS ?? "600000"),
  buildTimeoutMs: Number(process.env.AIG_AI_EDIT_BUILD_TIMEOUT_MS ?? "900000"),
  healthcheckUrl: process.env.AIG_AI_EDIT_HEALTHCHECK_URL ?? "http://127.0.0.1:3002/login",
  stateDir: defaultStateDir(),
  stateFile: path.join(defaultStateDir(), "state.json"),
  workshopStateFile:
    process.env.AIG_WORKSHOP_STATE_FILE ??
    (isLinux && existsSync("/home/studio/logs")
      ? "/home/studio/logs/preview-workshop/state.json"
      : path.join(process.cwd(), ".workshop-runtime", "state.json")),
  appDirLock:
    process.env.AIG_APP_DIR_LOCK ??
    (isLinux && existsSync("/home/studio/logs")
      ? "/home/studio/logs/app-dir.lock"
      : path.join(process.cwd(), ".app-dir.lock")),
  agentId: process.env.AIG_AI_EDIT_AGENT_ID ?? "ai-edit",
  port: Number(process.env.AIG_AI_EDIT_SIDECAR_PORT ?? "3010"),
  host: process.env.AIG_AI_EDIT_SIDECAR_HOST ?? "127.0.0.1",
  runtimeBasePath: normalizeBasePath(process.env.AIG_AI_EDIT_RUNTIME_BASE_PATH, "/_aig"),
  runtimeAliasPath: normalizeBasePath(process.env.AIG_AI_EDIT_RUNTIME_ALIAS_PATH, "/runtime"),
  workerScript: process.env.AIG_AI_EDIT_WORKER_SCRIPT ?? path.join(serviceRoot, "dist", "worker", "runner.cjs"),
  staticDir: process.env.AIG_AI_EDIT_STATIC_DIR ?? path.join(serviceRoot, "dist", "public")
};

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

export function isAiEditConfigured() {
  return (
    pathExists(aiEditConfig.appDir) &&
    pathExists(aiEditConfig.openClawBin) &&
    pathExists(aiEditConfig.restartFrontendScript)
  );
}
