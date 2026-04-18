import { describe, expect, it, vi } from "vitest";

import { nextjsProfile, viteProfile } from "../../src/frameworks";
import {
  AGENT_SCRATCH_EXCLUDES,
  BASE_RSYNC_EXCLUDES,
  buildRsyncExcludeArgs,
  buildWorkspace,
  installWorkspaceDependencies,
  prepareWorkspace,
  restartFrontend,
  runAsOpenClaw,
  runAsOpenClawInDir,
  syncToAppDir,
  workspaceRsyncExcludes,
  type WorkspaceConfig,
  type WorkspaceDeps
} from "../../src/worker/workspace";

const baseConfig = (overrides: Partial<WorkspaceConfig> = {}): WorkspaceConfig => ({
  workspaceDir: "/var/pyanchor/workspace",
  appDir: "/srv/app",
  appDirLock: "/var/pyanchor/app.lock",
  appDirOwner: "studio:studio",
  openClawUser: "openclaw",
  freshWorkspace: false,
  installCommand: "corepack yarn install --frozen-lockfile",
  buildCommand: "env NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next build",
  installTimeoutMs: 600_000,
  buildTimeoutMs: 900_000,
  restartFrontendScript: "/srv/app/scripts/restart.sh",
  ...overrides
});

interface RecordedCall {
  command: string;
  args: string[];
  options: Parameters<WorkspaceDeps["runCommand"]>[2];
}

const makeDeps = (
  overrides: Partial<WorkspaceDeps> = {}
): { deps: WorkspaceDeps; calls: RecordedCall[] } => {
  const calls: RecordedCall[] = [];
  const runCommand: WorkspaceDeps["runCommand"] = vi
    .fn()
    .mockImplementation(async (command: string, args: string[], options) => {
      calls.push({ command, args, options });
      return { stdout: "", stderr: "" };
    });
  const deps: WorkspaceDeps = {
    runCommand,
    framework: nextjsProfile,
    log: vi.fn(),
    sudoBin: "/usr/bin/sudo",
    flockBin: "/usr/bin/flock",
    ...overrides
  };
  return { deps, calls };
};

describe("rsync exclude helpers", () => {
  it("flattens an exclude list into --exclude pairs", () => {
    expect(buildRsyncExcludeArgs([".git", "node_modules", ".next"])).toEqual([
      "--exclude",
      ".git",
      "--exclude",
      "node_modules",
      "--exclude",
      ".next"
    ]);
  });

  it("ships .git + node_modules as the always-on base excludes", () => {
    expect(BASE_RSYNC_EXCLUDES).toEqual([".git", "node_modules"]);
  });

  it("ships the OpenClaw scratch artifacts in AGENT_SCRATCH_EXCLUDES", () => {
    expect(AGENT_SCRATCH_EXCLUDES).toContain(".openclaw");
    expect(AGENT_SCRATCH_EXCLUDES).toContain("EDIT_BRIEF.md");
    expect(AGENT_SCRATCH_EXCLUDES).toContain("HEARTBEAT.md");
  });

  it("merges base excludes with the framework profile's cache dirs", () => {
    expect(workspaceRsyncExcludes(nextjsProfile)).toEqual([".git", "node_modules", ".next"]);
    expect(workspaceRsyncExcludes(viteProfile)).toEqual([
      ".git",
      "node_modules",
      "dist",
      ".vite"
    ]);
  });
});

describe("runAsOpenClaw / runAsOpenClawInDir", () => {
  it("wraps args with sudo -u <user>", async () => {
    const { deps, calls } = makeDeps();
    await runAsOpenClaw(deps, { openClawUser: "openclaw" }, ["echo", "hi"]);
    expect(calls[0].command).toBe("/usr/bin/sudo");
    expect(calls[0].args).toEqual(["-u", "openclaw", "echo", "hi"]);
  });

  it("respects the deps.sudoBin override", async () => {
    const { deps, calls } = makeDeps({ sudoBin: "/opt/local/sudo" });
    await runAsOpenClaw(deps, { openClawUser: "agent" }, ["echo"]);
    expect(calls[0].command).toBe("/opt/local/sudo");
  });

  it("runs the command in a target directory via bash -lc cd", async () => {
    const { deps, calls } = makeDeps();
    await runAsOpenClawInDir(
      deps,
      { openClawUser: "openclaw" },
      "/var/work",
      ["yarn", "install"]
    );
    const args = calls[0].args;
    // sudo -u openclaw bash -lc 'cd "$1" && shift && exec "$@"' -- /var/work yarn install
    expect(args).toContain("/var/work");
    expect(args).toContain("yarn");
    expect(args).toContain("install");
    expect(args).toContain("bash");
    expect(args.join(" ")).toContain('cd "$1"');
  });
});

describe("prepareWorkspace", () => {
  it("skips rm -rf when freshWorkspace is false (persistent path)", async () => {
    const { deps, calls } = makeDeps();
    await prepareWorkspace(baseConfig({ freshWorkspace: false }), deps);
    const rmCall = calls.find((c) => c.args[0] === "rm");
    expect(rmCall).toBeUndefined();
  });

  it("rm -rf's the workspace when freshWorkspace is true", async () => {
    const { deps, calls } = makeDeps();
    await prepareWorkspace(baseConfig({ freshWorkspace: true }), deps);
    const rmCall = calls.find((c) => c.args.includes("rm"));
    expect(rmCall).toBeDefined();
    expect(rmCall?.args).toEqual(["rm", "-rf", "/var/pyanchor/workspace"]);
  });

  it("mkdir -p's the workspace dir under sudo", async () => {
    const { deps, calls } = makeDeps();
    await prepareWorkspace(baseConfig(), deps);
    const mkdir = calls.find((c) => c.args[0] === "mkdir");
    expect(mkdir?.args).toEqual(["mkdir", "-p", "/var/pyanchor/workspace"]);
  });

  it("rsyncs app→workspace under a shared flock with framework excludes", async () => {
    const { deps, calls } = makeDeps();
    await prepareWorkspace(baseConfig(), deps);
    const rsync = calls.find((c) => c.command === "/usr/bin/flock" && c.args.includes("rsync"));
    expect(rsync).toBeDefined();
    expect(rsync?.args).toContain("-s"); // shared lock for read-side
    expect(rsync?.args).toContain("/var/pyanchor/app.lock");
    expect(rsync?.args).toContain("--exclude");
    expect(rsync?.args).toContain(".git");
    expect(rsync?.args).toContain(".next"); // nextjs profile cache
    expect(rsync?.args).toContain("/srv/app/");
    expect(rsync?.args).toContain("/var/pyanchor/workspace/");
  });

  it("uses framework-specific excludes (vite cache dirs) when configured", async () => {
    const { deps, calls } = makeDeps({ framework: viteProfile });
    await prepareWorkspace(baseConfig(), deps);
    const rsync = calls.find((c) => c.args.includes("rsync"));
    expect(rsync?.args).toContain("dist");
    expect(rsync?.args).toContain(".vite");
    expect(rsync?.args).not.toContain(".next");
  });

  it("chowns the workspace to the agent user", async () => {
    const { deps, calls } = makeDeps();
    await prepareWorkspace(baseConfig(), deps);
    const chown = calls.find((c) => c.args[0] === "chown");
    expect(chown?.args).toEqual([
      "chown",
      "-R",
      "openclaw:openclaw",
      "/var/pyanchor/workspace"
    ]);
  });

  it("forwards baseExecOptions (cancel signal) to every runCommand call", async () => {
    const baseExecOptions = vi.fn().mockReturnValue({ activeChildren: new Set(), isCancelled: () => false });
    const { deps, calls } = makeDeps({ baseExecOptions });
    await prepareWorkspace(baseConfig(), deps);
    expect(baseExecOptions).toHaveBeenCalled();
    for (const call of calls) {
      expect(call.options?.activeChildren).toBeInstanceOf(Set);
      expect(typeof call.options?.isCancelled).toBe("function");
    }
  });
});

describe("installWorkspaceDependencies", () => {
  it("runs the configured installCommand under bash -lc as the agent user", async () => {
    const { deps, calls } = makeDeps();
    await installWorkspaceDependencies(
      baseConfig({ installCommand: "pnpm install --frozen-lockfile" }),
      deps
    );
    const args = calls[0].args.join(" ");
    expect(args).toContain("pnpm install --frozen-lockfile");
    expect(args).toContain("openclaw");
  });

  it("forwards installTimeoutMs to runCommand", async () => {
    const { deps, calls } = makeDeps();
    await installWorkspaceDependencies(baseConfig({ installTimeoutMs: 12345 }), deps);
    expect(calls[0].options?.timeoutMs).toBe(12345);
  });

  it("logs install chunks via the deps.log callback with [install] prefix", async () => {
    const log = vi.fn();
    const { deps } = makeDeps({ log });
    await installWorkspaceDependencies(baseConfig(), deps);
    // The mocked runCommand never emits chunks, but the wired callbacks are present:
    const opts = (deps.runCommand as ReturnType<typeof vi.fn>).mock.calls[0][2];
    opts.onStdoutChunk("hello\n");
    opts.onStderrChunk("warn\n");
    expect(log).toHaveBeenCalledWith(["[install] hello\n"]);
    expect(log).toHaveBeenCalledWith(["[install] warn\n"]);
  });
});

describe("buildWorkspace", () => {
  it("runs the configured buildCommand with buildTimeoutMs", async () => {
    const { deps, calls } = makeDeps();
    await buildWorkspace(baseConfig({ buildCommand: "vite build" }), deps);
    const args = calls[0].args.join(" ");
    expect(args).toContain("vite build");
    expect(calls[0].options?.timeoutMs).toBe(900_000);
  });

  it("logs build chunks with [build] prefix", async () => {
    const log = vi.fn();
    const { deps } = makeDeps({ log });
    await buildWorkspace(baseConfig(), deps);
    const opts = (deps.runCommand as ReturnType<typeof vi.fn>).mock.calls[0][2];
    opts.onStderrChunk("warning: foo\n");
    expect(log).toHaveBeenCalledWith(["[build] warning: foo\n"]);
  });
});

describe("syncToAppDir", () => {
  it("rsyncs workspace→app under an exclusive flock with framework + agent-scratch excludes", async () => {
    const { deps, calls } = makeDeps();
    await syncToAppDir(baseConfig(), deps);
    const rsync = calls.find((c) => c.command === "/usr/bin/flock" && c.args.includes("rsync"));
    expect(rsync).toBeDefined();
    expect(rsync?.args).toContain("-x"); // exclusive lock for the write side
    expect(rsync?.args).toContain("--delete");
    // base + framework + agent scratch excludes all present
    expect(rsync?.args).toContain(".git");
    expect(rsync?.args).toContain(".next");
    expect(rsync?.args).toContain(".openclaw");
    expect(rsync?.args).toContain("EDIT_BRIEF.md");
    // direction reversed vs prepareWorkspace
    expect(rsync?.args).toContain("/var/pyanchor/workspace/");
    expect(rsync?.args).toContain("/srv/app/");
  });

  it("chowns the app dir to the configured owner on linux", async () => {
    const realPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    try {
      const { deps, calls } = makeDeps();
      await syncToAppDir(baseConfig({ appDirOwner: "alice:alice" }), deps);
      const chown = calls.find((c) => c.args[0] === "chown" && c.args.includes("/srv/app"));
      expect(chown?.args).toEqual(["chown", "-R", "alice:alice", "/srv/app"]);
    } finally {
      Object.defineProperty(process, "platform", { value: realPlatform, configurable: true });
    }
  });

  it("skips the chown step on non-linux platforms", async () => {
    const realPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    try {
      const { deps, calls } = makeDeps();
      await syncToAppDir(baseConfig(), deps);
      const chownAppDir = calls.find(
        (c) => c.args[0] === "chown" && c.args.includes("/srv/app")
      );
      expect(chownAppDir).toBeUndefined();
    } finally {
      Object.defineProperty(process, "platform", { value: realPlatform, configurable: true });
    }
  });
});

describe("restartFrontend", () => {
  it("invokes the configured restart script with no args", async () => {
    const { deps, calls } = makeDeps();
    await restartFrontend(baseConfig({ restartFrontendScript: "/opt/restart.sh" }), deps);
    expect(calls[0]).toEqual(
      expect.objectContaining({ command: "/opt/restart.sh", args: [] })
    );
  });
});
