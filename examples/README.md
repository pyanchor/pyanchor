# pyanchor examples

Each subdirectory is a runnable, self-contained app with its own
`README.md`. Pick the one closest to your stack and copy it as the
starting point for your integration.

## Choose by framework

| Framework            | Minimal start                                | With production gating                                                  |
| -------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Next.js (App Router) | [`nextjs-minimal/`](./nextjs-minimal/)       | [`nextjs-portfolio-gate/`](./nextjs-portfolio-gate/) (magic-word URL)   |
|                      |                                              | [`nextjs-nextauth-gate/`](./nextjs-nextauth-gate/) (existing auth)      |
| Vite + React         | [`vite-react-minimal/`](./vite-react-minimal/) | [`vite-react-portfolio-gate/`](./vite-react-portfolio-gate/)          |
| Astro                | [`astro-minimal/`](./astro-minimal/)         | (apply the same gate cookie pattern as Vite)                            |
| Other                | Use the `astro-minimal` override pattern     | —                                                                       |

## Choose by feature

| Feature                                        | Example                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Smallest possible Next.js setup                | [`nextjs-minimal/`](./nextjs-minimal/)                                   |
| Smallest possible Vite setup                   | [`vite-react-minimal/`](./vite-react-minimal/)                           |
| Magic-word URL gate (no auth required)         | [`nextjs-portfolio-gate/`](./nextjs-portfolio-gate/) · [`vite-react-portfolio-gate/`](./vite-react-portfolio-gate/) |
| Tied to existing OAuth (NextAuth)              | [`nextjs-nextauth-gate/`](./nextjs-nextauth-gate/)                       |
| Swap between 5 agent backends with one env var | [`nextjs-multi-agent/`](./nextjs-multi-agent/)                           |
| Edits as reviewable GitHub PRs (no live apply) | [`nextjs-pr-mode/`](./nextjs-pr-mode/)                                   |
| Framework with no built-in profile             | [`astro-minimal/`](./astro-minimal/)                                     |

## All 8 examples at a glance

| Example                       | Files | Headline                                                    |
| ----------------------------- | ----- | ----------------------------------------------------------- |
| `nextjs-minimal`              | 7     | The "hello pyanchor" starter — start here                   |
| `nextjs-portfolio-gate`       | 7     | Recipe B (gate cookie) for sites without auth               |
| `nextjs-nextauth-gate`        | 9     | Recipe C (existing auth) — NextAuth + email allowlist       |
| `vite-react-minimal`          | 8     | The Vite equivalent of `nextjs-minimal`                     |
| `vite-react-portfolio-gate`   | 9     | Vite + standalone Node gate server (5174 → 5173)            |
| `nextjs-multi-agent`          | 6     | Same host, 5 interchangeable agents (openclaw/claude/codex/aider/gemini) |
| `astro-minimal`               | 7     | Non-built-in framework via `PYANCHOR_INSTALL_COMMAND` / `PYANCHOR_BUILD_COMMAND` overrides |
| `nextjs-pr-mode`              | 6     | `PYANCHOR_OUTPUT_MODE=pr` — edits land as GitHub PRs        |

## Operations templates

Not host-app examples — copy/paste-ready deploy artifacts.

| Template                      | Files | Headline                                                    |
| ----------------------------- | ----- | ----------------------------------------------------------- |
| [`systemd/`](./systemd/)      | 3     | Production-hardened systemd unit + EnvironmentFile + install README |

## Mix and match

The features are orthogonal:

- Any framework × any agent (`PYANCHOR_AGENT`)
- Any framework × any output mode (`PYANCHOR_OUTPUT_MODE`)
- Gate cookie + PR mode + audit log = recommended production stack

The examples isolate one feature each so you can compose what you need
without cargo-culting unrelated config.

## Conventions across examples

Every example follows the same conventions:

- `package.json` is `private: true, version: "0.0.0"` (these aren't
  published)
- Sidecar config goes in env vars, not files (matches production
  systemd/pm2 patterns)
- `scripts/restart.sh` is a stub `exit 0` — replace with your real
  restart command
- Bootstrap script tag is gated on `process.env.NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED`
  (or framework equivalent) so production builds without the env var
  ship zero pyanchor code
- Examples that include gating add `data-pyanchor-require-gate-cookie`
  as a fail-safe (defense layer 4 from `docs/SECURITY.md`)

## Don't see your stack?

Open an issue with the framework name and what you tried — the
`astro-minimal` override pattern (`PYANCHOR_INSTALL_COMMAND` +
`PYANCHOR_BUILD_COMMAND`) covers most cases without needing pyanchor
changes. If you write the example, send a PR and we'll merge it.
