# Production deployment recipes

pyanchor's local-dev story (`npx pyanchor`) is the same npm
package you ship to prod. The only thing that changes is **how the
sidecar process is supervised**. Three working recipes:

1. [systemd (bare metal / VPS)](#1-systemd-bare-metal--vps)
2. [Docker / docker-compose](#2-docker--docker-compose)
3. [Coolify / Railway / Render (managed PaaS)](#3-coolify--railway--render-managed-paas)

Each recipe ends with a "verify it's actually serving" checklist
and the production-only env vars you need beyond
`pyanchor doctor`'s required five.

---

## 1. systemd (bare metal / VPS)

The reference deployment for `https://pyanchor.pyan.kr` itself —
`/home/bot/pyanchor-demo/` is exactly this layout.

### Layout

```
/home/<user>/<your-app>/                     # your app (built static or next prod)
  node_modules/pyanchor/dist/server.cjs      # what systemd executes
  scripts/pyanchor-restart.sh                # what the sidecar runs after a successful edit
  dist/                                      # built static output (vite/next export)

/etc/<your-app>.env                          # operator env (mode 0640, owned by root, group your-app)
/etc/systemd/system/<your-app>-pyanchor.service
/etc/sudoers.d/<your-app>-pyanchor           # if restart.sh needs sudo (rsync into /var/www, etc.)
/etc/nginx/conf.d/<your-app>.conf            # reverse proxy /_pyanchor/ to 127.0.0.1:<port>

/var/lib/<your-app>/                         # state dir (state.json + audit.jsonl)
/var/www/<your-app>/                         # nginx-served static root (rsync target)
```

### `/etc/<your-app>.env`

```bash
# 5 required (init writes these)
PYANCHOR_TOKEN=<openssl rand -hex 32>
PYANCHOR_AGENT=codex                                  # or claude-code / openclaw / aider / gemini
PYANCHOR_APP_DIR=/home/bot/<your-app>
PYANCHOR_WORKSPACE_DIR=/var/lib/<your-app>/workspace
PYANCHOR_RESTART_SCRIPT=/home/bot/<your-app>/scripts/pyanchor-restart.sh
PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:<your-app-port>/

# Production-only (recommended for any internet-reachable host)
PYANCHOR_PORT=3010                                    # bind port; pin so systemd unit can match
PYANCHOR_HOST=127.0.0.1                               # loopback only (nginx terminates)
PYANCHOR_ALLOWED_ORIGINS=https://your-app.example.com # CSV; required if HOST != loopback
PYANCHOR_REQUIRE_GATE_COOKIE=true                     # plus the magic-word URL set/clear endpoints
PYANCHOR_AUDIT_LOG=true
PYANCHOR_AUDIT_LOG_FILE=/var/lib/<your-app>/audit.jsonl
PYANCHOR_STATE_DIR=/var/lib/<your-app>

# Optional but useful in prod
PYANCHOR_OUTPUT_MODE=apply                            # or pr (needs gh CLI)
PYANCHOR_AGENT_TIMEOUT_S=600                          # tune per-edit budget
PYANCHOR_ACTOR_SIGNING_SECRET=<openssl rand -hex 32>  # if you HMAC-sign X-Pyanchor-Actor
```

### `/etc/systemd/system/<your-app>-pyanchor.service`

```ini
[Unit]
Description=pyanchor sidecar for <your-app>
Documentation=https://github.com/pyanchor/pyanchor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<your-app-user>
Group=<your-app-user>
WorkingDirectory=/home/bot/<your-app>
EnvironmentFile=-/etc/<your-app>.env
ExecStart=/usr/bin/node /home/bot/<your-app>/node_modules/pyanchor/dist/server.cjs

Restart=on-failure
RestartSec=5s

# Sandbox — reduces blast radius if pyanchor or an agent is compromised.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources

# ProtectHome=read-only blocks writes to /home, so allow the dirs
# pyanchor actually needs to write to:
#   - app dir (rsync target + node_modules + dist)
#   - state dir (state.json + audit.jsonl)
#   - nginx static root (rsync target via sudo helper, if you use one)
ReadWritePaths=/home/bot/<your-app> /var/lib/<your-app> /var/www/<your-app>

LimitNOFILE=4096
MemoryMax=2G
TasksMax=256

[Install]
WantedBy=multi-user.target
```

### `/etc/sudoers.d/<your-app>-pyanchor`

If your `restart.sh` needs to rsync into `/var/www` (root-owned),
allowlist the exact command instead of giving general sudo:

```
# Lets the pyanchor sidecar rsync into /var/www without a password,
# scoped to the exact command shape the restart script uses.
<your-app-user> ALL=(root) NOPASSWD: /usr/bin/rsync -a --delete --exclude=_pyanchor /home/bot/<your-app>/dist/ /var/www/<your-app>/
```

Install with `sudo visudo -c` to syntax-check.

### `/etc/nginx/conf.d/<your-app>.conf`

```nginx
server {
    server_name your-app.example.com;

    # Magic-word URL gate — sets the pyanchor_dev cookie if the secret matches.
    # Rotate the secret in /etc/<your-app>.gate-secret + this `if` line together.
    location = /__pyanchor-gate-set {
        if ($arg_secret != "<rotate-me>") { return 404; }
        add_header Set-Cookie "pyanchor_dev=1; Secure; SameSite=Strict; Path=/; Max-Age=2592000" always;
        return 302 /;
    }
    location = /__pyanchor-gate-clear {
        add_header Set-Cookie "pyanchor_dev=; Secure; SameSite=Strict; Path=/; Max-Age=0" always;
        return 302 /;
    }

    # Static site
    location / {
        root /var/www/<your-app>;
        try_files $uri $uri/ /index.html;
    }

    # Sidecar reverse proxy
    location /_pyanchor/ {
        proxy_pass http://127.0.0.1:3010/_pyanchor/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
        proxy_read_timeout 120s;
        proxy_buffering off;   # /api/status long-poll
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    # Certbot manages these:
    ssl_certificate /etc/letsencrypt/live/your-app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-app.example.com/privkey.pem;
}

server {
    if ($host = your-app.example.com) { return 301 https://$host$request_uri; }
    listen 80; listen [::]:80;
    server_name your-app.example.com;
    return 404;
}
```

### Bring it up

```bash
sudo cp /home/bot/<your-app>/etc-templates/<your-app>.env /etc/<your-app>.env
sudo cp /home/bot/<your-app>/etc-templates/<your-app>-pyanchor.service /etc/systemd/system/
sudo cp /home/bot/<your-app>/etc-templates/<your-app>-pyanchor.sudoers /etc/sudoers.d/<your-app>-pyanchor
sudo cp /home/bot/<your-app>/etc-templates/<your-app>.nginx.conf /etc/nginx/conf.d/<your-app>.conf

sudo visudo -c                             # sudoers syntax check
sudo nginx -t && sudo systemctl reload nginx

sudo systemctl daemon-reload
sudo systemctl enable --now <your-app>-pyanchor
sudo systemctl status <your-app>-pyanchor

# Verify
curl -s http://127.0.0.1:3010/healthz                      # {"ok":true}
curl -s https://your-app.example.com/_pyanchor/bootstrap.js | head -3   # JS bundle
```

Open `https://your-app.example.com/__pyanchor-gate-set?secret=<your-secret>`
in a browser — the gate cookie is set, you're redirected to `/`,
and the overlay should mount in the bottom-right corner.

---

## 2. Docker / docker-compose

If you'd rather containerize the sidecar:

### `Dockerfile.pyanchor`

```dockerfile
FROM node:20-bookworm-slim

# pyanchor itself + your app's framework deps. Install the agent CLIs
# you actually use (codex / aider / gemini / openclaw). claude-code's
# SDK comes via npm so it's already in node_modules.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates rsync git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm install --omit=dev   # or pnpm install --prod / yarn install --production

COPY . .

# The sidecar binds to PORT inside the container; map it on the host.
EXPOSE 3010
CMD ["node", "node_modules/pyanchor/dist/server.cjs"]
```

### `compose.yml`

```yaml
services:
  pyanchor:
    build:
      context: .
      dockerfile: Dockerfile.pyanchor
    env_file: .env.production
    ports:
      - "127.0.0.1:3010:3010"   # loopback bind on host
    volumes:
      - ./workspace:/var/lib/pyanchor/workspace   # workspace dir (writable by container)
      - ./state:/var/lib/pyanchor                 # audit.jsonl + state.json
      - ./dist:/app/dist                          # built static output for nginx host to read
    restart: unless-stopped
    # Same security knobs as systemd's sandbox flags, container-style:
    read_only: true
    tmpfs:
      - /tmp
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
```

### `.env.production`

Same env as the systemd recipe above. Mount it into the container
via `env_file:` (don't bake secrets into the image).

### Bring it up

```bash
docker compose -f compose.yml up -d
docker compose logs -f pyanchor
curl -s http://127.0.0.1:3010/healthz   # {"ok":true}
```

Front it with nginx exactly as in the systemd recipe (the proxy
target is just `http://127.0.0.1:3010` in both cases).

---

## 3. Coolify / Railway / Render (managed PaaS)

Managed PaaS treats your repo as the source of truth. The pattern
is identical across providers; details differ in the UI panel.

### Build command

```bash
npm install && npm install --save-dev pyanchor
```

(or `pnpm` / `yarn` equivalent — pyanchor only needs the npm
install to land `dist/server.cjs` in `node_modules/`).

### Start command

```bash
node node_modules/pyanchor/dist/server.cjs
```

### Env vars (set in the dashboard)

Same as the systemd `.env`. Critical ones for managed PaaS:

- `PYANCHOR_PORT` = whatever port the platform tells you to bind
  (Coolify uses `$PORT`; reflect it: `PYANCHOR_PORT=$PORT`).
- `PYANCHOR_HOST` = `0.0.0.0` (the platform terminates TLS upstream
  and routes container `0.0.0.0:$PORT` to your public domain).
- `PYANCHOR_ALLOWED_ORIGINS` = your public domain. **Required**
  for non-loopback bind — pyanchor refuses to start without it.
- `PYANCHOR_TOKEN` = generated secret. Use the platform's
  encrypted-secret store, not a plain env var commit.

### Healthcheck

Point the platform's healthcheck at `/healthz` (200 OK with
`{"ok":true}`). pyanchor exposes both `/healthz` (always-on
liveness) and `/readyz` (returns 503 until config is fully
resolved) — managed platforms generally want healthz.

### Persistent volume (optional)

If you set `PYANCHOR_AUDIT_LOG=true`, mount a volume at the path
you set for `PYANCHOR_AUDIT_LOG_FILE` (e.g. `/data/audit.jsonl`).
Without persistence, audit lines survive only until the next
container restart. Same for `PYANCHOR_STATE_DIR` if you want
job state to outlive deploys.

---

## Production checklist (regardless of recipe)

- [ ] `PYANCHOR_TOKEN` is a 64-char hex (`openssl rand -hex 32`),
      not the example value.
- [ ] `PYANCHOR_HOST` is loopback, OR `PYANCHOR_ALLOWED_ORIGINS`
      is set to your public domain CSV.
- [ ] `PYANCHOR_REQUIRE_GATE_COOKIE=true` for any internet-
      reachable deployment (recipe 1's `__pyanchor-gate-set`
      pattern issues the cookie).
- [ ] `PYANCHOR_AUDIT_LOG=true` with a path on a persistent volume.
- [ ] The sidecar's `User=` (systemd) / container UID (Docker) is
      a non-root account.
- [ ] `pyanchor doctor` against the prod env prints zero ✗.
- [ ] `curl https://<your-domain>/_pyanchor/bootstrap.js` returns
      a JS bundle (not the SPA fallback HTML).
- [ ] Browser overlay mounts after the magic-word gate URL.
- [ ] One `pyanchor agent test` returns within
      `PYANCHOR_AGENT_TIMEOUT_S` (catches mis-configured backends
      before a real edit hits the timeout).

## Reference deployment

`https://pyanchor.pyan.kr` itself runs recipe 1 (systemd + nginx +
sudoers + magic-word gate cookie). Source of truth for the templates
above is the live config at:

- `/etc/systemd/system/pyanchor-demo.service`
- `/etc/pyanchor-demo.env`
- `/etc/sudoers.d/pyanchor-demo`
- `/etc/nginx/conf.d/pyanchor-pyan.conf`

Open the demo site, click `__pyanchor-gate-set?secret=...` once,
then any element on the page → AI overlay edit cycle runs against
codex with apply mode. That's the reference flow these recipes
target.
