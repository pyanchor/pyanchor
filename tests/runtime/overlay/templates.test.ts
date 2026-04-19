import { describe, expect, it } from "vitest";

import { renderMessagesTemplate } from "../../../src/runtime/overlay/templates";
import type { AiEditMessage } from "../../../src/runtime/overlay/state";

const message = (overrides: Partial<AiEditMessage> = {}): AiEditMessage => ({
  id: "m",
  jobId: "j",
  role: "user",
  mode: "edit",
  text: "hello",
  createdAt: new Date(2026, 0, 1, 3, 14, 7).toISOString(),
  status: "done",
  ...overrides
});

const baseProps = {
  messages: [],
  queuePosition: 0,
  serverStatus: "idle" as const,
  heartbeatAt: null,
  startedAt: null,
  pendingBubbleTitle: "Reading."
};

describe("renderMessagesTemplate", () => {
  it("renders the empty placeholder when there is no message and no pending work", () => {
    const html = renderMessagesTemplate(baseProps);
    expect(html).toContain("messages--empty");
    expect(html).toContain("Conversation history shows up here");
  });

  it("renders the message list when messages exist", () => {
    const html = renderMessagesTemplate({
      ...baseProps,
      messages: [message({ text: "hi from user" }), message({ role: "assistant", text: "answer" })]
    });
    expect(html).not.toContain("messages--empty");
    expect(html).toContain("hi from user");
    expect(html).toContain("answer");
    expect(html).toContain('class="message message--user"');
    expect(html).toContain('class="message message--assistant"');
  });

  it("uses 'You' for user messages and 'Pyanchor' for assistant + system", () => {
    const html = renderMessagesTemplate({
      ...baseProps,
      messages: [
        message({ role: "user", text: "u" }),
        message({ role: "assistant", text: "a" }),
        message({ role: "system", text: "s" })
      ]
    });
    expect(html.match(/>You</g)?.length).toBeGreaterThanOrEqual(1);
    expect(html.match(/>Pyanchor</g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("HTML-escapes message text against XSS", () => {
    const html = renderMessagesTemplate({
      ...baseProps,
      messages: [message({ text: '<img src=x onerror="alert(1)">' })]
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain("&lt;img src=x");
  });

  it("trims to the most recent N messages (default window 18)", () => {
    const messages = Array.from({ length: 25 }, (_, i) =>
      message({ id: `m-${i}`, text: `msg-${i}` })
    );
    const html = renderMessagesTemplate({ ...baseProps, messages });
    expect(html).not.toContain("msg-6");
    expect(html).toContain("msg-7"); // last 18 = msg-7..24
    expect(html).toContain("msg-24");
  });

  it("respects a custom messageWindow", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      message({ id: `m-${i}`, text: `msg-${i}` })
    );
    const html = renderMessagesTemplate({ ...baseProps, messages, messageWindow: 3 });
    expect(html).not.toContain("msg-6");
    expect(html).toContain("msg-7");
    expect(html).toContain("msg-9");
  });

  it("appends a pending bubble when serverStatus is 'running'", () => {
    const html = renderMessagesTemplate({
      ...baseProps,
      messages: [message({ text: "earlier" })],
      serverStatus: "running",
      pendingBubbleTitle: "Reading the page."
    });
    expect(html).toContain("message--pending");
    expect(html).toContain("Reading the page.");
  });

  it("appends a pending bubble when serverStatus is 'canceling'", () => {
    const html = renderMessagesTemplate({
      ...baseProps,
      messages: [],
      serverStatus: "canceling",
      pendingBubbleTitle: "Drafting your request."
    });
    expect(html).toContain("message--pending");
    expect(html).toContain("Drafting your request.");
  });

  it("appends a pending bubble when the user has a queued job (queuePosition > 0)", () => {
    const html = renderMessagesTemplate({
      ...baseProps,
      messages: [],
      queuePosition: 2,
      serverStatus: "idle",
      pendingBubbleTitle: "Drafting an answer."
    });
    expect(html).toContain("message--pending");
  });

  it("uses heartbeatAt when present, else falls back to startedAt for the pending bubble timestamp", () => {
    const html1 = renderMessagesTemplate({
      ...baseProps,
      serverStatus: "running",
      heartbeatAt: "2026-04-19T03:14:07Z",
      startedAt: null
    });
    // Some HH:MM:SS got stamped (exact value depends on TZ)
    expect(html1).toMatch(/<span class="message__time">\d{2}:\d{2}:\d{2}<\/span>/);

    const html2 = renderMessagesTemplate({
      ...baseProps,
      serverStatus: "running",
      heartbeatAt: null,
      startedAt: "2026-04-19T03:14:07Z"
    });
    expect(html2).toMatch(/<span class="message__time">\d{2}:\d{2}:\d{2}<\/span>/);
  });

  it("HTML-escapes the pendingBubbleTitle", () => {
    const html = renderMessagesTemplate({
      ...baseProps,
      messages: [],
      serverStatus: "running",
      pendingBubbleTitle: "<script>alert(1)</script>"
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
