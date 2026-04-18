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
  target: "node18"
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
