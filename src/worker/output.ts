/**
 * Output mode dispatcher.
 *
 * v0.18.0 — extracted from the inline rsync+restart block in
 * runner.ts so future modes (PR generation in v0.19, custom
 * shell hooks, etc.) can plug in without touching runner orchestration.
 *
 * Modes:
 *   apply  — current behavior. Build → rsync workspace to app → restart.
 *   dryrun — build only. Skips rsync + restart. Useful for verifying
 *            the agent path end-to-end without touching the live app
 *            (e.g. during development of new agent adapters).
 *   pr     — v0.19+: git commit + push + open PR. Skips rsync +
 *            restart. Throws "not yet implemented" in v0.18 so the
 *            error is loud, not silent.
 *
 * Caller contract: `executeOutput` always runs the build step first
 * (gated by fastReload as before). Mode-specific work happens AFTER
 * build succeeds. If build fails, the throw propagates up to
 * runner's existing failure path — unchanged from v0.17.x.
 */

import type { WorkspaceConfig, WorkspaceDeps } from "./workspace";
import { buildWorkspace, restartFrontend, syncToAppDir } from "./workspace";

/**
 * Escape values that get spliced into a GitHub-flavored markdown
 * body so they can't bend the surrounding structure.
 *
 * Two real risks (round-14 #3):
 *   - `@username` in any field generates real notifications.
 *   - Triple-backtick fences in user-supplied prompts close our
 *     own outer formatting and can drag the rest of the body
 *     into a code block (or the inverse).
 *
 * The fix:
 *   - Insert a zero-width space after `@` so GitHub doesn't
 *     resolve it as a mention but the visible text is unchanged.
 *   - Render multi-line user input as a markdown block-quote
 *     (`> ` prefix per line) — quote blocks ignore embedded
 *     fences and are styled as a clear "this came from outside"
 *     region in the rendered PR.
 */
export const escapeGitHubBodyText = (value: string): string =>
  value.replace(/@/g, "@\u200b");

export const renderQuotedBlock = (value: string): string =>
  value
    .split("\n")
    .map((line) => `> ${escapeGitHubBodyText(line)}`)
    .join("\n");

/**
 * Re-anchor a persistent PR-mode workspace on the configured base
 * branch BEFORE the agent runs. Without this, the workspace .git
 * stays on the previous PR's branch (since `prepareWorkspace`
 * intentionally excludes .git from rsync to preserve history) and
 * the next `git checkout -b ${prefix}${jobId}` makes a branch whose
 * parent commit is the PREVIOUS PR's tip, not the configured base.
 *
 * Round-14 #1: this was the biggest coherence bug in the v0.19
 * "team-ready PR mode" story — unmerged PRs accidentally stacked.
 *
 * Order of operations:
 *   1. `git fetch <remote> <base>` — get latest base tip.
 *   2. `git checkout <base>` — switch off the previous PR branch.
 *   3. `git reset --hard <remote>/<base>` — discard any stale local
 *      base commits AND clean the working tree. This is safe to call
 *      BEFORE the agent runs: `prepareWorkspace` rsynced app→workspace
 *      so the working tree already matches the deployed state, which
 *      should match the base branch tip in any sane deployment.
 *
 * Calling AFTER the agent runs would wipe the agent's edits, which
 * is why this is a separate pre-agent function and not part of
 * `runPr()` itself.
 */
export async function preparePrWorkspace(
  workspaceDir: string,
  pr: PrConfig,
  runCommand: WorkspaceDeps["runCommand"]
): Promise<void> {
  // Sanity check moved here from runPr() so the failure surfaces
  // BEFORE the agent runs (saves the operator the wait if their git
  // auth / clone is misconfigured).
  try {
    await runCommand(pr.gitBin, ["-C", workspaceDir, "rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new Error(
      `PR mode: ${workspaceDir} is not a git working tree. ` +
        `Initialize it once before enabling PYANCHOR_OUTPUT_MODE=pr ` +
        `(e.g. \`git clone <your-remote> ${workspaceDir}\`). ` +
        `See docs/PRODUCTION-HARDENING.md.`
    );
  }

  await runCommand(pr.gitBin, ["-C", workspaceDir, "fetch", pr.gitRemote, pr.gitBaseBranch]);
  await runCommand(pr.gitBin, ["-C", workspaceDir, "checkout", pr.gitBaseBranch]);
  await runCommand(
    pr.gitBin,
    ["-C", workspaceDir, "reset", "--hard", `${pr.gitRemote}/${pr.gitBaseBranch}`]
  );
}

export type OutputMode = "apply" | "pr" | "dryrun";

export const KNOWN_OUTPUT_MODES: ReadonlyArray<OutputMode> = ["apply", "pr", "dryrun"];

/**
 * Knobs for PR mode (v0.19.0). Sourced from PYANCHOR_GIT_* envvars
 * in the runner; passed in here so the dispatcher stays
 * config-agnostic + the unit test can inject stubs without touching
 * env state.
 */
export interface PrConfig {
  gitBin: string;
  ghBin: string;
  gitRemote: string;
  gitBaseBranch: string;
  gitBranchPrefix: string;
  /** Job id used as the branch suffix + audit `run_id`. */
  jobId: string;
  /** Original prompt — first line becomes the PR title; full body
   *  goes into the PR description (prefixed with disclaimer). */
  prompt: string;
  /** edit | chat. chat shouldn't reach PR mode (no diff to ship)
   *  but the type guards downstream regardless. */
  mode: "edit" | "chat";
  /** Optional actor (X-Pyanchor-Actor passthrough). Embedded in the
   *  PR body so reviewers see who triggered the change. */
  actor?: string;
}

export interface OutputContext {
  workspaceConfig: WorkspaceConfig;
  workspaceDeps: WorkspaceDeps;
  /** When false, skip the build step (matches the existing fastReload contract). */
  runBuild: boolean;
  /** When false, skip the restart step even on apply mode (matches the
   *  existing shouldRestartAfterEdit gate). */
  shouldRestart: boolean;
  /** Heartbeat helper (the runner's withHeartbeat). Wraps each step so
   *  long-running stages emit progress to state.json. */
  withHeartbeat: <T>(meta: { step: string; label: string }, work: () => Promise<T>) => Promise<T>;
  /** PR config, only required when mode === "pr". Optional so apply +
   *  dryrun callers don't have to materialize git knobs they ignore. */
  prConfig?: PrConfig;
}

export interface OutputResult {
  /** Whether the runner should proceed to its post-mode finalize block. */
  proceedToFinalize: boolean;
  /** Optional PR url for audit log + future webhook payloads (v0.19+). */
  prUrl?: string;
  /** Mode that actually ran — echoed back so audit gets the resolved value. */
  mode: OutputMode;
}

/**
 * Validate + normalize an env-supplied mode string. Unknown values
 * fall back to "apply" with a stderr warning so misconfiguration
 * doesn't silently change behavior.
 */
export function resolveOutputMode(raw: string): OutputMode {
  const trimmed = (raw || "apply").trim().toLowerCase();
  if (trimmed === "apply" || trimmed === "pr" || trimmed === "dryrun") {
    return trimmed;
  }
  console.warn(
    `[pyanchor] Unknown PYANCHOR_OUTPUT_MODE="${raw}". ` +
      `Falling back to "apply". Known: ${KNOWN_OUTPUT_MODES.join(", ")}.`
  );
  return "apply";
}

/**
 * Run the post-agent workspace flow. Returns whether the caller
 * should proceed to its existing `finalizeSuccess` (true for apply
 * + dryrun + pr) — the bool exists for future modes that own their
 * own finalize lifecycle (e.g. a deferred-merge mode that doesn't
 * mark the job "done" until the PR is merged).
 */
export async function executeOutput(
  mode: OutputMode,
  ctx: OutputContext
): Promise<OutputResult> {
  // Build always runs (unless fastReload is on) — every mode needs
  // to know the workspace compiles before we either ship it or
  // bail. Skipping build would let the agent break the workspace
  // and get a "success" event in the audit log.
  if (ctx.runBuild) {
    await ctx.withHeartbeat(
      {
        step: "Validating with a workspace build.",
        label: "Build"
      },
      () => buildWorkspace(ctx.workspaceConfig, ctx.workspaceDeps)
    );
  }

  switch (mode) {
    case "apply":
      return runApply(ctx);
    case "dryrun":
      return runDryrun();
    case "pr":
      if (!ctx.prConfig) {
        throw new Error(
          "PYANCHOR_OUTPUT_MODE=pr requires a PrConfig (PYANCHOR_GIT_* envvars). " +
            "Caller did not provide one."
        );
      }
      return runPr(ctx, ctx.prConfig);
    default: {
      // exhaustiveness — unreachable thanks to resolveOutputMode but
      // keep the throw so a future enum extension fails compile.
      const _exhaustive: never = mode;
      throw new Error(`Unhandled output mode: ${_exhaustive as string}`);
    }
  }
}

async function runApply(ctx: OutputContext): Promise<OutputResult> {
  await ctx.withHeartbeat(
    {
      step: "Syncing edits back to the app dir.",
      label: "Syncing"
    },
    () => syncToAppDir(ctx.workspaceConfig, ctx.workspaceDeps)
  );
  if (ctx.shouldRestart) {
    await ctx.withHeartbeat(
      {
        step: "Restarting the frontend.",
        label: "Restarting"
      },
      () => restartFrontend(ctx.workspaceConfig, ctx.workspaceDeps)
    );
  }
  return { proceedToFinalize: true, mode: "apply" };
}

async function runDryrun(): Promise<OutputResult> {
  // No-op tail. Build (above) already validated the workspace; we
  // just don't ship it. The agent's edits stay in the workspace dir
  // for inspection.
  return { proceedToFinalize: true, mode: "dryrun" };
}

async function runPr(ctx: OutputContext, pr: PrConfig): Promise<OutputResult> {
  const { workspaceDir } = ctx.workspaceConfig;
  const { runCommand } = ctx.workspaceDeps;

  // Workspace sanity + base-branch re-anchor happen in
  // preparePrWorkspace() BEFORE the agent runs (round-14 #1 fix).
  // By the time we get here, .git is on origin/<base> and the agent
  // has layered its edits on top — the working tree already shows
  // the diff we want to ship.

  // 1. Quick-out: if the agent didn't actually change anything,
  //    skip the PR entirely. Audit still records the run as success
  //    with no pr_url — matches "agent ran but produced no edit".
  const status = await runCommand(pr.gitBin, ["-C", workspaceDir, "status", "--porcelain"]);
  if (!status.stdout.trim()) {
    return { proceedToFinalize: true, mode: "pr" };
  }

  const branch = `${pr.gitBranchPrefix}${pr.jobId}`;
  const title = (pr.prompt.split("\n")[0] || "pyanchor edit").slice(0, 72);
  // Round-14 #3: render the prompt as a quoted block + escape `@`
  // mentions in actor/prompt. Backtick fences inside the prompt no
  // longer break our outer body markdown; @-mentions don't generate
  // real GitHub notifications.
  const body =
    `Generated by pyanchor.\n\n` +
    `**Prompt**\n\n${renderQuotedBlock(pr.prompt)}\n\n` +
    `---\n` +
    `Run ID: \`${pr.jobId}\`\n` +
    `Mode: \`${pr.mode}\`\n` +
    (pr.actor ? `Actor: ${escapeGitHubBodyText(pr.actor)}\n` : "");

  await ctx.withHeartbeat({ step: "Creating branch.", label: "Branch" }, () =>
    runCommand(pr.gitBin, ["-C", workspaceDir, "checkout", "-b", branch])
  );
  await runCommand(pr.gitBin, ["-C", workspaceDir, "add", "."]);
  await runCommand(pr.gitBin, ["-C", workspaceDir, "commit", "-m", title, "-m", body]);

  await ctx.withHeartbeat(
    { step: "Pushing branch.", label: "Push" },
    () => runCommand(pr.gitBin, ["-C", workspaceDir, "push", pr.gitRemote, branch])
  );

  // gh CLI reads cwd to discover the repo. Pass `cwd` so it operates
  // on the workspace's clone, not pyanchor's own checkout.
  const ghResult = await ctx.withHeartbeat(
    { step: "Opening PR.", label: "PR" },
    () =>
      runCommand(
        pr.ghBin,
        [
          "pr",
          "create",
          "--base",
          pr.gitBaseBranch,
          "--head",
          branch,
          "--title",
          title,
          "--body",
          body
        ],
        { cwd: workspaceDir }
      )
  );

  // gh outputs the PR URL on the last non-empty line of stdout.
  const prUrl = ghResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();

  return { proceedToFinalize: true, mode: "pr", prUrl };
}
