import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  escapeHtml,
  formatTime,
  shorten,
  takeFirstLine
} from "../../../src/runtime/overlay/format";

describe("escapeHtml", () => {
  it("escapes the five standard HTML metacharacters", () => {
    expect(escapeHtml(`<a href="x">'a'&b</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;a&#39;&amp;b&lt;/a&gt;"
    );
  });

  it("returns the empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("leaves Unicode (Korean, emoji, etc.) untouched", () => {
    expect(escapeHtml("안녕 🦞 <span>")).toBe("안녕 🦞 &lt;span&gt;");
  });

  it("escapes ampersands FIRST so already-escaped entities don't double-escape", () => {
    // The five replaceAll calls happen in order; & first means &lt;
    // becomes &amp;lt; — that's the documented behavior, not a bug.
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("formatTime", () => {
  beforeEach(() => {
    // Pin to a known local TZ-stable value: UTC midnight + 3:14:07.
    // formatTime uses local hours, so we set a date and assert pattern.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for null input", () => {
    expect(formatTime(null)).toBeNull();
  });

  it("returns null for an unparseable date string", () => {
    expect(formatTime("not-a-date")).toBeNull();
  });

  it("returns HH:MM:SS for a valid ISO timestamp", () => {
    const stamped = formatTime("2026-04-19T03:14:07Z");
    expect(stamped).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("zero-pads single-digit hours/minutes/seconds", () => {
    const date = new Date(2026, 0, 1, 1, 2, 3); // local 01:02:03
    expect(formatTime(date.toISOString())).toBe("01:02:03");
  });
});

describe("takeFirstLine", () => {
  it("returns the empty string for null", () => {
    expect(takeFirstLine(null)).toBe("");
  });

  it("returns the empty string when every line is whitespace", () => {
    expect(takeFirstLine("   \n  \n")).toBe("");
  });

  it("returns the first non-blank line, trimmed", () => {
    expect(takeFirstLine("  \nhello world  \nsecond line")).toBe("hello world");
  });

  it("treats a single-line input as that line, trimmed", () => {
    expect(takeFirstLine("  only line  ")).toBe("only line");
  });
});

describe("shorten", () => {
  it("returns the input unchanged when shorter than the cap", () => {
    expect(shorten("short", 10)).toBe("short");
  });

  it("returns the input unchanged when exactly at the cap", () => {
    expect(shorten("exactly12c..", 12)).toBe("exactly12c..");
  });

  it("appends an ellipsis when over the cap and respects the cap exactly", () => {
    const result = shorten("abcdefghijklmnop", 5);
    expect(result).toBe("abcd…");
    expect(result.length).toBe(5);
  });

  it("uses 120 as the default cap", () => {
    const long = "a".repeat(200);
    const result = shorten(long);
    expect(result.length).toBe(120);
    expect(result.endsWith("…")).toBe(true);
  });
});
