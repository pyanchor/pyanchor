# Free-D103 Frontend Codex Handoff

## 프로젝트 요약

- 프로젝트명: AIG (AI-based Integrated Ground)
- 메인 프론트: Next.js 14 App Router
- 운영 도메인: `https://studio.pyan.kr`
- 관리자용 AI edit 도메인: `https://studio-ai.pyan.kr`

## 현재 핵심 구조

### 메인 앱

- 루트 레이아웃: `app/layout.tsx`
- 메인 앱은 더 이상 React 기반 `AiEditFloat`를 렌더링하지 않음
- `NEXT_PUBLIC_AIG_DEVTOOLS_ENABLED=true`일 때만 `/_aig/bootstrap.js`를 주입
- `NEXT_PUBLIC_AIG_DEVTOOLS_ENABLED=false`면 AI edit 관련 UI가 전혀 렌더링되지 않음

### AI Edit sidecar

- 패키지 위치: `services/ai-edit-sidecar`
- 런타임 API:
  - `GET /_aig/bootstrap.js`
  - `GET /_aig/overlay.js`
  - `GET /_aig/api/status`
  - `POST /_aig/api/edit`
- 관리자 API:
  - `GET /`
  - `GET /api/admin/health`
  - `GET /api/admin/state`
- 오버레이는 vanilla TS + Shadow DOM
- worker는 OpenClaw workspace 수정, build 검증, appDir 동기화, frontend 재시작까지 담당

## 서버 경로 / 프로세스

| 항목 | 값 |
| --- | --- |
| repo root | `/home/studio/apps/Free-D103-Frontend` |
| frontend pm2 | `studio-pyan-frontend` |
| frontend port | `3002` |
| sidecar pm2 | `aig-ai-edit-sidecar` |
| sidecar port | `3010` |
| ai-edit state | `/home/studio/logs/ai-edit/state.json` |
| workshop state | `/home/studio/logs/preview-workshop/state.json` |
| app dir lock | `/home/studio/logs/app-dir.lock` |
| OpenClaw bin | `/home/openclaw-studio/.openclaw/bin/openclaw` |
| OpenClaw user | `openclaw-studio` |
| ai-edit workspace | `/home/openclaw-studio/ai-edit-workspace` |
| frontend restart script | `/home/studio/deploy/restart-frontend.sh` |

## 빌드 / 검증

로컬에서 확인한 항목:

- `yarn install`
- `yarn build`
- `yarn build:sidecar`
- `yarn tsc -p services/ai-edit-sidecar/tsconfig.json --noEmit`

`next build` 결과에서 기존 `/api/ai-edit*` 라우트는 사라졌고, workshop 라우트만 남아 있어야 정상입니다.

## 주의할 점

- AI edit와 workshop은 모두 appDir 동기화가 걸려 있으므로 `app-dir.lock` 충돌을 항상 의식해야 함
- sidecar 변경만 있을 때는 메인 Next build 없이 sidecar build/restart만 하면 됨
- 실제 앱 코드가 바뀌는 AI edit 작업은 여전히 대상 앱 rebuild/restart 비용이 있음
- 실서비스 배포에서는 `NEXT_PUBLIC_AIG_DEVTOOLS_ENABLED=false`를 기본값으로 유지하는 것이 맞음

## 다음 작업 후보

- 서버 nginx를 `studio.pyan.kr/_aig/* -> 127.0.0.1:3010`으로 연결
- `studio-ai.pyan.kr -> 127.0.0.1:3010` 관리자 표면 연결
- sidecar pm2 프로세스 생성 및 자동 재시작 설정
- AI edit admin 화면에서 최근 로그/히스토리까지 보여주기
