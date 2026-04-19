/**
 * Server-state polling client.
 *
 * Wraps the GET /api/status fetch + the post-fetch state mutations
 * (clearing lastSubmittedJobId once the user's job has actually
 * left the queue, surfacing outcome toasts) into a single factory
 * the overlay imports as a closure-bound function.
 *
 * Stays UI-agnostic: takes a `render` callback to invoke after each
 * sync, and an `onOutcome` callback to surface success/fail/cancel
 * toasts. The overlay wires both to its actual render() and showToast().
 */

import type { FetchJson } from "./fetch-helper";
import type { AiEditState, UIState } from "./state";

export type SyncOutcome =
  | { kind: "done"; mode: AiEditState["mode"] }
  | { kind: "failed"; error: string }
  | { kind: "canceled" };

export interface SyncStateClientOptions {
  /** Authenticated fetch wrapper from createFetchJson. */
  fetchJson: FetchJson;
  /** Compose the absolute URL for /api/status. */
  buildStatusUrl: () => string;
  /** Reads the current UI singleton (closure over `uiState`). */
  getUIState: () => UIState;
  /** Reads the current server-state singleton (closure). */
  getServerState: () => AiEditState;
  /** Replace the server-state singleton (closure mutation). */
  setServerState: (next: AiEditState) => void;
  /** Mutate the UI singleton (e.g. clear lastSubmittedJobId). */
  mutateUIState: (mutator: (state: UIState) => void) => void;
  /** Re-render the overlay after a sync. Always called, even on error. */
  render: () => void;
  /**
   * Invoked exactly once when an outcome transition is observed
   * (status change ON the same jobId, with withOutcomeToast=true).
   * Caller renders a toast.
   */
  onOutcome?: (outcome: SyncOutcome) => void;
}

export interface SyncStateClient {
  /**
   * Fetch /api/status, update server state, optionally surface an
   * outcome toast, and call render(). Swallows network errors and
   * still calls render() so the UI stays responsive.
   */
  sync(withOutcomeToast?: boolean): Promise<void>;
}

export function createSyncStateClient(opts: SyncStateClientOptions): SyncStateClient {
  return {
    async sync(withOutcomeToast = false) {
      const previous = opts.getServerState();
      const previousStatus = previous.status;
      const previousJobId = previous.jobId;
      try {
        const next = await opts.fetchJson<AiEditState>(opts.buildStatusUrl());
        opts.setServerState(next);

        const ui = opts.getUIState();
        if (
          ui.lastSubmittedJobId &&
          next.queue.every((item) => item.jobId !== ui.lastSubmittedJobId)
        ) {
          if (
            next.jobId !== ui.lastSubmittedJobId &&
            next.status !== "running" &&
            next.status !== "canceling"
          ) {
            opts.mutateUIState((state) => {
              state.lastSubmittedJobId = null;
            });
          }
        }

        if (
          withOutcomeToast &&
          previousJobId &&
          previousStatus !== next.status &&
          previousJobId === next.jobId
        ) {
          if (next.status === "done") {
            opts.onOutcome?.({ kind: "done", mode: next.mode });
            return;
          }
          if (next.status === "failed") {
            opts.onOutcome?.({ kind: "failed", error: next.error ?? "Job failed." });
            return;
          }
          if (next.status === "canceled") {
            opts.onOutcome?.({ kind: "canceled" });
            return;
          }
        }

        opts.render();
      } catch {
        opts.render();
      }
    }
  };
}
