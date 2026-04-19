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

test.describe("v0.9.4 built-in Korean bundle (end-to-end)", () => {
  test("locale='ko' renders Korean panel header + empty-state copy", async ({ page }) => {
    await mockApi(page);
    await page.goto("/ko.html");
    await openPanel(page);

    const text = await shadowText(page);
    // Empty-state message uses the Korean translation
    expect(text).toContain("대화 기록");
    // Mode buttons are translated
    expect(text).toContain("질문"); // modeAsk
    expect(text).toContain("편집"); // modeEdit
    // Default mode is "edit" → composer headline shows the edit translation.
    expect(text).toContain("페이지 편집"); // composerHeadlineEdit
    // Brand stays English
    expect(text).toContain("Pyanchor DevTools");
  });

  test("locale='ko' status banner uses Korean copy when running", async ({ page }) => {
    const runningState: MockState = {
      ...idleState,
      status: "running",
      jobId: "job-1",
      mode: "edit"
    };
    await mockApi(page, runningState);
    await page.goto("/ko.html");
    await openPanel(page);
    await page.waitForTimeout(200);

    const text = await shadowText(page);
    // statusReadingEdit translation visible somewhere in the panel
    expect(text).toContain("페이지와 코드를 읽는");
  });

  test("dialog aria-label remains the brand (Korean panelTitle preserved English)", async ({ page }) => {
    await mockApi(page);
    await page.goto("/ko.html");
    await openPanel(page);

    const ariaLabel = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return host?.shadowRoot?.querySelector("[role='dialog']")?.getAttribute("aria-label");
    });
    expect(ariaLabel).toBe("Pyanchor DevTools");
  });

  test("toggle button aria-label uses Korean toggleClose / toggleOpen", async ({ page }) => {
    await mockApi(page);
    await page.goto("/ko.html");
    await openPanel(page);

    const closeAria = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return host?.shadowRoot?.querySelector("[data-action='toggle']")?.getAttribute("aria-label");
    });
    expect(closeAria).toBe("Pyanchor DevTools 닫기");
  });
});
