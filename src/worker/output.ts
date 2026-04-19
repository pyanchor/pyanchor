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

  // 0. Sanity: workspace must be a git working tree. v0.19 doesn't
  //    auto-clone; the operator pre-sets-up the workspace as a
  //    checkout of the deployment repo. If missing, fail with a
  //    pointer to the docs rather than silently doing nothing.
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

  // 1. Quick-out: if the agent didn't actually change anything,
  //    skip the PR entirely. Audit still records the run as success
  //    with no pr_url — matches "agent ran but produced no edit".
  const status = await runCommand(pr.gitBin, ["-C", workspaceDir, "status", "--porcelain"]);
  if (!status.stdout.trim()) {
    return { proceedToFinalize: true, mode: "pr" };
  }

  const branch = `${pr.gitBranchPrefix}${pr.jobId}`;
  const title = (pr.prompt.split("\n")[0] || "pyanchor edit").slice(0, 72);
  const body =
    `Generated by pyanchor.\n\n` +
    `**Prompt**\n\n${pr.prompt}\n\n` +
    `---\n` +
    `Run ID: \`${pr.jobId}\`\n` +
    `Mode: \`${pr.mode}\`\n` +
    (pr.actor ? `Actor: \`${pr.actor}\`\n` : "");

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
