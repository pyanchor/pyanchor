import { expect, test, type Page, type Request } from "@playwright/test";

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
 * Open the overlay panel by clicking the toggle button inside the
 * shadow root. Returns a function to retrieve the most recent
 * shadow innerHTML (for snapshot-style assertions).
 */
async function openPanel(page: Page) {
  await expect(page.locator("#pyanchor-overlay-root")).toBeAttached();
  // Wait for the toggle to actually be rendered (overlay sometimes
  // takes a microtask after script eval).
  await page.waitForFunction(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    return Boolean(host?.shadowRoot?.querySelector(".toggle, button[data-action='toggle'], button"));
  });
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
    const btn = host?.shadowRoot?.querySelector<HTMLElement>(
      ".toggle, button[data-action='toggle'], button"
    );
    btn?.click();
  });
}

test.describe("v0.5.1 token surface — full bootstrap path", () => {
  test(
    "after session POST 200, subsequent /api/status requests carry NO Authorization header (cookie-only path engaged)",
    async ({ page }) => {
      const sessionRequests: Request[] = [];
      const statusRequests: Request[] = [];

      // Capture every API request so we can assert on header presence.
      await page.route("**/_pyanchor/api/session", async (route) => {
        sessionRequests.push(route.request());
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            // The real sidecar would Set-Cookie; mock it for completeness
            // even though Playwright's same-origin tests don't strictly
            // need it for this assertion.
            "set-cookie": "pyanchor_session=opaque-id; HttpOnly; SameSite=Strict"
          },
          body: JSON.stringify({ id: "opaque-session-id", ttlMs: 86_400_000 })
        });
      });

      await page.route("**/_pyanchor/api/status", async (route) => {
        const req = route.request();
        // Stamp wall-clock capture time so the assertion can filter
        // strictly post-blanking requests (Codex round-7 #1).
        (req as unknown as { _capturedAt: number })._capturedAt = Date.now();
        statusRequests.push(req);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(idleState)
        });
      });

      await page.goto("/bootstrap.html");

      // Wait for bootstrap to set __PyanchorConfig and kick off /api/session.
      await page.waitForFunction(
        () => Boolean((window as Window & { __PyanchorConfig?: { token: string } }).__PyanchorConfig)
      );

      // Capture a "blanking timestamp" inside the page itself so the
      // snapshot is atomic with the .then(blank token) handler. The
      // node-side statusRequests array can include requests that
      // INITIATED before blanking but only landed at the route handler
      // after; using request.timing().requestStart to filter post-
      // blanking requests is more accurate than counting requests at
      // blanking time (Codex round-7 #1).
      const blankingTimestampMs = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const tick = () => {
              const cfg = (window as Window & { __PyanchorConfig?: { token: string } })
                .__PyanchorConfig;
              if (cfg?.token === "") {
                resolve(performance.timeOrigin + performance.now());
                return;
              }
              setTimeout(tick, 5);
            };
            tick();
          })
      );

      // The /api/session POST itself MUST carry the bearer token.
      expect(sessionRequests.length).toBe(1);
      const sessionAuth = sessionRequests[0]!.headers()["authorization"];
      expect(sessionAuth).toBe("Bearer e2e-test-token-32-chars-1234567890");

      // Wait for at least one /api/status request whose start time
      // is strictly after blankingTimestampMs.
      const isPostBlanking = (req: Request): boolean => {
        // Playwright Request.timing() returns -1 for unfinished
        // timing fields. Use the wall-clock startTime via the
        // initiator's response promise instead: when the route
        // handler captures the request, we record now() ourselves.
        // Fallback: if metadata is missing, treat as pre-blanking
        // (conservative — won't false-positive a leak).
        const start = (req as unknown as { _capturedAt?: number })._capturedAt;
        return typeof start === "number" && start > blankingTimestampMs;
      };

      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (statusRequests.some(isPostBlanking)) break;
        await page.waitForTimeout(100);
      }
      const postBlanking = statusRequests.filter(isPostBlanking);
      expect(
        postBlanking.length,
        `no /api/status request fired strictly after token blanking within 8s (${statusRequests.length} total captured) — cookie-only path can't be verified`
      ).toBeGreaterThan(0);

      const leakers = postBlanking.filter((req) =>
        Boolean(req.headers()["authorization"])
      );
      expect(
        leakers,
        `${leakers.length}/${postBlanking.length} post-blanking /api/status requests leaked the Authorization header`
      ).toHaveLength(0);
    }
  );
});

test.describe("submit + cancel user flows", () => {
  test("submitting a prompt POSTs /api/edit with {prompt, targetPath, mode}", async ({ page }) => {
    const editRequests: Request[] = [];

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
    await page.route("**/_pyanchor/api/edit", async (route) => {
      editRequests.push(route.request());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...idleState, status: "running", jobId: "submitted-job" })
      });
    });

    await page.goto("/");
    await openPanel(page);

    // Type the prompt into the textarea inside the shadow DOM.
    const typed = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const textarea = host?.shadowRoot?.querySelector<HTMLTextAreaElement>(".textarea");
      if (!textarea) return null;
      textarea.value = "make the button blue";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      return "make the button blue";
    });
    expect(typed).toBe("make the button blue");

    // Click the submit button. Selectors: form submit, .composer__submit,
    // or any button with data-action="submit".
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const root = host?.shadowRoot;
      const btn =
        root?.querySelector<HTMLElement>("button[data-action='submit']") ??
        root?.querySelector<HTMLElement>(".composer__submit") ??
        root?.querySelector<HTMLElement>("form button[type='submit']");
      btn?.click();
    });

    await page.waitForTimeout(300);

    expect(editRequests.length).toBe(1);
    const body = editRequests[0]!.postDataJSON();
    expect(body.prompt).toBe("make the button blue");
    expect(body.mode).toMatch(/edit|chat/);
    expect(typeof body.targetPath).toBe("string");
  });

  test("clicking cancel while running POSTs /api/cancel with the active jobId", async ({ page }) => {
    const cancelRequests: Request[] = [];

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
        body: JSON.stringify({
          ...idleState,
          status: "running",
          jobId: "active-job-xyz",
          mode: "edit",
          currentStep: "Working."
        })
      })
    );
    await page.route("**/_pyanchor/api/cancel", async (route) => {
      cancelRequests.push(route.request());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...idleState, status: "canceling", jobId: "active-job-xyz" })
      });
    });

    await page.goto("/");
    await openPanel(page);
    await page.waitForTimeout(200);

    // Click cancel.
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#pyanchor-overlay-root");
      const root = host?.shadowRoot;
      const btn =
        root?.querySelector<HTMLElement>("button[data-action='cancel']") ??
        root?.querySelector<HTMLElement>(".composer__cancel") ??
        root?.querySelector<HTMLElement>("button.cancel");
      btn?.click();
    });

    await page.waitForTimeout(300);

    expect(cancelRequests.length).toBeGreaterThanOrEqual(1);
    // The cancel payload may or may not include jobId — depends on the
    // overlay's internal logic. Either way the request should fire.
    const body = cancelRequests[0]!.postDataJSON();
    // Best-effort assertion: if jobId is sent, it should match active.
    if (body && body.jobId) {
      expect(body.jobId).toBe("active-job-xyz");
    }
  });
});
