import { mkdir } from "node:fs/promises";

import { build } from "esbuild";

await mkdir("dist/public", { recursive: true });
await mkdir("dist/worker", { recursive: true });

const shared = {
  bundle: true,
  legalComments: "none",
  sourcemap: false,
  logLevel: "info"
};

await build({
  ...shared,
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.cjs",
  platform: "node",
  format: "cjs",
  target: "node18"
});

await build({
  ...shared,
  entryPoints: ["src/worker/runner.ts"],
  outfile: "dist/worker/runner.cjs",
  platform: "node",
  format: "cjs",
  target: "node18",
  // Optional peer deps: leave as runtime require() so users without the
  // adapter dep installed can still run pyanchor with PYANCHOR_AGENT=openclaw.
  external: ["@anthropic-ai/claude-agent-sdk"]
});

await build({
  ...shared,
  entryPoints: ["src/runtime/bootstrap.ts"],
  outfile: "dist/public/bootstrap.js",
  platform: "browser",
  format: "iife",
  target: "es2020"
});

await build({
  ...shared,
  entryPoints: ["src/runtime/overlay.ts"],
  outfile: "dist/public/overlay.js",
  platform: "browser",
  format: "iife",
  target: "es2020"
});

// v0.11.0 — locale bundles ship as separate IIFEs so the main
// overlay.js doesn't drag every translation along. Bootstrap loads
// the matching one when `data-pyanchor-locale="..."` is set.
await mkdir("dist/public/locales", { recursive: true });
await Promise.all(
  ["ko", "ja", "zh-cn", "es", "de", "fr", "pt-br", "vi", "id", "ru", "hi", "th"].map((locale) =>
    build({
      ...shared,
      entryPoints: [`src/runtime/overlay/locales/${locale}.ts`],
      outfile: `dist/public/locales/${locale}.js`,
      platform: "browser",
      format: "iife",
      target: "es2020"
    })
  )
);
