# systemd

Production-hardened systemd unit + EnvironmentFile template for
running the pyanchor sidecar on a Linux host. Pair with a reverse
proxy (nginx / caddy / cloudflare tunnel) for the public face.

This is the same hardening block from
[`../../docs/PRODUCTION-HARDENING.md`](../../docs/PRODUCTION-HARDENING.md)
pulled into copy/paste-ready files. Use this if you want to skip
straight to "make it work in production" without scrolling through
the rationale.

## Files

```
systemd/
  pyanchor.service       ← /etc/systemd/system/pyanchor.service
  pyanchor.env.example   ← copy to /etc/pyanchor.env, fill in
  README.md              ← this file
```

## Install

```bash
# 1. Create the service user + state dirs
sudo useradd --system --no-create-home --shell /usr/sbin/nologin pyanchor
sudo mkdir -p /var/lib/pyanchor/{workspace,state}
sudo chown -R pyanchor:pyanchor /var/lib/pyanchor

# 2. Drop pyanchor's compiled artifacts where ExecStart points
sudo mkdir -p /opt/pyanchor
# (rsync your built dist/ here, or pnpm install + pnpm build in /opt/pyanchor)

# 3. Install the unit + env file
sudo cp pyanchor.service /etc/systemd/system/
sudo cp pyanchor.env.example /etc/pyanchor.env
sudo nano /etc/pyanchor.env       # fill in tokens, paths, agent, allowlist
sudo chown root:pyanchor /etc/pyanchor.env
sudo chmod 640 /etc/pyanchor.env  # secrets, root-readable + service-group-readable

# 4. Boot it
sudo systemctl daemon-reload
sudo systemctl enable --now pyanchor
sudo systemctl status pyanchor
journalctl -u pyanchor -f
```

## Verify

```bash
# Liveness — always 200 if the process is up
curl -i http://127.0.0.1:3010/healthz
# {"ok":true}

# Readiness — 200 only when workspace + app dir + restart script + agent CLI all resolve
curl -i http://127.0.0.1:3010/readyz
# 200 {"ok":true,"ready":true}        ← good, route traffic here
# 503 {"ok":false,"ready":false}      ← something's missing — check journalctl

# Sandbox score (lower is more secure)
sudo systemd-analyze security pyanchor
# Should print < 2.0
```

## k8s / docker users

The `/healthz` and `/readyz` endpoints are equally usable as k8s
probes:

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 3010
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /readyz
    port: 3010
  periodSeconds: 10
  failureThreshold: 3
```

The systemd unit exists primarily for VPS / bare-metal / single-node
deploys; in clustered environments you'd usually run pyanchor inside
a sidecar container next to your app pod.

## Debugging readyz failures

`/readyz` returns 503 when `isPyanchorConfigured()` fails. The most
common causes:

| Symptom                                      | Fix                                                   |
| -------------------------------------------- | ----------------------------------------------------- |
| `PYANCHOR_APP_DIR` doesn't exist             | Create it or point at the actual deployed app path    |
| `PYANCHOR_WORKSPACE_DIR` doesn't exist       | `mkdir -p` it as the pyanchor user                    |
| Restart script missing or not executable     | `chmod +x /opt/pyanchor/restart.sh`                   |
| Agent CLI not on PATH                        | `which openclaw` / `which gemini` etc as pyanchor user |
| `claude-code` agent always passes (npm pkg)  | Expected — claude-code uses a node module, no binary  |

`/healthz` will keep returning 200 even when `/readyz` is 503 — the
process is alive, it just can't run an edit yet. K8s will stop
routing traffic but won't restart the pod (correct behaviour: the
problem is config, not crashed code).

## See also

- [`../../docs/PRODUCTION-HARDENING.md`](../../docs/PRODUCTION-HARDENING.md)
  — full hardening rationale, bubblewrap wrapper, sudoers, log shipping
- [`../../docs/SECURITY.md`](../../docs/SECURITY.md) — threat model
  and the 3 deployment recipes
