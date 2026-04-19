import { expect, test, type Page } from "@playwright/test";

// v0.13.1 — round-12 #1 regression guard.
//
// Codex round-12 confirmed v0.12.1 wired the late-register hook,
// but the documented "load locale after overlay → UI localizes"
// behavior was still false because overlay captured `s` at boot
// and never re-resolved. This spec proves the new CustomEvent
// re-render path closes that gap end-to-end.
//
// Setup (served by tests/e2e/server.mjs at /reverse-ko.html):
//   - __PyanchorConfig.locale = "ko" (host requested Korean)
//   - overlay.js loads, but NO locales/ko.js script is preloaded
//   - the bundle would normally be auto-injected by bootstrap.js,
//     but this fixture skips bootstrap to isolate the late-register
//     code path
//
// Test:
//   1. Wait for overlay to boot — UI should be English (no locale
//      bundle yet, `resolveStrings("ko")` returns enStrings).
//   2. Inject `<script src="/_pyanchor/locales/ko.js">` late.
//   3. The bundle's top-level code calls `__PyanchorRegisterStrings`
//      which fires `pyanchor:locale-registered`.
//   4. Overlay's listener re-resolves `s` and re-renders.
//   5. UI text now reads in Korean.

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

test.describe("v0.13.1 late-register CustomEvent re-render (round-12 #1)", () => {
  test("overlay-first-then-locale: UI starts English, late-load ko bundle, UI becomes Korean", async ({
    page
  }) => {
    await mockApi(page);
    await page.goto("/reverse-ko.html");
    await openPanel(page);

    // Step 1: overlay booted but no locale bundle yet → English copy.
    const beforeText = await shadowText(page);
    expect(beforeText).toContain("Edit page"); // composerHeadlineEdit (English)
    expect(beforeText).not.toContain("페이지 편집"); // Korean shouldn't appear yet

    // Step 2: inject the ko bundle script tag. The bundle's top-level
    // code finds __PyanchorRegisterStrings (overlay exposed it on
    // boot) and calls it → strings.ts dispatches the
    // pyanchor:locale-registered CustomEvent → overlay's listener
    // re-resolves `s` and calls render().
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "/_pyanchor/locales/ko.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("ko bundle failed to load"));
          document.head.appendChild(script);
        })
    );

    // Step 3: wait for the listener to swap strings + re-render.
    // Use waitForFunction rather than a fixed sleep so we don't
    // race against scheduler quirks on slower CI hardware.
    await page.waitForFunction(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const text = host?.shadowRoot?.textContent ?? "";
      return text.includes("페이지 편집"); // composerHeadlineEdit (Korean)
    });

    const afterText = await shadowText(page);
    expect(afterText).toContain("페이지 편집");
    // Brand stays English on every locale (deliberate, see v0.10.0+).
    expect(afterText).toContain("Pyanchor DevTools");
  });
});
