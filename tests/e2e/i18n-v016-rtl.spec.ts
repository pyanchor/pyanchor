import { expect, test, type Page } from "@playwright/test";

// v0.16.0 — RTL expansion: Hebrew, Persian (Farsi), Urdu.
//
// Mirrors the v0.15.0 ar (Arabic) suite. Each new RTL locale should:
//   1. Render translated copy (panel headlines + aria-label).
//   2. Get `dir="rtl"` on the .pyanchor-root.
//   3. Land the trigger on the LEFT visual edge (mirror of LTR).
//
// Includes one explicit LTR-still-LTR check per spec just to keep
// the regression guard local (in case the v0.15.0 guard ever moves).

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

const dirAttribute = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    return host?.shadowRoot?.querySelector(".pyanchor-root")?.getAttribute("dir") ?? "";
  });

const triggerOnLeftHalf = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    const trigger = host?.shadowRoot?.querySelector<HTMLElement>("[data-action='toggle']");
    const rect = trigger?.getBoundingClientRect();
    return {
      distanceFromLeft: rect?.left ?? 0,
      distanceFromRight: window.innerWidth - (rect?.right ?? 0)
    };
  });

interface RtlCase {
  path: string;
  /** Phrases expected somewhere in the rendered shadow root text */
  phrases: string[];
  /** Exact aria-label of the toggle button after open */
  toggleClose: string;
}

const cases: Record<string, RtlCase> = {
  he: {
    path: "/he.html",
    phrases: ["שאל", "ערוך", "ערוך דף", "Pyanchor DevTools"],
    toggleClose: "סגור את Pyanchor DevTools"
  },
  fa: {
    path: "/fa.html",
    phrases: ["بپرس", "ویرایش", "ویرایش صفحه", "Pyanchor DevTools"],
    toggleClose: "بستن Pyanchor DevTools"
  },
  ur: {
    path: "/ur.html",
    phrases: ["پوچھیں", "ترمیم", "صفحہ ترمیم کریں", "Pyanchor DevTools"],
    toggleClose: "Pyanchor DevTools بند کریں"
  }
};

for (const [locale, c] of Object.entries(cases)) {
  test.describe(`v0.16.0 RTL: ${locale} bundle + layout flip`, () => {
    test(`locale='${locale}' renders translated panel + dir='rtl' on .pyanchor-root`, async ({ page }) => {
      await mockApi(page);
      await page.goto(c.path);
      await openPanel(page);

      const text = await page.evaluate(() => {
        const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
        return host?.shadowRoot?.textContent ?? "";
      });
      for (const phrase of c.phrases) {
        expect(text).toContain(phrase);
      }

      expect(await dirAttribute(page)).toBe("rtl");

      const ariaLabel = await page.evaluate(() => {
        const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
        return (
          host?.shadowRoot?.querySelector("[data-action='toggle']")?.getAttribute("aria-label") ??
          ""
        );
      });
      expect(ariaLabel).toBe(c.toggleClose);
    });

    test(`locale='${locale}' trigger sits on the LEFT visual edge under RTL`, async ({ page }) => {
      await mockApi(page);
      await page.goto(c.path);
      await openPanel(page);

      const { distanceFromLeft, distanceFromRight } = await triggerOnLeftHalf(page);
      expect(distanceFromLeft).toBeLessThan(distanceFromRight);
    });
  });
}
