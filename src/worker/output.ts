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
      return runPr();
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

async function runPr(): Promise<OutputResult> {
  // v0.19 will replace this with: git checkout -b <prefix><jobid>,
  // git add ., git commit -m "...", git push, gh pr create. The
  // runner's existing finalizeSuccess marks the job done; the audit
  // event records the resulting PR url.
  throw new Error(
    "PYANCHOR_OUTPUT_MODE=pr is not implemented yet in v0.18. " +
      "Coming in v0.19 with `git push` + `gh pr create` integration."
  );
}
