# Integrate pyanchor with a Next.js app

This guide assumes a Next.js 13+ App Router project. Pages Router works
too — only the layout-injection step changes.

## 1. Pick paths and a token

Decide three paths and one secret up front. Use absolute paths.

```bash
export PYANCHOR_TOKEN=$(openssl rand -hex 32)
export PYANCHOR_APP_DIR=/home/me/projects/my-nextjs-app
export PYANCHOR_WORKSPACE_DIR=/home/me/.pyanchor-workspace
export PYANCHOR_RESTART_SCRIPT=/home/me/projects/my-nextjs-app/scripts/restart.sh
export PYANCHOR_HEALTHCHECK_URL=http://127.0.0.1:3000/
```

The **workspace** is a scratch copy of the app dir that the agent
mutates first. After a successful build, pyanchor rsyncs the workspace
back into the app dir and triggers your restart script. Keep the
workspace on the same filesystem as the app dir so rsync stays cheap.

## 2. Write a restart script

Pyanchor calls this with no arguments. Make it idempotent and fast.

```bash
#!/usr/bin/env bash
# scripts/restart.sh
set -euo pipefail
pm2 restart my-nextjs-app
# or: docker compose restart frontend
# or: systemctl --user restart my-nextjs-app
```

`chmod +x scripts/restart.sh`.

## 3. Inject the bootstrap into your layout

Use an env flag so production never accidentally enables the overlay.
Pass the token via a `data-` attribute (the bootstrap reads it and
forwards it on every API call).

```tsx
// app/layout.tsx
const devtoolsEnabled = process.env.NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED === "true";
const devtoolsToken = process.env.NEXT_PUBLIC_PYANCHOR_TOKEN ?? "";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {devtoolsEnabled && (
          <script
            src="/_pyanchor/bootstrap.js"
            defer
            data-pyanchor-token={devtoolsToken}
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

In `.env.development`:

```bash
NEXT_PUBLIC_PYANCHOR_DEVTOOLS_ENABLED=true
NEXT_PUBLIC_PYANCHOR_TOKEN=<same token as PYANCHOR_TOKEN above>
```

In `.env.production` leave both **unset**, or explicitly `=false`.

> ⚠️ The bootstrap is injected into the page HTML. Whoever loads the
> page sees the script tag. Only enable it on pages your trusted users
> reach (admin domain, dev/staging, or behind your own auth gate).

## 4. Reverse-proxy `/_pyanchor/*`

Add a location block to the same nginx vhost that serves your Next.js
app. Pyanchor listens on `127.0.0.1:3010` by default.

```nginx
server {
    listen 443 ssl;
    server_name app.example.com;
    # ... your existing TLS / Next.js config ...

    location /_pyanchor/ {
        proxy_pass http://127.0.0.1:3010/_pyanchor/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        # ... rest of your Next.js proxy config ...
    }
}
```

Pyanchor also responds at `/runtime/*` (alias). If your Next app
already uses `/runtime/*` for something, change the alias via
`PYANCHOR_RUNTIME_ALIAS_PATH=/_pyanchor-runtime` (or set it to `/`
empty by passing the same value as `PYANCHOR_RUNTIME_BASE_PATH`).

## 5. Start the sidecar

```bash
pyanchor
```

You should see:

```
pyanchor sidecar listening on http://127.0.0.1:3010
```

Reload your Next.js page. A small floating button (bottom-right) is the
overlay trigger. Click it, type a request, hit enter.

## 6. Process management

For production, run pyanchor under a process supervisor:

**pm2:**

```bash
pm2 start --name pyanchor /usr/bin/env -- \
  PYANCHOR_TOKEN=... \
  PYANCHOR_APP_DIR=... \
  PYANCHOR_WORKSPACE_DIR=... \
  PYANCHOR_RESTART_SCRIPT=... \
  PYANCHOR_HEALTHCHECK_URL=... \
  pyanchor
pm2 save
```

**systemd user service:**

```ini
# ~/.config/systemd/user/pyanchor.service
[Unit]
Description=Pyanchor sidecar
After=network.target

[Service]
EnvironmentFile=%h/.pyanchor.env
ExecStart=/home/%u/.local/bin/pyanchor
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

## Troubleshooting

**`401 Unauthorized` on every request.** The token sent by the bootstrap
doesn't match `PYANCHOR_TOKEN`. Check both env files agree.

**`429 Too many requests`.** You hit the per-IP rate limit on `/api/edit`
(6 / min default). Wait a minute or fork to relax it.

**Frontend doesn't restart after edit.** Run your `PYANCHOR_RESTART_SCRIPT`
manually with the same env. Check the sidecar log for `[install]` and
`[build]` lines — the agent might have failed before reaching the sync
step.

**`Missing required environment variables`.** The validator at startup
listed exactly which ones. Set them and restart.
