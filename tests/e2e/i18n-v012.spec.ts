import { expect, test, type Page } from "@playwright/test";

// v0.12.0 — Latin / SE-Asian locale expansion (es / de / fr / pt-br /
// vi / id). Mirrors the v0.10.0 i18n-extra spec: each locale gets a
// fixture page that loads the locale IIFE before the overlay, and we
// assert the panel header / mode buttons / aria-label render in the
// translated copy.

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
  /** URL path served by tests/e2e/server.mjs */
  path: string;
  /** Phrases expected somewhere in the rendered shadow root text */
  phrases: string[];
  /** Exact value of the toggle button's aria-label after open */
  toggleClose: string;
}

const cases: Record<string, LocaleCase> = {
  es: {
    path: "/es.html",
    phrases: ["Preguntar", "Editar", "Editar página", "Pyanchor DevTools"],
    toggleClose: "Cerrar Pyanchor DevTools"
  },
  de: {
    path: "/de.html",
    phrases: ["Fragen", "Bearbeiten", "Seite bearbeiten", "Pyanchor DevTools"],
    toggleClose: "Pyanchor DevTools schließen"
  },
  fr: {
    path: "/fr.html",
    phrases: ["Demander", "Éditer", "Éditer la page", "Pyanchor DevTools"],
    toggleClose: "Fermer Pyanchor DevTools"
  },
  "pt-br": {
    path: "/pt.html",
    phrases: ["Perguntar", "Editar", "Editar página", "Pyanchor DevTools"],
    toggleClose: "Fechar Pyanchor DevTools"
  },
  vi: {
    path: "/vi.html",
    phrases: ["Hỏi", "Sửa", "Sửa trang", "Pyanchor DevTools"],
    toggleClose: "Đóng Pyanchor DevTools"
  },
  id: {
    path: "/id.html",
    phrases: ["Tanya", "Edit", "Edit halaman", "Pyanchor DevTools"],
    toggleClose: "Tutup Pyanchor DevTools"
  }
};

for (const [locale, c] of Object.entries(cases)) {
  test.describe(`v0.12.0 built-in ${locale} bundle`, () => {
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
