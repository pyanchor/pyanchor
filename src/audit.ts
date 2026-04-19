/**
 * Append-only audit log for pyanchor edit jobs.
 *
 * v0.18.0 — first audit infrastructure. Records one JSON line per
 * job outcome with a documented schema. Designed to:
 *   - survive crashes (open-write-close per event, not buffered)
 *   - be log-rotation friendly (any tool that truncates the file
 *     keeps working — we re-open on every event)
 *   - feed into Datadog / Splunk / Loki / etc. via tail
 *
 * Roadmap notes:
 *   - v0.19: `actor` populated from the `X-Pyanchor-Actor` header
 *     the host app passes after its own auth gate. Pyanchor doesn't
 *     verify the value — host owns identity; we record what we're told.
 *   - v0.19: `pr_url` populated when output_mode is `pr`.
 *   - v0.20: webhook hooks read from the same event stream so
 *     audit + notifications stay consistent.
 *
 * The interface (`AuditSink`) is exposed so future callers can
 * substitute a SaaS log shipper without touching pyanchor core.
 */

import { appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export interface AuditEvent {
  /** ISO 8601 timestamp of the event (not the job start). */
  ts: string;
  /** Job id assigned at edit-request time. */
  run_id: string;
  /** Optional identity passed through by the host app's auth gate (v0.19+). */
  actor?: string;
  /** Origin header of the request that started the job, if known. */
  origin?: string;
  /** SHA-256 of the prompt text. Avoids leaking prompts to log shippers
   *  while still letting compliance teams correlate "is this the same prompt". */
  prompt_hash: string;
  /** Page path the edit was anchored to (e.g. `/dashboard`). */
  target_path?: string;
  /** Edit or chat. */
  mode: "edit" | "chat";
  /** apply | pr | dryrun. v0.18 ships apply + dryrun; pr in v0.19. */
  output_mode: "apply" | "pr" | "dryrun";
  /** SHA-256 of the unified diff (or null when nothing changed / chat). */
  diff_hash?: string | null;
  /** Final outcome of the job. */
  outcome: "success" | "failed" | "canceled";
  /** PR URL if output_mode === "pr" and creation succeeded (v0.19+). */
  pr_url?: string;
  /** Wall clock duration from worker start to outcome, milliseconds. */
  duration_ms: number;
  /** Adapter used (openclaw / claude-code / codex / aider / ...). */
  agent: string;
  /** Optional error message on failed/canceled outcomes. */
  error?: string;
}

export interface AuditSink {
  /**
   * Record one event. Implementations should be fire-and-forget:
   * audit failures must NEVER block the worker's success path. The
   * runner awaits this but the sink should swallow its own errors
   * after logging them to stderr.
   */
  emit(event: AuditEvent): Promise<void>;
}

/** Hex SHA-256 of a UTF-8 string. */
export const sha256Hex = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex");

/**
 * Default sink: append a single JSON line per event to a file.
 * Re-opens the file on every event so log-rotation is safe.
 */
export class FileAuditSink implements AuditSink {
  constructor(private readonly filePath: string) {}

  async emit(event: AuditEvent): Promise<void> {
    try {
      // JSON.stringify is intentional (not pretty-printed). One event
      // per line lets tail / jq / Splunk parse without reassembly.
      await appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
    } catch (err) {
      // Audit failure must not break the worker. Log to stderr so
      // operators see it in their normal log pipeline.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[pyanchor:audit] failed to append to ${this.filePath}: ${message}`);
    }
  }
}

/** Sink that drops events on the floor. Used when audit is disabled. */
export class NoopAuditSink implements AuditSink {
  async emit(_event: AuditEvent): Promise<void> {
    // intentional no-op
  }
}
