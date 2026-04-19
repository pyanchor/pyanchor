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

async function mockIdle(page: Page) {
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

/** Open the panel via the toggle button (click). Returns once the panel is in the DOM. */
async function openPanelByClick(page: Page) {
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

/** Read the active element's data-action attribute, or "TEXTAREA" / "BODY" for special cases. */
async function activeElementId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    const root = host?.shadowRoot;
    const active = root?.activeElement as HTMLElement | null;
    if (!active) return document.activeElement?.tagName ?? "NONE";
    if (active.tagName === "TEXTAREA") return "TEXTAREA";
    return active.dataset?.action ?? active.tagName;
  });
}

test.describe("keyboard navigation — focus retention across re-renders (Codex round-9 #1)", () => {
  test("clicking a mode-switch button does NOT drop focus to BODY (v0.9.3 fix)", async ({ page }) => {
    await mockIdle(page);
    await page.goto("/");
    await openPanelByClick(page);

    // After fresh open, focus auto-lands on the textarea.
    expect(await activeElementId(page)).toBe("TEXTAREA");

    // Programmatically focus the mode-chat button + click it.
    // The click triggers a re-render (mode change → state mutation
    // → render() called). v0.9.2 dropped focus to BODY here; v0.9.3
    // saves the data-action identity and restores focus to the same
    // button after innerHTML wipe.
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const btn = host?.shadowRoot?.querySelector<HTMLElement>(
        "[data-action='mode-chat']"
      );
      btn?.focus();
      btn?.click();
    });

    // Give the render() microtask + DOM update a beat.
    await page.waitForTimeout(50);

    // Focus should STILL be on the (now possibly re-rendered) mode-chat
    // button, NOT on body / null.
    expect(await activeElementId(page)).toBe("mode-chat");
  });

  test("clicking close moves focus back to the toggle button (focus return on close)", async ({ page }) => {
    await mockIdle(page);
    await page.goto("/");
    await openPanelByClick(page);

    // Sanity: panel open, focus on textarea
    expect(await activeElementId(page)).toBe("TEXTAREA");

    // Click the close button — uiState.isOpen flips to false → next
    // render closes the panel. v0.9.3 detects justClosed and focuses
    // the toggle button.
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      host?.shadowRoot?.querySelector<HTMLElement>("[data-action='close']")?.click();
    });

    await page.waitForTimeout(50);

    expect(await activeElementId(page)).toBe("toggle");
  });
});

test.describe("keyboard navigation — focus trap wraps inside the panel", () => {
  test("Tab past the last focusable element wraps to the first", async ({ page }) => {
    await mockIdle(page);
    await page.goto("/");
    await openPanelByClick(page);

    // Programmatically focus the LAST focusable in the panel
    // (submit button) then dispatch a Tab keydown — focus trap
    // should wrap to the first focusable (close button).
    const firstAction = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const root = host?.shadowRoot;
      const panel = root?.querySelector<HTMLElement>(".panel");
      if (!panel) return null;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      return {
        firstAction: focusable[0]?.dataset?.action ?? focusable[0]?.tagName ?? null,
        lastAction:
          focusable[focusable.length - 1]?.dataset?.action ??
          focusable[focusable.length - 1]?.tagName ??
          null,
        count: focusable.length
      };
    });
    expect(firstAction).not.toBeNull();
    expect(firstAction!.count).toBeGreaterThan(1);

    // Focus the last focusable, then send Tab.
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const root = host?.shadowRoot;
      const focusable = Array.from(
        root?.querySelector(".panel")?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      focusable[focusable.length - 1]?.focus();
    });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(30);

    // Focus should have wrapped back to the first focusable.
    expect(await activeElementId(page)).toBe(firstAction!.firstAction);
  });

  test("Shift+Tab past the first focusable element wraps to the last", async ({ page }) => {
    await mockIdle(page);
    await page.goto("/");
    await openPanelByClick(page);

    const positions = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const root = host?.shadowRoot;
      const focusable = Array.from(
        root?.querySelector(".panel")?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      return {
        first: focusable[0]?.dataset?.action ?? focusable[0]?.tagName ?? null,
        last:
          focusable[focusable.length - 1]?.dataset?.action ??
          focusable[focusable.length - 1]?.tagName ??
          null
      };
    });

    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const root = host?.shadowRoot;
      const first = root
        ?.querySelector(".panel")
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
      first?.focus();
    });
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(30);

    expect(await activeElementId(page)).toBe(positions.last);
  });
});
