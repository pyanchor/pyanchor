import { describe, expect, it, vi } from "vitest";

import { executeOutput, KNOWN_OUTPUT_MODES, resolveOutputMode } from "../../src/worker/output";
import type { WorkspaceConfig, WorkspaceDeps } from "../../src/worker/workspace";
import { nextjsProfile } from "../../src/frameworks/nextjs";

// Minimal stub deps. The output module never inspects these directly
// — it just forwards to the workspace functions, which we mock per
// test by spying on what runCommand was invoked with.
const stubConfig: WorkspaceConfig = {
  workspaceDir: "/tmp/ws",
  appDir: "/tmp/app",
  appDirLock: "/tmp/app.lock",
  appDirOwner: "pyanchor:pyanchor",
  openClawUser: "pyanchor",
  freshWorkspace: false,
  installCommand: "npm install",
  buildCommand: "npm run build",
  installTimeoutMs: 60_000,
  buildTimeoutMs: 60_000,
  restartFrontendScript: "/tmp/restart.sh"
};

const trackingHeartbeat = (calls: string[]) =>
  async <T>(meta: { step: string; label: string }, work: () => Promise<T>): Promise<T> => {
    calls.push(meta.label);
    return work();
  };

const stubDeps = (runCommand: WorkspaceDeps["runCommand"]): WorkspaceDeps => ({
  runCommand,
  framework: nextjsProfile,
  sudoBin: "/bin/true",
  flockBin: "/bin/true"
});

describe("resolveOutputMode", () => {
  it("returns the canonical mode for known values (case-insensitive)", () => {
    expect(resolveOutputMode("apply")).toBe("apply");
    expect(resolveOutputMode("APPLY")).toBe("apply");
    expect(resolveOutputMode(" pr ")).toBe("pr");
    expect(resolveOutputMode("dryrun")).toBe("dryrun");
  });

  it("falls back to apply with stderr warning for unknown values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveOutputMode("nonsense")).toBe("apply");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("Unknown PYANCHOR_OUTPUT_MODE");
    warn.mockRestore();
  });

  it("falls back to apply for empty string (env var unset path)", () => {
    expect(resolveOutputMode("")).toBe("apply");
  });

  it("KNOWN_OUTPUT_MODES enumerates all currently-supported values", () => {
    expect([...KNOWN_OUTPUT_MODES]).toEqual(["apply", "pr", "dryrun"]);
  });
});

describe("executeOutput \u2014 apply mode", () => {
  it("runs build then sync then restart, in order", async () => {
    const labels: string[] = [];
    const commands: string[] = [];
    const runCommand = vi.fn(async (cmd: string, args: string[]) => {
      commands.push([cmd, ...args].join(" "));
      return { stdout: "", stderr: "", code: 0 };
    });

    await executeOutput("apply", {
      workspaceConfig: stubConfig,
      workspaceDeps: stubDeps(runCommand),
      runBuild: true,
      shouldRestart: true,
      withHeartbeat: trackingHeartbeat(labels)
    });

    expect(labels).toEqual(["Build", "Syncing", "Restarting"]);
    // All three steps called runCommand at least once.
    expect(runCommand).toHaveBeenCalled();
  });

  it("skips build when runBuild=false (fastReload contract)", async () => {
    const labels: string[] = [];
    const runCommand = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));

    await executeOutput("apply", {
      workspaceConfig: stubConfig,
      workspaceDeps: stubDeps(runCommand),
      runBuild: false,
      shouldRestart: true,
      withHeartbeat: trackingHeartbeat(labels)
    });

    expect(labels).toEqual(["Syncing", "Restarting"]);
  });

  it("skips restart when shouldRestart=false", async () => {
    const labels: string[] = [];
    const runCommand = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));

    await executeOutput("apply", {
      workspaceConfig: stubConfig,
      workspaceDeps: stubDeps(runCommand),
      runBuild: true,
      shouldRestart: false,
      withHeartbeat: trackingHeartbeat(labels)
    });

    expect(labels).toEqual(["Build", "Syncing"]);
  });
});

describe("executeOutput \u2014 dryrun mode", () => {
  it("runs build but skips sync + restart (no apply)", async () => {
    const labels: string[] = [];
    const runCommand = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));

    const result = await executeOutput("dryrun", {
      workspaceConfig: stubConfig,
      workspaceDeps: stubDeps(runCommand),
      runBuild: true,
      shouldRestart: true,
      withHeartbeat: trackingHeartbeat(labels)
    });

    expect(labels).toEqual(["Build"]);
    expect(result.mode).toBe("dryrun");
    expect(result.proceedToFinalize).toBe(true);
  });

  it("with runBuild=false, dryrun is a complete no-op", async () => {
    const labels: string[] = [];
    const runCommand = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));

    await executeOutput("dryrun", {
      workspaceConfig: stubConfig,
      workspaceDeps: stubDeps(runCommand),
      runBuild: false,
      shouldRestart: false,
      withHeartbeat: trackingHeartbeat(labels)
    });

    expect(labels).toEqual([]);
    expect(runCommand).not.toHaveBeenCalled();
  });
});

describe("executeOutput \u2014 pr mode (v0.18 placeholder)", () => {
  it("throws a documented 'not implemented' error pointing at v0.19", async () => {
    const runCommand = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));

    await expect(
      executeOutput("pr", {
        workspaceConfig: stubConfig,
        workspaceDeps: stubDeps(runCommand),
        runBuild: false,
        shouldRestart: false,
        withHeartbeat: trackingHeartbeat([])
      })
    ).rejects.toThrow(/v0\.19/);
  });
});
