import { chmod, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

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

// v0.28.0 — top-level CLI dispatcher. `pyanchor init` lives here;
// the default no-arg path just spawns dist/server.cjs as a child.
// Built separately (not bundled into server.cjs) so the cold-start
// path of a normal `pyanchor` invocation stays tiny.
//
// v0.32.1 — banner adds a node shebang so `npx pyanchor` / the npm
// `bin` shim work. Without this, npm's symlink (node_modules/.bin/
// pyanchor → dist/cli.cjs) hits a file with no interpreter line, the
// shell tries to run it as sh, and you get "use strict: not found"
// "Syntax error" garbage. systemd users (`ExecStart=/usr/bin/node
// .../server.cjs`) never noticed because they invoke node directly.
await build({
  ...shared,
  entryPoints: ["src/cli/main.ts"],
  outfile: "dist/cli.cjs",
  platform: "node",
  format: "cjs",
  target: "node18",
  banner: { js: "#!/usr/bin/env node" },
  // server.cjs is a sibling, loaded at runtime via spawn — never
  // imported. Mark as external so esbuild doesn't try to bundle it.
  external: ["./server.cjs"]
});

// v0.32.1 — esbuild writes 0644; npm install would chmod +x the bin
// at install time anyway, but doing it here makes the tarball itself
// 0755 (visible in `npm pack` tar -tv) and avoids a class of "the
// tarball looks broken" surprises in audit/security tooling.
await chmod("dist/cli.cjs", 0o755);

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
//
// v0.16.0: glob the locales directory directly instead of carrying
// a hand-maintained list. Adding a new locale = drop the file on
// disk + add the code to `src/shared/locales.ts` (the single source
// of truth bootstrap.ts + server.ts both read). Keeps build wiring
// from drifting when the runtime list grows.
await mkdir("dist/public/locales", { recursive: true });
const localeDir = "src/runtime/overlay/locales";
const localeFiles = (await readdir(localeDir)).filter((f) => f.endsWith(".ts"));
await Promise.all(
  localeFiles.map((file) => {
    const code = path.basename(file, ".ts");
    return build({
      ...shared,
      entryPoints: [path.join(localeDir, file)],
      outfile: `dist/public/locales/${code}.js`,
      platform: "browser",
      format: "iife",
      target: "es2020"
    });
  })
);
