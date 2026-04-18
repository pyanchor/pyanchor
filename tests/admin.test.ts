import { describe, expect, it } from "vitest";

import { renderAdminHtml } from "../src/admin";
import type { AdminHealth, AiEditState } from "../src/shared/types";

const baseHealth = (overrides: Partial<AdminHealth> = {}): AdminHealth => ({
  configured: true,
  port: 3010,
  host: "127.0.0.1",
  runtimeBasePath: "/_pyanchor",
  runtimeAliasPath: "/runtime",
  stateFile: "/home/bot/.pyanchor/state.json",
  workspaceDir: "/tmp/workspace",
  appDir: "/srv/app",
  workerScript: "/opt/pyanchor/dist/worker/runner.cjs",
  healthcheckUrl: "http://127.0.0.1:3000/",
  agent: "openclaw",
  fastReload: false,
  ...overrides
});

const baseState = (overrides: Partial<AiEditState> = {}): AiEditState => ({
  configured: true,
  status: "idle",
  jobId: null,
  pid: null,
  prompt: "",
  targetPath: "",
  mode: null,
  currentStep: null,
  heartbeatAt: null,
  heartbeatLabel: null,
  thinking: null,
  activityLog: [],
  error: null,
  startedAt: null,
  completedAt: null,
  updatedAt: new Date(0).toISOString(),
  queue: [],
  messages: [],
  ...overrides
});

describe("renderAdminHtml", () => {
  it("returns a complete HTML document", () => {
    const html = renderAdminHtml(baseHealth(), baseState());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("renders the configured-OK badge when health.configured is true", () => {
    const html = renderAdminHtml(baseHealth({ configured: true }), baseState());
    expect(html).toContain("dot--ok");
    expect(html).toContain("Configured");
  });

  it("renders the needs-wiring badge when health.configured is false", () => {
    const html = renderAdminHtml(baseHealth({ configured: false }), baseState());
    expect(html).toContain("Needs server wiring");
    // The dot--ok class is conditional; absent on the unconfigured badge.
    expect(html).toMatch(/<span class="dot "/);
  });

  it("escapes HTML metacharacters in the appDir field", () => {
    const html = renderAdminHtml(
      baseHealth({ appDir: "/tmp/<script>alert(1)</script>" }),
      baseState()
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes HTML in current-state fields (currentStep, heartbeatLabel)", () => {
    const html = renderAdminHtml(
      baseHealth(),
      baseState({
        status: "running",
        currentStep: '<img src="x" onerror="alert(1)">',
        heartbeatLabel: "Thinking <em>",
        targetPath: "/<x>"
      })
    );
    expect(html).not.toContain('<img src="x"');
    expect(html).toContain("&lt;img");
    expect(html).toContain("Thinking &lt;em&gt;");
    expect(html).toContain("/&lt;x&gt;");
  });

  it("includes the runtime base path as a clickable link to bootstrap.js", () => {
    const html = renderAdminHtml(baseHealth(), baseState());
    expect(html).toMatch(/href="\/_pyanchor\/bootstrap\.js"/);
  });

  it("uses '-' placeholders when state fields are empty", () => {
    const html = renderAdminHtml(baseHealth(), baseState({ targetPath: "", currentStep: null }));
    // Each empty field renders as "-" in the meta dl.
    expect(html.match(/<dd>-<\/dd>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("embeds the queue length", () => {
    const html = renderAdminHtml(
      baseHealth(),
      baseState({
        queue: [
          {
            jobId: "j1",
            prompt: "p1",
            targetPath: "/x",
            enqueuedAt: new Date(0).toISOString(),
            mode: "edit"
          },
          {
            jobId: "j2",
            prompt: "p2",
            targetPath: "/y",
            enqueuedAt: new Date(0).toISOString(),
            mode: "chat"
          }
        ]
      })
    );
    // queue length renders as a literal number inside the Queue dd
    expect(html).toMatch(/<dt>Queue<\/dt>\s*<dd>2<\/dd>/);
  });

  it("inlines health and state as JSON in <pre> blocks (escaped)", () => {
    const html = renderAdminHtml(baseHealth({ port: 9999 }), baseState({ status: "running" }));
    expect(html).toContain('id="health-json"');
    expect(html).toContain('id="state-json"');
    // JSON quotes are HTML-escaped to &quot; inside the pre, so we
    // assert on the escaped form. Numeric values aren't quoted, so
    // the port shows up bare.
    expect(html).toContain("&quot;port&quot;: 9999");
    expect(html).toContain("&quot;status&quot;: &quot;running&quot;");
  });

  it("escapes JSON string content too (e.g. an appDir with HTML)", () => {
    const html = renderAdminHtml(
      baseHealth({ appDir: "/srv/<bad>" }),
      baseState()
    );
    // The JSON pre should also contain the escaped form, never the raw tag.
    const jsonBlockStart = html.indexOf('id="health-json"');
    const jsonBlockEnd = html.indexOf("</pre>", jsonBlockStart);
    const jsonBlock = html.slice(jsonBlockStart, jsonBlockEnd);
    expect(jsonBlock).not.toContain("<bad>");
    expect(jsonBlock).toContain("&lt;bad&gt;");
  });
});
