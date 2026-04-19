import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectFormat,
  FetchWebhookSink,
  formatBody,
  NoopWebhookSink,
  renderSummary,
  type WebhookPayload
} from "../src/webhooks";

const basePayload = (overrides: Partial<WebhookPayload> = {}): WebhookPayload => ({
  event: "edit_requested",
  ts: "2026-04-20T01:00:00.000Z",
  run_id: "job-1",
  ...overrides
});

describe("detectFormat", () => {
  it("returns slack for hooks.slack.com", () => {
    expect(detectFormat("https://hooks.slack.com/services/abc/def")).toBe("slack");
  });

  it("returns slack for any *.slack.com host", () => {
    expect(detectFormat("https://corp.slack.com/webhook")).toBe("slack");
  });

  it("returns discord for *.discord.com hosts", () => {
    expect(detectFormat("https://discord.com/api/webhooks/123/abc")).toBe("discord");
    expect(detectFormat("https://canary.discord.com/api/webhooks/x/y")).toBe("discord");
  });

  it("returns discord for the bare legacy discordapp.com host (v0.20.1 round-14 #4a)", () => {
    // v0.20.0 only matched `discord.com` exact + `*.discord.com` +
    // `*.discordapp.com`; the bare `discordapp.com` apex fell through.
    expect(detectFormat("https://discordapp.com/api/webhooks/1/2")).toBe("discord");
    expect(detectFormat("https://canary.discordapp.com/api/webhooks/1/2")).toBe(
      "discord"
    );
  });

  it("returns raw for unknown hosts", () => {
    expect(detectFormat("https://example.com/hook")).toBe("raw");
    expect(detectFormat("https://my-custom-pipeline.io/in")).toBe("raw");
  });

  it("returns raw on malformed URLs (defensive)", () => {
    expect(detectFormat("not a url")).toBe("raw");
  });

  it("override forces format regardless of host", () => {
    expect(detectFormat("https://hooks.slack.com/x", "raw")).toBe("raw");
    expect(detectFormat("https://example.com/", "slack")).toBe("slack");
    expect(detectFormat("https://example.com/", "discord")).toBe("discord");
  });

  it("override 'auto' falls back to detection", () => {
    expect(detectFormat("https://hooks.slack.com/x", "auto")).toBe("slack");
  });
});

describe("renderSummary", () => {
  it("includes the actor name when present", () => {
    expect(renderSummary(basePayload({ actor: "alice@example.com" }))).toContain(
      "alice@example.com"
    );
  });

  it("falls back to 'someone' when no actor", () => {
    expect(renderSummary(basePayload())).toContain("someone");
  });

  it("includes target_path when present", () => {
    expect(
      renderSummary(basePayload({ target_path: "/dashboard", actor: "x" }))
    ).toContain("/dashboard");
  });

  it("uses correct article — 'an edit' (vowel) vs 'a chat' (consonant) (v0.20.1 round-14 #4b)", () => {
    // v0.20.0 had both branches emit "n" → "requested an chat".
    expect(renderSummary(basePayload({ event: "edit_requested", mode: "edit" }))).toContain(
      "requested an edit"
    );
    expect(renderSummary(basePayload({ event: "edit_requested", mode: "chat" }))).toContain(
      "requested a chat"
    );
  });

  it("pr_opened includes the PR URL", () => {
    expect(
      renderSummary(
        basePayload({
          event: "pr_opened",
          pr_url: "https://github.com/foo/bar/pull/42"
        })
      )
    ).toContain("https://github.com/foo/bar/pull/42");
  });
});

describe("formatBody", () => {
  it("slack format wraps the summary in { text }", () => {
    const body = formatBody(basePayload({ actor: "x" }), "slack") as { text: string };
    expect(body.text).toContain("x");
  });

  it("discord format wraps the summary in { content }", () => {
    const body = formatBody(basePayload({ actor: "y" }), "discord") as { content: string };
    expect(body.content).toContain("y");
  });

  it("raw format passes the full payload through", () => {
    const payload = basePayload({ actor: "z", run_id: "abc" });
    expect(formatBody(payload, "raw")).toEqual(payload);
  });
});

describe("FetchWebhookSink", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to the configured URL with auto-detected slack format", async () => {
    const sink = new FetchWebhookSink({
      urls: { edit_requested: "https://hooks.slack.com/services/x" },
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    await sink.emit("edit_requested", basePayload({ actor: "alice" }));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.com/services/x");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string) as { text: string };
    expect(body.text).toContain("alice");
  });

  it("posts the raw JSON payload to non-Slack/Discord URLs", async () => {
    const sink = new FetchWebhookSink({
      urls: { edit_requested: "https://my.pipeline.io/in" },
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    await sink.emit("edit_requested", basePayload({ run_id: "abc-123" }));

    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(init?.body as string) as WebhookPayload;
    expect(body.run_id).toBe("abc-123");
    expect(body.event).toBe("edit_requested");
  });

  it("respects per-event format override (raw on a slack URL)", async () => {
    const sink = new FetchWebhookSink({
      urls: { edit_requested: "https://hooks.slack.com/services/x" },
      formats: { edit_requested: "raw" },
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    await sink.emit("edit_requested", basePayload({ run_id: "raw-test" }));

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as WebhookPayload;
    // Override to raw → no { text } wrap.
    expect(body).not.toHaveProperty("text");
    expect(body.run_id).toBe("raw-test");
  });

  it("is a no-op when no URL is configured for the event", async () => {
    const sink = new FetchWebhookSink({
      urls: {}, // none
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    await sink.emit("edit_requested", basePayload());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs to stderr but does not throw on dispatch failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failingFetch = vi.fn(async () => {
      throw new Error("network down");
    });
    const sink = new FetchWebhookSink({
      urls: { edit_applied: "https://example.com/hook" },
      fetchImpl: failingFetch as unknown as typeof fetch
    });
    await expect(sink.emit("edit_applied", basePayload({ event: "edit_applied" }))).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0]?.[0]).toContain("dispatch failed");
  });

  it("logs non-2xx response codes to stderr without throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fiveHundredFetch = vi.fn(async () => new Response("nope", { status: 503 }));
    const sink = new FetchWebhookSink({
      urls: { edit_applied: "https://example.com/hook" },
      fetchImpl: fiveHundredFetch as unknown as typeof fetch
    });
    await expect(sink.emit("edit_applied", basePayload({ event: "edit_applied" }))).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0]?.[0]).toContain("503");
  });
});

describe("NoopWebhookSink", () => {
  it("does nothing", async () => {
    const sink = new NoopWebhookSink();
    await expect(sink.emit("edit_requested", basePayload())).resolves.toBeUndefined();
  });
});
