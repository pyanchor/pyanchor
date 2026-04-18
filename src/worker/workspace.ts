/**
 * Workspace lifecycle: rsync app→workspace, install deps, build,
 * rsync workspace→app, restart frontend. All operations shell out
 * to sudo + flock + rsync; the runner injects runCommand so this
 * module stays testable with mocked exec.
 */

import type { FrameworkProfile } from "../frameworks/types";

import type { RunCommandOptions } from "./child-process";

export type RunCommand = (
  command: string,
  args: string[],
  options?: RunCommandOptions
) => Promise<{ stdout: string; stderr: string }>;

export interface WorkspaceConfig {
  workspaceDir: string;
  appDir: string;
  appDirLock: string;
  appDirOwner: string;
  openClawUser: string;
  freshWorkspace: boolean;
  installCommand: string;
  buildCommand: string;
  installTimeoutMs: number;
  buildTimeoutMs: number;
  restartFrontendScript: string;
}

export interface WorkspaceDeps {
  runCommand: RunCommand;
  framework: FrameworkProfile;
  /** Shared exec options the runner builds (activeChildren, isCancelled). */
  baseExecOptions?: () => Pick<RunCommandOptions, "activeChildren" | "isCancelled" | "canceledError">;
  /** Per-line log forwarder for install/build chunks. */
  log?: (lines: string[]) => void;
  sudoBin?: string;
  flockBin?: string;
}

const DEFAULT_SUDO = "/usr/bin/sudo";
const DEFAULT_FLOCK = "/usr/bin/flock";

// .git and node_modules are always excluded; framework profile adds
// its own cache/output dirs (.next for nextjs, dist + .vite for vite).
export const BASE_RSYNC_EXCLUDES = [".git", "node_modules"];

// Agent scratch artifacts that must NEVER reach the app dir on
// sync-back. OpenClaw drops these into the workspace root; other
// adapters add nothing here. Keep narrow; framework-specific cache
// dirs live in the FrameworkProfile.
export const AGENT_SCRATCH_EXCLUDES = [
  ".openclaw",
  "AGENTS.md",
  "BOOTSTRAP.md",
  "EDIT_BRIEF.md",
  "HEARTBEAT.md",
  "IDENTITY.md",
  "SOUL.md",
  "TOOLS.md",
  "USER.md"
];

export const buildRsyncExcludeArgs = (excludes: readonly string[]): string[] =>
  excludes.flatMap((entry) => ["--exclude", entry]);

export const workspaceRsyncExcludes = (framework: FrameworkProfile): string[] => [
  ...BASE_RSYNC_EXCLUDES,
  ...framework.workspaceExcludes
];

const sudoOf = (deps: WorkspaceDeps) => deps.sudoBin ?? DEFAULT_SUDO;
const flockOf = (deps: WorkspaceDeps) => deps.flockBin ?? DEFAULT_FLOCK;
const baseExec = (deps: WorkspaceDeps) => deps.baseExecOptions?.() ?? {};

export const runAsOpenClaw = (
  deps: WorkspaceDeps,
  config: Pick<WorkspaceConfig, "openClawUser">,
  args: string[],
  options: RunCommandOptions = {}
) => deps.runCommand(sudoOf(deps), ["-u", config.openClawUser, ...args], options);

export const runAsOpenClawInDir = (
  deps: WorkspaceDeps,
  config: Pick<WorkspaceConfig, "openClawUser">,
  workingDir: string,
  args: string[],
  options: RunCommandOptions = {}
) =>
  runAsOpenClaw(
    deps,
    config,
    ["bash", "-lc", 'cd "$1" && shift && exec "$@"', "--", workingDir, ...args],
    options
  );

/**
 * Persistent-workspace path (default since v0.2.3) preserves the
 * workspace's node_modules and framework cache dirs across jobs so
 * install and build stay incremental. rsync mirrors source files
 * from the app dir with --delete, scoped to non-excluded paths.
 */
export async function prepareWorkspace(
  config: WorkspaceConfig,
  deps: WorkspaceDeps
): Promise<void> {
  const sudo = sudoOf(deps);
  const flock = flockOf(deps);
  const exec = baseExec(deps);

  if (config.freshWorkspace) {
    await deps.runCommand(sudo, ["rm", "-rf", config.workspaceDir], exec);
  }
  await deps.runCommand(sudo, ["mkdir", "-p", config.workspaceDir], exec);

  await deps.runCommand(
    flock,
    [
      "-s",
      "-w",
      "60",
      config.appDirLock,
      sudo,
      "rsync",
      "-a",
      "--delete",
      ...buildRsyncExcludeArgs(workspaceRsyncExcludes(deps.framework)),
      `${config.appDir}/`,
      `${config.workspaceDir}/`
    ],
    exec
  );

  // chown is idempotent on persistent workspaces.
  await deps.runCommand(
    sudo,
    ["chown", "-R", `${config.openClawUser}:${config.openClawUser}`, config.workspaceDir],
    exec
  );
}

export function installWorkspaceDependencies(config: WorkspaceConfig, deps: WorkspaceDeps) {
  return runAsOpenClawInDir(
    deps,
    config,
    config.workspaceDir,
    ["bash", "-lc", config.installCommand],
    {
      ...baseExec(deps),
      timeoutMs: config.installTimeoutMs,
      onStdoutChunk: (text) => deps.log?.([`[install] ${text}`]),
      onStderrChunk: (text) => deps.log?.([`[install] ${text}`])
    }
  );
}

export function buildWorkspace(config: WorkspaceConfig, deps: WorkspaceDeps) {
  return runAsOpenClawInDir(
    deps,
    config,
    config.workspaceDir,
    ["bash", "-lc", config.buildCommand],
    {
      ...baseExec(deps),
      timeoutMs: config.buildTimeoutMs,
      onStdoutChunk: (text) => deps.log?.([`[build] ${text}`]),
      onStderrChunk: (text) => deps.log?.([`[build] ${text}`])
    }
  );
}

export async function syncToAppDir(
  config: WorkspaceConfig,
  deps: WorkspaceDeps
): Promise<void> {
  const sudo = sudoOf(deps);
  const flock = flockOf(deps);
  const exec = baseExec(deps);

  await deps.runCommand(
    flock,
    [
      "-x",
      "-w",
      "60",
      config.appDirLock,
      sudo,
      "rsync",
      "-a",
      "--delete",
      ...buildRsyncExcludeArgs([
        ...workspaceRsyncExcludes(deps.framework),
        ...AGENT_SCRATCH_EXCLUDES
      ]),
      `${config.workspaceDir}/`,
      `${config.appDir}/`
    ],
    exec
  );

  if (process.platform === "linux") {
    await deps.runCommand(sudo, ["chown", "-R", config.appDirOwner, config.appDir], exec);
  }
}

export function restartFrontend(config: WorkspaceConfig, deps: WorkspaceDeps) {
  return deps.runCommand(config.restartFrontendScript, [], baseExec(deps));
}
