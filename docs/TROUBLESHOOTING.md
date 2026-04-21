# Troubleshooting

> **First step for any "it doesn't work":** run `pyanchor doctor`.
> It walks every startup check (env vars, fs, agent CLI, output
> mode prerequisites) and prints what passed, what failed, and a
> suggested fix per item. Exit 0 = the sidecar will boot. The rest
> of this doc maps common symptoms to deeper diagnosis.

## Quick map

| Symptom | First command | If still stuck |
|---|---|---|
| `/readyz` returns 503 | `pyanchor doctor` | [Sidecar refuses to boot](#sidecar-refuses-to-boot) |
| Overlay button doesn't appear | Browser DevTools → Console | [Bootstrap doesn't mount](#bootstrap-doesnt-mount) |
| Edit hangs / times out | `pyanchor agent test` | [Agent CLI silent or slow](#agent-cli-silent-or-slow) |
| Edit completes but page didn't change | `pyanchor logs --tail 5` | [Apply mode rsync silently failed](#apply-mode-rsync-silently-failed) |
| Edit landed but build failed | `pyanchor logs --outcome failed -n 10` | [Build broke the workspace](#build-broke-the-workspace) |
| PR mode: PR didn't open | `gh auth status` as the sidecar user | [PR mode prerequisites](#pr-mode-prerequisites) |
| Audit log empty | `grep PYANCHOR_AUDIT_LOG /etc/...env` | [Audit log not enabled](#audit-log-not-enabled) |
| 401 / 403 on `/api/*` | DevTools → Network → request headers | [Auth + gate cookie](#auth--gate-cookie) |

## Sidecar refuses to boot

Symptom: `/readyz` returns 503, `pyanchor` exits with an env var error,
or systemd shows `pyanchor-demo.service` as `failed`.

```bash
# 1. Check the boot-time validation
pyanchor doctor

# 2. If doctor says everything passes but the sidecar still refuses
#    to start, look at the literal startup output:
pyanchor 2>&1 | head -20      # one-shot run
journalctl -u pyanchor.service -n 40 --no-pager   # under systemd
```

`pyanchor doctor` checks the same things `validateConfig()` does at
startup, so a doctor green + sidecar fail is rare. When it happens
the cause is almost always one of:

- A required env var is set but **points at a path that doesn't exist
  yet** (`PYANCHOR_WORKSPACE_DIR` not `mkdir -p`'d)
- `PYANCHOR_RESTART_SCRIPT` is set but the file is `chmod 644`
  (not executable)
- `PYANCHOR_HOST=0.0.0.0` is set but `PYANCHOR_ALLOWED_ORIGINS` is
  empty (sidecar refuses this combination as a CSRF guard)

## Bootstrap doesn't mount

Symptom: `https://your-app/` loads, but the floating overlay button
isn't in the bottom-right corner.

DevTools → Console will tell you which layer is failing. Common
messages:

| Console message | Cause | Fix |
|---|---|---|
| `[pyanchor] not on a trusted host` | The current hostname isn't in `data-pyanchor-trusted-hosts` | Add it: `<script ... data-pyanchor-trusted-hosts="prod.example.com,localhost">` |
| `[pyanchor] overlay disabled — gate cookie "<name>" not set` | The fail-safe attribute is set but the cookie isn't | Visit your magic-word URL OR set `httpOnly: false` on the cookie issuer (the bootstrap reads `document.cookie` — see [`ACCESS-CONTROL.md`](./ACCESS-CONTROL.md)) |
| `[pyanchor] missing data-pyanchor-token` | Bootstrap script tag exists but the token attribute is empty | Token didn't substitute into the HTML at build time — for Next.js use `NEXT_PUBLIC_PYANCHOR_TOKEN` and `process.env.NEXT_PUBLIC_PYANCHOR_TOKEN` in the layout |
| Network: `bootstrap.js` returns 403 | Sidecar gate cookie middleware is rejecting | You need to visit your magic-word URL first, or `PYANCHOR_REQUIRE_GATE_COOKIE=true` is set without the cookie path being wired up |
| Network: `bootstrap.js` returns 502/504 | Reverse proxy can't reach the sidecar | `curl http://127.0.0.1:3010/healthz` from the proxy host. Check sidecar is running + listening on the configured port |

## Agent CLI silent or slow

Symptom: Click overlay → progress shows "running agent" but never
emits a result event. Eventually times out (default 900s) or you
cancel.

```bash
# 1. Confirm the adapter can reach the agent at all (cheap one-shot)
pyanchor agent test

# 2. Common adapter pitfalls:
pyanchor agent test openclaw      # if openclaw OAuth expired, this surfaces it
pyanchor agent test claude-code   # if @anthropic-ai/claude-agent-sdk is missing, this errors clearly
pyanchor agent test gemini        # if GEMINI_API_KEY is unset, this errors clearly
```

If `agent test` succeeds but real edits still hang:

- **Workspace too big**: agents read the whole workspace dir.
  `node_modules` is auto-excluded but if you have large generated
  assets in the workspace, the agent's context window fills up.
  Move generated stuff to `.gitignore`d dirs that are also in
  `workspaceExcludes` (see your framework profile).
- **Token rate limiting**: if your provider rate-limits, the agent
  classifier surfaces that as an `error` event in the audit log:
  ```bash
  pyanchor logs -n 5 --outcome failed
  ```
- **Network egress blocked**: if you ran the systemd template with
  `IPAddressDeny=any` (we don't ship this in the default — see
  [`PRODUCTION-HARDENING.md`](./PRODUCTION-HARDENING.md)), agent
  CLI calls to the LLM provider are blocked. Remove the deny line.

## Apply mode rsync silently failed

Symptom: `pyanchor logs --tail 5` shows `outcome: success` but the
page didn't change.

```bash
# Check what the worker actually did
pyanchor logs --tail 1 --json | jq .

# Check the actual restart script output (apply mode runs this)
sudo journalctl -u pyanchor.service -n 50 --no-pager | grep restart.sh
```

Most common causes:

- **Restart script is no-op**: For dev (`next dev` etc), this is
  intentional — the dev server hot-reloads the new files. In
  production, your restart script should do `pm2 reload` /
  `systemctl restart` / `docker restart`.
- **rsync wrote into the wrong dir**: `PYANCHOR_APP_DIR` doesn't
  match where the running app actually serves from. Confirm with
  `ls -la PYANCHOR_APP_DIR` after an edit — should see new mtimes.
- **nginx is caching**: static deploys (Vite/Astro/SvelteKit
  static-adapter) need either `proxy_cache_bypass` or a
  build-hashed asset filename change. The HTML itself usually
  has a `Cache-Control: no-cache`.

## Build broke the workspace

Symptom: `pyanchor logs --outcome failed -n 10` shows multiple
recent failures with `error: ... build failed`.

```bash
# Inspect the workspace directly
sudo -u <pyanchor-user> bash
cd $PYANCHOR_WORKSPACE_DIR
$PYANCHOR_BUILD_COMMAND     # whatever the framework profile defaults to
```

The agent edits then runs the build; if the build breaks, the edit
gets rolled back (apply mode) or the PR fails CI (PR mode). The
workspace is left in the post-edit state for inspection — `git diff`
inside the workspace shows what the agent changed.

## PR mode prerequisites

Symptom: `PYANCHOR_OUTPUT_MODE=pr` but no PR shows up on GitHub.

```bash
# 1. Confirm gh + git resolve as the pyanchor user
sudo -u <pyanchor-user> bash
which gh && gh --version
which git && git --version
gh auth status                  # must show "Logged in to github.com"

# 2. The workspace must be a git clone, not just a dir
cd $PYANCHOR_WORKSPACE_DIR
git status                      # should show a clean working tree on PYANCHOR_GIT_BASE_BRANCH
git remote -v                   # must point at your GitHub repo

# 3. Doctor flags PR-mode prereqs explicitly
pyanchor doctor                 # look for "Output mode: pr" section
```

The full PR mode setup is in
[`examples/nextjs-pr-mode/README.md`](../examples/nextjs-pr-mode/README.md).
The most common gotcha is that the workspace dir was created by
`mkdir`, not `git clone` — pyanchor doesn't auto-clone (no
credentials assumption).

## Audit log not enabled

Symptom: `pyanchor logs` says `audit log not found at ...`.

```bash
# Check the env
sudo grep PYANCHOR_AUDIT_LOG /etc/pyanchor.env       # or wherever you store the env

# Should see:
#   PYANCHOR_AUDIT_LOG=true
#   PYANCHOR_AUDIT_LOG_FILE=/var/lib/pyanchor/state/audit.jsonl   (optional)
```

If `PYANCHOR_AUDIT_LOG` is unset or `false`, the worker silently
drops audit events. Default is **off** so existing setups don't
grow a new file silently — flip it on for any team / production
deploy.

## Auth + gate cookie

Symptom: 401 or 403 on `/api/*` requests.

| Status | Likely cause |
|---|---|
| **401** on `/api/edit` etc | `PYANCHOR_TOKEN` mismatch between sidecar and bootstrap script tag. Check `data-pyanchor-token="..."` in the served HTML matches what's in the env file. |
| **403** with `"Production gate cookie missing"` | `PYANCHOR_REQUIRE_GATE_COOKIE=true` is set but no `pyanchor_dev` cookie on the request. Visit your magic-word URL or sign in to the host app's auth flow. |
| **403** with `"Origin not allowed"` | `PYANCHOR_ALLOWED_ORIGINS` doesn't include the request's `Origin` header. Add it (CSV). |

Full 9-layer access-control reference: [`ACCESS-CONTROL.md`](./ACCESS-CONTROL.md).

## Operator CLI cheat sheet

The four sister commands all start from `pyanchor`:

| Command | When to use |
|---|---|
| `pyanchor doctor` | Anytime the sidecar refuses to boot or behaves weird at startup |
| `pyanchor doctor --json` | CI gates / monitoring (Datadog / k8s readiness scripts) |
| `pyanchor logs --tail 20` | "What happened in the last few edits?" |
| `pyanchor logs --follow` | Watch live (useful while reproducing a bug) |
| `pyanchor logs --outcome failed -n 50` | Recent failures only |
| `pyanchor logs --since 2026-04-20 --json` | Export a time range as raw JSONL for analysis |
| `pyanchor agent test` | "Is the agent CLI installed and authenticated?" |
| `pyanchor agent test gemini "Reply with hello"` | One-shot ping a specific adapter with a custom prompt |
| `scripts/audit-stats.sh` | Adoption-window summary (success rate, p50/p99 duration, top actors) |

## Still stuck?

- Read [`SECURITY.md`](./SECURITY.md) if the issue is auth-shaped.
- Read [`PRODUCTION-HARDENING.md`](./PRODUCTION-HARDENING.md) if the
  issue is operator-shaped (systemd, sandbox, log shipping).
- Read [`ACCESS-CONTROL.md`](./ACCESS-CONTROL.md) for the 9-layer
  access-control model.
- Open an issue with: the output of `pyanchor doctor --json`, the
  last 20 lines of `pyanchor logs --tail 20 --json`, and what you
  typed into the overlay. That triple is enough context to
  reproduce most issues.
