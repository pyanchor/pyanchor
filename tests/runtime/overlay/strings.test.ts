import { afterEach, describe, expect, it } from "vitest";

import {
  _clearRegistry,
  enStrings,
  registerStrings,
  resolveStrings,
  type StringTable
} from "../../../src/runtime/overlay/strings";

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
  });

  it("statusQueuedAt formats the position into the message", () => {
    expect(enStrings.statusQueuedAt(3)).toContain("3");
    expect(enStrings.statusQueuedAt(3)).toContain("Queued");
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
    expect(resolveStrings("ko")).toBe(enStrings);
    expect(resolveStrings("zz-XX")).toBe(enStrings);
  });

  it("matches case-insensitively", () => {
    registerStrings("ko", { roleYou: "사용자" });
    expect(resolveStrings("KO").roleYou).toBe("사용자");
    expect(resolveStrings("Ko").roleYou).toBe("사용자");
  });
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
