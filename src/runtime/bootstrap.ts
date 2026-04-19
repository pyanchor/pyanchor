export {};

declare global {
  interface Window {
    __PyanchorBootstrapLoaded?: boolean;
    __PyanchorConfig?: {
      baseUrl: string;
      token: string;
      /** Optional locale code (e.g. "ko", "en"). v0.9.0+. */
      locale?: string;
    };
  }
}

export const DEFAULT_TRUSTED_HOSTS = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"];

export const isTrustedHost = (hostname: string, allowList: string[]): boolean => {
  const trimmed = hostname.toLowerCase();
  if (!trimmed) return false;
  for (const entry of allowList) {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) continue;
    if (pattern === trimmed) return true;
    if (pattern === ".local" && trimmed.endsWith(".local")) return true;
    if (pattern.startsWith("*.") && trimmed.endsWith(pattern.slice(1))) return true;
    if (pattern.startsWith(".") && trimmed.endsWith(pattern)) return true;
  }
  return false;
};

export interface BootstrapDeps {
  /** Window-like object — uses `__PyanchorBootstrapLoaded`, `__PyanchorConfig`, `location`. */
  window: Window;
  /** Document used for createElement / currentScript / overlay-dedup query. */
  document: Document;
  /** Fetch implementation for the session-exchange POST. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /**
   * The script tag that loaded this bootstrap, if known. The IIFE at
   * the bottom of this file passes `document.currentScript`; tests
   * pass a fixture script element so the dataset reads work without
   * touching the real page.
   */
  currentScript: HTMLScriptElement | null;
}

/**
 * Pure runner for the bootstrap. Idempotent on
 * `window.__PyanchorBootstrapLoaded`. Returns one of:
 *   - "skipped-already-loaded" — second call short-circuits
 *   - "skipped-untrusted-host" — hostname not in allowlist; no overlay loaded
 *   - "loaded" — config set, session POST kicked off, overlay script appended
 *   - "loaded-overlay-already-present" — config set but overlay tag dedup'd
 *
 * The session-exchange POST runs as a background fire-and-forget;
 * its `.then` blanks `window.__PyanchorConfig.token` on success.
 */
export type BootstrapResult =
  | "skipped-already-loaded"
  | "skipped-untrusted-host"
  | "loaded"
  | "loaded-overlay-already-present";

export function runBootstrap(deps: BootstrapDeps): BootstrapResult {
  const { window: win, document: doc, currentScript } = deps;
  const fetchImpl = deps.fetch ?? fetch;

  if (win.__PyanchorBootstrapLoaded) return "skipped-already-loaded";
  win.__PyanchorBootstrapLoaded = true;

  const scriptUrl = currentScript?.src ? new URL(currentScript.src, win.location.href) : null;
  const basePath = scriptUrl?.pathname.replace(/\/bootstrap\.js$/, "") ?? "/_pyanchor";
  const baseUrl = `${scriptUrl?.origin ?? win.location.origin}${basePath}`.replace(/\/+$/, "");
  const token = currentScript?.dataset.pyanchorToken?.trim() ?? "";

  // Locale resolution priority: pre-seeded `__PyanchorConfig.locale`
  // (host code mutated the global before bootstrap ran) →
  // `data-pyanchor-locale` on this <script> tag → undefined (overlay
  // falls back to English). Read once here so the overlay-side
  // resolveStrings() lookup actually has data to work with.
  const datasetLocale = currentScript?.dataset.pyanchorLocale?.trim();
  const locale = win.__PyanchorConfig?.locale ?? datasetLocale ?? undefined;

  // Hostname allowlist defense.
  const customHosts = currentScript?.dataset.pyanchorTrustedHosts?.trim();
  const allowList = customHosts ? customHosts.split(",") : DEFAULT_TRUSTED_HOSTS;
  if (!isTrustedHost(win.location.hostname, allowList)) {
    console.warn(
      `[pyanchor] overlay disabled on untrusted host "${win.location.hostname}". ` +
        `Add it to data-pyanchor-trusted-hosts on the <script> tag if this is intentional.`
    );
    return "skipped-untrusted-host";
  }

  win.__PyanchorConfig = { baseUrl, token, ...(locale ? { locale } : {}) };

  // Exchange the bearer token for an HttpOnly session cookie. On
  // success, blank window.__PyanchorConfig.token so the raw bearer
  // stops sitting in JS-readable global state past the first
  // ~200ms of page load. Fire-and-forget; failures leave the token
  // in place so the overlay can still authenticate via the
  // Authorization header.
  if (token) {
    void fetchImpl(`${baseUrl}/api/session`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((response) => {
        if (response.ok && win.__PyanchorConfig) {
          win.__PyanchorConfig.token = "";
        }
      })
      .catch(() => undefined);
  }

  if (doc.querySelector("script[data-pyanchor-overlay='1']")) {
    return "loaded-overlay-already-present";
  }

  // v0.11.0 — if a locale is requested, inject its bundle BEFORE the
  // overlay script. Both are `defer`, so browsers execute them in
  // document order; the locale pushes itself onto
  // `window.__PyanchorPendingLocales`, and the overlay drains that
  // queue on boot. Skipping this when there's no locale keeps the
  // default English path fetch-free.
  //
  // Only inject for locales we ship bundles for. Unknown locales fall
  // back to English silently (same contract as `resolveStrings`).
  const BUILT_IN_LOCALES = new Set([
    "ko",
    "ja",
    "zh-cn",
    "es",
    "de",
    "fr",
    "pt-br",
    "vi",
    "id",
    "ru",
    "hi",
    "th"
  ]);
  const localeKey = locale?.toLowerCase();
  if (
    localeKey &&
    BUILT_IN_LOCALES.has(localeKey) &&
    !doc.querySelector(`script[data-pyanchor-locale-bundle='${localeKey}']`)
  ) {
    const localeScript = doc.createElement("script");
    localeScript.src = `${baseUrl}/locales/${localeKey}.js`;
    localeScript.defer = true;
    localeScript.dataset.pyanchorLocaleBundle = localeKey;
    doc.head.appendChild(localeScript);
  }

  const overlayScript = doc.createElement("script");
  overlayScript.src = `${baseUrl}/overlay.js`;
  overlayScript.defer = true;
  overlayScript.dataset.pyanchorOverlay = "1";
  if (locale) {
    // Mirror the locale onto the overlay script tag so the overlay
    // can read it via its own data-pyanchor-locale lookup. Redundant
    // with __PyanchorConfig.locale but keeps the two activation
    // paths consistent.
    overlayScript.dataset.pyanchorLocale = locale;
  }
  doc.head.appendChild(overlayScript);
  return "loaded";
}

// Browser entrypoint: invoke runBootstrap with the real globals.
// Tests import runBootstrap directly with fake deps.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  runBootstrap({
    window,
    document,
    currentScript: document.currentScript as HTMLScriptElement | null
  });
}
