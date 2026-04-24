# Security Policy

## Supported Versions

pyanchor is pre-1.0; only the latest minor (currently `0.33.x`)
receives security fixes. Older minors are deprecated.

| Version | Status |
|---------|--------|
| `0.33.x` | ✅ supported (latest) |
| `0.32.x` | ❌ end of life |
| `< 0.32` | ❌ end of life |

## Reporting a Vulnerability

If you find a security issue in pyanchor, please **do not** open
a public GitHub issue. Instead, use one of:

1. **GitHub Security Advisories** (preferred):
   https://github.com/pyanchor/pyanchor/security/advisories/new
2. **Email**: open the maintainer profile at
   https://github.com/pyanchor and contact via the address there.

Please include:

- Affected version (`npm view pyanchor version`)
- Reproduction steps (a minimal Next.js / Vite test case is ideal)
- Expected vs observed behavior
- The threat model you're assuming (operator-trust, multi-tenant,
  public bind, etc.) — the answer changes the severity

## Threat Model

pyanchor's deployed surface assumes:

- **Operator-trust on host config**: env vars (`PYANCHOR_*`) are
  considered fully trusted. The operator who runs the sidecar
  controls install/build/restart commands — pyanchor explicitly
  treats those as shell hooks, not user input.
- **Token = privilege**: `PYANCHOR_TOKEN` is the only authentication
  the sidecar enforces. Leaking it is equivalent to giving an
  attacker `/api/edit` power over the workspace dir.
- **Origin allowlist required for non-loopback**: `validateConfig()`
  refuses to bind to non-loopback hosts when
  `PYANCHOR_ALLOWED_ORIGINS` is empty (since v0.18.0).
- **Workspace confinement**: agent edits stay within
  `PYANCHOR_WORKSPACE_DIR`. `targetPath` traversal (`..`,
  backslash, NUL, drive letters, percent-encoded) is rejected at
  the API boundary (since v0.33.0). The Aider adapter additionally
  re-resolves candidate paths against the workspace root.
- **Destructive path guard**: `validateConfig()` refuses to start
  when `PYANCHOR_WORKSPACE_DIR` / `PYANCHOR_APP_DIR` resolve to
  bare system dirs (`/`, `/home`, `/var`, ...) or HOME (since
  v0.33.0). Operator typo can no longer `rm -rf` host state.

What pyanchor does **not** defend against:

- A compromised operator host. Anyone who can write
  `~/.codex/config.toml` or `/etc/pyanchor.env` already has equal
  or greater control than pyanchor itself.
- An agent (codex / claude-code / openclaw / aider / gemini)
  intentionally writing files outside its prompt scope. The
  workspace confines the filesystem; agent prompt-injection
  resistance is the agent's responsibility.

## Recent Hardening (v0.32.x → v0.33.x)

- v0.33.0: `commandExists()` shell:false + name allowlist
  (cwd `.env` autoload + untrusted repo combo was a local-exec
  sink before this fix)
- v0.33.0: Aider `targetPath` traversal guard (API boundary +
  defense-in-depth in `guessFilesForRoute()`)
- v0.33.0: destructive path guard (system dirs forbidden)
- v0.33.0: server-local RMW lock (concurrent `/api/edit` race)
- v0.33.0: shutdown SIGTERMs active worker (no orphan apply)
- v0.32.8: `app.listen` EADDRINUSE handler (no silent shadow)
- v0.32.5: SIGTERM handler `process.exit(0)` (no hang on stop)
- v0.32.3: `PYANCHOR_AGENT_MODEL` default empty (no openclaw
  routing prefix leak into other adapters)
- v0.32.1: `dist/cli.cjs` shebang + chmod (no shell-parses-JS
  on `npx pyanchor`)

See `CHANGELOG.md` for the full ship-by-ship history.

## Provenance

npm tarballs since v0.32.x are published with `--provenance`
(verifiable Sigstore attestation linking the tarball to the
`release.yml` GitHub Actions workflow + the source commit).
You can verify with:

```bash
npm view pyanchor@latest --json | jq '.dist.attestations'
```

The attestation URL points at the GitHub run that built and
published that exact version.
