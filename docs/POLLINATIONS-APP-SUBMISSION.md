# Pollinations App Submission — draft

This file is the draft submission body for
<https://github.com/pollinations/pollinations/issues/new/choose> →
**App Submission** template. Copy each section into the matching
form field. Not part of the published docs — kept here so the
wording is reviewable / editable in source control before posting.

---

## App Name

Pyanchor

## App Description

Pyanchor is an open-source, agent-agnostic AI live-edit sidecar for
running web apps (Next.js / Vite / Astro). You add a one-line
`<script>` to your page; an in-page overlay (Shadow DOM) lets you
point at any element and describe a change in plain language. A
backend agent then edits the project files, builds, and either
applies the change to the live deploy or opens a PR for review.

Pyanchor ships **six interchangeable agent backends**, selected via
`PYANCHOR_AGENT`. The newest one is **Pollinations** — added
specifically so users without a CLI agent installed (or without
an OpenAI / Anthropic / Google account) can still drive the
overlay end-to-end with zero install.

The Pollinations adapter calls `POST https://gen.pollinations.ai/v1/chat/completions`
with `tools: auto` and runs its own tool loop —
`list_files` → `read_file` → `search_replace` (or `write_file`) →
`done` — against pyanchor's scratch workspace. It honours
`PYANCHOR_POLLINATIONS_TOKEN` (Bearer),
`PYANCHOR_POLLINATIONS_REFERRER` (attribution), and
`PYANCHOR_POLLINATIONS_MODEL` (default `nova-fast` — Amazon Nova
Micro, the cheapest tool-capable model in your catalog at
~$0.000245/call vs `openai-fast` at ~$0.00055). v0.38.0 migrated
the adapter from the legacy `text.pollinations.ai/openai` endpoint
to `gen.pollinations.ai/v1/chat/completions` so the full ~36-model
catalog is reachable. v0.39.0 added a `search_replace(path, find,
replace)` patch-based edit tool so small models don't have to
re-emit the entire file for every change (closes a class of
truncation/quality bugs we hit on 200+ line files). v0.40.x added
host brand override (`data-pyanchor-brand-icon-url` /
`data-pyanchor-brand-name` on the bootstrap script) so each
deployment can put their own logo + name in the in-page overlay,
and explicit response-language detection so a user prompt in
Korean / Japanese / etc. gets a same-language `done` summary back.

Why this matters for Pollinations: pyanchor is positioned as
"self-hosted, prod-attached, free-of-vendor-lock-in", and the
Pollinations adapter is the only built-in option that requires
**no account, no SDK install, no API key purchase** to start —
which mirrors Pollinations' own thesis. Every pyanchor user we
onboard via the demo at <https://pyanchor.pyan.kr> is one more
deployment with a Pollinations integration baked in.

- Source: <https://github.com/pyanchor/pyanchor>
- Adapter: [`src/agents/pollinations.ts`](https://github.com/pyanchor/pyanchor/blob/main/src/agents/pollinations.ts)
- Setup doc: [`docs/pollinations-setup.md`](https://github.com/pyanchor/pyanchor/blob/main/docs/pollinations-setup.md)
- Adapter matrix: [`docs/adapters.md`](https://github.com/pyanchor/pyanchor/blob/main/docs/adapters.md)
- npm: <https://www.npmjs.com/package/pyanchor>
- Demo / landing: <https://pyanchor.pyan.kr>

## App URL

<https://pyanchor.pyan.kr>

(Self-hosted demo / landing page. The live overlay is wired to a
sample app on the same host so reviewers can click → describe →
apply without local setup.)

## Email / Other Contact

- Email: shkm1420@gmail.com
- GitHub: <https://github.com/ikellllllll>
- Discord: pyanchor-author (DM open)

## Optional fields

- **GitHub repository**: <https://github.com/pyanchor/pyanchor>
  (MIT, public, regular releases on npm — current version 0.40.2.
  Pollinations-relevant release path: v0.36.0 introduced the
  adapter; v0.37.0 added HMAC-signed gate cookies + the sidecar
  `/_pyanchor/unlock` endpoint the reviewer URL below uses;
  v0.38.0 migrated to `gen.pollinations.ai/v1/chat/completions`;
  v0.39.0 added the `search_replace` patch-based edit tool;
  v0.40.0 added host brand override; v0.40.1 / v0.40.2 added
  explicit user-prompt-language detection so non-English prompts
  get same-language summaries.)
- **App language**: English (with Korean README at
  [`README-ko.md`](https://github.com/pyanchor/pyanchor/blob/main/README-ko.md)).

## Tier requested

🌸 **Flower** — the default `nova-fast` model is the cheapest
tool-capable option in your catalog (~$0.000245/call, ~$0.0012
per typical 5-call edit cycle), so the dominant pyanchor use
case (small UI tweaks) fits the anonymous quota for a handful of
users. Heavier multi-file edits or sustained demo traffic still
hit the wall fast, though. A Flower allocation (≈10 pollen/day on
the developer account that owns the `pyanchor.pyan.kr` referrer)
covers normal demo traffic and lets us advertise Pollinations as
the recommended "zero-install" backend in the README.

## Verification

The adapter is shipped on `main` and bundled into npm. Reviewers
can verify in three ways:

1. **Static**: open
   <https://github.com/pyanchor/pyanchor/blob/main/src/agents/pollinations.ts>
   and grep for `gen.pollinations.ai/v1/chat/completions`.
2. **Bundle**: `npm pack pyanchor && tar -xOf pyanchor-*.tgz
   package/dist/worker/runner.cjs | grep -c PYANCHOR_POLLINATIONS`
   → returns 5 (one per env var).
3. **Live**: one-click reviewer unlock URL — see the contact email
   for the secret. The unlock URL hits the v0.37.0 sidecar
   `/_pyanchor/unlock` route, which validates the secret server-
   side, issues a 30-day HMAC-signed JWT cookie, and 302-redirects
   to the demo. From there: click the floating pyanchor button
   (uses our brand icon thanks to v0.40.0), point at any heading,
   type a short instruction (e.g. "make this blue", or "이 헤딩을
   파란색으로 만들어줘" — both work), and hit enter. The change
   is rsynced into the live deploy by the sidecar and the page
   reloads.

   **Note on the network tab**: the Pollinations API call is
   server-side from the pyanchor sidecar, NOT browser-side. So
   the only outbound request the browser sees is `POST /_pyanchor/api/edit`
   to the sidecar. The actual `POST gen.pollinations.ai/v1/chat/completions`
   call (with `Authorization: Bearer sk_...`,
   `Referer: https://pyanchor.pyan.kr`, `model: "nova-fast"`) goes
   from the sidecar's worker process. To verify it really hits
   Pollinations, the audit log
   (`/var/lib/pyanchor-demo/state/audit.jsonl`) records every job
   with `agent: "pollinations"`, and we can share `journalctl -u
   pyanchor-demo` excerpts on request that show the outbound
   fetch.

   The unlock secret is **not** included in this public submission
   body — it's emailed separately so reviewers don't need to share
   it with the public, and so we can rotate it after review without
   touching the GitHub issue. (If preferred, we can make the URL
   public for the review window — let us know on the issue and we
   will edit this section to include it inline.)

Thanks for the open infrastructure 🌱
