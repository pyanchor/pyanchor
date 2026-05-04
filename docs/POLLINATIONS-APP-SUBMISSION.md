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
`list_files` → `read_file` → `write_file` → `done` — against
pyanchor's scratch workspace. It honours `PYANCHOR_POLLINATIONS_TOKEN`
(Bearer), `PYANCHOR_POLLINATIONS_REFERRER` (attribution), and
`PYANCHOR_POLLINATIONS_MODEL` (default `nova-fast` — Amazon Nova
Micro, the cheapest tool-capable model in your catalog at
~$0.000245/call vs `openai-fast` at ~$0.00055). v0.38.0 migrated
the adapter from the legacy `text.pollinations.ai/openai` endpoint
to `gen.pollinations.ai/v1/chat/completions` so the full ~36-model
catalog is reachable.

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
  (MIT, public, regular releases on npm — current version 0.38.0;
  the Pollinations adapter shipped in v0.36.0, v0.36.1 / v0.36.2
  were docs catch-up patches, v0.37.0 added HMAC-signed gate
  cookies + the optional sidecar unlock endpoint that the
  reviewer URL below uses, and v0.38.0 migrated the adapter from
  the legacy `text.pollinations.ai/openai` endpoint to the new
  `gen.pollinations.ai/v1/chat/completions` gateway.)
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
   and grep for `text.pollinations.ai/openai`.
2. **Bundle**: `npm pack pyanchor && tar -xOf pyanchor-*.tgz
   package/dist/worker/runner.cjs | grep -c PYANCHOR_POLLINATIONS`
   → returns 5 (one per env var).
3. **Live**: one-click reviewer unlock URL — see the contact email
   for the secret. The unlock URL hits the v0.37.0 sidecar
   `/_pyanchor/unlock` route, which validates the secret server-
   side, issues a 30-day HMAC-signed JWT cookie, and 302-redirects
   to the demo. From there: click the floating pyanchor button,
   point at any heading, type a short instruction (e.g. "make this
   blue"), and hit enter. The browser Network tab will show `POST
   gen.pollinations.ai/v1/chat/completions` with `Referer:
   https://pyanchor.pyan.kr` plus an `Authorization: Bearer sk_...`
   header (Pyanchor's dedicated OSS-app token) and `model:
   "nova-fast"`. The edit is then rsynced into the live deploy by
   the sidecar and the page reloads with the change visible.

   The unlock secret is **not** included in this public submission
   body — it's emailed separately so reviewers don't need to share
   it with the public, and so we can rotate it after review without
   touching the GitHub issue. (If preferred, we can make the URL
   public for the review window — let us know on the issue and we
   will edit this section to include it inline.)

Thanks for the open infrastructure 🌱
