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
    return Boolean(host?.shadowRoot?.querySelector(".panel"));
  });
}

const shadowText = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    return host?.shadowRoot?.textContent ?? "";
  });

test.describe("v0.10.0 built-in Japanese bundle", () => {
  test("locale='ja' renders Japanese panel header + empty state + mode buttons", async ({ page }) => {
    await mockApi(page);
    await page.goto("/ja.html");
    await openPanel(page);

    const text = await shadowText(page);
    // empty state in Japanese
    expect(text).toContain("会話履歴");
    // mode buttons translated
    expect(text).toContain("質問"); // modeAsk
    expect(text).toContain("編集"); // modeEdit
    // composer headline (default mode = edit)
    expect(text).toContain("ページ編集");
    // brand stays English
    expect(text).toContain("Pyanchor DevTools");
  });

  test("locale='ja' toggle button aria-label uses Japanese toggleClose", async ({ page }) => {
    await mockApi(page);
    await page.goto("/ja.html");
    await openPanel(page);

    const ariaLabel = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return host?.shadowRoot?.querySelector("[data-action='toggle']")?.getAttribute("aria-label");
    });
    expect(ariaLabel).toBe("Pyanchor DevTools を閉じる");
  });
});

test.describe("v0.10.0 built-in Simplified Chinese bundle", () => {
  test("locale='zh-cn' renders Chinese panel header + empty state + mode buttons", async ({ page }) => {
    await mockApi(page);
    await page.goto("/zh.html");
    await openPanel(page);

    const text = await shadowText(page);
    // empty state in Chinese
    expect(text).toContain("对话历史");
    // mode buttons translated
    expect(text).toContain("提问"); // modeAsk
    expect(text).toContain("编辑"); // modeEdit
    expect(text).toContain("编辑页面"); // composerHeadlineEdit
    expect(text).toContain("Pyanchor DevTools");
  });

  test("locale='zh-cn' toggle button aria-label uses Chinese toggleClose", async ({ page }) => {
    await mockApi(page);
    await page.goto("/zh.html");
    await openPanel(page);

    const ariaLabel = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return host?.shadowRoot?.querySelector("[data-action='toggle']")?.getAttribute("aria-label");
    });
    expect(ariaLabel).toBe("关闭 Pyanchor DevTools");
  });
});
