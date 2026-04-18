import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  activeSessionCount,
  clearAllSessions,
  createSession,
  revokeSession,
  validateSession
} from "../src/sessions";

beforeEach(() => {
  clearAllSessions();
});

afterEach(() => {
  vi.useRealTimers();
  clearAllSessions();
});

describe("createSession", () => {
  it("returns a 64-char hex id (32 random bytes) and the requested ttl", () => {
    const { id, ttlMs } = createSession(60_000);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(ttlMs).toBe(60_000);
  });

  it("issues distinct ids on every call", () => {
    const a = createSession(60_000).id;
    const b = createSession(60_000).id;
    expect(a).not.toBe(b);
  });

  it("registers the new session in the active count", () => {
    expect(activeSessionCount()).toBe(0);
    createSession(60_000);
    createSession(60_000);
    expect(activeSessionCount()).toBe(2);
  });
});

describe("validateSession", () => {
  it("returns false for an empty id", () => {
    expect(validateSession("")).toBe(false);
  });

  it("returns false for an unknown id", () => {
    expect(validateSession("deadbeef".repeat(8))).toBe(false);
  });

  it("returns true for a freshly issued session", () => {
    const { id } = createSession(60_000);
    expect(validateSession(id)).toBe(true);
  });

  it("returns false (and evicts) once the session has expired", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { id } = createSession(1_000);

    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    expect(validateSession(id)).toBe(false);
    expect(activeSessionCount()).toBe(0);
  });
});

describe("revokeSession", () => {
  it("drops a known session", () => {
    const { id } = createSession(60_000);
    expect(validateSession(id)).toBe(true);
    revokeSession(id);
    expect(validateSession(id)).toBe(false);
    expect(activeSessionCount()).toBe(0);
  });

  it("is a no-op for empty / unknown ids", () => {
    createSession(60_000);
    revokeSession("");
    revokeSession("not-a-real-id");
    expect(activeSessionCount()).toBe(1);
  });
});

describe("pruneIfFull (cap enforcement)", () => {
  it("prunes expired entries before issuing when at cap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    // Fill exactly to MAX_SESSIONS (4096) with short-lived sessions.
    for (let i = 0; i < 4096; i++) {
      createSession(1_000);
    }
    expect(activeSessionCount()).toBe(4096);

    vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));
    // Issuing one more triggers pruneIfFull, which sweeps expired entries.
    const { id } = createSession(60_000);
    expect(validateSession(id)).toBe(true);
    // After expiry sweep, only the new long-lived session should remain.
    expect(activeSessionCount()).toBe(1);
  });

  it("falls back to dropping the oldest half when nothing has expired", () => {
    // All sessions long-lived; cap forces the half-drop fallback.
    for (let i = 0; i < 4096; i++) {
      createSession(60_000);
    }
    const before = activeSessionCount();
    createSession(60_000);
    const after = activeSessionCount();
    // Half were dropped, then the new session was added.
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThanOrEqual(4096 - 4096 / 2 + 1);
  });
});
