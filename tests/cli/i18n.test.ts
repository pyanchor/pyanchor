/**
 * v0.35.0 — CLI i18n locale resolution + fallback.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getLocale, listSupportedLocales, setLocale, t } from "../../src/cli/i18n";

const originalEnv = { ...process.env };

beforeEach(() => {
  // Reset env between tests so each starts from a known baseline.
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v as string;
  }
  // Reset to default English between tests.
  setLocale("en");
});

afterEach(() => {
  setLocale("en");
});

describe("CLI i18n", () => {
  it("returns English by default", () => {
    setLocale("en");
    expect(t("doctor.title")).toMatch(/local config diagnostics/);
  });

  it("setLocale('ko') flips to Korean translations", () => {
    setLocale("ko");
    expect(t("doctor.title")).toContain("로컬 설정 진단");
    expect(getLocale()).toBe("ko");
  });

  it("falls back to English for unknown locale", () => {
    setLocale("zz-not-real");
    // setLocale ignores unknown codes — locale stays at the
    // previous value (English from beforeEach).
    expect(getLocale()).toBe("en");
    expect(t("doctor.title")).toMatch(/local config diagnostics/);
  });

  it("falls back to English when key is missing in active locale", () => {
    setLocale("ko");
    // Unknown key — should return the literal key (defensive).
    expect(t("totally.fake.key.does.not.exist")).toBe("totally.fake.key.does.not.exist");
  });

  it("interpolates {placeholder} parameters", () => {
    setLocale("en");
    expect(t("doctor.summary.allOk", { passed: 3, total: 5, warnSuffix: "" })).toContain(
      "3/5 ok"
    );
    expect(t("doctor.summary.allOk", { passed: 3, total: 5, warnSuffix: "" })).toContain(
      "Ready to run"
    );
  });

  it("interpolates parameters in Korean translations too", () => {
    setLocale("ko");
    expect(t("doctor.summary.allOk", { passed: 3, total: 5, warnSuffix: "" })).toContain(
      "3/5 정상"
    );
  });

  it("listSupportedLocales returns the full overlay-matching set (22)", () => {
    const list = listSupportedLocales();
    // Must match the overlay's locale set so a user who picks a
    // language for the in-page UI sees the matching CLI strings.
    const expected = [
      "en", "ko", "ja", "zh-cn", "fr", "es", "de",
      "pt-br", "ru", "it", "nl", "sv", "pl",
      "tr", "hi", "id", "vi", "th",
      "ar", "he", "fa", "ur"
    ];
    expect(list.length).toBe(expected.length);
    for (const code of expected) {
      expect(list).toContain(code);
    }
  });

  it("v0.35.1 — every shipped locale defines doctor.title (smoke check)", () => {
    // Catches a forgotten translation (would otherwise silently
    // fall back to English with no signal).
    for (const code of listSupportedLocales()) {
      setLocale(code);
      const title = t("doctor.title");
      expect(title).toBeTruthy();
      expect(title).not.toBe("doctor.title"); // i.e. not the literal-key fallback
    }
  });

  it("v0.35.1 — Japanese / Chinese / French / Spanish / German each translate doctor.title", () => {
    setLocale("ja");
    expect(t("doctor.title")).toContain("ローカル設定");
    setLocale("zh-cn");
    expect(t("doctor.title")).toContain("本地配置");
    setLocale("fr");
    expect(t("doctor.title")).toContain("configuration locale");
    setLocale("es");
    expect(t("doctor.title")).toContain("configuración local");
    setLocale("de");
    expect(t("doctor.title")).toContain("Konfigurationsdiagnose");
  });
});
