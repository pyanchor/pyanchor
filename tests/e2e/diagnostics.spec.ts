import { expect, test, type Page } from "@playwright/test";

interface MockState {
  configured: boolean;
  status: string;
  jobId: string | null;
  pid: number | null;
  prompt: string;
  targetPath: string;
  mode: string | null;
  currentStep: string | null;
  heartbeatAt: string | null;
  heartbeatLabel: string | null;
  thinking: string | null;
  activityLog: string[];
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  queue: unknown[];
  messages: unknown[];
}

const idleState: MockState = {
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
  messages: []
};

async function mockApi(page: Page, status: MockState = idleState) {
  await page.route("**/_pyanchor/api/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "x", ttlMs: 1000 })
    })
  );
  await page.route("**/_pyanchor/api/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(status)
    })
  );
}

async function openPanel(page: Page) {
  await expect(page.locator("#pyanchor-overlay-root")).toBeAttached();
  await page.waitForFunction(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    return Boolean(host?.shadowRoot?.querySelector("[data-action='toggle']"));
  });
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    host?.shadowRoot?.querySelector<HTMLElement>("[data-action='toggle']")?.click();
  });
  await page.waitForFunction(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    return Boolean(host?.shadowRoot?.querySelector(".diagnostics"));
  });
}

const expandDiagnostics = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    const details = host?.shadowRoot?.querySelector<HTMLDetailsElement>(".diagnostics");
    if (details) details.open = true;
  });

const diagnosticsRows = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    const grid = host?.shadowRoot?.querySelector(".diagnostics__grid");
    if (!grid) return null;
    const out: Record<string, string> = {};
    const dts = Array.from(grid.querySelectorAll("dt"));
    const dds = Array.from(grid.querySelectorAll("dd"));
    for (let i = 0; i < dts.length; i++) {
      out[dts[i]!.textContent!.trim()] = dds[i]!.textContent!.trim();
    }
    return out;
  });

test.describe("v0.9.7 diagnostics panel", () => {
  test("collapsed by default; expanding shows runtime + auth + state rows", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await openPanel(page);

    // Collapsed by default: <details> has no `open` attribute initially.
    const initiallyOpen = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const details = host?.shadowRoot?.querySelector<HTMLDetailsElement>(".diagnostics");
      return details?.open ?? false;
    });
    expect(initiallyOpen).toBe(false);

    // Expand and verify the field grid populates with sane values.
    await expandDiagnostics(page);
    await page.waitForTimeout(50);

    const rows = await diagnosticsRows(page);
    expect(rows).not.toBeNull();
    expect(rows!.Runtime).toBe("/_pyanchor");
    expect(rows!.Status).toBe("idle");
    expect(rows!.Queue).toBe("0");
    expect(rows!["Job ID"]).toBe("—"); // null jobId rendered as em-dash
    expect(rows!.Mode).toBe("—"); // null mode rendered as em-dash
    // Auth is "bearer token" because the overlay-direct fixture
    // never runs bootstrap → token stays in window.__PyanchorConfig.
    expect(rows!.Auth).toBe("bearer token");
  });

  test("running state surfaces jobId + mode + auth correctly", async ({ page }) => {
    const runningState: MockState = {
      ...idleState,
      status: "running",
      jobId: "active-job-xyz",
      mode: "edit",
      heartbeatAt: "2026-04-19T10:00:00Z",
      updatedAt: "2026-04-19T10:00:00Z"
    };
    await mockApi(page, runningState);
    await page.goto("/");
    await openPanel(page);
    await page.waitForTimeout(200); // let polling pull the running state
    await expandDiagnostics(page);

    const rows = await diagnosticsRows(page);
    expect(rows!.Status).toBe("running");
    expect(rows!["Job ID"]).toBe("active-job-xyz");
    expect(rows!.Mode).toBe("edit");
  });

  test("Korean locale renders translated diagnostics labels", async ({ page }) => {
    await mockApi(page);
    await page.goto("/ko.html");
    await openPanel(page);
    await expandDiagnostics(page);

    const rows = await diagnosticsRows(page);
    expect(rows).not.toBeNull();
    // Labels translated
    expect(rows!).toHaveProperty("런타임");
    expect(rows!).toHaveProperty("상태");
    expect(rows!).toHaveProperty("작업 ID");
    expect(rows!).toHaveProperty("대기열");
    // Korean locale resolved
    expect(rows!["로케일"]).toBe("ko");
  });
});
