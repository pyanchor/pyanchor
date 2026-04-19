import { describe, expect, it, vi } from "vitest";

import {
  escapeGitHubBodyText,
  executeOutput,
  KNOWN_OUTPUT_MODES,
  preparePrWorkspace,
  renderQuotedBlock,
  resolveOutputMode
} from "../../src/worker/output";
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

describe("escape helpers (v0.20.1 round-14 #3)", () => {
  it("escapeGitHubBodyText inserts ZWSP after @ to disarm GH mentions", () => {
    expect(escapeGitHubBodyText("@alice")).toBe("@\u200balice");
    expect(escapeGitHubBodyText("hi @team and @bob")).toBe(
      "hi @\u200bteam and @\u200bbob"
    );
  });

  it("escapeGitHubBodyText leaves text without @ unchanged", () => {
    expect(escapeGitHubBodyText("nothing here")).toBe("nothing here");
    expect(escapeGitHubBodyText("")).toBe("");
  });

  it("renderQuotedBlock wraps every line with `> ` and escapes mentions per-line", () => {
    const block = renderQuotedBlock("line one\n@user line two\nthird");
    expect(block).toBe("> line one\n> @\u200buser line two\n> third");
  });

  it("renderQuotedBlock preserves backtick fences inside the quoted block (no formatting break)", () => {
    const block = renderQuotedBlock("before\n```code```\nafter");
    expect(block).toBe("> before\n> ```code```\n> after");
  });
});

describe("preparePrWorkspace (v0.20.1 round-14 #1)", () => {
  const stubPr = {
    gitBin: "git",
    ghBin: "gh",
    gitRemote: "origin",
    gitBaseBranch: "main",
    gitBranchPrefix: "pyanchor/",
    jobId: "test-job",
    prompt: "x",
    mode: "edit" as const
  };

  it("rejects with a docs-pointer when the workspace is not a git working tree", async () => {
    const runCommand = vi.fn(async (_cmd: string, args: string[]) => {
      if (args.includes("rev-parse")) {
        throw new Error("fatal: not a git repository");
      }
      return { stdout: "", stderr: "" };
    });
    await expect(preparePrWorkspace("/tmp/ws", stubPr, runCommand)).rejects.toThrow(
      /git working tree/
    );
  });

  it("runs fetch + checkout + reset --hard origin/<base> in order", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const runCommand = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes("rev-parse")) return { stdout: "true", stderr: "" };
      return { stdout: "", stderr: "" };
    });

    await preparePrWorkspace("/tmp/ws", stubPr, runCommand);

    const sequence = calls.map((c) => c.args.find((a) => ["rev-parse", "fetch", "checkout", "reset"].includes(a)));
    expect(sequence).toEqual(["rev-parse", "fetch", "checkout", "reset"]);

    const reset = calls.find((c) => c.args.includes("reset"));
    expect(reset?.args).toContain("--hard");
    expect(reset?.args).toContain("origin/main");
  });

  it("uses the configured remote + base branch in the reset target", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const runCommand = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes("rev-parse")) return { stdout: "true", stderr: "" };
      return { stdout: "", stderr: "" };
    });

    await preparePrWorkspace("/tmp/ws", { ...stubPr, gitRemote: "upstream", gitBaseBranch: "develop" }, runCommand);

    const reset = calls.find((c) => c.args.includes("reset"));
    expect(reset?.args).toContain("upstream/develop");
    const fetch = calls.find((c) => c.args.includes("fetch"));
    expect(fetch?.args).toEqual(expect.arrayContaining(["fetch", "upstream", "develop"]));
  });
});

describe("executeOutput \u2014 pr mode (v0.19)", () => {
  const stubPrConfig = {
    gitBin: "git",
    ghBin: "gh",
    gitRemote: "origin",
    gitBaseBranch: "main",
    gitBranchPrefix: "pyanchor/",
    jobId: "test-job-abc",
    prompt: "Make the header gradient bluer",
    mode: "edit" as const
  };

  it("throws when no prConfig is supplied (caller bug, not config)", async () => {
    const runCommand = vi.fn(async () => ({ stdout: "", stderr: "" }));
    await expect(
      executeOutput("pr", {
        workspaceConfig: stubConfig,
        workspaceDeps: stubDeps(runCommand),
        runBuild: false,
        shouldRestart: false,
        withHeartbeat: trackingHeartbeat([])
      })
    ).rejects.toThrow(/PrConfig/);
  });

  // Note: the "not a git working tree" check moved out of runPr() into
  // preparePrWorkspace() in v0.20.1 (round-14 #1 fix) so the failure
  // surfaces BEFORE the agent runs. See preparePrWorkspace tests below.

  it("skips PR creation when git status reports no changes", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const runCommand = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes("status")) return { stdout: "", stderr: "" }; // clean tree
      return { stdout: "", stderr: "" };
    });

    const result = await executeOutput("pr", {
      workspaceConfig: stubConfig,
      workspaceDeps: stubDeps(runCommand),
      runBuild: false,
      shouldRestart: false,
      withHeartbeat: trackingHeartbeat([]),
      prConfig: stubPrConfig
    });

    expect(result.mode).toBe("pr");
    expect(result.prUrl).toBeUndefined();
    // Only the status probe ran — no checkout/commit/push.
    expect(calls.find((c) => c.args.includes("checkout"))).toBeUndefined();
    expect(calls.find((c) => c.args.includes("commit"))).toBeUndefined();
    expect(calls.find((c) => c.args.includes("push"))).toBeUndefined();
  });

  it("happy path: runs checkout/add/commit/push then captures gh PR URL", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const runCommand = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes("status")) return { stdout: " M src/Header.tsx\n", stderr: "" };
      if (cmd === "gh") {
        // gh prints the PR URL on stdout
        return { stdout: "https://github.com/example/repo/pull/42\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });

    const labels: string[] = [];
    const result = await executeOutput("pr", {
      workspaceConfig: stubConfig,
      workspaceDeps: stubDeps(runCommand),
      runBuild: false,
      shouldRestart: false,
      withHeartbeat: trackingHeartbeat(labels),
      prConfig: stubPrConfig
    });

    expect(result.mode).toBe("pr");
    expect(result.prUrl).toBe("https://github.com/example/repo/pull/42");
    expect(labels).toEqual(["Branch", "Push", "PR"]);

    // Verify the branch name pattern + the gh args.
    const checkout = calls.find((c) => c.args.includes("checkout"));
    expect(checkout?.args).toContain("pyanchor/test-job-abc");

    const ghCall = calls.find((c) => c.cmd === "gh");
    expect(ghCall?.args).toContain("--base");
    expect(ghCall?.args).toContain("main");
    expect(ghCall?.args).toContain("--head");
    expect(ghCall?.args).toContain("pyanchor/test-job-abc");
  });

  it("PR title truncates to 72 chars from the first prompt line", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const runCommand = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes("status")) return { stdout: " M x", stderr: "" };
      if (cmd === "gh") return { stdout: "https://x/pull/1\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });

    const longPrompt = "A".repeat(120) + "\nsecond line";
    await executeOutput("pr", {
      workspaceConfig: stubConfig,
      workspaceDeps: stubDeps(runCommand),
      runBuild: false,
      shouldRestart: false,
      withHeartbeat: trackingHeartbeat([]),
      prConfig: { ...stubPrConfig, prompt: longPrompt }
    });

    const ghCall = calls.find((c) => c.cmd === "gh");
    const titleIdx = ghCall?.args.indexOf("--title") ?? -1;
    const title = ghCall?.args[titleIdx + 1] ?? "";
    expect(title.length).toBe(72);
    expect(title).toBe("A".repeat(72));
  });

  it("PR body renders prompt as a quoted block + escapes @-mentions (v0.20.1 round-14 #3)", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const runCommand = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes("status")) return { stdout: " M x", stderr: "" };
      if (cmd === "gh") return { stdout: "https://x/pull/3\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });

    const evilPrompt =
      "first line @team\n```fence```\nlast line";
    await executeOutput("pr", {
      workspaceConfig: stubConfig,
      workspaceDeps: stubDeps(runCommand),
      runBuild: false,
      shouldRestart: false,
      withHeartbeat: trackingHeartbeat([]),
      prConfig: { ...stubPrConfig, prompt: evilPrompt, actor: "@alice" }
    });

    const ghCall = calls.find((c) => c.cmd === "gh");
    const bodyIdx = ghCall?.args.indexOf("--body") ?? -1;
    const body = ghCall?.args[bodyIdx + 1] ?? "";

    // Every prompt line is prefixed with `> ` (markdown blockquote)
    expect(body).toContain("> first line @\u200bteam");
    expect(body).toContain("> ```fence```"); // fence neutralized inside quote
    expect(body).toContain("> last line");
    // Actor's @ is escaped with zero-width space.
    expect(body).toContain("Actor: @\u200balice");
    // No raw @team / @alice anywhere — would otherwise notify users.
    expect(body).not.toMatch(/(^|[^\u200b])@team/);
    expect(body).not.toMatch(/(^|[^\u200b])@alice/);
  });

  it("PR body includes Actor when prConfig.actor is supplied (v0.19 passthrough)", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const runCommand = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes("rev-parse")) return { stdout: "true", stderr: "" };
      if (args.includes("status")) return { stdout: " M x", stderr: "" };
      if (cmd === "gh") return { stdout: "https://x/pull/2\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });

    await executeOutput("pr", {
      workspaceConfig: stubConfig,
      workspaceDeps: stubDeps(runCommand),
      runBuild: false,
      shouldRestart: false,
      withHeartbeat: trackingHeartbeat([]),
      prConfig: { ...stubPrConfig, actor: "alice@example.com" }
    });

    const ghCall = calls.find((c) => c.cmd === "gh");
    const bodyIdx = ghCall?.args.indexOf("--body") ?? -1;
    const body = ghCall?.args[bodyIdx + 1] ?? "";
    // v0.20.1 round-14 #3: actor's @ is escaped with ZWSP so GitHub
    // doesn't generate notifications for it.
    expect(body).toContain("alice@\u200bexample.com");
  });
});
