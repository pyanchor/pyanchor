// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TRUSTED_HOSTS,
  hasGateCookie,
  isTrustedHost,
  runBootstrap
} from "../../src/runtime/bootstrap";

const makeScript = (
  attributes: {
    src?: string;
    pyanchorToken?: string;
    pyanchorTrustedHosts?: string;
    pyanchorRequireGateCookie?: string;
  } = {}
): HTMLScriptElement => {
  const script = document.createElement("script");
  if (attributes.src) script.src = attributes.src;
  if (attributes.pyanchorToken !== undefined) {
    script.dataset.pyanchorToken = attributes.pyanchorToken;
  }
  if (attributes.pyanchorTrustedHosts !== undefined) {
    script.dataset.pyanchorTrustedHosts = attributes.pyanchorTrustedHosts;
  }
  if (attributes.pyanchorRequireGateCookie !== undefined) {
    script.dataset.pyanchorRequireGateCookie = attributes.pyanchorRequireGateCookie;
  }
  return script;
};

// happy-dom lets us write document.cookie like a browser. Helper
// keeps test bodies short and clears cookies between tests.
const setCookie = (cookie: string) => {
  Object.defineProperty(document, "cookie", {
    value: cookie,
    writable: true,
    configurable: true
  });
};

const setHostname = (hostname: string) => {
  // happy-dom lets us replace location via Object.defineProperty.
  Object.defineProperty(window, "location", {
    value: new URL(`http://${hostname}/`),
    writable: true,
    configurable: true
  });
};

beforeEach(() => {
  // Reset the page for each test.
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete (window as Window & { __PyanchorBootstrapLoaded?: boolean }).__PyanchorBootstrapLoaded;
  delete (window as Window & { __PyanchorConfig?: unknown }).__PyanchorConfig;
  setHostname("localhost");
  setCookie("");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hasGateCookie (v0.17.0 production gating fail-safe)", () => {
  it("returns true when the named cookie is set with a non-empty value", () => {
    expect(hasGateCookie("pyanchor_dev=1", "pyanchor_dev")).toBe(true);
    expect(hasGateCookie("foo=bar; pyanchor_dev=abcd", "pyanchor_dev")).toBe(true);
    expect(hasGateCookie("pyanchor_dev=abcd; foo=bar", "pyanchor_dev")).toBe(true);
  });

  it("returns false when the cookie is missing", () => {
    expect(hasGateCookie("", "pyanchor_dev")).toBe(false);
    expect(hasGateCookie("foo=bar", "pyanchor_dev")).toBe(false);
  });

  it("returns false when the cookie is present but empty (=)", () => {
    expect(hasGateCookie("pyanchor_dev=", "pyanchor_dev")).toBe(false);
  });

  it("does not match a cookie with a name that's a prefix of another (no false positives)", () => {
    // `pyanchor_dev_other=1` should NOT match a `pyanchor_dev` query.
    expect(hasGateCookie("pyanchor_dev_other=1", "pyanchor_dev")).toBe(false);
  });

  it("returns false when the name argument is empty", () => {
    expect(hasGateCookie("pyanchor_dev=1", "")).toBe(false);
  });
});

describe("runBootstrap \u2014 production gate cookie fail-safe (v0.17.0)", () => {
  it("returns 'skipped-missing-gate-cookie' when the attribute is set but the cookie is absent", () => {
    setCookie("");
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "tok",
      pyanchorRequireGateCookie: "pyanchor_dev"
    });
    const result = runBootstrap({
      window,
      document,
      fetch: vi.fn() as never,
      currentScript: script
    });

    expect(result).toBe("skipped-missing-gate-cookie");
    // No overlay tag, no config, no fetch call.
    expect(document.head.querySelector("script[data-pyanchor-overlay]")).toBeNull();
  });

  it("loads normally when the gate cookie attribute is set AND the cookie is present", () => {
    setCookie("pyanchor_dev=1");
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "tok",
      pyanchorRequireGateCookie: "pyanchor_dev"
    });
    const result = runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });

    expect(result).toBe("loaded");
    expect(document.head.querySelector("script[data-pyanchor-overlay]")).not.toBeNull();
  });

  it("loads normally when the gate-cookie attribute is NOT set (legacy / non-gated deployment)", () => {
    setCookie("");
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "tok"
    });
    const result = runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });

    expect(result).toBe("loaded");
  });

  it("respects custom cookie names via the attribute value", () => {
    setCookie("custom_gate_cookie=present");
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "tok",
      pyanchorRequireGateCookie: "custom_gate_cookie"
    });
    const result = runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });

    expect(result).toBe("loaded");
  });
});

describe("isTrustedHost", () => {
  it("matches exact hostnames in the allowlist", () => {
    expect(isTrustedHost("localhost", ["localhost", "example.com"])).toBe(true);
    expect(isTrustedHost("example.com", ["localhost", "example.com"])).toBe(true);
  });

  it("rejects hostnames not in the allowlist", () => {
    expect(isTrustedHost("evil.com", ["localhost", "example.com"])).toBe(false);
  });

  it("matches wildcard *.foo.com (subdomains only, not the bare domain)", () => {
    expect(isTrustedHost("a.foo.com", ["*.foo.com"])).toBe(true);
    expect(isTrustedHost("nested.a.foo.com", ["*.foo.com"])).toBe(true);
    // Bare domain doesn't end with ".foo.com" (no leading dot), so it's rejected.
    expect(isTrustedHost("foo.com", ["*.foo.com"])).toBe(false);
    expect(isTrustedHost("evil.com", ["*.foo.com"])).toBe(false);
  });

  it("matches the .local suffix special case", () => {
    expect(isTrustedHost("device.local", [".local"])).toBe(true);
    expect(isTrustedHost("foo.bar.local", [".local"])).toBe(true);
    expect(isTrustedHost("foo.com", [".local"])).toBe(false);
  });

  it("ignores empty entries and trims whitespace", () => {
    expect(isTrustedHost("localhost", ["", "  localhost  ", ""])).toBe(true);
  });

  it("returns false for empty hostname", () => {
    expect(isTrustedHost("", ["localhost"])).toBe(false);
  });

  it("DEFAULT_TRUSTED_HOSTS covers loopback variants", () => {
    expect(DEFAULT_TRUSTED_HOSTS).toContain("localhost");
    expect(DEFAULT_TRUSTED_HOSTS).toContain("127.0.0.1");
    expect(DEFAULT_TRUSTED_HOSTS).toContain("[::1]");
  });
});

describe("runBootstrap — idempotency", () => {
  it("first call returns 'loaded'; second call returns 'skipped-already-loaded'", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });

    expect(runBootstrap({ window, document, fetch: fetchMock as never, currentScript: script })).toBe(
      "loaded"
    );
    expect(runBootstrap({ window, document, fetch: fetchMock as never, currentScript: script })).toBe(
      "skipped-already-loaded"
    );
  });
});

describe("runBootstrap — trusted host allowlist", () => {
  it("skips on untrusted host with a console.warn", () => {
    setHostname("evil.com");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    const script = makeScript({ src: "http://evil.com/_pyanchor/bootstrap.js" });

    const result = runBootstrap({
      window,
      document,
      fetch: fetchMock as never,
      currentScript: script
    });

    expect(result).toBe("skipped-untrusted-host");
    expect(warn).toHaveBeenCalled();
    expect(window.__PyanchorConfig).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads on a host listed via data-pyanchor-trusted-hosts override", () => {
    setHostname("staging.example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const script = makeScript({
      src: "http://staging.example.com/_pyanchor/bootstrap.js",
      pyanchorTrustedHosts: "staging.example.com,foo.local"
    });

    const result = runBootstrap({
      window,
      document,
      fetch: fetchMock as never,
      currentScript: script
    });

    expect(result).toBe("loaded");
    expect(window.__PyanchorConfig).toBeDefined();
  });
});

describe("runBootstrap — config wiring", () => {
  it("derives baseUrl from the script src by stripping /bootstrap.js", () => {
    const script = makeScript({ src: "http://localhost:3000/_pyanchor/bootstrap.js" });
    runBootstrap({ window, document, fetch: vi.fn() as never, currentScript: script });
    expect(window.__PyanchorConfig?.baseUrl).toBe("http://localhost:3000/_pyanchor");
  });

  it("falls back to /_pyanchor when there is no currentScript", () => {
    runBootstrap({ window, document, fetch: vi.fn() as never, currentScript: null });
    expect(window.__PyanchorConfig?.baseUrl).toMatch(/\/_pyanchor$/);
  });

  it("reads the bearer token from data-pyanchor-token, trimmed", () => {
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "  my-token-123  "
    });
    runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });
    expect(window.__PyanchorConfig?.token).toBe("my-token-123");
  });

  it("leaves token as empty string when no data-pyanchor-token attribute", () => {
    const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });
    runBootstrap({ window, document, fetch: vi.fn() as never, currentScript: script });
    expect(window.__PyanchorConfig?.token).toBe("");
  });
});

describe("runBootstrap — session exchange + token blanking (v0.5.1 security)", () => {
  it("POSTs /api/session with the bearer token when present", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "secret-token"
    });

    runBootstrap({ window, document, fetch: fetchMock as never, currentScript: script });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost/_pyanchor/api/session");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });

  it("does NOT call /api/session when no token is set", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });

    runBootstrap({ window, document, fetch: fetchMock as never, currentScript: script });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blanks window.__PyanchorConfig.token after a successful session POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "secret"
    });

    runBootstrap({ window, document, fetch: fetchMock as never, currentScript: script });
    expect(window.__PyanchorConfig?.token).toBe("secret");

    // Let the .then callback resolve.
    await Promise.resolve();
    await Promise.resolve();

    expect(window.__PyanchorConfig?.token).toBe("");
  });

  it("PRESERVES the token when the session POST returns non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "secret"
    });

    runBootstrap({ window, document, fetch: fetchMock as never, currentScript: script });
    await Promise.resolve();
    await Promise.resolve();

    expect(window.__PyanchorConfig?.token).toBe("secret");
  });

  it("PRESERVES the token when the session POST throws (network error)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "secret"
    });

    runBootstrap({ window, document, fetch: fetchMock as never, currentScript: script });
    await Promise.resolve();
    await Promise.resolve();

    expect(window.__PyanchorConfig?.token).toBe("secret");
  });
});

describe("runBootstrap — locale propagation (v0.9.2 fix, Codex round-8 #1)", () => {
  const makeScriptWithLocale = (locale: string) => {
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "tok"
    });
    script.dataset.pyanchorLocale = locale;
    return script;
  };

  it("reads data-pyanchor-locale and writes it onto window.__PyanchorConfig.locale", () => {
    const script = makeScriptWithLocale("ko");
    runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });
    expect(window.__PyanchorConfig?.locale).toBe("ko");
  });

  it("preserves a pre-seeded __PyanchorConfig.locale (host code wins over dataset)", () => {
    // Host app set locale before bootstrap loaded.
    (window as Window & { __PyanchorConfig?: { locale?: string; baseUrl?: string; token?: string } })
      .__PyanchorConfig = {
      baseUrl: "ignored",
      token: "ignored",
      locale: "ja"
    };

    const script = makeScriptWithLocale("ko");
    runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });

    // Pre-seeded "ja" wins over dataset "ko".
    expect(window.__PyanchorConfig?.locale).toBe("ja");
  });

  it("omits the locale field entirely when neither is present", () => {
    const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });
    runBootstrap({ window, document, fetch: vi.fn() as never, currentScript: script });
    expect(window.__PyanchorConfig).toBeDefined();
    expect(window.__PyanchorConfig?.locale).toBeUndefined();
  });

  it("mirrors the locale onto the appended overlay script tag's dataset", () => {
    const script = makeScriptWithLocale("ko");
    runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });

    const overlayTag = document.head.querySelector<HTMLScriptElement>(
      "script[data-pyanchor-overlay='1']"
    );
    expect(overlayTag).not.toBeNull();
    expect(overlayTag?.dataset.pyanchorLocale).toBe("ko");
  });

  it("does NOT add data-pyanchor-locale on the overlay tag when no locale resolved", () => {
    const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });
    runBootstrap({ window, document, fetch: vi.fn() as never, currentScript: script });

    const overlayTag = document.head.querySelector<HTMLScriptElement>(
      "script[data-pyanchor-overlay='1']"
    );
    expect(overlayTag?.dataset.pyanchorLocale).toBeUndefined();
  });

  it("treats empty-string data-pyanchor-locale as 'no locale' (Codex round-9 edge)", () => {
    // dataset.pyanchorLocale === "" should not propagate as a real
    // locale — `?.trim()` returns "" and the falsy gate omits it.
    const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });
    script.dataset.pyanchorLocale = "";
    runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });
    expect(window.__PyanchorConfig?.locale).toBeUndefined();

    const overlayTag = document.head.querySelector<HTMLScriptElement>(
      "script[data-pyanchor-overlay='1']"
    );
    expect(overlayTag?.dataset.pyanchorLocale).toBeUndefined();
  });
});

describe("runBootstrap — host brand override (v0.40.0)", () => {
  const makeScriptWithBrand = (
    iconUrl?: string,
    name?: string
  ): HTMLScriptElement => {
    const script = makeScript({
      src: "http://localhost/_pyanchor/bootstrap.js",
      pyanchorToken: "tok"
    });
    if (iconUrl !== undefined) script.dataset.pyanchorBrandIconUrl = iconUrl;
    if (name !== undefined) script.dataset.pyanchorBrandName = name;
    return script;
  };

  it("reads data-pyanchor-brand-icon-url onto __PyanchorConfig.brand.iconUrl", () => {
    const script = makeScriptWithBrand("/pyanchor-logo.png");
    runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });
    expect(window.__PyanchorConfig?.brand?.iconUrl).toBe("/pyanchor-logo.png");
  });

  it("reads data-pyanchor-brand-name onto __PyanchorConfig.brand.name", () => {
    const script = makeScriptWithBrand(undefined, "Acme Editor");
    runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });
    expect(window.__PyanchorConfig?.brand?.name).toBe("Acme Editor");
  });

  it("reads both fields when both attributes are present", () => {
    const script = makeScriptWithBrand("/logo.svg", "Acme");
    runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });
    expect(window.__PyanchorConfig?.brand).toEqual({
      iconUrl: "/logo.svg",
      name: "Acme"
    });
  });

  it("omits the brand field entirely when neither attribute is present", () => {
    const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });
    runBootstrap({ window, document, fetch: vi.fn() as never, currentScript: script });
    expect(window.__PyanchorConfig).toBeDefined();
    expect(window.__PyanchorConfig?.brand).toBeUndefined();
  });

  it("treats empty-string brand attributes as 'unset' (no brand override)", () => {
    const script = makeScriptWithBrand("", "");
    runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });
    expect(window.__PyanchorConfig?.brand).toBeUndefined();
  });

  it("preserves a pre-seeded __PyanchorConfig.brand (host JS wins over dataset)", () => {
    (window as Window & {
      __PyanchorConfig?: {
        baseUrl?: string;
        token?: string;
        brand?: { iconUrl?: string; name?: string };
      };
    }).__PyanchorConfig = {
      baseUrl: "ignored",
      token: "ignored",
      brand: { iconUrl: "/preseeded.png", name: "Preseeded" }
    };

    const script = makeScriptWithBrand("/dataset.png", "FromDataset");
    runBootstrap({
      window,
      document,
      fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
      currentScript: script
    });

    expect(window.__PyanchorConfig?.brand?.iconUrl).toBe("/preseeded.png");
    expect(window.__PyanchorConfig?.brand?.name).toBe("Preseeded");
  });
});

describe("runBootstrap — overlay script injection", () => {
  it("appends a <script src='.../overlay.js' data-pyanchor-overlay='1' defer> to <head>", () => {
    const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });
    runBootstrap({ window, document, fetch: vi.fn() as never, currentScript: script });

    const overlayTag = document.head.querySelector<HTMLScriptElement>(
      "script[data-pyanchor-overlay='1']"
    );
    expect(overlayTag).not.toBeNull();
    expect(overlayTag?.src).toBe("http://localhost/_pyanchor/overlay.js");
    expect(overlayTag?.defer).toBe(true);
  });

  // v0.12.1 — round-11 #3 follow-up. Lock the locale-script-before-
  // overlay-script ordering for every built-in locale so the next
  // person who edits BUILT_IN_LOCALES doesn't accidentally drop the
  // injection (silent regression: locale 404s + UI stays English).
  describe("auto-injects locale bundle script BEFORE overlay (built-in locales)", () => {
    const builtIns = [
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
      "th",
      "tr",
      "nl",
      "pl",
      "sv",
      "it",
      "ar",
      "he",
      "fa",
      "ur"
    ];
    it.each(builtIns)("locale=%s injects locales/%s.js with defer + correct attrs", (locale) => {
      const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });
      script.dataset.pyanchorLocale = locale;
      runBootstrap({
        window,
        document,
        fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
        currentScript: script
      });

      const localeTag = document.head.querySelector<HTMLScriptElement>(
        `script[data-pyanchor-locale-bundle='${locale}']`
      );
      expect(localeTag).not.toBeNull();
      expect(localeTag?.src).toBe(`http://localhost/_pyanchor/locales/${locale}.js`);
      expect(localeTag?.defer).toBe(true);

      // The overlay tag must be appended AFTER the locale tag —
      // browsers execute deferred scripts in document order, so this
      // ordering is what guarantees the locale bundle is in the queue
      // when the overlay drains it.
      const overlayTag = document.head.querySelector<HTMLScriptElement>(
        "script[data-pyanchor-overlay='1']"
      );
      const positions = Array.from(document.head.children);
      expect(positions.indexOf(localeTag!)).toBeLessThan(positions.indexOf(overlayTag!));
    });

    it("does NOT inject a locale bundle for unknown locales (silent fallback to English)", () => {
      const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });
      script.dataset.pyanchorLocale = "klingon";
      runBootstrap({
        window,
        document,
        fetch: vi.fn().mockResolvedValue({ ok: false }) as never,
        currentScript: script
      });

      const anyLocaleBundle = document.head.querySelector("script[data-pyanchor-locale-bundle]");
      expect(anyLocaleBundle).toBeNull();
      // The overlay tag still lands and config still propagates the
      // unknown locale; resolveStrings just returns enStrings.
      expect(window.__PyanchorConfig?.locale).toBe("klingon");
    });

    it("does NOT inject a locale bundle when no locale is requested at all", () => {
      const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });
      runBootstrap({
        window,
        document,
        fetch: vi.fn() as never,
        currentScript: script
      });
      expect(document.head.querySelector("script[data-pyanchor-locale-bundle]")).toBeNull();
    });
  });

  it("dedups: returns 'loaded-overlay-already-present' if a <script data-pyanchor-overlay='1'> is present", () => {
    const existing = document.createElement("script");
    existing.dataset.pyanchorOverlay = "1";
    document.head.appendChild(existing);

    const script = makeScript({ src: "http://localhost/_pyanchor/bootstrap.js" });
    const result = runBootstrap({
      window,
      document,
      fetch: vi.fn() as never,
      currentScript: script
    });

    expect(result).toBe("loaded-overlay-already-present");
    // Still set config; just didn't append a second script tag.
    expect(window.__PyanchorConfig).toBeDefined();
    expect(document.head.querySelectorAll("script[data-pyanchor-overlay='1']")).toHaveLength(1);
  });
});
