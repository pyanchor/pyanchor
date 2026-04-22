# pyanchor v0.32.10 정적 감사 보고서

범위: `src/server.ts`, `src/config.ts`, `src/auth.ts`, `src/audit.ts`, `src/state.ts`, `src/agents/*`, `src/runtime/*`, `src/cli/*`, `src/worker/*` 중심 정적 read/grep 감사.

제약 준수: 테스트/실행/외부 HTTP 호출 없이 source만 읽었다. `src/*`, `dist/*`, `examples/*`는 수정하지 않았다.

요약: P0 0건, P1 5건, P2 10건, by-design 5건.

## Findings

### [P1] concurrency: `state.json` read-modify-write lock 부재로 중복 runner/lost update 가능
위치: `src/state.ts:237-246`, `src/state.ts:250-370`, `src/state.ts:380-469`, `src/worker/state-io.ts:52-72`, `src/worker/lifecycle.ts:127-161`

문제: `writeAiEditState()`와 worker-side `writeStateUnlocked()`는 atomic rename을 쓰지만, read-modify-write 전체를 보호하는 lock/CAS가 없다. 서버 프로세스의 `startAiEdit()`와 `readAiEditState()`가 같은 idle/queue snapshot을 동시에 읽으면 둘 다 runner를 spawn할 수 있다. worker와 server도 같은 `state.json.tmp` 파일명을 공유해서 동시 write 시 rename 순서에 따라 lost update 또는 `ENOENT`가 날 수 있다.

재현/시나리오: 인증된 두 `/api/edit` 요청이 거의 동시에 들어오면 둘 다 `current.status === idle`을 보고 각각 worker를 spawn한다. 마지막 write가 `pid`를 덮어써서 다른 child는 state에서 추적되지 않지만 workspace/app sync는 계속 진행할 수 있다. 비슷하게 `/api/status` poll 두 개가 idle+queue 상태를 동시에 보면 같은 queued job을 중복 dequeue할 수 있다.

제안 fix: 서버 `state.ts`에도 worker `createStateIO()` 같은 process-local mutex를 두고, server/worker 간에는 `flock` 또는 state-file adjacent lock으로 RMW 전체를 serialize한다. temp 파일명은 `${stateFile}.${pid}.${randomUUID()}.tmp`처럼 unique하게 만들고, write 전후에 `jobId`/`updatedAt` CAS를 확인한다.

### [P1] path traversal: `targetPath`가 Aider explicit file args로 workspace 밖 파일을 지정할 수 있음
위치: `src/state.ts:43-50`, `src/frameworks/nextjs.ts:11-24`, `src/frameworks/vite.ts:6-54`, `src/frameworks/astro.ts:10-45`, `src/frameworks/remix.ts:11-47`, `src/frameworks/sveltekit.ts:9-43`, `src/agents/aider.ts:69-78`, `src/agents/aider.ts:125-128`

문제: `/api/edit`는 `targetPath`가 string인지까지만 확인하고, framework profile의 `normalizeRoute()`는 leading/trailing slash만 제거한다. 이후 `aider.ts`가 `path.join(workspaceDir, rel)`로 candidate를 만들고 존재하면 absolute path를 `aider` argv에 넣는다. `targetPath`에 `..` segment가 있으면 candidate가 workspace 밖으로 escape할 수 있다.

재현/시나리오: Aider backend에서 인증된 API client가 `targetPath: "/../../../../home/app/other-project/secret"` 같은 값을 보내고, profile candidate가 실제 외부 `*.tsx|*.jsx|*.ts|*.js` 파일과 맞아떨어지면 Aider가 workspace 밖 파일을 explicit edit target으로 받는다. token 보유자가 원래 app workspace edit 권한을 갖더라도, 이 경로는 pyanchor의 workspace confinement contract를 넘어선다.

제안 fix: `/api/edit`에서 `targetPath`를 URL path 형태로 제한하고 `.`/`..`, backslash, NUL, drive-letter, percent-decoded traversal을 거부한다. `guessFilesForRoute()`에서도 `const abs = path.resolve(workspaceDir, rel)` 후 `path.relative(workspaceDir, abs)`가 `..`로 시작하거나 absolute면 후보를 버리는 defense-in-depth를 둔다.

### [P1] command injection: `commandExists()`가 env-controlled binary name을 `shell: true`로 확인
위치: `src/cli/main.ts:38-50`, `src/cli/load-env.ts:95-127`, `src/config.ts:331-340`, `src/cli/doctor.ts:304-315`, `src/cli/doctor.ts:336-356`

문제: `pyanchor doctor`, sidecar default path, `agent test`, `logs`는 cwd `.env.local`/`.env`를 자동 load한다. 이후 `commandExists(command)`가 POSIX에서 `spawnSync("command", ["-v", command], { shell: true })`를 호출한다. `PYANCHOR_CODEX_BIN`, `PYANCHOR_AIDER_BIN`, `PYANCHOR_GEMINI_BIN`, `PYANCHOR_OPENCLAW_BIN`, `PYANCHOR_GIT_BIN`, `PYANCHOR_GH_BIN` 같은 env 값이 shell metacharacter를 포함하면 PATH lookup 단계에서 command injection 표면이 생긴다.

재현/시나리오: 사용자가 untrusted repo에서 `pyanchor doctor`를 실행했는데 repo `.env`가 `PYANCHOR_CODEX_BIN=codex; touch /tmp/pwned`처럼 설정되어 있으면, doctor의 CLI resolve check가 shell을 경유한다. 실제 exploitability는 Node의 shell arg quoting 세부 구현에 좌우되지만, 이 코드는 애초에 shell이 필요 없는 binary existence check에 shell을 열고 있어 위험하다.

제안 fix: `shell: true`를 제거한다. POSIX에서는 `spawnSync("sh", ["-c", "command -v -- \"$1\"", "sh", command])`처럼 value를 positional arg로 넘기거나, 더 단순히 basename은 안전한 allowlist regex로 제한하고 path-shaped 값은 기존 `executablePathExists()`로만 확인한다.

### [P1] destructive path safety: `workspaceDir`/`appDir` 오설정 시 `rm -rf`, `rsync --delete`, `chown -R` 피해 가능
위치: `src/config.ts:425-491`, `src/worker/workspace.ts:113-141`, `src/worker/workspace.ts:182-205`, `src/worker/output.ts:96-100`

문제: `validateConfig()`는 required env와 non-loopback origin만 검증하고, mutable path의 안전성은 확인하지 않는다. worker는 `PYANCHOR_FRESH_WORKSPACE=true`일 때 `sudo rm -rf config.workspaceDir`를 실행하고, sync-back은 `rsync --delete`와 `sudo chown -R config.appDirOwner config.appDir`를 실행한다. `workspaceDir=/`, `workspaceDir==appDir`, `workspaceDir`가 app parent, `appDir=/home` 같은 오설정을 막지 않는다.

재현/시나리오: 운영자가 `.env` typo로 `PYANCHOR_WORKSPACE_DIR=/tmp` 또는 `/`에 가깝게 잡고 fresh workspace를 켜면 worker 시작 시 broad delete가 실행될 수 있다. `PYANCHOR_APP_DIR`이 잘못 넓게 잡히면 sync-back과 recursive chown이 의도 밖 파일을 건드린다.

제안 fix: `validateConfig()`에 `assertSafeMutablePath()`를 추가한다. `/`, homedir, stateDir parent, serviceRoot, appDir와 동일/상하위 overlap, relative path, symlink-resolved overlap을 reject한다. destructive 작업 전에는 workspace sentinel file 예: `.pyanchor-workspace` 존재를 요구하고, 없으면 `rm -rf`/`rsync --delete`를 중단한다.

### [P1] shutdown: server SIGTERM/SIGINT가 detached worker를 cancel하지 않음
위치: `src/state.ts:207-230`, `src/server.ts:512-523`, `src/worker/runner.ts:410-416`

문제: `spawnRunner()`는 worker를 `detached: true`, `stdio: "ignore"`로 띄우고 `unref()`한다. 서버 shutdown handler는 HTTP server close 후 즉시 `process.exit()`만 호출한다. 따라서 터미널 `Ctrl+C`, supervisor stop, deploy restart 시 active worker가 살아남아 agent/build/rsync/restart를 계속할 수 있다.

재현/시나리오: 사용자가 edit 시작 직후 sidecar를 종료한다. UI/API는 내려갔지만 detached worker는 계속 workspace를 변경하고 apply mode에서는 appDir sync/restart까지 진행할 수 있다. systemd `KillMode=control-group`에서는 운 좋게 같이 죽을 수 있지만, Node CLI 직접 실행 경로에서는 orphan 가능성이 남는다.

제안 fix: server가 active runner pid를 state에서 읽어 shutdown 시 `SIGTERM`을 보내고 짧은 grace 후 `SIGKILL`한다. 또는 “server restart across active jobs”를 의도한 contract로 명시하고, 상태에 `server_stopping`/`orphaned` 표시와 recovery policy를 둔다. 기본 안전값은 stop 시 cancel이다.

### [P2] API contract: `/api/cancel` body 검증 누락으로 malformed JSON이 500이 될 수 있음
위치: `src/server.ts:345-354`, `src/state.ts:472-534`

문제: `/api/edit`는 v0.32.7에서 body shape을 400으로 검증하지만 `/api/cancel`은 `request.body as AiEditCancelInput` 후 바로 `cancelAiEdit()`에 넘긴다. `null` body는 `input.jobId` 접근에서 throw하고, `{ "jobId": 123 }`은 `.trim()` call에서 TypeError가 날 수 있다.

재현/시나리오: 인증된 client가 `POST /_pyanchor/api/cancel`에 JSON `null` 또는 `{"jobId":123}`을 보내면 사용자 오류인데 500으로 응답할 가능성이 높다. `{}`가 “current/latest cancel”인지는 코드상 의도처럼 보이지만 API contract에 명확히 드러나지 않는다.

제안 fix: route에서 `body === undefined || body === null || typeof body === "object"`를 확인하고, `jobId`가 있으면 string인지 검증한다. invalid는 400. `{}` cancel semantics는 docs/API type에 명시한다.

### [P2] API contract: prompt length/configuration 오류가 500으로 매핑됨
위치: `src/server.ts:312-328`, `src/state.ts:381-394`

문제: route는 prompt 존재 여부만 400으로 처리한다. `startAiEdit()` 내부의 `prompt.length > PYANCHOR_PROMPT_MAX_LENGTH`와 `!isPyanchorConfigured()`는 plain `Error`를 throw하고, `asyncRoute` global handler가 500으로 변환한다. 길이 초과는 400 또는 413, sidecar not configured는 503에 가깝다.

재현/시나리오: 사용자가 긴 prompt를 붙여넣으면 서버 문제가 아닌 client/request 문제인데 500으로 보인다. bootstrap 직후 readiness가 아직 false인 경우도 API contract상 503이 더 정확하다.

제안 fix: `/api/edit` route에서 prompt length를 `pyanchorConfig.promptMaxLength`로 사전 검증해 413 또는 400을 반환한다. `startAiEdit()`에는 typed error 또는 `{ status }`를 가진 error class를 사용해 `handleError()`가 status를 보존하게 한다.

### [P2] XSS: admin HTML의 `href` attribute에 env-derived `runtimeLink`가 escape 없이 삽입됨
위치: `src/admin.ts:11-13`, `src/admin.ts:181-184`, `src/config.ts:67-70`

문제: admin renderer는 대부분 `escapeHtml()`을 적용하지만 `<a href="${runtimeLink}">`의 attribute value는 escape하지 않는다. `runtimeBasePath`는 leading slash만 강제하고 quote/control 문자는 제한하지 않는다. admin page는 token-gated라 remote anonymous XSS는 아니지만, config-origin XSS sink다.

재현/시나리오: `PYANCHOR_RUNTIME_BASE_PATH='/_pyanchor\" onclick=\"alert(1)'` 같은 값이 들어가면 admin HTML attribute boundary를 깰 수 있다. `.env` auto-load와 결합하면 untrusted repo config가 admin page rendering에 영향을 준다.

제안 fix: `href="${escapeHtml(runtimeLink)}"`로 바꾸고, `normalizeBasePath()`에서 `^/[A-Za-z0-9._~/-]+$` 정도의 strict path regex를 적용한다. invalid base path는 `validateConfig()`에서 fail-fast한다.

### [P2] command injection/footgun: generated restart script가 process/unit/container name을 shell quote하지 않음
위치: `src/cli/init.ts:207-218`, `src/cli/templates.ts:114-130`

문제: `renderRestartScript()`는 `pm2`, `systemctl`, `docker` preset에서 `input.name`을 그대로 shell script에 삽입한다. `shellQuote()`는 env와 printed commands에는 쓰이지만 restart script command에는 쓰이지 않는다.

재현/시나리오: project directory 또는 prompt 입력값이 `my-app; touch /tmp/pwned` 같은 문자열이고 사용자가 non-noop restart preset을 선택하면, 생성된 `scripts/pyanchor-restart.sh`가 pyanchor apply 후 실행될 때 추가 shell command가 실행될 수 있다. `systemctl` preset은 `sudo`를 포함하므로 영향이 더 크다.

제안 fix: `${shellQuote(input.name)}`를 사용하거나, 각 preset별로 안전한 name regex를 적용한다. `systemctl` unit은 systemd unit name grammar, docker container는 Docker name grammar로 validate하는 편이 더 좋다.

### [P2] performance/DoS: rate limiter bucket map이 hard cap을 보장하지 않음
위치: `src/rate-limit.ts:21-62`, `src/server.ts:62-76`, `src/server.ts:104-109`

문제: `tokenBucketMiddleware()`는 `maxKeys`를 받지만 `pruneIfFull()`은 오래된 key만 제거한다. 60초 안에 서로 다른 IP key가 `maxKeys`를 초과하면 오래된 항목이 없어 map이 계속 커질 수 있다. `trust proxy=true` 또는 넓은 proxy trust 설정에서는 `X-Forwarded-For` churn으로 key cardinality를 키울 수 있다.

재현/시나리오: 공개 배포에서 proxy trust가 과하게 열려 있고 attacker가 매 요청 다른 forwarded IP를 주면 edit/cancel limiter map이 4096을 넘어 계속 증가한다. 요청 자체는 token/gate에서 걸릴 수 있지만 limiter middleware가 write endpoint 앞에서 실행되는 구조와 배치에 따라 memory pressure가 생길 수 있다.

제안 fix: expiry sweep 후에도 `buckets.size > maxKeys`면 oldest/random 절반을 강제로 drop한다. 가능하면 limiter key는 trusted proxy chain에서 검증된 client IP만 사용한다.

### [P2] concurrency: timeout 후 delayed `SIGKILL` timer를 close 시 취소하지 않음
위치: `src/worker/child-process.ts:83-87`, `src/agents/openclaw/exec.ts:125-135`

문제: timeout/abort path는 `SIGTERM` 후 nested `setTimeout(... SIGKILL ...)`을 예약하지만, child가 정상 종료되어도 이 nested timer를 clear하지 않는다. timer 실행 시점에 `child.pid`만 확인하고 `exitCode`/`signalCode`를 확인하지 않는다.

재현/시나리오: timeout 직후 child가 SIGTERM으로 종료됐는데 5초 내 PID가 재사용되면, 이론적으로 unrelated process에 SIGKILL을 보낼 수 있다. PID reuse window가 작아 P2지만, process supervisor/CI처럼 process churn이 높은 환경에서는 피하는 편이 맞다.

제안 fix: kill timer handle을 저장하고 `close`/`error`에서 clear한다. timer callback에서도 `child.exitCode !== null || child.signalCode !== null`이면 signal을 보내지 않는다.

### [P2] diagnostics: stdin synthetic stderr가 `close` 이후 도착하면 보존되지 않음
위치: `src/worker/child-process.ts:108-144`, `src/agents/openclaw/exec.ts:70-78`, `src/agents/openclaw/exec.ts:100-103`, `src/agents/openclaw/exec.ts:110-118`

문제: EPIPE 같은 stdin error를 stderr chunk로 보존하려는 의도는 좋지만, `close` event가 먼저 promise/iterator를 settle하면 이후 stdin error note는 thrown error/result에 반영되지 않는다. OpenClaw `streamSpawn()`은 `close` event를 yield하면 iterator가 return하므로, 뒤늦은 synthetic stderr는 queue에 들어가도 소비되지 않는다.

재현/시나리오: child가 stdin을 읽기 전에 빠르게 종료하고 `close`가 먼저 도착하면 사용자는 실제 root cause 없이 `exited with code`만 볼 수 있다. v0.8.x 계열에서 중요했던 diagnostic preservation이 current helper에도 순서 의존성을 갖는다.

제안 fix: stdin write/end를 `finished`/`error`와 close settlement 사이에 명시적으로 coordinate한다. 최소한 close handler에서 일정 microtask tick 동안 pending stdin error를 drain하거나, spawn failure/early close이면 synthetic note를 deterministic하게 붙인다.

### [P2] error handling: heartbeat interval write failure를 완전히 swallow
위치: `src/worker/runtime-buffer.ts:175-190`

문제: `withHeartbeat()`의 interval tick은 `void pulseState(...).catch(() => undefined)`로 실패를 묻는다. disk full, permission change, state dir unmount 같은 문제가 생기면 long-running job 동안 heartbeat가 멈춰도 stderr나 state에 신호가 남지 않는다. timer-driven buffer flush는 `onFlushError`로 stderr를 남기는데 heartbeat path는 같은 처리가 없다.

재현/시나리오: build가 오래 도는 중 state file write가 실패하면 overlay는 stale heartbeat를 보거나 job이 멈춘 것처럼 보인다. worker는 task를 계속 진행하고 나중에 finalize에서야 실패할 수 있다.

제안 fix: heartbeat interval catch도 `onFlushError`로 연결한다. 같은 에러를 rate-limit해서 stderr에 남기고, 가능하면 다음 successful write 때 activityLog에 “heartbeat write failed”를 남긴다.

### [P2] type safety: `pyanchor logs`가 JSON schema를 검증하지 않아 valid-but-invalid line에서 crash 가능
위치: `src/cli/logs.ts:126-140`, `src/cli/logs.ts:143-151`, `src/cli/logs.ts:180-192`

문제: `parseJsonl()`은 JSON syntax만 확인하고 `JSON.parse(line) as AuditEvent`로 cast한다. 이후 `renderEvent()`는 `e.ts.replace`, `e.outcome.padEnd`, `formatDuration(e.duration_ms)` 등을 바로 호출한다. syntactically valid JSON이지만 schema가 다른 line은 CLI crash를 유발할 수 있다.

재현/시나리오: audit log에 `{}` 또는 `{"ts":123}` 같은 줄이 섞이면 malformed line skip 정책과 달리 render 단계에서 throw한다. log rotation/수동 편집/외부 shipper 재주입에서 발생할 수 있다.

제안 fix: `isAuditEvent()` narrow를 추가해 필수 field type과 enum을 검증한다. invalid event는 `--json`에서는 원문 skip 또는 warning, table mode에서는 `(skipped invalid audit line)` 정도로 처리한다.

### [P2] UX correctness: render skip key가 queue item identity/order를 포함하지 않음
위치: `src/runtime/overlay.ts:237-268`, `src/runtime/overlay.ts:278-280`, `src/runtime/overlay.ts:392-394`

문제: v0.32.10 render skip cache는 `serverState.queue.length`만 key에 넣는다. render는 `trackedQueuePosition()`과 `canCancel` 계산에서 queue contents/order를 읽는다. queue length가 같지만 item identity/order가 바뀌는 상태 전환은 render가 skip될 수 있다.

재현/시나리오: queued job 하나가 cancel되고 거의 동시에 다른 job이 enqueue되어 depth가 1로 유지되면, 사용자 overlay가 이전 job의 queue position/cancel affordance를 유지할 수 있다. FIFO 보통 경로에서는 드문 edge라 P2다.

제안 fix: render key에 `serverState.queue.map((q) => [q.jobId, q.mode, q.enqueuedAt])` 정도를 포함한다. prompt 전문은 key 비용 때문에 제외해도 된다.

### [by-design] timing attack: bearer token/HMAC actor 비교는 현재 threat model에서 수용 가능
위치: `src/auth.ts:17-22`, `src/actor.ts:93-103`

문제: bearer token은 length mismatch에서 early return하고, equal length일 때 `crypto.timingSafeEqual()`을 사용한다. actor HMAC도 hex length/regex 확인 후 `timingSafeEqual()`을 사용한다.

재현/시나리오: token length 자체는 응답 시간으로 추정 가능할 수 있지만, token은 operator가 긴 random secret으로 설정하는 전제이고 실제 secret bytes는 constant-time 비교다.

제안 fix: 필수는 아니다. 굳이 harden한다면 configured token hash와 provided hash를 고정 길이로 비교해 length leak까지 없앨 수 있지만 현재 우선순위는 낮다.

### [by-design] SSRF: request body에서 outbound URL로 이어지는 경로는 보이지 않음
위치: `src/state.ts:169-183`, `src/webhooks.ts:162-188`, `src/config.ts:79`, `src/config.ts:251-256`

문제: outbound `fetch()`는 `PYANCHOR_HEALTHCHECK_URL`과 `PYANCHOR_WEBHOOK_*_URL`에서만 온다. `/api/edit` body의 `targetPath`나 `prompt`가 URL fetch target으로 쓰이는 경로는 보이지 않았다.

재현/시나리오: 운영자가 env에 internal metadata URL을 넣으면 SSRF처럼 동작할 수 있지만, pyanchor contract상 env는 trusted operator config다. remote authenticated user가 URL을 주입해 fetch시키는 경로는 확인되지 않았다.

제안 fix: by-design 유지 가능. hardening으로는 URL scheme을 `http:`/`https:`로 제한하고 webhook은 private IP deny 옵션을 제공하되, healthcheck는 loopback/private host가 정상 사용례라 blanket deny는 부적절하다.

### [by-design] command execution: install/build/restart command는 operator-owned shell hook
위치: `src/config.ts:101-115`, `src/worker/workspace.ts:144-171`, `src/worker/workspace.ts:208-210`

문제: `PYANCHOR_INSTALL_COMMAND`, `PYANCHOR_BUILD_COMMAND`, `PYANCHOR_RESTART_SCRIPT`는 shell execution surface지만 operator가 직접 지정하는 deployment hook이다. 사용자 prompt가 이 shell string에 concat되는 경로는 보이지 않았다.

재현/시나리오: malicious env를 넣으면 당연히 command execution이 가능하다. 이는 pyanchor를 실행하는 운영자가 shell hook을 설정하는 모델이다.

제안 fix: by-design으로 유지하되, doctor에서 “operator-owned command hook”임을 명확히 표시하고 production docs에 최소 권한 runner user를 강조한다.

### [by-design] origin allowlist empty on loopback: 경고는 맞고 fail-closed 범위도 합리적
위치: `src/server.ts:43-58`, `src/config.ts:471-490`, `src/origin.ts:21-42`

문제: `PYANCHOR_ALLOWED_ORIGINS`가 비어 있으면 origin middleware는 no-op이다. 다만 non-loopback bind에서는 `validateConfig()`가 fail-closed하고, loopback dev에서는 warning만 띄운다.

재현/시나리오: localhost dev workflow에서는 empty allowlist가 ergonomics를 높인다. public bind에서는 token/session-bearing cross-origin risk가 커져 startup이 거부된다.

제안 fix: by-design 유지 가능. production init preset이나 doctor는 지금처럼 gate cookie + allowed origins를 계속 강하게 안내하면 된다.

### [by-design] actor identity: unsigned header default는 host-owned identity contract와 일치
위치: `src/config.ts:258-266`, `src/actor.ts:1-37`, `src/server.ts:276-305`

문제: signing secret이 없으면 `X-Pyanchor-Actor`를 unsigned로 받아 audit/PR body에 기록한다. v0.27.0 이후 HMAC signing secret을 설정하면 spoofed actor는 drop된다.

재현/시나리오: host middleware가 client-provided `X-Pyanchor-Actor`를 그대로 forward하면 audit spoofing이 가능하지만, 이는 host auth boundary 설정 문제다. pyanchor는 opt-in HMAC으로 방어 수단을 제공한다.

제안 fix: by-design 유지 가능. docs/examples에서 host가 verified session/JWT에서 actor를 생성하고, 가능하면 `PYANCHOR_ACTOR_SIGNING_SECRET`을 켜도록 안내한다.

## 추천 ship 우선순위

1. P1 state serialization: server/worker 공통 file lock + unique temp file + RMW mutex. 작업량: 0.5-1.5일. 효과: duplicate runner, lost update, cancel/heartbeat overwrite를 한 번에 줄임.
2. P1 Aider path traversal: `targetPath` sanitize + workspace confinement check. 작업량: 1-2시간. 효과: workspace boundary 보안 회복.
3. P1 `commandExists()` shell 제거. 작업량: 30분-1시간. 효과: cwd dotenv auto-load와 결합한 local command injection 제거.
4. P1 destructive path guard/sentinel. 작업량: 0.5일. 효과: `rm -rf`, `rsync --delete`, `chown -R` 오설정 피해 방지.
5. P1 shutdown active worker cancel policy. 작업량: 0.5일. 효과: sidecar stop 후 orphan edit/apply 방지.
6. P2 `/api/cancel` + prompt length status mapping. 작업량: 1-2시간. 효과: API contract 신뢰도 개선.
7. P2 admin href escaping + base path regex. 작업량: 30분. 효과: config-origin XSS sink 제거.
8. P2 restart template quoting. 작업량: 30분. 효과: generated script footgun 제거.

