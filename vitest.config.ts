import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // v0.32.8 — workspace-level pool config to handle the
    // subprocess-smoke files (server-readyz, server-metrics,
    // server-gate-cookie, server-locale-routes, server-listen-ref).
    // Each spawns dist/server.cjs children that bind real TCP
    // ports. Under vitest's default thread pool, a child can
    // outlive its owning worker (the worker exits on test
    // completion but the spawned child's lifecycle is independent),
    // so subsequent tests racing into the same port range hit
    // EADDRINUSE and silently route their fetch to the prior
    // sidecar.
    //
    // Pre-v0.32.8 this was masked by a GC bug in dist/server.cjs
    // that killed the spawned child within ~1s of "listening"
    // (v0.32.4 fixed the GC bug, exposing the latent race).
    // v0.32.5 worked around it by describe.skip()-ing 13 tests.
    // v0.32.8 switches to forks pool with singleFork: true so
    // every spawning test runs sequentially in one worker process,
    // and adds afterEach cleanup hooks so port releases land
    // before the next test's bind.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["dist/**", "examples/**", "tests/**"]
    }
  }
});
