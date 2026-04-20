/**
 * End-to-end smoke for `pyanchor init`. Boots the actual built
 * dist/cli.cjs as a child process against a tmpdir fixture and
 * asserts the file system result. Catches the kind of bug the unit
 * tests can't (e.g. esbuild-bundling-import.meta.url breaking the
 * dispatcher) — round-trip from `node dist/cli.cjs init --yes` to
 * actual files on disk.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";

const cliPath = path.resolve(process.cwd(), "dist", "cli.cjs");

if (!existsSync(cliPath)) {
  throw new Error(`[cli-e2e] ${cliPath} missing — run \`pnpm build\` first.`);
}

const setupNextjsApp = () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pyanchor-init-e2e-"));
  writeFileSync(
    path.join(tmp, "package.json"),
    JSON.stringify(
      {
        name: "e2e-app",
        scripts: { dev: "next dev" },
        dependencies: { next: "^14.2.0", react: "^18.3.1" }
      },
      null,
      2
    ),
    "utf8"
  );
  mkdirSync(path.join(tmp, "app"), { recursive: true });
  writeFileSync(path.join(tmp, "app", "layout.tsx"), "export default () => null;", "utf8");
  return tmp;
};

const runInit = (cwd: string, ...extra: string[]): string =>
  execSync(`node ${cliPath} init --yes ${extra.join(" ")} --cwd ${cwd}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

describe("pyanchor init (e2e via dist/cli.cjs)", () => {
  it("--version prints the package version", () => {
    const out = execSync(`node ${cliPath} --version`, { encoding: "utf8" }).trim();
    // Loose check — semver-shaped
    expect(out).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("--help prints usage + subcommand list", () => {
    const out = execSync(`node ${cliPath} --help`, { encoding: "utf8" });
    expect(out).toContain("pyanchor init");
    expect(out).toContain("--version");
    expect(out).toContain("--help");
  });

  it("init --dry-run prints a plan but writes nothing", () => {
    const tmp = setupNextjsApp();
    const out = execSync(`node ${cliPath} init --yes --dry-run --cwd ${tmp}`, {
      encoding: "utf8"
    });
    expect(out).toContain("(dry run — no files written)");
    expect(out).toContain("Plan:");
    expect(existsSync(path.join(tmp, ".env.local"))).toBe(false);
    expect(existsSync(path.join(tmp, "scripts", "pyanchor-restart.sh"))).toBe(false);
  });

  it("init --yes generates .env.local + restart script + workspace dir", () => {
    const tmp = setupNextjsApp();
    runInit(tmp);

    const envPath = path.join(tmp, ".env.local");
    expect(existsSync(envPath)).toBe(true);
    const env = readFileSync(envPath, "utf8");
    expect(env).toMatch(/^PYANCHOR_TOKEN=[0-9a-f]{64}$/m);
    expect(env).toContain("PYANCHOR_FRAMEWORK=nextjs");
    expect(env).toContain(`PYANCHOR_APP_DIR=${tmp}`);

    const restartPath = path.join(tmp, "scripts", "pyanchor-restart.sh");
    expect(existsSync(restartPath)).toBe(true);
    // chmod +x
    const stat = statSync(restartPath);
    expect(stat.mode & 0o111).toBeTruthy();
  });

  it("init --yes is idempotent (rerun without --force skips existing files)", () => {
    const tmp = setupNextjsApp();
    runInit(tmp);
    const envBefore = readFileSync(path.join(tmp, ".env.local"), "utf8");

    const out = runInit(tmp);
    expect(out).toContain("SKIP");
    const envAfter = readFileSync(path.join(tmp, ".env.local"), "utf8");
    expect(envAfter).toBe(envBefore);
  });

  it("init --yes --force overwrites existing files", () => {
    const tmp = setupNextjsApp();
    runInit(tmp);
    const envBefore = readFileSync(path.join(tmp, ".env.local"), "utf8");

    runInit(tmp, "--force");
    const envAfter = readFileSync(path.join(tmp, ".env.local"), "utf8");
    // Token re-rolls on every run, so the file content WILL differ
    expect(envAfter).not.toBe(envBefore);
    expect(envAfter).toMatch(/^PYANCHOR_TOKEN=[0-9a-f]{64}$/m);
  });

  it("init prints the bootstrap snippet for the detected framework", () => {
    const tmp = setupNextjsApp();
    const out = runInit(tmp);
    expect(out).toContain("app/layout.tsx");
    expect(out).toContain("NEXT_PUBLIC_PYANCHOR_TOKEN");
    expect(out).toContain("next.config.mjs");
  });

  it("init bails with a clear error when run outside a package.json", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "pyanchor-init-bare-"));
    let exitCode = 0;
    let stderr = "";
    try {
      execSync(`node ${cliPath} init --yes --cwd ${tmp}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (err) {
      exitCode = (err as { status?: number }).status ?? 1;
      stderr = (err as { stderr?: string }).stderr ?? "";
    }
    expect(exitCode).toBe(1);
    expect(stderr).toContain("No package.json");
  });
});
