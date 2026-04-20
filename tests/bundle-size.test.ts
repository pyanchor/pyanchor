/**
 * Bundle size regression guard.
 *
 * Catches accidental bloat in the bundles end-users actually download
 * (the runtime + locale bundles) and the worker artifact pyanchor
 * spawns. Server.cjs is intentionally NOT guarded — it bundles
 * Express + cookie-parser, so its size depends on dep updates we
 * don't fully control.
 *
 * Thresholds are set with ~2x headroom over current actuals so a
 * realistic feature addition fits, but a 3-5x regression (typically
 * an accidental SDK inclusion or duplicate dep) trips immediately.
 *
 * To raise a threshold intentionally:
 *   1. Run `node build.mjs` and check the new size.
 *   2. Update the constant here AND mention the bump in CHANGELOG
 *      with the reason.
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const distRoot = path.resolve(process.cwd(), "dist");

// Guards in BYTES. Keep in sync with the CHANGELOG bundle-size note
// of the version that last raised them.
const LIMITS: Array<{ file: string; maxBytes: number; note: string }> = [
  { file: "public/bootstrap.js", maxBytes: 12 * 1024, note: "trusted-host check + token-blanking + locale auto-inject" },
  { file: "public/overlay.js", maxBytes: 80 * 1024, note: "shadow root UI + state machine + i18n queue" },
  { file: "worker/runner.cjs", maxBytes: 200 * 1024, note: "agent dispatch + workspace + audit + webhooks + classifier" },
  // v0.28.0 — `pyanchor init` dispatcher. Tiny by design (no
  // server bundle inside; spawns dist/server.cjs as a child).
  // Current: ~23KB. 64KB ceiling lets future subcommands breathe
  // without enabling a runaway dependency tree.
  { file: "cli.cjs", maxBytes: 64 * 1024, note: "init scaffolder + dispatcher (server.cjs spawned as child)" }
];

// Per-locale bundle ceiling. Largest known is 'th' (Thai script).
// 12KB headroom over current ~6.9KB lets future adds (more strings,
// new RTL locale) breathe.
const PER_LOCALE_MAX_BYTES = 12 * 1024;

// Locale codes shipped with the package. Keep in sync with
// src/shared/locales.ts. Mismatch fails the dedicated test below
// so we notice if locale list and shared module drift.
const SHIPPED_LOCALES = [
  "ko", "ja", "zh-cn", "es", "de", "fr", "pt-br", "vi", "id",
  "ru", "hi", "th", "tr", "nl", "pl", "sv", "it", "ar", "he", "fa", "ur"
];

describe("bundle size regression guard", () => {
  it.each(LIMITS)("$file stays under $maxBytes bytes", ({ file, maxBytes }) => {
    const fullPath = path.join(distRoot, file);
    if (!existsSync(fullPath)) {
      throw new Error(
        `bundle artifact missing at ${fullPath}. Run \`node build.mjs\` before tests.`
      );
    }
    const size = statSync(fullPath).size;
    expect(size).toBeLessThanOrEqual(maxBytes);
  });

  it.each(SHIPPED_LOCALES)("locales/%s.js stays under per-locale ceiling", (locale) => {
    const fullPath = path.join(distRoot, "public", "locales", `${locale}.js`);
    if (!existsSync(fullPath)) {
      throw new Error(
        `locale bundle missing at ${fullPath}. Run \`node build.mjs\` before tests.`
      );
    }
    const size = statSync(fullPath).size;
    expect(size).toBeLessThanOrEqual(PER_LOCALE_MAX_BYTES);
  });

  it("SHIPPED_LOCALES count matches the source-of-truth BUILT_IN_LOCALES", async () => {
    const { BUILT_IN_LOCALES } = await import("../src/shared/locales");
    expect(SHIPPED_LOCALES.sort()).toEqual([...BUILT_IN_LOCALES].sort());
  });
});
