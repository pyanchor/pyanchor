import { expect, test, type Page } from "@playwright/test";

// v0.13.0 — Slavic / Indic / SE-Asian additions (ru / hi / th).
// Same pattern as the v0.10.0 / v0.12.0 i18n suites.

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

async function mockApi(page: Page) {
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
      body: JSON.stringify(idleState)
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

const ariaLabelOfToggle = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    return (
      host?.shadowRoot?.querySelector("[data-action='toggle']")?.getAttribute("aria-label") ?? ""
    );
  });

interface LocaleCase {
  path: string;
  phrases: string[];
  toggleClose: string;
}

const cases: Record<string, LocaleCase> = {
  ru: {
    path: "/ru.html",
    phrases: ["Спросить", "Изменить", "Изменить страницу", "Pyanchor DevTools"],
    toggleClose: "Закрыть Pyanchor DevTools"
  },
  hi: {
    path: "/hi.html",
    phrases: ["पूछें", "संपादन", "पेज संपादित करें", "Pyanchor DevTools"],
    toggleClose: "Pyanchor DevTools बंद करें"
  },
  th: {
    path: "/th.html",
    phrases: ["ถาม", "แก้ไข", "แก้ไขหน้า", "Pyanchor DevTools"],
    toggleClose: "ปิด Pyanchor DevTools"
  }
};

for (const [locale, c] of Object.entries(cases)) {
  test.describe(`v0.13.0 built-in ${locale} bundle`, () => {
    test(`locale='${locale}' renders translated panel`, async ({ page }) => {
      await mockApi(page);
      await page.goto(c.path);
      await openPanel(page);

      const text = await shadowText(page);
      for (const phrase of c.phrases) {
        expect(text).toContain(phrase);
      }
    });

    test(`locale='${locale}' toggle aria-label uses translated toggleClose`, async ({ page }) => {
      await mockApi(page);
      await page.goto(c.path);
      await openPanel(page);

      const ariaLabel = await ariaLabelOfToggle(page);
      expect(ariaLabel).toBe(c.toggleClose);
    });
  });
}
