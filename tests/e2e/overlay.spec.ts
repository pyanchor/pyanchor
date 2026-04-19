import { expect, test, type Page, type Route } from "@playwright/test";

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

/**
 * Minimal mock harness: route every /_pyanchor/api/* call to one of
 * the staged JSON responses below. Tests can override per-route by
 * calling page.route() AFTER mockApi() — Playwright matches the
 * most-recently-registered handler first.
 */
async function mockApi(page: Page, opts: { status?: MockState; sessionOk?: boolean } = {}) {
  const status = opts.status ?? idleState;
  await page.route("**/_pyanchor/api/session", (route) =>
    route.fulfill({
      status: opts.sessionOk === false ? 401 : 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "session-id", ttlMs: 86_400_000 })
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

test.describe("overlay mount", () => {
  test("mounts a Shadow DOM toggle button on a fixture page", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    // Wait for the overlay script to load and append the host element.
    const host = page.locator("#pyanchor-overlay-root");
    await expect(host).toBeAttached();
    // Shadow DOM is not directly visible to Playwright queries by default —
    // use evaluate() to assert structure.
    const hasShadow = await host.evaluate((el) => Boolean((el as HTMLElement).shadowRoot));
    expect(hasShadow).toBe(true);

    const toggleHtml = await host.evaluate((el) => {
      const root = (el as HTMLElement).shadowRoot;
      return root?.querySelector(".toggle, button, .pyanchor-root")?.outerHTML ?? "";
    });
    expect(toggleHtml.length).toBeGreaterThan(0);
  });

  test("exposes shadow root content reachable via DOM piercing", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const host = page.locator("#pyanchor-overlay-root");
    await expect(host).toBeAttached();

    // Use the >>> shadow DOM piercing combinator to find content.
    const shadowText = await host.evaluate((el) => {
      const root = (el as HTMLElement).shadowRoot;
      return root?.textContent ?? "";
    });
    // The overlay always renders SOMETHING — the toggle button at minimum.
    expect(shadowText.length).toBeGreaterThan(0);
  });
});

test.describe("overlay polling + status display", () => {
  test("renders running state from /api/status", async ({ page }) => {
    const runningState: MockState = {
      ...idleState,
      status: "running",
      jobId: "job-1",
      mode: "edit",
      currentStep: "Preparing workspace.",
      heartbeatLabel: "Preparing"
    };
    await mockApi(page, { status: runningState });
    await page.goto("/");
    await expect(page.locator("#pyanchor-overlay-root")).toBeAttached();

    // Open the panel by clicking the toggle button inside the shadow root.
    const opened = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const root = host?.shadowRoot;
      const toggle = root?.querySelector<HTMLElement>(
        ".toggle, button[data-action='toggle'], button"
      );
      toggle?.click();
      return Boolean(toggle);
    });
    expect(opened).toBe(true);

    // After opening, the status line / pending bubble should reflect the
    // running state. Wait for the next poll cycle to see it.
    await page.waitForTimeout(200);
    const shadowText = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return host?.shadowRoot?.textContent ?? "";
    });
    // The overlay surfaces SOME running indicator — heartbeat label,
    // currentStep, or the generic "Reading the page and the code."
    // We assert the most stable: at least one of these tokens is present.
    const showsRunning =
      shadowText.includes("Preparing") ||
      shadowText.includes("Reading") ||
      shadowText.includes("Editing");
    expect(showsRunning).toBe(true);
  });
});

test.describe("overlay error tolerance", () => {
  test("survives a 500 from /api/status without crashing the page", async ({ page }) => {
    await page.route("**/_pyanchor/api/session", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "x", ttlMs: 1000 })
      })
    );
    await page.route("**/_pyanchor/api/status", (route: Route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "internal" })
      })
    );

    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await page.goto("/");
    await expect(page.locator("#pyanchor-overlay-root")).toBeAttached();
    await page.waitForTimeout(300);

    // Overlay's syncState() is wrapped in try/catch and still calls render().
    // We expect NO uncaught page errors from the failed status fetch.
    const overlayInitErrors = pageErrors.filter((err) =>
      err.message.includes("Pyanchor")
    );
    expect(overlayInitErrors).toHaveLength(0);

    // Host element still attached, shadow root still alive.
    const hostAlive = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      return Boolean(host?.shadowRoot);
    });
    expect(hostAlive).toBe(true);
  });
});
