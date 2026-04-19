/**
 * Outbound webhook dispatch (v0.20.0).
 *
 * Fire-and-forget POST notifications when edit jobs change state.
 * Designed to mirror the audit log events so a Slack/Discord channel
 * + the audit.jsonl file end up describing the same set of facts in
 * different formats.
 *
 * Three event types ship:
 *   - edit_requested  — a new /api/edit landed in the sidecar
 *   - edit_applied    — apply mode finished successfully
 *   - pr_opened       — pr mode finished successfully (carries pr_url)
 *
 * Each event has its own `PYANCHOR_WEBHOOK_*_URL` env. Empty / unset
 * = no dispatch for that event.
 *
 * Auto-detection of the destination format from the URL host:
 *   - `*.slack.com` / `hooks.slack.com` → Slack incoming webhook
 *     payload (`{ text }`)
 *   - `*.discord.com` / `discordapp.com` → Discord webhook payload
 *     (`{ content }`)
 *   - everything else → generic JSON payload (the full event)
 *
 * If you need a different format (Microsoft Teams, generic +
 * transformed, etc.), override `PYANCHOR_WEBHOOK_*_FORMAT=raw` to
 * always send the generic JSON payload — your downstream can shape
 * it however it likes.
 */

export type WebhookEvent =
  | "edit_requested"
  | "edit_applied"
  | "pr_opened";

export interface WebhookPayload {
  event: WebhookEvent;
  ts: string;
  run_id: string;
  actor?: string;
  prompt?: string;
  target_path?: string;
  mode?: "edit" | "chat";
  output_mode?: "apply" | "pr" | "dryrun";
  pr_url?: string;
  agent?: string;
  /** Free-form host context. Optional; the worker fills in what it knows. */
  origin?: string;
}

export type WebhookFormat = "auto" | "slack" | "discord" | "raw";

export interface WebhookSinkOptions {
  /** Map of event → webhook URL. Empty value = no-op for that event. */
  urls: Partial<Record<WebhookEvent, string>>;
  /**
   * Per-event format override. "auto" (default) inspects the URL host;
   * "slack" / "discord" force the named formatter; "raw" sends the
   * generic payload.
   */
  formats?: Partial<Record<WebhookEvent, WebhookFormat>>;
  /** Optional fetch override (tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Hard cap so a stuck endpoint can't pile up dispatches. Default
   * 5000ms. Webhooks are fire-and-forget; we don't await responses
   * for the worker's success path.
   */
  timeoutMs?: number;
}

export interface WebhookSink {
  emit(event: WebhookEvent, payload: WebhookPayload): Promise<void>;
}

/** Returns true iff `url` is non-empty after trim. */
const hasUrl = (url: string | undefined | null): url is string =>
  typeof url === "string" && url.trim().length > 0;

/**
 * Heuristic — pick a payload formatter from the destination host.
 * Easier to reason about than a separate per-event config bool, and
 * keeps the common case (Slack / Discord) zero-config.
 */
export function detectFormat(url: string, override?: WebhookFormat): WebhookFormat {
  if (override && override !== "auto") return override;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "raw";
  }
  if (host === "hooks.slack.com" || host.endsWith(".slack.com")) return "slack";
  // Round-14 #4a: include the bare legacy `discordapp.com` host
  // (no subdomain). v0.20.0 only matched `discord.com` exact +
  // `*.discord.com` + `*.discordapp.com` — the bare apex
  // `discordapp.com` fell through to raw.
  if (
    host === "discord.com" ||
    host === "discordapp.com" ||
    host.endsWith(".discord.com") ||
    host.endsWith(".discordapp.com")
  ) {
    return "discord";
  }
  return "raw";
}

/**
 * Render a human-readable one-line summary for chat sinks
 * (Slack / Discord). Avoids dumping the full prompt — chat
 * formats need a glance-readable line.
 */
export function renderSummary(payload: WebhookPayload): string {
  const who = payload.actor ? `*${payload.actor}*` : "someone";
  const where = payload.target_path ? ` on \`${payload.target_path}\`` : "";
  switch (payload.event) {
    case "edit_requested":
      // Round-14 #4b: article should be "an" before "edit" (vowel),
      // "a" before "chat" (consonant). v0.20.0 had both branches
      // emit "n", so chat requests rendered "an chat".
      return `${who} requested a${payload.mode === "edit" ? "n" : ""} ${payload.mode ?? "edit"}${where}.`;
    case "edit_applied":
      return `${who}'s ${payload.mode ?? "edit"}${where} was applied.`;
    case "pr_opened":
      return `${who}'s ${payload.mode ?? "edit"}${where} opened a PR${
        payload.pr_url ? `: ${payload.pr_url}` : ""
      }.`;
  }
}

/**
 * Map a generic payload to the destination wire format.
 */
export function formatBody(payload: WebhookPayload, format: WebhookFormat): unknown {
  if (format === "slack") return { text: renderSummary(payload) };
  if (format === "discord") return { content: renderSummary(payload) };
  return payload;
}

/**
 * Default sink: posts to the configured URLs with the auto-detected
 * format. Errors are swallowed after stderr — webhook failures must
 * never block the worker's success path.
 */
export class FetchWebhookSink implements WebhookSink {
  private readonly urls: Partial<Record<WebhookEvent, string>>;
  private readonly formats: Partial<Record<WebhookEvent, WebhookFormat>>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: WebhookSinkOptions) {
    this.urls = opts.urls;
    this.formats = opts.formats ?? {};
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  async emit(event: WebhookEvent, payload: WebhookPayload): Promise<void> {
    const url = this.urls[event];
    if (!hasUrl(url)) return;
    const format = detectFormat(url, this.formats[event]);
    const body = formatBody(payload, format);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        console.error(
          `[pyanchor:webhook] ${event} -> ${url} responded ${response.status}`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[pyanchor:webhook] ${event} -> ${url} dispatch failed: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** No-op sink — used when webhooks are unconfigured. */
export class NoopWebhookSink implements WebhookSink {
  async emit(_event: WebhookEvent, _payload: WebhookPayload): Promise<void> {
    // intentional no-op
  }
}
