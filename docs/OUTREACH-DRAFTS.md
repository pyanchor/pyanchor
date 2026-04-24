# Outreach drafts (v0.34.0)

Pre-written posts the maintainer can copy-paste-publish to each
channel. All assume v0.34.0 is the latest npm publish + the live
demo at `pyanchor.pyan.kr` is up. Adjust dates / metrics as
needed.

---

## 1. Show HN

**Title** (≤80 chars, no clickbait):
> Show HN: Pyanchor – Click any element on your live site, type, get a PR

**Body** (4 short paragraphs):

```
I built Pyanchor because I was tired of being a "can you change
this copy" service desk. It's an Express sidecar you bolt onto
your running web app (Next.js / Vite / Astro / SvelteKit / Remix /
Nuxt). A one-line script tag injects an in-page overlay (Shadow
DOM, no CSS collisions). You point at any UI element, describe
the change in plain language, and your AI agent of choice does
the edit, builds the project, and either restarts the frontend
or opens a PR — all without anyone leaving the browser.

The wedge is "the page itself becomes the editor". Designers,
PMs, and backend devs can self-serve small UI tweaks; the
frontend team reviews PRs on its normal cadence. Set
PYANCHOR_OUTPUT_MODE=pr and there are no surprise prod writes.

5 agent backends (codex / claude-code / openclaw / aider / gemini)
swappable via one env var. 6 framework profiles built in. 9-layer
access control (token, origin, gate cookie, HMAC actor,
destructive-path guard, ...). MIT, self-hosted, no SaaS.

Live demo: https://pyanchor.pyan.kr (paste the magic-word URL
to set the gate cookie, then click any element).
GitHub: https://github.com/pyanchor/pyanchor
npm: https://www.npmjs.com/package/pyanchor (v0.34.0)

Happy to answer questions about the design — especially the
"why a sidecar instead of an IDE plugin" call and how the
9-layer access control plays with public-bind production.
```

Posting tips:
- Show HN posts do best when the maintainer is online to answer
  comments in the first hour. Schedule for a US-Pacific morning
  (~9-11am PT) for max throughput.
- Don't link your own social accounts in the body — Show HN
  rules.
- Have `pyanchor.pyan.kr` warm and gate-cookie-ready. First-time
  visitors who hit a 401 will bounce.

---

## 2. Reddit r/nextjs (or r/vuejs after the Nuxt profile)

**Title**:
> [Open source] Pyanchor — point at any element on your live Next.js app, type, get a PR

**Body**:

```
Built this to scratch my own itch. PMs and designers Slack me
"hey can you change the copy on the about page" 5 times a week,
and I'd rather they self-served.

Pyanchor is a small Express sidecar you `npm install --save-dev`
into a Next.js project. Add one `<script>` tag to your layout,
add the /_pyanchor proxy rewrite to next.config, and your live
site grows a click-to-edit overlay.

The overlay has 3 output modes:
- apply: rsync straight to the live app (fastest dev loop)
- pr: git push + gh pr create (review before live — 0 surprise
  writes)
- dryrun: build but don't apply (test the agent path)

5 AI agent backends (codex, claude-code, openclaw, aider, gemini)
— swap via one env var. Token-gated; 9-layer access control.
6 framework profiles built in (next/vite/astro/sveltekit/remix/nuxt).

Live demo: https://pyanchor.pyan.kr
GitHub: https://github.com/pyanchor/pyanchor
MIT.

Happy to answer questions about the Next.js integration
specifically — App Router + Pages router + custom-server +
edge runtime are all supported via the same /_pyanchor rewrite.
```

Posting tips:
- Cross-post to r/vuejs with the title rephrased ("...your live
  Nuxt app") and lean on the v0.34.0 Nuxt profile.
- r/javascript is broader; safer to wait until you have at least
  one external user posting positive feedback before going there.

---

## 3. Twitter / X (single post)

**280 chars or less**:

```
Pyanchor (v0.34.0): click any element on your live web app,
type the change, get a PR.

5 AI agent backends, 6 framework profiles, MIT, self-hosted.

Live: https://pyanchor.pyan.kr
GitHub: https://github.com/pyanchor/pyanchor

The page itself becomes the editor. No IDE, no SaaS.
```

Pin a follow-up thread:
1. Why a sidecar (not IDE plugin): you can't ask a designer to
   open Cursor. You can ask them to click a button on the live
   site.
2. Why agent-agnostic: model lock-in is bad. Swap codex / claude
   / aider with one env var.
3. Why output_mode=pr by default for teams: every change becomes
   reviewable. Frontend reviews on normal cadence. Zero surprise
   prod writes.
4. Why self-hosted: your code never leaves your infra. Important
   for any non-trivial team.

---

## 4. 한국 개발자 커뮤니티 (Korean dev communities)

타겟: GeekNews, OKKY 자유게시판, 디스콰이엇 (Disquiet), 페이스북 한국 dev 그룹.

**제목**:
> 라이브 웹앱에 element 클릭 → 자연어로 변경 → AI agent가 PR — 자체 호스팅 사이드카

**본문**:

```
프론트엔드 dev로 일하면서 "이거 좀 바꿔주세요" Slack 핑이 너무 많아서
주말에 만든 도구입니다.

Pyanchor는 Next.js / Vite / Astro / SvelteKit / Remix / Nuxt 같은
웹앱에 붙이는 작은 Express 사이드카예요. layout에 <script> 한 줄,
config에 /_pyanchor proxy 한 줄 추가하면 끝. 라이브 사이트에 click-
to-edit overlay가 생깁니다.

3가지 output 모드:
- apply: 라이브 앱에 바로 rsync (가장 빠른 dev 루프)
- pr: git push + gh pr create (리뷰 후 반영 — 깜짝 prod 쓰기 없음)
- dryrun: build만 (agent 흐름 테스트)

5개 AI 백엔드 (codex / claude-code / openclaw / aider / gemini) —
env 한 줄로 swap. token 인증 + 9-layer 접근 제어.

라이브 데모: https://pyanchor.pyan.kr
(매직워드 URL로 gate 쿠키 설정 후 element 클릭하면 codex로 라이브 편집)
GitHub: https://github.com/pyanchor/pyanchor
한국어 README: https://github.com/pyanchor/pyanchor/blob/main/README-ko.md

self-host. SaaS 아님. MIT.

PM/디자이너가 직접 작은 UI 수정 → 프론트엔드는 PR 리뷰만. 그게 진짜 의도.
```

---

## 채널 우선순위

1. **Show HN** — 가장 큰 첫 wave. v0.34.0이 안정적이고 데모가
   warm한 상태에서.
2. **r/nextjs + r/vuejs** — Show HN 다음 날. Show HN reaction을
   참고해서 본문 한 번 수정 가능.
3. **Twitter** — Show HN과 동시 (Show HN 링크 RT 형태).
4. **GeekNews / OKKY / Disquiet** — Show HN 일주일 후. 한국어
   README 링크가 있으니 의미 있음.

각 채널 publish 후 첫 1시간 동안 댓글 응답 가능한 시간대에 올릴 것.
무응답 = 죽은 글.

## 사후 추적

- npm 다운로드 그래프 (npm-stat.com/charts.html?package=pyanchor)
- GitHub stars 일별 변화 (star-history.com/#pyanchor/pyanchor)
- referrer 트래픽 (GitHub Insights → Traffic)
- 새 GitHub issues / discussions 알림 켜둘 것

추적 데이터로 다음 ship 우선순위 조정 (예: Vue/Nuxt 사용자 issue가
많이 들어오면 Nuxt profile 더 깊게).
