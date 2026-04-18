import { describe, expect, it } from "vitest";

import {
  createBrief,
  formatConversationContext,
  getRouteHints
} from "../../src/agents/openclaw/brief";
import { viteProfile } from "../../src/frameworks";
import type { AiEditMessage } from "../../src/shared/types";

const message = (overrides: Partial<AiEditMessage> = {}): AiEditMessage => ({
  id: "id",
  jobId: "job",
  role: "user",
  mode: "edit",
  text: "hello",
  createdAt: new Date(0).toISOString(),
  status: null,
  ...overrides
});

describe("getRouteHints", () => {
  it("returns auth-specific guidance for /login", () => {
    const hints = getRouteHints("/login");
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.join("\n")).toContain("auth");
  });

  it("returns auth-specific guidance for /signup", () => {
    expect(getRouteHints("/signup").join("\n")).toContain("auth");
  });

  it("returns the generic two-line fallback for arbitrary routes", () => {
    const hints = getRouteHints("/dashboard");
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain("target route file");
  });

  it("returns the generic fallback for empty target", () => {
    expect(getRouteHints("")).toHaveLength(2);
  });
});

describe("formatConversationContext", () => {
  it("returns the empty marker when there are no messages", () => {
    expect(formatConversationContext([])).toBe("- No prior conversation.");
  });

  it("renders role, mode, and status for each message", () => {
    const out = formatConversationContext([
      message({ role: "user", mode: "edit", text: "do X", status: "running" }),
      message({ role: "assistant", mode: "edit", text: "did X", status: "done" })
    ]);
    expect(out).toContain("- User [edit] (running): do X");
    expect(out).toContain("- Assistant [edit] (done): did X");
  });

  it("truncates to the last 6 messages", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      message({ id: String(i), text: `msg-${i}` })
    );
    const out = formatConversationContext(messages);
    expect(out).not.toContain("msg-3");
    expect(out).toContain("msg-4");
    expect(out).toContain("msg-9");
  });

  it("omits the status suffix when status is null", () => {
    const out = formatConversationContext([message({ status: null, text: "hi" })]);
    expect(out).toContain("[edit]: hi");
    expect(out).not.toMatch(/\(\)/);
  });
});

describe("createBrief", () => {
  it("includes the prompt, mode, and target page", () => {
    const brief = createBrief("change the button", "/login", "edit", []);
    expect(brief).toContain("Mode: edit");
    expect(brief).toContain("Target page: /login");
    expect(brief).toContain("change the button");
  });

  it("uses the 'not specified' marker when target path is empty", () => {
    expect(createBrief("p", "", "edit", [])).toContain("Target page: not specified");
  });

  it("emits edit-mode constraints in edit mode", () => {
    const brief = createBrief("p", "/x", "edit", []);
    expect(brief).toContain("Preserve route flow");
    expect(brief).toContain("Implement the requested UI change completely");
  });

  it("emits chat-mode constraints in chat mode", () => {
    const brief = createBrief("p", "/x", "chat", []);
    expect(brief).toContain("Do not modify files");
    expect(brief).toContain("Answer clearly in Korean");
  });

  it("inlines route hints", () => {
    const brief = createBrief("p", "/login", "edit", []);
    expect(brief).toContain("app/(auth)/login/page.tsx");
  });

  it("inlines the conversation context", () => {
    const brief = createBrief("p", "/x", "edit", [message({ text: "earlier turn" })]);
    expect(brief).toContain("earlier turn");
  });

  it("uses framework-specific route hints when a profile is passed", () => {
    const brief = createBrief("p", "/dashboard", "edit", [], viteProfile);
    expect(brief).toMatch(/no file-system router|src\/routes/);
    expect(brief).not.toContain("app/globals.css");
  });
});
