/**
 * Tests for the v0.28.0 `pyanchor init` template renderers.
 *
 * Pure string functions — no fs, no env, no mocking. Locks the
 * shape of generated files so future edits don't accidentally drop
 * a required env var or break the "copy this snippet" instructions.
 */

import { describe, expect, it } from "vitest";

import {
  renderBootstrapSnippet,
  renderEnv,
  renderNextConfigSnippet,
  renderRestartScript
} from "../../src/cli/templates";

describe("renderEnv", () => {
  const baseInput = {
    token: "test-token-32-bytes-long-1234567890ab",
    agent: "claude-code" as const,
    framework: "nextjs" as const,
    appDir: "/home/user/app",
    workspaceDir: "/tmp/pyanchor-workspace",
    restartScript: "/home/user/app/scripts/pyanchor-restart.sh",
    healthcheckUrl: "http://127.0.0.1:3000/",
    port: 3010,
    requireGate: false,
    allowedOrigins: [],
    outputMode: "apply" as const
  };

  it("emits all required env vars", () => {
    const env = renderEnv(baseInput);
    expect(env).toContain("PYANCHOR_TOKEN=test-token-");
    expect(env).toContain("PYANCHOR_AGENT=claude-code");
    expect(env).toContain("PYANCHOR_FRAMEWORK=nextjs");
    expect(env).toContain("PYANCHOR_APP_DIR=/home/user/app");
    expect(env).toContain("PYANCHOR_WORKSPACE_DIR=/tmp/pyanchor-workspace");
    expect(env).toContain("PYANCHOR_RESTART_SCRIPT=/home/user/app/scripts/pyanchor-restart.sh");
    expect(env).toContain("PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:3000/");
    expect(env).toContain("PYANCHOR_PORT=3010");
  });

  it("comments out optional vars by default", () => {
    const env = renderEnv(baseInput);
    expect(env).toContain("# PYANCHOR_ALLOWED_ORIGINS=");
    expect(env).toContain("# PYANCHOR_OUTPUT_MODE=apply");
    expect(env).toContain("# PYANCHOR_REQUIRE_GATE_COOKIE=true");
    expect(env).toContain("# PYANCHOR_AUDIT_LOG=true");
  });

  it("activates ALLOWED_ORIGINS when provided", () => {
    const env = renderEnv({ ...baseInput, allowedOrigins: ["https://app.example.com"] });
    expect(env).toContain("PYANCHOR_ALLOWED_ORIGINS=https://app.example.com");
    expect(env).not.toContain("# PYANCHOR_ALLOWED_ORIGINS=");
  });

  it("activates OUTPUT_MODE when not 'apply'", () => {
    const env = renderEnv({ ...baseInput, outputMode: "pr" });
    expect(env).toContain("PYANCHOR_OUTPUT_MODE=pr");
    expect(env).not.toMatch(/^# PYANCHOR_OUTPUT_MODE=/m);
  });

  it("activates REQUIRE_GATE_COOKIE when requireGate=true", () => {
    const env = renderEnv({ ...baseInput, requireGate: true });
    expect(env).toContain("PYANCHOR_REQUIRE_GATE_COOKIE=true");
    expect(env).not.toMatch(/^# PYANCHOR_REQUIRE_GATE_COOKIE=/m);
  });

  it("normalizes framework=unknown to nextjs in the file", () => {
    const env = renderEnv({ ...baseInput, framework: "unknown" });
    expect(env).toContain("PYANCHOR_FRAMEWORK=nextjs");
  });
});

describe("renderRestartScript", () => {
  it("noop preset returns a script that exits 0", () => {
    const s = renderRestartScript({ approach: "noop", name: "myapp" });
    expect(s).toContain("#!/usr/bin/env bash");
    expect(s).toContain("set -euo pipefail");
    expect(s).toContain("exit 0");
    // The noop script must not actually invoke any process manager.
    // (The string "pm2" appears in the comment block as an example
    // of what to edit in for production — that's fine.)
    expect(s).not.toContain("pm2 reload");
    expect(s).not.toContain("systemctl restart");
    expect(s).not.toContain("docker restart");
  });

  it("pm2 preset uses reload + the supplied name", () => {
    const s = renderRestartScript({ approach: "pm2", name: "my-frontend" });
    expect(s).toContain("pm2 reload my-frontend");
  });

  it("systemctl preset uses sudo + restart + the supplied unit", () => {
    const s = renderRestartScript({ approach: "systemctl", name: "myapp.service" });
    expect(s).toContain("systemctl restart myapp.service");
    expect(s).toContain("sudo");
  });

  it("docker preset uses docker restart + the container name", () => {
    const s = renderRestartScript({ approach: "docker", name: "mycontainer" });
    expect(s).toContain("docker restart mycontainer");
  });

  it("custom preset emits a TODO + exit 0 fallback", () => {
    const s = renderRestartScript({ approach: "custom", name: "myapp" });
    expect(s).toContain("TODO");
    expect(s).toContain("exit 0");
  });
});

describe("renderBootstrapSnippet", () => {
  it("Next.js App Router uses NEXT_PUBLIC_PYANCHOR_TOKEN env injection", () => {
    const s = renderBootstrapSnippet("nextjs", "app");
    expect(s).toContain("app/layout.tsx");
    expect(s).toContain("NEXT_PUBLIC_PYANCHOR_TOKEN");
    expect(s).toContain("/_pyanchor/bootstrap.js");
  });

  it("Next.js Pages Router targets _document.tsx", () => {
    const s = renderBootstrapSnippet("nextjs", "pages");
    expect(s).toContain("pages/_document.tsx");
  });

  it("Vite snippet targets index.html + vite.config", () => {
    const s = renderBootstrapSnippet("vite", "n/a");
    expect(s).toContain("index.html");
    expect(s).toContain("vite.config.ts");
    expect(s).toContain("REPLACE_WITH_PYANCHOR_TOKEN");
  });

  it("Astro snippet targets src/layouts/Base.astro + astro.config.mjs", () => {
    const s = renderBootstrapSnippet("astro", "n/a");
    expect(s).toContain("src/layouts/Base.astro");
    expect(s).toContain("astro.config.mjs");
  });

  it("unknown framework falls back to a generic instruction", () => {
    const s = renderBootstrapSnippet("unknown", "n/a");
    expect(s).toContain("global HTML template");
    expect(s).toContain("/_pyanchor/bootstrap.js");
  });
});

describe("renderNextConfigSnippet", () => {
  it("emits a valid-looking next.config.mjs rewrite block", () => {
    const s = renderNextConfigSnippet();
    expect(s).toContain("next.config.mjs");
    expect(s).toContain("async rewrites()");
    expect(s).toContain("/_pyanchor/:path*");
    expect(s).toContain("http://127.0.0.1:3010/_pyanchor/:path*");
  });
});
