<div align="center">

# Pyanchor 🦞

**웹 앱용 agent-agnostic AI 라이브 편집 사이드카.**
*실행 중인 앱에 직접 편집을 anchor — Next.js, Vite, 또는 직접 만든 스택.*

[![npm version](https://img.shields.io/npm/v/pyanchor.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/pyanchor)
[![npm downloads](https://img.shields.io/npm/dm/pyanchor.svg?style=flat-square)](https://www.npmjs.com/package/pyanchor)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![Pollinations OSS app](https://img.shields.io/badge/pollinations.ai-flower--tier-7c6cf6?style=flat-square)](https://github.com/pollinations/pollinations/issues/10670)

<br />

<a href="https://pyanchor.pyan.kr">
  <img src="https://pyanchor.pyan.kr/pyanchor-demo-ko.gif" alt="Pyanchor 데모: 우하단 floating overlay → 한국어 prompt로 버튼 라벨 변경 → agent가 install / src/App.tsx 편집 / build / reload → 새 라벨이 라이브 페이지에 표시. 약 30초." width="900" />
</a>

<sub>라이브 데모: <a href="https://pyanchor.pyan.kr"><strong>pyanchor.pyan.kr</strong></a> — 같은 흐름, 6개 agent backend (openclaw / claude-code / codex / aider / gemini / pollinations) 중 Pollinations는 install 0.</sub>

<br /><br />

[**English**](./README.md) · [**문서**](#-문서) · [**빠른 시작**](#-빠른-시작) · [**지원 agent**](#지원-agent) · [**보안**](#-보안)

</div>

---

> Pyanchor는 실행 중인 웹 앱(Next.js / Vite / Astro / 또는 install + build
> 명령이 있는 어떤 스택)에 붙이는 작은 Express 사이드카입니다.
> 한 줄짜리 `<script>` 태그가 페이지 안에 overlay를 주입(Shadow DOM, 스타일
> 충돌 없음)하고, 사용자는 UI element를 가리킨 뒤 자연어로 변경을 설명하면,
> AI 코딩 agent가 편집 → build → 프론트엔드 재시작 또는 PR 생성까지 — 누구도
> 브라우저를 떠나지 않고 끝납니다.

**self-host + prod-attached** 워크플로우용. SaaS도, IDE 플러그인도 아님.

## 누구를 위한가?

세 가지 겹치는 use case. pyanchor가 셋 다 다루는 이유는 **페이지 자체가
에디터가 된다**는 wedge 때문 — IDE 필요 없음.

- **자기 deploy를 직접 dogfood하는 솔로 dev.** "보고 → 클릭 →
  ship" 가장 빠른 루프. `apply` 모드는 라이브 앱에 직접 rsync.
- **"이거 좀 바꿔주세요" 콜센터에 지친 프론트엔드 dev.** 요청자에게
  token 하나 쥐어주고, 페이지 가리키게 하고, 셀프 서비스시키세요.
  `PYANCHOR_OUTPUT_MODE=pr` 설정하면 모든 편집이 PR로 → 평소 cadence로
  review만 → 깜짝 prod 쓰기 없음.
- **디자이너, PM, 백엔드 dev** — 프론트엔드 팀 안 건드리고 작은 UI
  변경만 직접 하고 싶은 사람들. 페이지 열고, floating 버튼 클릭,
  "이 버튼 보라색으로 + 로딩 스피너 추가" 입력 → 1분 안에 PR.

마지막이 진짜 pyanchor를 만든 이유. *"about 페이지 카피 좀 바꿔줘"*
Slack ping에 지친 author가 만들었음. 이제 요청자가 직접 하고, 프론트엔드는
PR review만.

## Cursor / v0 / Lovable 대신 왜 이걸?

|              | 어디서 동작           | 무엇을 편집           | 누가 편집할 수 있나                          |
| ------------ | --------------------- | --------------------- | -------------------------------------------- |
| Cursor       | 에디터                | 워크스페이스의 파일   | IDE를 켠 dev                                 |
| v0 / Lovable | 벤더 클라우드         | 새로 만드는 앱        | 벤더 계정 소유자                             |
| **Pyanchor** | 지금 보고 있는 페이지 | 이미 ship한 앱        | **token + (선택) PR review를 가진 누구나**   |

스테이징의 라이브 로그인 페이지를 가리키며 *"다크 모드로 바꿔"*라고
하고 싶은데, 코드는 절대 인프라 밖으로 나가면 안 되고, Cursor seat 가진
사람만 쓸 수 있는 게 아니어야 한다면 — 이게 맞습니다.

## 동작 원리

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  당신의 웹 앱            │     │  Pyanchor 사이드카        │
│  (Next.js / Vite /      │     │  (port 3010, localhost)  │
│   Astro / 직접 스택)     │     │                          │
│                         │     │  Express 서버             │
│  layout/index 주입:      │     │   /_pyanchor/bootstrap.js│
│   <script               │ ──> │   /_pyanchor/overlay.js  │
│     src="/_pyanchor/    │     │   /_pyanchor/api/edit    │
│     bootstrap.js"       │     │   /api/admin/*           │
│     defer />            │     │   /healthz + /readyz     │
│                         │     │                          │
│  Shadow DOM overlay     │     │  Workspace + Worker      │
│  → 클릭 → 프롬프트       │ <── │   AgentRunner adapter    │
│                         │     │   (codex/claude/...)     │
└─────────────────────────┘     │   build + apply / PR     │
                                └──────────────────────────┘
```

## 🚀 빠른 시작

```bash
# 1. 설치 (dev dep — pyanchor는 dev-time 사이드카, prod 번들 미포함)
npm install --save-dev pyanchor

# 2. 인터랙티브 init — 7개 prompt를 enter로 다닥
npx pyanchor init

# 3. 진단 — 자동으로 cwd .env 로드
npx pyanchor doctor

# 4. 사이드카 시작
npx pyanchor

# 5. init이 알려준 bootstrap script 태그 + dev proxy 1줄씩
#    layout.tsx (Next.js) / index.html (Vite) / Base.astro (Astro) 등에 paste

# 6. 일반 dev 명령으로 앱 띄우기 (npm run dev / pnpm dev)
#    브라우저: 우하단 anchor 아이콘 → 클릭 → 프롬프트 입력 → 30초 안에 편집 적용
```

5개 필수 env (`pyanchor init`이 자동 작성):
- `PYANCHOR_TOKEN` — bearer auth secret
- `PYANCHOR_AGENT` — `codex` / `claude-code` / `openclaw` / `aider` / `gemini` / `pollinations`
- `PYANCHOR_APP_DIR` — 당신 앱의 root
- `PYANCHOR_WORKSPACE_DIR` — agent가 편집하는 scratch 디렉토리
- `PYANCHOR_RESTART_SCRIPT` — 편집 후 프론트엔드 reload 방법

나머지 ~60개 env는 모두 sensible default 있음. `.env.example` 참고.

## 지원 agent

6개 백엔드. `PYANCHOR_AGENT=<name>` 한 줄로 swap.

| Agent           | 설치                                                 | 인증                                |
| --------------- | ---------------------------------------------------- | ----------------------------------- |
| `codex`         | `npm i -g @openai/codex`                             | `codex login` (ChatGPT account 또는 OpenAI API key) |
| `claude-code`   | `npm i @anthropic-ai/claude-agent-sdk`               | `ANTHROPIC_API_KEY` 또는 Claude OAuth |
| `openclaw`      | OpenClaw 자체 설치 (per-agent profiles)              | OpenClaw OAuth                      |
| `aider`         | `pip install aider-chat`                             | `OPENAI_API_KEY` 등                 |
| `gemini`        | `npm i -g @google/gemini-cli`                        | `GEMINI_API_KEY` 또는 `gemini auth login` |
| `pollinations`  | **CLI 설치 불필요** (HTTP-only, v0.36.0+)            | 익명 IP 한도 / `PYANCHOR_POLLINATIONS_TOKEN=sk_...` Bearer |

## 지원 framework

5개 first-class profile + override path. `PYANCHOR_FRAMEWORK=<name>`.

| Framework   | install                            | build              | 워크스페이스 제외 |
| ----------- | ---------------------------------- | ------------------ | ----------------- |
| `nextjs`    | `corepack yarn install --frozen…`  | `next build`       | `.next`           |
| `vite`      | `npm install`                      | `npm run build`    | `dist`, `.vite`   |
| `astro`     | `npm install`                      | `npx astro build`  | `dist`, `.astro`  |
| `sveltekit` | `npm install`                      | `npm run build`    | `.svelte-kit`, `build`, `dist`, `.vite` |
| `remix`     | `npm install`                      | `npm run build`    | `build`, `.cache` |
| `nuxt`      | `npm install`                      | `npx nuxt build`   | `.nuxt`, `.output`, `dist` |

다른 스택은 `PYANCHOR_INSTALL_COMMAND` + `PYANCHOR_BUILD_COMMAND` env로
override.

## 출력 모드

| 모드     | 동작                                                              |
| -------- | ----------------------------------------------------------------- |
| `apply`  | workspace → app dir rsync + restart 스크립트 실행 (기본)          |
| `pr`     | git push + `gh pr create` (자동 merge 안 함; 사람이 review)       |
| `dryrun` | build만; rsync도 PR도 안 함 (agent 흐름 검증용)                   |

`PYANCHOR_OUTPUT_MODE=<mode>` 또는 init prompt에서 선택.

## 보안

- **token = privilege**: `PYANCHOR_TOKEN`이 유일한 인증
- **9-layer 접근 제어** (`docs/ACCESS-CONTROL.md`): token → bind →
  origin → trusted hosts → gate cookie → bootstrap fail-safe →
  reverse proxy → systemd IPAddress → HMAC actor signing
- **non-loopback bind는 origin 허용목록 필수** (v0.18.0+, fail-closed)
- **destructive path guard** (v0.33.0+): system dir (`/`, `/home`,
  `/var`, ...) 거부 → typo로 `rm -rf`되는 사고 방지
- **provenance attested**: 모든 npm tarball은 Sigstore + GitHub
  Actions로 signed (`npm view pyanchor@latest --json | jq
  '.dist.attestations'`)

자세한 위협 모델 + 책임 있는 공개 → [`.github/SECURITY.md`](./.github/SECURITY.md).

## 📚 문서

- [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) — 증상 →
  진단 빠른 매핑
- [`docs/PRODUCTION-DEPLOYMENT.md`](./docs/PRODUCTION-DEPLOYMENT.md)
  — systemd / Docker / Coolify 배포 레시피
- [`docs/ACCESS-CONTROL.md`](./docs/ACCESS-CONTROL.md) — 9-layer
  접근 제어 자세히
- [`docs/codex-setup.md`](./docs/codex-setup.md) — codex 백엔드
- [`docs/claude-code-setup.md`](./docs/claude-code-setup.md) —
  claude-code 백엔드
- [`docs/openclaw-setup.md`](./docs/openclaw-setup.md) — openclaw
- [`docs/aider-setup.md`](./docs/aider-setup.md) — aider
- [`docs/gemini-setup.md`](./docs/gemini-setup.md) — gemini
- [`docs/pollinations-setup.md`](./docs/pollinations-setup.md) — pollinations (HTTP-only)
- [`docs/integrate-with-vite.md`](./docs/integrate-with-vite.md) —
  Vite 통합 자세히

## 라이브 데모

[`https://pyanchor.pyan.kr`](https://pyanchor.pyan.kr) — recipe 1
(systemd + nginx + magic-word gate cookie + 정적 React)로 운영 중.
gate 쿠키 발급 후 페이지 element 클릭하면 codex 백엔드로 라이브 편집
사이클 동작.

## 라이선스

MIT. © PYAN.

## 영문 문서

전체 영문 README는 [`README.md`](./README.md) — 이 한국어 README는
핵심 섹션만 번역.
