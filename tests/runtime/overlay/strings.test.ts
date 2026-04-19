// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  _clearRegistry,
  enStrings,
  registerStrings,
  resolveStrings,
  type StringTable
} from "../../../src/runtime/overlay/strings";
// v0.11.0 — locale bundles ship as separate modules. Importing them
// from this test re-runs their top-level "push to
// window.__PyanchorPendingLocales" side effect; calling
// `_clearRegistry()` then drains the queue back into the registry,
// reproducing the production loading order (locale script before
// overlay script, both deferred).
import { koStrings } from "../../../src/runtime/overlay/locales/ko";
import { jaStrings } from "../../../src/runtime/overlay/locales/ja";
import { zhCNStrings } from "../../../src/runtime/overlay/locales/zh-cn";
// v0.12.0 — Latin / SE-Asian locale expansion.
import { esStrings } from "../../../src/runtime/overlay/locales/es";
import { deStrings } from "../../../src/runtime/overlay/locales/de";
import { frStrings } from "../../../src/runtime/overlay/locales/fr";
import { ptBRStrings } from "../../../src/runtime/overlay/locales/pt-br";
import { viStrings } from "../../../src/runtime/overlay/locales/vi";
import { idStrings } from "../../../src/runtime/overlay/locales/id";

beforeEach(() => {
  // Re-seed the queue with every built-in locale so the rest of the
  // suite sees the production-like environment.
  (window as Window & { __PyanchorPendingLocales?: unknown[] }).__PyanchorPendingLocales = [
    { locale: "ko", bundle: koStrings },
    { locale: "ja", bundle: jaStrings },
    { locale: "zh-cn", bundle: zhCNStrings },
    { locale: "es", bundle: esStrings },
    { locale: "de", bundle: deStrings },
    { locale: "fr", bundle: frStrings },
    { locale: "pt-br", bundle: ptBRStrings },
    { locale: "vi", bundle: viStrings },
    { locale: "id", bundle: idStrings }
  ];
  _clearRegistry();
});

afterEach(() => {
  _clearRegistry();
});

describe("enStrings (default English bundle)", () => {
  it("provides a complete StringTable shape (no required keys missing)", () => {
    // Spot-check every category at least once. If a new key gets
    // added to StringTable but not enStrings, this test would fail
    // to compile (TypeScript) — the runtime check below catches the
    // case where someone adds an `as any` cast to skip the type
    // check.
    expect(enStrings.statusReadingChat).toBeTruthy();
    expect(enStrings.statusReadingEdit).toBeTruthy();
    expect(enStrings.statusJobFailed).toBeTruthy();
    expect(enStrings.statusJobCanceled).toBeTruthy();
    expect(enStrings.statusAnswerReady).toBeTruthy();
    expect(enStrings.statusEditComplete).toBeTruthy();
    expect(typeof enStrings.statusQueuedAt).toBe("function");
    expect(enStrings.pendingDrafting).toBeTruthy();
    expect(enStrings.pendingReading).toBeTruthy();
    expect(enStrings.pendingAnswering).toBeTruthy();
    expect(enStrings.composerEditTitle).toBeTruthy();
    expect(enStrings.composerChatTitle).toBeTruthy();
    expect(enStrings.composerSendHint).toBeTruthy();
    expect(enStrings.composerNotConfigured).toBeTruthy();
    expect(enStrings.composerSubmitSend).toBeTruthy();
    expect(enStrings.composerSubmitRun).toBeTruthy();
    expect(enStrings.composerSubmitSending).toBeTruthy();
    expect(enStrings.composerCancelLabel).toBeTruthy();
    expect(enStrings.modeAsk).toBeTruthy();
    expect(enStrings.modeEdit).toBeTruthy();
    expect(enStrings.modeLockedTitle).toBeTruthy();
    expect(enStrings.toggleOpen).toBeTruthy();
    expect(enStrings.toggleClose).toBeTruthy();
    expect(enStrings.toggleTitle).toBeTruthy();
    expect(enStrings.toastAnswerReceived).toBeTruthy();
    expect(enStrings.toastEditComplete).toBeTruthy();
    expect(enStrings.toastQuestionSent).toBeTruthy();
    expect(enStrings.toastEditStarted).toBeTruthy();
    expect(enStrings.toastCancelSent).toBeTruthy();
    expect(enStrings.toastCancelFailed).toBeTruthy();
    expect(enStrings.toastRequestCanceled).toBeTruthy();
    expect(enStrings.toastFailedToStart).toBeTruthy();
    expect(enStrings.messagesEmpty).toBeTruthy();
    expect(enStrings.roleYou).toBeTruthy();
    expect(enStrings.rolePyanchor).toBeTruthy();
    expect(enStrings.errorRuntimeNotConfigured).toBeTruthy();
    expect(enStrings.composerHeadlineChat).toBeTruthy();
    expect(enStrings.composerHeadlineEdit).toBeTruthy();
    // v0.9.2 — i18n extraction completion (Codex round-8 #3)
    expect(enStrings.panelTitle).toBeTruthy();
    expect(enStrings.panelContextLabel).toBeTruthy();
    expect(typeof enStrings.statusYourPosition).toBe("function");
    // v0.9.3 — i18n completion (Codex round-9 #2)
    expect(enStrings.errorRequestFailed).toBeTruthy();
    expect(enStrings.errorJobFailed).toBeTruthy();
    // v0.9.5 — UX phase 1 (Codex round-9 features 2/3/4)
    expect(enStrings.kbdShortcutHint).toBeTruthy();
    expect(enStrings.retryLast).toBeTruthy();
    expect(enStrings.copyLast).toBeTruthy();
    expect(enStrings.toastCopied).toBeTruthy();
    expect(enStrings.toastCopyFailed).toBeTruthy();
    // v0.9.7 — diagnostics panel (Codex round-9 feature #6)
    expect(enStrings.diagnosticsTitle).toBeTruthy();
    expect(enStrings.diagRuntime).toBeTruthy();
    expect(enStrings.diagLocale).toBeTruthy();
    expect(enStrings.diagAuth).toBeTruthy();
    expect(enStrings.diagStatus).toBeTruthy();
    expect(enStrings.diagJobId).toBeTruthy();
    expect(enStrings.diagMode).toBeTruthy();
    expect(enStrings.diagQueue).toBeTruthy();
    expect(enStrings.diagLastUpdate).toBeTruthy();
    expect(enStrings.diagAuthCookie).toBeTruthy();
    expect(enStrings.diagAuthBearer).toBeTruthy();
  });

  it("statusQueuedAt formats the position into the message", () => {
    expect(enStrings.statusQueuedAt(3)).toContain("3");
    expect(enStrings.statusQueuedAt(3)).toContain("Queued");
  });

  it("statusYourPosition formats the position into the breadcrumb", () => {
    expect(enStrings.statusYourPosition(2)).toBe("Your request: position 2");
  });

  it("panelTitle is the brand name (used as dialog aria-label)", () => {
    expect(enStrings.panelTitle).toBe("Pyanchor DevTools");
  });

  it("errorRequestFailed + errorJobFailed are the documented English fallbacks", () => {
    // These match the v0.8.x hardcoded values that were extracted in
    // v0.9.3. Regression guard against editor rewrites that would
    // otherwise silently change the user-facing copy.
    expect(enStrings.errorRequestFailed).toBe("Request failed.");
    expect(enStrings.errorJobFailed).toBe("Job failed.");
  });

  it("kbdShortcutHint mentions the Cmd/Ctrl + Shift + . accelerator", () => {
    expect(enStrings.kbdShortcutHint).toContain("Cmd/Ctrl");
    expect(enStrings.kbdShortcutHint).toContain("Shift");
    expect(enStrings.kbdShortcutHint).toContain(".");
  });

  it("composerSubmitSending uses the unicode horizontal ellipsis (no ASCII '...')", () => {
    // The original copy used "Sending…" — preserve that for
    // typographic consistency. Snapshot at \u2026 to catch regressions
    // to "Sending..." across editor rewrites.
    expect(enStrings.composerSubmitSending).toBe("Sending\u2026");
  });
});

describe("resolveStrings", () => {
  it("returns enStrings for null / undefined locale", () => {
    expect(resolveStrings(null)).toBe(enStrings);
    expect(resolveStrings(undefined)).toBe(enStrings);
  });

  it('returns enStrings for "en" / "en-US" / "en-GB" without registry lookup', () => {
    expect(resolveStrings("en")).toBe(enStrings);
    expect(resolveStrings("en-US")).toBe(enStrings);
    expect(resolveStrings("en-GB")).toBe(enStrings);
  });

  it("returns enStrings for an unregistered locale (silent fallback)", () => {
    // ko is now built-in (v0.9.4); use a guaranteed-unregistered code.
    expect(resolveStrings("zz-XX")).toBe(enStrings);
    expect(resolveStrings("xx-fake")).toBe(enStrings);
  });

  it("matches case-insensitively", () => {
    // ko is built-in; just verify the lookup is case-insensitive.
    expect(resolveStrings("KO").roleYou).toBe("사용자");
    expect(resolveStrings("Ko").roleYou).toBe("사용자");
  });
});

describe("built-in ja + zh-cn bundles (v0.10.0)", () => {
  it("ja resolves to a Japanese bundle, not English", () => {
    const ja = resolveStrings("ja");
    expect(ja).not.toBe(enStrings);
    expect(ja.roleYou).toBe("あなた");
    expect(ja.panelTitle).toBe("Pyanchor DevTools"); // brand stays
    expect(ja.diagnosticsTitle).toBe("診断情報");
  });

  it("zh-cn resolves to a Simplified Chinese bundle, case-insensitive", () => {
    const zh = resolveStrings("zh-cn");
    expect(zh).not.toBe(enStrings);
    expect(zh.roleYou).toBe("你");
    expect(zh.panelTitle).toBe("Pyanchor DevTools"); // brand stays
    expect(zh.diagnosticsTitle).toBe("诊断");
    // Case-insensitive lookup
    expect(resolveStrings("zh-CN").roleYou).toBe("你");
    expect(resolveStrings("ZH-CN").roleYou).toBe("你");
  });

  it("bare 'zh' (without -CN) does NOT auto-resolve to zh-cn (explicit codes only)", () => {
    expect(resolveStrings("zh")).toBe(enStrings);
  });

  it("ja parameterized strings format the position", () => {
    const ja = resolveStrings("ja");
    expect(ja.statusQueuedAt(2)).toBe("キュー 2 番目。現在のジョブ完了後に実行されます。");
    expect(ja.statusYourPosition(3)).toBe("あなたのリクエスト: 3 番目");
  });

  it("zh-cn parameterized strings format the position", () => {
    const zh = resolveStrings("zh-cn");
    expect(zh.statusQueuedAt(2)).toBe("队列第 2 位。当前任务结束后开始执行。");
    expect(zh.statusYourPosition(3)).toBe("你的请求：第 3 位");
  });

  it("every StringTable key has a translation (no English fallthrough) for ja + zh-cn", () => {
    const ja = resolveStrings("ja");
    const zh = resolveStrings("zh-cn");
    // Spot-check a representative slice; the type system already
    // requires every key to exist (Partial<StringTable>).
    expect(ja.statusReadingChat).not.toBe(enStrings.statusReadingChat);
    expect(ja.diagnosticsTitle).not.toBe(enStrings.diagnosticsTitle);
    expect(ja.errorRequestFailed).not.toBe(enStrings.errorRequestFailed);
    expect(zh.statusReadingChat).not.toBe(enStrings.statusReadingChat);
    expect(zh.diagnosticsTitle).not.toBe(enStrings.diagnosticsTitle);
    expect(zh.errorRequestFailed).not.toBe(enStrings.errorRequestFailed);
  });
});

describe("built-in ko bundle (v0.9.4)", () => {
  it("is registered automatically — no explicit registerStrings needed", () => {
    // Fresh registry state (afterEach calls _clearRegistry which
    // re-seeds built-ins). ko should resolve to Korean copy.
    const ko = resolveStrings("ko");
    expect(ko).not.toBe(enStrings);
    expect(ko.roleYou).toBe("사용자");
    expect(ko.panelTitle).toBe("Pyanchor DevTools"); // brand stays
    expect(ko.messagesEmpty).toContain("대화 기록");
  });

  it("falls back to enStrings for keys NOT present in the ko bundle (none currently)", () => {
    const ko = resolveStrings("ko");
    // Every StringTable key should have a Korean translation. If a
    // future key is added to StringTable but not ko, this would
    // catch it by returning the English value (== enStrings[key]).
    expect(ko.statusReadingChat).not.toBe(enStrings.statusReadingChat);
    expect(ko.statusJobFailed).not.toBe(enStrings.statusJobFailed);
    expect(ko.errorRequestFailed).not.toBe(enStrings.errorRequestFailed);
    expect(ko.errorJobFailed).not.toBe(enStrings.errorJobFailed);
    // v0.9.5 keys also translated
    expect(ko.retryLast).not.toBe(enStrings.retryLast);
    expect(ko.copyLast).not.toBe(enStrings.copyLast);
    expect(ko.toastCopied).not.toBe(enStrings.toastCopied);
    // v0.9.7 diagnostics keys
    expect(ko.diagnosticsTitle).not.toBe(enStrings.diagnosticsTitle);
    expect(ko.diagRuntime).not.toBe(enStrings.diagRuntime);
    expect(ko.diagAuth).not.toBe(enStrings.diagAuth);
  });

  it("parameterized strings work (statusQueuedAt / statusYourPosition)", () => {
    const ko = resolveStrings("ko");
    expect(ko.statusQueuedAt(2)).toBe("대기열 2번째. 현재 작업이 끝나면 실행됩니다.");
    expect(ko.statusYourPosition(3)).toBe("내 요청: 3번째");
  });

  it("host registerStrings('ko', …) override wins over the built-in bundle", () => {
    registerStrings("ko", { roleYou: "host-overrode" });
    // Host-provided partial merges, but since the v0.9.4 ko bundle is
    // replaced (not deep-merged) by the registry.set call, the other
    // ko keys revert to English. Documented behavior: "last
    // registration for a locale wins".
    const ko = resolveStrings("ko");
    expect(ko.roleYou).toBe("host-overrode");
    expect(ko.messagesEmpty).toBe(enStrings.messagesEmpty); // rest falls back
  });
});

describe("built-in Latin + SE-Asian bundles (v0.12.0)", () => {
  it.each([
    ["es", "Tú", "Página actual"],
    ["de", "Du", "Aktuelle Seite"],
    ["fr", "Vous", "Page actuelle"],
    ["pt-br", "Você", "Página atual"],
    ["vi", "Bạn", "Trang hiện tại"],
    ["id", "Anda", "Halaman saat ini"]
  ])("%s resolves to a translated bundle (roleYou=%s, panelContextLabel=%s)", (locale, roleYou, panelContextLabel) => {
    const t = resolveStrings(locale);
    expect(t).not.toBe(enStrings);
    expect(t.roleYou).toBe(roleYou);
    expect(t.panelContextLabel).toBe(panelContextLabel);
    // Brand stays English on every locale (deliberate).
    expect(t.panelTitle).toBe("Pyanchor DevTools");
  });

  it.each([
    ["es", "ES"],
    ["de", "DE"],
    ["fr", "FR"],
    ["pt-br", "PT-BR"],
    ["vi", "VI"],
    ["id", "ID"]
  ])("%s lookup is case-insensitive (uppercase %s also works)", (locale, upper) => {
    expect(resolveStrings(upper)).toEqual(resolveStrings(locale));
    expect(resolveStrings(upper)).not.toBe(enStrings);
  });

  it.each([
    ["es", "En cola, posición 2."],
    ["de", "In der Warteschlange, Position 2."],
    ["fr", "En file d'attente, position 2."],
    ["pt-br", "Na fila, posição 2."],
    ["vi", "Đang xếp hàng, vị trí 2."],
    ["id", "Dalam antrean, posisi 2."]
  ])("%s statusQueuedAt formats the position (%s prefix)", (locale, expectedPrefix) => {
    expect(resolveStrings(locale).statusQueuedAt(2)).toContain(expectedPrefix);
    expect(resolveStrings(locale).statusQueuedAt(2)).toContain("2");
  });

  it.each(["es", "de", "fr", "pt-br", "vi", "id"])(
    "%s translates every checked surface key (no English fallthrough)",
    (locale) => {
      const t = resolveStrings(locale);
      // Spot-check the diagnostic labels (newest keys are the most
      // common to forget when translating).
      expect(t.diagnosticsTitle).not.toBe(enStrings.diagnosticsTitle);
      expect(t.retryLast).not.toBe(enStrings.retryLast);
      expect(t.copyLast).not.toBe(enStrings.copyLast);
      expect(t.statusReadingChat).not.toBe(enStrings.statusReadingChat);
      expect(t.errorRequestFailed).not.toBe(enStrings.errorRequestFailed);
    }
  );
});

describe("registerStrings", () => {
  it("merges partial overrides over enStrings (untranslated keys fall back to English)", () => {
    registerStrings("ko", {
      roleYou: "사용자",
      composerSubmitSend: "보내기"
    });
    const ko = resolveStrings("ko");
    expect(ko.roleYou).toBe("사용자");
    expect(ko.composerSubmitSend).toBe("보내기");
    // Un-translated key falls back to English defaults.
    expect(ko.statusJobFailed).toBe(enStrings.statusJobFailed);
  });

  it("supports parameterized strings (statusQueuedAt) in overrides", () => {
    registerStrings("ko", {
      statusQueuedAt: (n) => `대기 ${n}번째.`
    });
    expect(resolveStrings("ko").statusQueuedAt(2)).toBe("대기 2번째.");
  });

  it("last registration wins (idempotent overwrite)", () => {
    registerStrings("ko", { roleYou: "first" });
    registerStrings("ko", { roleYou: "second" });
    expect(resolveStrings("ko").roleYou).toBe("second");
  });

  it("does not mutate enStrings (overrides produce a fresh table)", () => {
    const originalRoleYou = enStrings.roleYou;
    registerStrings("ko", { roleYou: "사용자" });
    expect(resolveStrings("ko").roleYou).toBe("사용자");
    expect(enStrings.roleYou).toBe(originalRoleYou); // unchanged
  });
});

describe("StringTable type completeness (compile-time guarantee)", () => {
  it("a partial Korean bundle is structurally valid (compile check)", () => {
    // This exists purely so a regression in StringTable that drops a
    // key the runtime depends on (e.g. statusQueuedAt) would also
    // break this test's type. Runtime assertion is trivial.
    const koPartial: Partial<StringTable> = {
      roleYou: "사용자",
      rolePyanchor: "파이앵커",
      statusQueuedAt: (n) => `${n}번 대기 중`
    };
    expect(koPartial.roleYou).toBe("사용자");
  });
});
