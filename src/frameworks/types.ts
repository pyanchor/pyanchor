/**
 * Framework profile contract.
 *
 * A profile bundles the per-framework knowledge the sidecar needs:
 * default install/build commands, which workspace paths to skip when
 * rsyncing, and how to translate a route hint into actual file paths.
 *
 * Profiles are pure data + pure functions — no I/O, no module state —
 * so they're trivially unit-testable and safe to share across the
 * worker process and the agent adapters.
 */

export interface FrameworkProfile {
  /** Identifier used in PYANCHOR_FRAMEWORK and surfaced in logs. */
  readonly name: string;

  /**
   * Default shell command to install workspace dependencies.
   * Overridden by PYANCHOR_INSTALL_COMMAND when set.
   */
  readonly installCommand: string;

  /**
   * Default shell command to validate the workspace builds.
   * Overridden by PYANCHOR_BUILD_COMMAND when set.
   */
  readonly buildCommand: string;

  /**
   * Cache / output directories rsync should NOT copy from the app dir
   * into the workspace (and vice versa). `.git` and `node_modules` are
   * always excluded by the worker; profiles add framework-specific
   * dirs like `.next`, `dist`, `.vite`.
   */
  readonly workspaceExcludes: readonly string[];

  /**
   * Adapter-facing build instruction. Spliced into the brief so the
   * agent knows how to validate its own changes.
   * Example: "Run a production build (`next build`) and fix any issues."
   */
  readonly briefBuildHint: string;

  /**
   * Heuristic: route hint → candidate file paths (relative to workspace
   * root). The first path that exists on disk is what aider / claude-code
   * use as the explicit edit target. Empty array = no guess; the adapter
   * falls back to its own discovery.
   */
  routeFileCandidates(targetPath: string): string[];

  /**
   * OpenClaw-style markdown bullets appended to EDIT_BRIEF.md. Should
   * mention concrete file paths so the agent doesn't have to grep.
   * Empty array = no extra hints; the brief still includes the generic
   * "start with the target route file" line.
   */
  routeHints(targetPath: string): string[];
}
