/**
 * Real-git + fake-gh smoke for PR output mode (v0.24.0).
 *
 * Round-14 #1 + round-15 confirmed `preparePrWorkspace()` does the
 * right thing in unit tests against mocked `runCommand`. This test
 * exercises the same code path against a real git binary + a fake
 * `gh` script, so we catch:
 *   - quoting / arg-passing bugs the mock hides
 *   - real git's behavior on `reset --hard origin/<base>` after
 *     workspace changes from a previous "PR" branch
 *   - `git status --porcelain` empty-vs-not detection on a real
 *     working tree
 *   - branch-parent invariant: job2 must come off origin/main, not
 *     job1's tip (the actual round-14 high)
 *
 * What's still mocked: the upstream agent (we just touch a file
 * directly to simulate "agent edited workspace") and `gh` (a 6-line
 * shell script that prints a canned PR URL on stdout). Real `gh`
 * needs auth, network, and a real GitHub repo — out of scope for
 * unit-style smoke.
 *
 * Skipped automatically if `git` is not on PATH (CI lanes without
 * git, e.g. minimal containers, see this test as `it.skip`).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { executeOutput, preparePrWorkspace, type PrConfig } from "../../src/worker/output";
import type { WorkspaceConfig, WorkspaceDeps } from "../../src/worker/workspace";
import { nextjsProfile } from "../../src/frameworks/nextjs";
import { runCommand } from "../../src/worker/child-process";

const gitAvailable = (() => {
  try {
    return spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
})();

const describeIfGit = gitAvailable ? describe : describe.skip;

// Run a git command synchronously in a directory. Used for test
// SETUP only (creating the bare remote, seeding initial main commit).
// The actual code under test calls git via the `runCommand` helper.
function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${r.stderr}`);
  }
  return r.stdout;
}

describeIfGit("PR mode against real git + fake gh (v0.24.0)", () => {
  let baseDir: string;
  let bareRemote: string;
  let workspaceDir: string;
  let fakeGhPath: string;
  let prConfig: PrConfig;
  let workspaceConfig: WorkspaceConfig;
  let workspaceDeps: WorkspaceDeps;
  let ghCallLog: string;

  beforeEach(() => {
    baseDir = mkdtempSync(path.join(tmpdir(), "pyanchor-pr-real-"));
    bareRemote = path.join(baseDir, "remote.git");
    workspaceDir = path.join(baseDir, "workspace");
    ghCallLog = path.join(baseDir, "gh-calls.log");
    fakeGhPath = path.join(baseDir, "fake-gh.sh");

    // 1. Bare remote with an initial `main` commit + one tracked file.
    mkdirSync(bareRemote, { recursive: true });
    git(bareRemote, "init", "--bare", "--initial-branch=main");

    // Seed remote: clone, commit, push, throw away the seeder clone.
    const seeder = path.join(baseDir, "seeder");
    git(baseDir, "clone", bareRemote, seeder);
    writeFileSync(path.join(seeder, "README.md"), "initial\n");
    git(seeder, "config", "user.email", "test@example.com");
    git(seeder, "config", "user.name", "Test User");
    git(seeder, "add", ".");
    git(seeder, "commit", "-m", "initial");
    git(seeder, "push", "origin", "main");
    rmSync(seeder, { recursive: true });

    // 2. Workspace = clone of the bare remote (the operator-managed setup
    //    documented in PRODUCTION-HARDENING.md PR mode section).
    git(baseDir, "clone", bareRemote, workspaceDir);
    git(workspaceDir, "config", "user.email", "pyanchor@example.com");
    git(workspaceDir, "config", "user.name", "pyanchor worker");

    // 3. Fake `gh` script. Logs its argv to gh-calls.log so we can
    //    assert what pyanchor invoked, then prints the canned PR URL
    //    to stdout (matches real `gh pr create` behavior).
    writeFileSync(
      fakeGhPath,
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> "${ghCallLog}"\necho "https://github.com/example/repo/pull/42"\n`
    );
    chmodSync(fakeGhPath, 0o755);

    prConfig = {
      gitBin: "git",
      ghBin: fakeGhPath,
      gitRemote: "origin",
      gitBaseBranch: "main",
      gitBranchPrefix: "pyanchor/",
      jobId: "real-job-1",
      prompt: "make the README louder",
      mode: "edit"
    };

    workspaceConfig = {
      workspaceDir,
      appDir: workspaceDir, // not used in PR mode
      appDirLock: path.join(baseDir, "app.lock"),
      appDirOwner: "test:test",
      openClawUser: "test",
      freshWorkspace: false,
      installCommand: "true",
      buildCommand: "true",
      installTimeoutMs: 60_000,
      buildTimeoutMs: 60_000,
      restartFrontendScript: "/bin/true"
    };

    workspaceDeps = {
      runCommand,
      framework: nextjsProfile
    };
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("preparePrWorkspace fetches + checkouts + resets to origin/main on a real workspace", async () => {
    // Simulate "previous PR branch" left behind: create a divergent
    // local branch + check it out so HEAD is NOT on main.
    git(workspaceDir, "checkout", "-b", "pyanchor/old-job");
    writeFileSync(path.join(workspaceDir, "leftover.txt"), "stale\n");
    git(workspaceDir, "add", ".");
    git(workspaceDir, "commit", "-m", "stale work from prior PR");
    const beforeHead = git(workspaceDir, "rev-parse", "HEAD").trim();

    await preparePrWorkspace(workspaceDir, prConfig, workspaceDeps.runCommand);

    // After re-anchor, HEAD is on origin/main (the seeded "initial" commit).
    const afterBranch = git(workspaceDir, "branch", "--show-current").trim();
    expect(afterBranch).toBe("main");
    const afterHead = git(workspaceDir, "rev-parse", "HEAD").trim();
    expect(afterHead).not.toBe(beforeHead);

    // Working tree is clean (the leftover.txt was tracked + reset hard
    // wiped it back to main's state, which doesn't have it).
    const status = git(workspaceDir, "status", "--porcelain");
    expect(status).toBe("");
    expect(existsSync(path.join(workspaceDir, "leftover.txt"))).toBe(false);
  });

  it("end-to-end: re-anchor + agent edits + executeOutput pushes branch with main as parent", async () => {
    // Pre-condition: a prior PR was created (leaves workspace on its branch).
    git(workspaceDir, "checkout", "-b", "pyanchor/old-job");
    writeFileSync(path.join(workspaceDir, "old.txt"), "old\n");
    git(workspaceDir, "add", ".");
    git(workspaceDir, "commit", "-m", "old PR work");
    const oldHead = git(workspaceDir, "rev-parse", "HEAD").trim();
    const mainHead = git(bareRemote, "rev-parse", "main").trim();

    // Step 1: re-anchor (what runner.ts does pre-agent).
    await preparePrWorkspace(workspaceDir, prConfig, workspaceDeps.runCommand);

    // Step 2: "agent edits". Just touch a real file.
    writeFileSync(
      path.join(workspaceDir, "README.md"),
      "INITIAL (now louder)\n"
    );

    // Step 3: executeOutput in pr mode. Build skipped (the build step
    // shells through sudo for cross-user execution; not the surface
    // this smoke targets — that's runner-subprocess.test.ts territory).
    const result = await executeOutput("pr", {
      workspaceConfig,
      workspaceDeps,
      runBuild: false,
      shouldRestart: false,
      withHeartbeat: async (_meta, work) => work(),
      prConfig
    });

    expect(result.mode).toBe("pr");
    expect(result.prUrl).toBe("https://github.com/example/repo/pull/42");

    // Pushed branch exists on the bare remote.
    const remoteBranches = git(bareRemote, "branch").trim();
    expect(remoteBranches).toContain("pyanchor/real-job-1");

    // The new branch's first non-merge commit has main as its parent,
    // NOT old PR's tip. This is the round-14 high we're guarding.
    const newBranchTip = git(
      bareRemote,
      "rev-parse",
      "pyanchor/real-job-1"
    ).trim();
    const parent = git(
      workspaceDir,
      "log",
      "-1",
      "--format=%P",
      newBranchTip
    ).trim();
    expect(parent).toBe(mainHead);
    expect(parent).not.toBe(oldHead);
  });

  it("no-op: clean workspace skips PR creation entirely", async () => {
    await preparePrWorkspace(workspaceDir, prConfig, workspaceDeps.runCommand);
    // No "agent edit" — workspace stays clean.

    const result = await executeOutput("pr", {
      workspaceConfig,
      workspaceDeps,
      runBuild: false,
      shouldRestart: false,
      withHeartbeat: async (_meta, work) => work(),
      prConfig
    });

    expect(result.mode).toBe("pr");
    expect(result.prUrl).toBeUndefined();

    // Fake gh was NOT called.
    expect(existsSync(ghCallLog)).toBe(false);

    // No new branch on remote.
    const remoteBranches = git(bareRemote, "branch").trim();
    expect(remoteBranches).not.toContain("pyanchor/real-job-1");
  });

  it("PR title + body land in gh argv with prompt content + run id", async () => {
    await preparePrWorkspace(workspaceDir, prConfig, workspaceDeps.runCommand);
    writeFileSync(path.join(workspaceDir, "README.md"), "edited\n");

    await executeOutput("pr", {
      workspaceConfig,
      workspaceDeps,
      runBuild: false,
      shouldRestart: false,
      withHeartbeat: async (_meta, work) => work(),
      prConfig: { ...prConfig, actor: "alice@example.com" }
    });

    // Read the captured gh argv.
    const captured = require("node:fs").readFileSync(ghCallLog, "utf8") as string;
    expect(captured).toContain("pr");
    expect(captured).toContain("create");
    expect(captured).toContain("--base");
    expect(captured).toContain("main");
    expect(captured).toContain("--head");
    expect(captured).toContain("pyanchor/real-job-1");
    // Title contains the prompt's first line.
    expect(captured).toContain("make the README louder");
    // Body has the run id + the escaped actor (round-15 #3 ZWSP fix).
    expect(captured).toContain("real-job-1");
    expect(captured).toContain("alice@\u200bexample.com");
  });
});
