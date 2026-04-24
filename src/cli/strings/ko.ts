/**
 * Korean CLI strings (v0.35.0).
 *
 * Translation policy:
 *   - 일반 안내 / 헤더 / prompt 질문은 한국어
 *   - 기술 용어 (CLI 명령, env 변수, 파일 경로, JSON 키, 코드
 *     키워드)는 영문 그대로
 *   - 줄임말 안 씀 — pyanchor를 py로 안 부르듯이
 *   - 존댓말 통일 (반말 X)
 *
 * Missing keys silently fall back to English (see i18n.ts).
 */

export const strings: Record<string, string> = {
  // ─── shared ─────────────────────────────────────────────
  "common.ok": "정상",
  "common.fail": "실패",
  "common.warn": "주의",

  // ─── doctor ─────────────────────────────────────────────
  "doctor.title": "pyanchor doctor — 로컬 설정 진단",
  "doctor.subtitle":
    "(사이드카를 시작하지는 않습니다. 시작 시 무엇을 보게 될지만 점검합니다)",
  "doctor.dotenv.loaded": "로드됨: {files} (cwd dotenv 자동 로드)",
  "doctor.group.required": "필수 환경 변수",
  "doctor.group.fs": "파일 시스템",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "출력 모드: {mode}",
  "doctor.group.optional": "선택 옵션",
  "doctor.summary.allOk":
    "필수 검사 모두 통과 ({passed}/{total} 정상{warnSuffix}). `pyanchor` 실행 준비 완료.",
  "doctor.summary.failed":
    "{failed}개 검사 실패, 경고 {warned}개, 정상 {passed}개 (총 {total}개). 위의 ✗ 항목을 수정한 뒤 `pyanchor doctor`를 다시 실행하세요.",
  "doctor.summary.warnSuffix": ", 경고 {warned}개",
  "doctor.summary.accessControlHint":
    "접근 제어(gate cookie, allowed origins, HMAC actor, 운영 환경 설정)는 docs/ACCESS-CONTROL.md를 참고하세요.",

  // ─── init ───────────────────────────────────────────────
  "init.title": "pyanchor init — 인터랙티브 스캐폴더",
  "init.detected": "  감지됨: {summary}",
  "init.error.noPackageJson":
    "\n이 디렉토리에 package.json이 없습니다. 앱 root에서 init을 실행하세요.",
  "init.prompt.agent": "어떤 agent를 사용하시겠어요?",
  "init.prompt.workspaceDir":
    "Workspace 디렉토리 (agent가 sync-back 전에 편집하는 scratch 공간)",
  "init.prompt.restartApproach":
    "Restart 방식 (편집 성공 후 프론트엔드를 어떻게 reload할지)",
  "init.prompt.pm2Name": "pm2 프로세스 이름",
  "init.prompt.systemctlUnit": "systemd unit 이름",
  "init.prompt.dockerContainer": "docker 컨테이너 이름",
  "init.prompt.port": "사이드카 port",
  "init.prompt.portBusy":
    "사이드카 port ({preferred}이 이미 사용 중 — {suggested}을 추천합니다)",
  "init.prompt.healthcheckUrl":
    "Healthcheck URL (프론트엔드가 다시 떴을 때 2xx를 반환하는 URL)",
  "init.prompt.requireGate":
    "운영용 gate cookie를 켤까요? (localhost가 아닌 경우 권장)",
  "init.prompt.outputMode": "출력 모드",
  "init.prompt.confirmApply": "이 변경 사항을 적용할까요?",
  "init.tokenReused":
    "  (기존 {envFile}의 PYANCHOR_TOKEN을 재사용 — 아래 bootstrap snippet이 디스크 내용과 일치)",
  "init.plan.header": "계획:",
  "init.dryRun": "(dry run — 파일을 쓰지 않습니다)",
  "init.dryRun.nextSteps": "실제로는 다음 단계가 진행됩니다:",
  "init.aborted": "취소됨 — 파일을 쓰지 않았습니다.",
  "init.done.header":
    "완료. 다음 단계 (소스 파일은 자동으로 patch하지 않습니다 — 망가뜨릴 위험이 큼):",
  "init.done.quickCheck":
    "빠른 점검 (방금 만든 .env가 자동 로드됩니다):",
  "init.done.startSidecar": "그 다음 사이드카 시작:",
  "init.done.prodHint":
    "  # (운영: 같은 환경 변수를 systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env 등으로 주입하세요)",
  "init.claudeCode.note":
    "\n  주의: claude-code는 in-process SDK (@anthropic-ai/claude-agent-sdk)를 사용합니다.\n        binary가 아니라 SDK입니다. init 후 추가로:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # 또는 Claude OAuth 사용\n        둘 다 없으면 `pyanchor doctor`가 경고합니다.",
  "init.forceWarning.intro":
    "\n⚠️  --force 옵션이 켜져 있습니다. PYANCHOR_TOKEN이 새로 생성됩니다.",
  "init.forceWarning.update":
    "    bootstrap script 태그의 data-pyanchor-token도 아래 새 값으로 업데이트하세요.",
  "init.forceWarning.401":
    "    그렇지 않으면 모든 overlay API 호출이 401을 받습니다.",

  // ─── logs ───────────────────────────────────────────────
  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "audit log를 {path}에서 찾을 수 없습니다. PYANCHOR_AUDIT_LOG=true로 설정하면 작성이 시작됩니다.",

  // ─── agent test ─────────────────────────────────────────
  "agentTest.title": "pyanchor agent test — adapter 1회 ping",
  "agentTest.summary.ok":
    "agent {agent}이 {ms}ms 만에 응답했습니다. 파이프라인 정상.",
  "agentTest.summary.fail":
    "agent {agent}이 정상 응답하지 않았습니다. 위 출력을 확인하세요."
};
