import { expect, test, type Page } from "@playwright/test";

// v0.15.0 — first RTL locale (Arabic).
//
// Asserts both halves of the RTL contract:
//   1. The translated copy actually renders (panel headlines + aria-label).
//   2. The directional flip lands: `.pyanchor-root` has `dir="rtl"`,
//      AND the v0.15.0 logical CSS properties resolve to the
//      mirrored axis (computed `right` becomes inset-inline-end =
//      effectively the LEFT visual edge under RTL).
//
// Includes a parallel LTR regression assertion: a known LTR locale
// (Korean) renders with `dir="ltr"` so a future change to the dir
// computation can't accidentally flip every locale.

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

test.describe("v0.15.0 Arabic (RTL) bundle + layout flip", () => {
  test("locale='ar' renders translated panel + dir='rtl' on .pyanchor-root", async ({ page }) => {
    await mockApi(page);
    await page.goto("/ar.html");
    await openPanel(page);

    // Translated copy lands.
    const text = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return host?.shadowRoot?.textContent ?? "";
    });
    expect(text).toContain("تعديل الصفحة"); // composerHeadlineEdit
    expect(text).toContain("اسأل"); // modeAsk
    expect(text).toContain("عدّل"); // modeEdit
    expect(text).toContain("Pyanchor DevTools"); // brand stays Latin

    // Directional flip lands.
    expect(await dirAttribute(page)).toBe("rtl");

    // toggleClose aria-label is in Arabic.
    const ariaLabel = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return (
        host?.shadowRoot?.querySelector("[data-action='toggle']")?.getAttribute("aria-label") ??
        ""
      );
    });
    expect(ariaLabel).toBe("إغلاق Pyanchor DevTools");
  });

  test("RTL trigger sits on the LEFT visual edge (logical inset-inline-end flips under dir=rtl)", async ({
    page
  }) => {
    await mockApi(page);
    await page.goto("/ar.html");

    // Open panel ensures full layout, including position. We assert
    // on the trigger, not the panel, so we don't depend on
    // panel-internal layout choices.
    await openPanel(page);

    // The trigger lives inside .pyanchor-root which is `position:
    // absolute` relative to its `position: fixed` parent. Under
    // dir="rtl" the parent's `inset-inline-end` resolves to the
    // start (left) visual edge, so the trigger should sit closer to
    // the LEFT viewport edge than to the right.
    const { triggerLeft, triggerRight, viewportWidth } = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const trigger = host?.shadowRoot?.querySelector<HTMLElement>("[data-action='toggle']");
      const rect = trigger?.getBoundingClientRect();
      return {
        triggerLeft: rect?.left ?? 0,
        triggerRight: rect?.right ?? 0,
        viewportWidth: window.innerWidth
      };
    });
    // Trigger left-edge distance from viewport left should be
    // smaller than trigger right-edge distance from viewport right.
    // (Mirror image of the LTR layout where right < left.)
    const distanceFromLeft = triggerLeft;
    const distanceFromRight = viewportWidth - triggerRight;
    expect(distanceFromLeft).toBeLessThan(distanceFromRight);
  });

  test("LTR regression guard: locale='ko' still renders dir='ltr'", async ({ page }) => {
    // If a future change broke the RTL_LOCALES check (e.g. someone
    // accidentally added 'ko' to the set or inverted the boolean),
    // every LTR locale would suddenly flip. This test catches that.
    await mockApi(page);
    await page.goto("/ko.html");
    await openPanel(page);
    expect(await dirAttribute(page)).toBe("ltr");
  });
});
