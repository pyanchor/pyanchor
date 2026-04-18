# AIG Frontend Prototype

`PJT/ref`의 설계 문서와 화면 초안을 바탕으로 만든 AIG 프론트 프로토타입입니다.

## Stack

- Next.js 14 App Router
- TypeScript
- Zustand
- React Query
- Monaco Editor
- Custom CSS

## Commands

```bash
yarn install
yarn dev
yarn build
yarn build:sidecar
yarn build:all
```

## AI Edit 구조

메인 앱은 개발용 AI 수정 UI를 직접 렌더링하지 않습니다.

- 메인 앱: `app/layout.tsx`에서 bootstrap script만 env 기준으로 주입
- sidecar: `services/ai-edit-sidecar`
  - 관리자 표면: `studio-ai.pyan.kr`
  - 런타임 표면: `studio.pyan.kr/_aig/*`
  - worker: OpenClaw workspace 수정, build 검증, appDir 동기화, frontend 재시작

개발 환경에서 attach:

```bash
NEXT_PUBLIC_AIG_DEVTOOLS_ENABLED=true
NEXT_PUBLIC_AIG_DEVTOOLS_BASE_URL=/_aig
```

실서비스에서는 아래처럼 끄는 것이 기본입니다.

```bash
NEXT_PUBLIC_AIG_DEVTOOLS_ENABLED=false
```

## Deployment

로컬에서 서버 재배포:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-to-studio.ps1
```

기본 동작:

1. 서버 repo에서 `git pull --ff-only`
2. `yarn install --frozen-lockfile`
3. `yarn build`
4. `yarn build:sidecar`
5. `studio-pyan-frontend` 재시작
6. `aig-ai-edit-sidecar` 재시작

## 주요 경로

- 메인 앱 루트: `/home/studio/apps/Free-D103-Frontend`
- 메인 앱 포트: `127.0.0.1:3002`
- sidecar 포트: `127.0.0.1:3010`
- 메인 앱 도메인: `https://studio.pyan.kr`
- sidecar 관리자 도메인: `https://studio-ai.pyan.kr`
