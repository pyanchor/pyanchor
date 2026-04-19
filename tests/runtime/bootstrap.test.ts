// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TRUSTED_HOSTS,
  isTrustedHost,
  runBootstrap
} from "../../src/runtime/bootstrap";

const makeScript = (
  attributes: { src?: string; pyanchorToken?: string; pyanchorTrustedHosts?: string } = {}
): HTMLScriptElement => {
  const script = document.createElement("script");
  if (attributes.src) script.src = attributes.src;
  if (attributes.pyanchorToken !== undefined) {
    script.dataset.pyanchorToken = attributes.pyanchorToken;
  }
  if (attributes.pyanchorTrustedHosts !== undefined) {
    script.dataset.pyanchorTrustedHosts = attributes.pyanchorTrustedHosts;
  }
  return script;
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
});

afterEach(() => {
  vi.restoreAllMocks();
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
