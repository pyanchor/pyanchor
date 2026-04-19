import { describe, expect, it, vi } from "vitest";

import { createFetchJson, runtimePath } from "../../../src/runtime/overlay/fetch-helper";

const mockResponse = (
  body: unknown,
  init: { ok?: boolean; status?: number } = {}
): Response =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body
  }) as unknown as Response;

describe("createFetchJson", () => {
  it("calls the underlying fetch with cache:no-store and Content-Type:json", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ value: 1 }));
    const fetchJson = createFetchJson({
      baseUrl: "/_pyanchor",
      getToken: () => null,
      fetchImpl
    });
    await fetchJson<{ value: number }>("/_pyanchor/api/status");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const opts = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(opts.cache).toBe("no-store");
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("includes the Authorization header when getToken() returns a string", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    const fetchJson = createFetchJson({
      baseUrl: "/_pyanchor",
      getToken: () => "secret-bearer",
      fetchImpl
    });
    await fetchJson("/_pyanchor/api/edit", { method: "POST" });
    const opts = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const auth = (opts.headers as Record<string, string>)["Authorization"];
    expect(auth).toBe("Bearer secret-bearer");
  });

  it("OMITS the Authorization header when getToken() returns null/empty (cookie path)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    const fetchJson = createFetchJson({
      baseUrl: "/_pyanchor",
      getToken: () => "",
      fetchImpl
    });
    await fetchJson("/_pyanchor/api/status");
    const opts = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((opts.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("re-reads the token on every call (lazy lookup, not capture-at-create)", async () => {
    let token: string | null = "first";
    const getToken = () => token;
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    const fetchJson = createFetchJson({ baseUrl: "/_pyanchor", getToken, fetchImpl });

    await fetchJson("/a");
    expect((fetchImpl.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer first"
    });

    token = null;
    await fetchJson("/b");
    expect(
      (fetchImpl.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>
    ).not.toHaveProperty("Authorization");
  });

  it("merges per-call headers on top of the auth defaults", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    const fetchJson = createFetchJson({
      baseUrl: "/_pyanchor",
      getToken: () => "tok",
      fetchImpl
    });
    await fetchJson("/x", { headers: { "X-Trace": "1" } });
    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers["X-Trace"]).toBe("1");
    expect(headers["Authorization"]).toBe("Bearer tok");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("rejects with the server's {error} message on non-2xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        mockResponse({ error: "Prompt is too long." }, { ok: false, status: 400 })
      );
    const fetchJson = createFetchJson({
      baseUrl: "/_pyanchor",
      getToken: () => null,
      fetchImpl
    });
    await expect(fetchJson("/x")).rejects.toThrow("Prompt is too long.");
  });

  it("falls back to a generic message when the server omits {error}", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({}, { ok: false, status: 500 }));
    const fetchJson = createFetchJson({
      baseUrl: "/_pyanchor",
      getToken: () => null,
      fetchImpl
    });
    await expect(fetchJson("/x")).rejects.toThrow("Request failed.");
  });

  it("returns the JSON body on 2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: "idle", queue: [] }));
    const fetchJson = createFetchJson({
      baseUrl: "/_pyanchor",
      getToken: () => null,
      fetchImpl
    });
    const data = await fetchJson<{ status: string; queue: unknown[] }>("/_pyanchor/api/status");
    expect(data.status).toBe("idle");
    expect(data.queue).toEqual([]);
  });
});

describe("runtimePath", () => {
  it("joins baseUrl + suffix with exactly one slash", () => {
    expect(runtimePath("/_pyanchor", "/api/status")).toBe("/_pyanchor/api/status");
    expect(runtimePath("/_pyanchor/", "/api/status")).toBe("/_pyanchor/api/status");
    expect(runtimePath("/_pyanchor", "api/status")).toBe("/_pyanchor/api/status");
    expect(runtimePath("/_pyanchor/", "api/status")).toBe("/_pyanchor/api/status");
  });

  it("collapses multiple trailing/leading slashes", () => {
    expect(runtimePath("/_pyanchor///", "///api/x")).toBe("/_pyanchor/api/x");
  });

  it("works with absolute base URLs", () => {
    expect(runtimePath("https://example.com/_pyanchor", "/api/status")).toBe(
      "https://example.com/_pyanchor/api/status"
    );
  });
});
