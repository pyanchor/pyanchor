# Production hardening guide

`docs/SECURITY.md` is the threat model. This is the operator
playbook — concrete commands + config for the deployment recipes
listed there.

> **The agent has a shell.** Every hardening below assumes the
> agent will eventually try to do something you didn't expect.
> Plan to contain it, not to trust it.

## Layered defenses, in priority order

### 1. Separate Unix user (always)

The pyanchor sidecar process and the agent worker should both run
as a system user with **no login shell**, **no sudo grants outside
the documented allowlist**, and **read-only access to anything
outside the workspace dir**.

```bash
# Create a dedicated user
sudo useradd --system --no-create-home --shell /usr/sbin/nologin pyanchor

# Workspace dir owned by pyanchor, locked-down perms
sudo install -d -o pyanchor -g pyanchor -m 700 /var/lib/pyanchor/workspace

# State dir (audit log, sessions, etc.)
sudo install -d -o pyanchor -g pyanchor -m 700 /var/lib/pyanchor/state
```

Then:

```bash
PYANCHOR_WORKSPACE_DIR=/var/lib/pyanchor/workspace
PYANCHOR_STATE_DIR=/var/lib/pyanchor/state
# Run the sidecar as the pyanchor user (systemd User= or a
# `sudo -u pyanchor node dist/server.cjs` wrapper)
```

### 2. systemd sandbox (Linux, recommended)

If pyanchor runs under systemd, layer the unit file with sandbox
directives. These are free, fail-closed, and survive code bugs.

```ini
# /etc/systemd/system/pyanchor.service
[Unit]
Description=pyanchor sidecar
After=network.target

[Service]
Type=simple
User=pyanchor
Group=pyanchor

# Working directory + env
WorkingDirectory=/opt/pyanchor
EnvironmentFile=/etc/pyanchor.env
ExecStart=/usr/bin/node /opt/pyanchor/dist/server.cjs

# Sandbox
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
MemoryDenyWriteExecute=true

# Allow writes only to the workspace + state dirs the worker needs
ReadWritePaths=/var/lib/pyanchor/workspace /var/lib/pyanchor/state

# Network: bind only loopback by default. If you reverse-proxy,
# leave this and let the proxy handle the public face.
IPAddressDeny=any
IPAddressAllow=127.0.0.0/8 ::1/128

[Install]
WantedBy=multi-user.target
```

Test the sandbox is on:

```bash
systemd-analyze security pyanchor
# Expect score < 2.0 (lower is more secure)
```

### 3. bubblewrap / nsjail for the worker (advanced)

If you want belt-and-suspenders even when the systemd unit is
compromised, wrap the worker invocation with `bubblewrap` so the
agent sees a private filesystem view.

```bash
# Wrap the worker spawn in your sidecar config or sudo wrapper
bwrap \
  --ro-bind / / \
  --bind /var/lib/pyanchor/workspace /workspace \
  --bind /var/lib/pyanchor/state /state \
  --tmpfs /tmp \
  --proc /proc \
  --dev /dev \
  --unshare-user --unshare-pid --unshare-ipc \
  --new-session \
  --die-with-parent \
  /usr/bin/node /opt/pyanchor/dist/worker/runner.cjs
```

`nsjail` is a similar option with finer-grained syscall filtering.
Pick one based on what your distro packages cleanly.

### 4. Network exposure

Default: bind `127.0.0.1`. **Never bind `0.0.0.0` directly** —
v0.18.0 refuses to start in this configuration unless
`PYANCHOR_ALLOWED_ORIGINS` is also set.

If you reverse-proxy, the proxy should:

- Terminate TLS
- Add basic auth, IP allowlist, or SSO before forwarding to pyanchor
- Strip `X-Forwarded-For` headers from untrusted upstreams (or
  configure `PYANCHOR_TRUST_PROXY` to match the trusted hops)
- Forward `Host:` and `Origin:` so pyanchor's origin allowlist
  + cookie SameSite checks fire correctly

Example nginx snippet for "company VPN only" deployments:

```nginx
location /_pyanchor/ {
    # Only the corp VPN can reach pyanchor
    allow 10.0.0.0/8;
    deny all;

    # Forward to local sidecar
    proxy_pass http://127.0.0.1:3010;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 5. Restart script lockdown

The `PYANCHOR_RESTART_SCRIPT` runs as the pyanchor user with no
arg validation. **The script itself is the trust boundary** — make
it short and explicit:

```bash
#!/usr/bin/env bash
# /opt/pyanchor/restart-frontend.sh
set -euo pipefail

# ONLY the exact command we mean. No arg passthrough, no exec from env.
exec /usr/bin/pm2 reload my-frontend --update-env
```

Bad pattern (don't do this):

```bash
#!/usr/bin/env bash
# Don't accept args, don't `eval`, don't run "$@"
exec "$@"   # <-- agent could feed any argv
```

### 5b. PR mode setup (v0.19.0+)

Before turning on `PYANCHOR_OUTPUT_MODE=pr`:

```bash
# 1. Workspace must be a git clone of your deployment repo. Pyanchor
#    does NOT auto-clone; this is a one-time operator step. The .git
#    dir survives subsequent rsyncs because it's in BASE_RSYNC_EXCLUDES.
sudo -u pyanchor git clone <your-remote> /var/lib/pyanchor/workspace

# 2. Configure git auth as the pyanchor user. Pick ONE:
#    a) gh CLI authentication (recommended)
sudo -u pyanchor gh auth login
sudo -u pyanchor gh auth setup-git   # so `git push` uses gh's https creds

#    b) GH_TOKEN env var (fine for systemd EnvironmentFile)
echo 'GH_TOKEN=ghp_...' | sudo tee -a /etc/pyanchor.env

#    c) SSH deploy key (the pyanchor user needs ~/.ssh/known_hosts +
#       the key registered with the repo)
```

Then enable PR mode:

```sh
PYANCHOR_OUTPUT_MODE=pr
PYANCHOR_GIT_BASE_BRANCH=main
PYANCHOR_GIT_BRANCH_PREFIX=pyanchor/
```

What pyanchor does on each PR job (v0.20.1+):
1. `git fetch origin main` + `git checkout main` + `git reset --hard origin/main` —
   re-anchors the persistent workspace clone on the base branch.
   Without this, the next PR's branch would have the previous PR's
   tip as its parent (round-14 #1 fix).
2. Agent runs and edits workspace files.
3. `git status --porcelain` — if no changes, skip PR creation.
4. `git checkout -b pyanchor/<jobId>` + `git add .` + `git commit`.
5. `git push origin <branch>` + `gh pr create`.

Webhook notifications about PR creation are **best-effort only**:
5-second timeout, stderr logging on failure, no retry. If you need
guaranteed delivery, tail the audit log instead.

### 6. sudo grants for the openclaw agent

If you use `PYANCHOR_AGENT=openclaw`, the worker shells out under
`sudo` to flip workspace ownership during sync. Keep the sudoers
entry **as narrow as possible**:

```sudoers
# /etc/sudoers.d/pyanchor
# pyanchor user can ONLY run these specific binaries with these
# specific args. NOPASSWD because the daemon has no tty.
pyanchor ALL=(openclaw) NOPASSWD: /usr/bin/openclaw
pyanchor ALL=(root) NOPASSWD: /usr/bin/rsync /var/lib/pyanchor/workspace/ /opt/myapp/
pyanchor ALL=(root) NOPASSWD: /usr/bin/chown -R pyanchor\:pyanchor /opt/myapp/
```

Test the policy:

```bash
sudo -l -U pyanchor   # list exactly what the user can run
```

### 7. Audit log retention + shipping

`audit.jsonl` (when enabled via `PYANCHOR_AUDIT_LOG=true`) is
append-only. To prevent it from filling the disk, rotate via your
existing tool (logrotate, systemd-journal, or your log shipper):

```
# /etc/logrotate.d/pyanchor
/var/lib/pyanchor/state/audit.jsonl {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 0600 pyanchor pyanchor
}
```

Pyanchor re-opens the file on every event, so log rotation is
safe — no SIGHUP required.

To ship to a centralized log store (Datadog / Splunk / Loki / etc.),
tail the file with your existing agent:

```yaml
# datadog example
logs:
  - type: file
    path: /var/lib/pyanchor/state/audit.jsonl
    service: pyanchor
    source: pyanchor
    sourcecategory: audit
```

### 8. Secret hygiene

- Generate `PYANCHOR_TOKEN` with `openssl rand -hex 32` (or
  `head -c 32 /dev/urandom | base64`). Never reuse across
  environments.
- Store secrets in a manager (Vault, AWS Secrets Manager,
  1Password Connect, etc.), not the unit file.
- Rotate `PYANCHOR_TOKEN` after any incident or after staff
  turnover. Rotation = update env + restart sidecar; existing
  cookie sessions are revoked at next request because the cookie's
  signing material is implicitly tied to the token presence.

## Configuration matrix

| Scenario | host | allowedOrigins | requireGateCookie | outputMode |
|---|---|---|---|---|
| Local solo dev | `127.0.0.1` | empty | false | `apply` |
| Local team dev (VPN) | `127.0.0.1` | `https://*.dev.corp` | false | `apply` |
| Public live-edit (your portfolio) | `127.0.0.1` (proxy) | `https://your.dev` | **true** | `apply` |
| Production "PR-only" team gate (v0.19+) | `127.0.0.1` (proxy) | `https://app.corp` | true | `pr` |
| Staging dryrun | `127.0.0.1` | `https://staging.corp` | true | `dryrun` |

## What pyanchor will NOT do for you

- Authenticate end users. Use your host app's auth + the gate
  cookie pattern (`docs/SECURITY.md` recipe B).
- Sandbox the agent's filesystem access. Use bubblewrap / nsjail /
  systemd directives (above).
- Filter or moderate prompts. If you need allowlists, reject
  destructive verbs, or require human review, gate at the host
  app's API layer before forwarding to `/api/edit`.
- Detect malicious diffs from the agent. The PR mode (v0.19+) gives
  you the existing git review process; the apply mode gives you
  speed in exchange for trust.

If you need any of the above, they're features for a host app to
provide on top of pyanchor — not features pyanchor will ever bake in.
