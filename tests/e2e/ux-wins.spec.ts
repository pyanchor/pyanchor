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

async function mountOverlay(page: Page) {
  await expect(page.locator("#pyanchor-overlay-root")).toBeAttached();
  await page.waitForFunction(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    return Boolean(host?.shadowRoot?.querySelector("[data-action='toggle']"));
  });
}

const isPanelOpen = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    return Boolean(host?.shadowRoot?.querySelector(".panel"));
  });

test.describe("v0.9.5 keyboard shortcut (Cmd/Ctrl + Shift + .)", () => {
  test("Ctrl+Shift+. toggles the panel from a closed state", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await mountOverlay(page);

    expect(await isPanelOpen(page)).toBe(false);

    // Press Ctrl+Shift+. (use Control on all platforms — the
    // overlay's listener accepts metaKey OR ctrlKey).
    await page.keyboard.press("Control+Shift+.");
    await page.waitForTimeout(50);

    expect(await isPanelOpen(page)).toBe(true);

    // Press again → toggles closed.
    await page.keyboard.press("Control+Shift+.");
    await page.waitForTimeout(50);

    expect(await isPanelOpen(page)).toBe(false);
  });

  test("plain '.' or Shift+'.' do NOT toggle the panel (modifier required)", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await mountOverlay(page);

    expect(await isPanelOpen(page)).toBe(false);
    await page.keyboard.press(".");
    expect(await isPanelOpen(page)).toBe(false);
    await page.keyboard.press("Shift+.");
    expect(await isPanelOpen(page)).toBe(false);
  });

  test("synthetic event.repeat keydowns do NOT bounce the panel (Codex round-10 #1)", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await mountOverlay(page);

    expect(await isPanelOpen(page)).toBe(false);

    // Dispatch THREE synthetic keydown events: one fresh (repeat=false)
    // and two repeat=true. Without the v0.9.6 guard these would
    // toggle [open, close, open]. With the guard only the fresh one
    // counts → panel ends up open.
    await page.evaluate(() => {
      const fire = (repeat: boolean) => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: ".",
            shiftKey: true,
            ctrlKey: true,
            repeat,
            bubbles: true,
            cancelable: true
          })
        );
      };
      fire(false);
      fire(true);
      fire(true);
    });
    await page.waitForTimeout(50);

    expect(await isPanelOpen(page)).toBe(true);
  });
});

test.describe("v0.9.5 retry last request", () => {
  test("after a successful submit + failed status, Retry button appears and refills the prompt", async ({ page }) => {
    // Stage 1: successful submit (server returns idle so polling
    // sees no active job; the overlay client still records
    // lastSubmittedPrompt locally).
    let stagedStatus: MockState = idleState;
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
        body: JSON.stringify(stagedStatus)
      })
    );
    await page.route("**/_pyanchor/api/edit", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...idleState, status: "running", jobId: "j1" })
      })
    );

    await page.goto("/");
    await mountOverlay(page);

    // Open + type + submit
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      host?.shadowRoot?.querySelector<HTMLElement>("[data-action='toggle']")?.click();
    });
    await page.waitForFunction(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return Boolean(host?.shadowRoot?.querySelector(".textarea"));
    });
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const textarea = host?.shadowRoot?.querySelector<HTMLTextAreaElement>(".textarea");
      if (textarea) {
        textarea.value = "rerun me later";
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      host?.shadowRoot?.querySelector<HTMLFormElement>("[data-action='submit']")?.requestSubmit();
    });
    await page.waitForTimeout(150);

    // Stage 2: switch the polled status to failed so the Retry
    // button condition (status=failed AND lastSubmittedPrompt!=null)
    // becomes true. Re-route /api/status by swapping the closure var
    // and triggering a poll via visibility / navigation event.
    stagedStatus = {
      ...idleState,
      status: "failed",
      jobId: "j1",
      error: "synthetic failure for retry test"
    };
    // Force a re-render by dispatching pyanchor:navigation (overlay
    // listens and calls render()). Actually we need a fresh /api/status
    // poll first — the polling client only re-renders on next sync.
    // Easiest: just wait for the next poll cycle (3.5s). Speed it up
    // by manually triggering a visibility change which the overlay
    // doesn't listen to, so we have to wait for the actual poll.
    //
    // Pragmatic shortcut for the test: wait for the polling loop to
    // see the new status (POLL_INTERVAL_MS = 3500ms). Bump the
    // timeout accordingly.
    await page.waitForTimeout(4000);

    // Retry button should be visible now
    const retryButtonText = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return host?.shadowRoot?.querySelector("[data-action='retry']")?.textContent?.trim() ?? null;
    });
    expect(retryButtonText).toBe("Retry last request");

    // Click retry → textarea refills with the saved prompt
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      host?.shadowRoot?.querySelector<HTMLElement>("[data-action='retry']")?.click();
    });
    await page.waitForTimeout(50);

    const restoredPrompt = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return host?.shadowRoot?.querySelector<HTMLTextAreaElement>(".textarea")?.value ?? null;
    });
    expect(restoredPrompt).toBe("rerun me later");

    // Codex round-10 #2: focus must move to the TEXTAREA (not stay
    // on the Retry button). Without v0.9.6's explicit focus(), the
    // focus-retention logic would restore focus to the still-attached
    // Retry button and immediate typing would not edit the prompt.
    const focusedAction = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const root = host?.shadowRoot;
      const active = root?.activeElement as HTMLElement | null;
      return active?.tagName === "TEXTAREA" ? "TEXTAREA" : active?.dataset?.action ?? null;
    });
    expect(focusedAction).toBe("TEXTAREA");
  });
});

test.describe("v0.9.5 copy last (clipboard)", () => {
  test("Copy button is visible when an assistant message exists, and clicking it writes to the clipboard", async ({ page, context }) => {
    // Grant clipboard write permission.
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);

    const stateWithAssistant: MockState = {
      ...idleState,
      status: "done",
      jobId: "j1",
      mode: "edit",
      messages: [
        {
          id: "u",
          jobId: "j1",
          role: "user",
          mode: "edit",
          text: "do the thing",
          createdAt: new Date(0).toISOString(),
          status: "done"
        },
        {
          id: "a",
          jobId: "j1",
          role: "assistant",
          mode: "edit",
          text: "here is the assistant answer that should be copied",
          createdAt: new Date(0).toISOString(),
          status: "done"
        }
      ]
    };

    await mockApi(page, stateWithAssistant);
    await page.goto("/");
    await mountOverlay(page);

    // Open the panel
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      host?.shadowRoot?.querySelector<HTMLElement>("[data-action='toggle']")?.click();
    });
    await page.waitForTimeout(100);

    // Copy button should be visible
    const copyText = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return host?.shadowRoot?.querySelector("[data-action='copy']")?.textContent?.trim() ?? null;
    });
    expect(copyText).toBe("Copy");

    // Click copy
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      host?.shadowRoot?.querySelector<HTMLElement>("[data-action='copy']")?.click();
    });
    await page.waitForTimeout(150);

    // Verify clipboard contents
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe("here is the assistant answer that should be copied");
  });

  test("Copy button is NOT shown when only system messages exist (Codex round-10 #3)", async ({ page }) => {
    // System-only state: a queue cancellation system message but no
    // assistant message. v0.9.5 incorrectly surfaced Copy here and
    // copied the system text. v0.9.6 narrows to assistant-only.
    const systemOnlyState: MockState = {
      ...idleState,
      status: "canceled",
      jobId: "j1",
      mode: "edit",
      messages: [
        {
          id: "u",
          jobId: "j1",
          role: "user",
          mode: "edit",
          text: "ask",
          createdAt: new Date(0).toISOString(),
          status: "canceled"
        },
        {
          id: "s",
          jobId: "j1",
          role: "system",
          mode: "edit",
          text: "Queued request canceled.",
          createdAt: new Date(0).toISOString(),
          status: "canceled"
        }
      ]
    };

    await mockApi(page, systemOnlyState);
    await page.goto("/");
    await mountOverlay(page);

    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      host?.shadowRoot?.querySelector<HTMLElement>("[data-action='toggle']")?.click();
    });
    await page.waitForTimeout(100);

    const copyExists = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return Boolean(host?.shadowRoot?.querySelector("[data-action='copy']"));
    });
    expect(copyExists).toBe(false);
  });
});
