# nextjs-pr-mode

End-to-end walkthrough of pyanchor's **PR output mode**: the agent's
edits land on a feature branch as a reviewable GitHub PR instead of
being rsynced to the live app.

This is the recommended mode for:
- Shared dev environments where multiple people share one host
- Demo / staging deploys you don't want anyone overwriting
- Production-adjacent environments where every change needs review
- Open-source projects where contributors propose changes via the
  overlay rather than the IDE

## How it differs from apply mode

```
                       ┌── apply mode (default) ─────┐
                       │  agent → workspace → rsync → │
                       │  app dir → restart           │
visitor → overlay →────┤                              │
                       │  pr mode (this example)      │
                       │  agent → workspace → git     │
                       │  commit + push → gh pr create│
                       └──────────────────────────────┘
```

The host app is **never restarted** in PR mode. The workspace is a git
working tree (auto-included from rsync when `outputMode === "pr"`) and
each successful agent run produces one PR.

## Prerequisites

The sidecar's worker user needs:

1. **`git` on PATH** — set `PYANCHOR_GIT_BIN` to override
2. **`gh` CLI on PATH, authenticated** — set `PYANCHOR_GH_BIN` to override
3. **A workspace that is a git working tree** — see "first-time
   workspace setup" below
4. **Write access to the GitHub remote** — gh's auth token must have
   `repo` scope

```bash
# Verify
git --version
gh --version
gh auth status   # must say "Logged in to github.com"
```

If you're running pyanchor under a service account (`pyanchor` user),
authenticate as that user:

```bash
sudo -u pyanchor gh auth login --hostname github.com --git-protocol https
```

## Layout

```
nextjs-pr-mode/
  app/
    layout.tsx        ← bootstrap script tag (data-pyanchor-output-mode="pr" is purely informational)
    page.tsx          ← landing page
  scripts/restart.sh  ← stub (never invoked in PR mode)
  next.config.mjs     ← /_pyanchor proxy
  package.json
```

## First-time workspace setup

PR mode requires the workspace dir to contain a git repo with a
remote. The simplest setup:

```bash
# 1. Clone your app repo into the workspace location pyanchor will use
git clone git@github.com:your-org/your-app.git /tmp/pyanchor-pr-workspace

# 2. Make sure the default branch is checked out and clean
cd /tmp/pyanchor-pr-workspace
git checkout main   # or whatever PYANCHOR_GIT_BASE_BRANCH is
git status          # must be clean
```

Pyanchor will `git fetch` + `git checkout` + `git reset --hard
origin/<base>` BEFORE invoking the agent each run — so any local
state in the workspace is wiped. That's intentional: it guarantees
the agent starts from a clean tree.

## Run it

```bash
pnpm install

export NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED=true
export NEXT_PUBLIC_PYANCHOR_TOKEN=$(openssl rand -hex 32)
export PYANCHOR_TOKEN=$NEXT_PUBLIC_PYANCHOR_TOKEN

pnpm dev   # http://localhost:3000
```

In another terminal — sidecar in PR mode:

```bash
export PYANCHOR_TOKEN=<same as above>
export PYANCHOR_APP_DIR=$(pwd)
export PYANCHOR_WORKSPACE_DIR=/tmp/pyanchor-pr-workspace   # the git clone from above
export PYANCHOR_RESTART_SCRIPT=$(pwd)/scripts/restart.sh   # never invoked but required
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:3000/
export PYANCHOR_AGENT=openclaw
export PYANCHOR_ALLOWED_ORIGINS=http://localhost:3000

# ─── PR mode bits ──────────────────────────────────────────────
export PYANCHOR_OUTPUT_MODE=pr
export PYANCHOR_GIT_REMOTE=origin           # default
export PYANCHOR_GIT_BASE_BRANCH=main        # default; match your repo's default
export PYANCHOR_GIT_BRANCH_PREFIX=pyanchor/ # default; PRs land as pyanchor/<run_id>

# Optional: webhook so the PR URL pings Slack
export PYANCHOR_WEBHOOK_PR_OPENED_URL=https://hooks.slack.com/services/T.../B.../...

pyanchor
```

## Try it

1. Open `http://localhost:3000`
2. Click the floating overlay button
3. Type a request: "change the H1 to 'PR mode works'"
4. Watch the overlay status panel — it walks through:
   - `preparing workspace` (fetch + checkout main + reset --hard)
   - `running agent` (your PYANCHOR_AGENT)
   - `committing changes` (git add + commit)
   - `pushing branch` (git push origin pyanchor/<run_id>)
   - `opening PR` (gh pr create)
5. The status panel surfaces the PR URL — click it
6. Review the PR on GitHub, merge or close

The host app at `localhost:3000` **never changes** during this flow.
The page only updates after you merge the PR and your normal CI/CD
deploys it (or you `git pull && pnpm dev` locally).

## Per-PR audit trail

Each PR mode run emits an `pr_opened` audit event:

```jsonl
{"ts":"2026-04-20T...","run_id":"r-...","actor":"alice@example.com","mode":"edit","output_mode":"pr","outcome":"success","pr_url":"https://github.com/.../pull/42","duration_ms":18204,...}
```

Enable with `PYANCHOR_AUDIT_LOG=true`. See
[`docs/PRODUCTION-HARDENING.md`](../../docs/PRODUCTION-HARDENING.md)
for shipping the log to your aggregator.

## Common errors

| Symptom                                       | Cause                                                          |
| --------------------------------------------- | -------------------------------------------------------------- |
| `gh: command not found`                       | Install GitHub CLI on the worker user's PATH                   |
| `gh auth status: not logged in`               | Run `sudo -u <worker-user> gh auth login`                      |
| `fatal: not a git repository`                 | Workspace dir isn't a clone — see "first-time setup" above     |
| `Permission denied (publickey)` on push       | Worker user's SSH key not authorized; use `gh auth login --git-protocol https` instead |
| `error: pathspec 'origin/main' did not match` | `PYANCHOR_GIT_BASE_BRANCH` mismatches your repo's default      |

## Switching back to apply mode

```bash
# Sidecar:
unset PYANCHOR_OUTPUT_MODE   # default is "apply"
# or:
export PYANCHOR_OUTPUT_MODE=apply
# Restart sidecar
```

The host app code doesn't change between modes.

## See also

- [`docs/PRODUCTION-HARDENING.md`](../../docs/PRODUCTION-HARDENING.md) §
  PR mode setup
- [`docs/SECURITY.md`](../../docs/SECURITY.md) — PR mode is the
  most-defended output mode (no live writes, no restart, all changes
  human-reviewed)
- [`../nextjs-multi-agent/`](../nextjs-multi-agent/) — combine PR
  mode with any of the 5 agent adapters
