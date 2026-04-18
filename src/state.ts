import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { pyanchorConfig, isPyanchorConfigured } from "./config";
import type {
  AdminHealth,
  AiEditCancelInput,
  AiEditMessage,
  AiEditMessageStatus,
  AiEditMode,
  AiEditQueueItem,
  AiEditStartInput,
  AiEditState
} from "./shared/types";

const MAX_MESSAGES = 24;
const MAX_ACTIVITY_LOG = 80;
const CANCELED_ERROR = "사용자가 작업을 취소했습니다.";

const createInitialState = (): AiEditState => ({
  configured: isPyanchorConfigured(),
  status: "idle",
  jobId: null,
  pid: null,
  prompt: "",
  targetPath: "",
  mode: null,
  currentStep: null,
  heartbeatAt: null,
  heartbeatLabel: null,
  thinking: null,
  activityLog: [],
  error: null,
  startedAt: null,
  completedAt: null,
  updatedAt: new Date().toISOString(),
  queue: [],
  messages: []
});

const normalizeTargetPath = (value: string | undefined) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const normalizeMode = (value: string | undefined | null): AiEditMode | null => {
  if (value === "chat" || value === "edit") {
    return value;
  }
  return null;
};

const trimActivityLog = (value: unknown) =>
  (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []).slice(
    -MAX_ACTIVITY_LOG
  );

const trimMessages = (value: unknown) =>
  (Array.isArray(value) ? value.filter((item): item is AiEditMessage => Boolean(item && typeof item === "object")) : [])
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : randomUUID(),
      jobId: typeof item.jobId === "string" ? item.jobId : null,
      role: (item.role === "assistant" || item.role === "system" ? item.role : "user") as AiEditMessage["role"],
      mode: (item.mode === "chat" ? "chat" : "edit") as AiEditMode,
      text: typeof item.text === "string" ? item.text : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      status:
        item.status === "queued" ||
        item.status === "running" ||
        item.status === "done" ||
        item.status === "failed" ||
        item.status === "canceled"
          ? item.status
          : null
    }))
    .slice(-MAX_MESSAGES);

const normalizeQueue = (value: unknown) =>
  (Array.isArray(value) ? value.filter((item): item is AiEditQueueItem => Boolean(item && typeof item === "object")) : [])
    .map((item) => ({
      jobId: typeof item.jobId === "string" ? item.jobId : randomUUID(),
      prompt: typeof item.prompt === "string" ? item.prompt : "",
      targetPath: normalizeTargetPath(typeof item.targetPath === "string" ? item.targetPath : ""),
      enqueuedAt: typeof item.enqueuedAt === "string" ? item.enqueuedAt : new Date().toISOString(),
      mode: (item.mode === "chat" ? "chat" : "edit") as AiEditMode
    }))
    .slice(-MAX_MESSAGES);

const appendActivityLog = (state: AiEditState, lines: string[]) => ({
  ...state,
  activityLog: [...state.activityLog, ...lines.filter(Boolean)].slice(-MAX_ACTIVITY_LOG)
});

const stampLogLine = (message: string) => {
  const time = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());

  return `[${time}] ${message}`;
};

const createMessage = ({
  jobId,
  role,
  mode,
  text,
  status
}: {
  jobId: string | null;
  role: AiEditMessage["role"];
  mode: AiEditMode;
  text: string;
  status: AiEditMessageStatus | null;
}): AiEditMessage => ({
  id: randomUUID(),
  jobId,
  role,
  mode,
  text,
  createdAt: new Date().toISOString(),
  status
});

const pushMessage = (state: AiEditState, message: AiEditMessage): AiEditState => ({
  ...state,
  messages: [...state.messages, message].slice(-MAX_MESSAGES)
});

const updateUserMessageStatus = (
  state: AiEditState,
  jobId: string,
  status: AiEditMessageStatus
): AiEditState => ({
  ...state,
  messages: state.messages.map((message) =>
    message.jobId === jobId && message.role === "user" ? { ...message, status } : message
  )
});

const normalizeState = (raw: Partial<AiEditState>): AiEditState => ({
  ...createInitialState(),
  ...raw,
  mode: normalizeMode(raw.mode),
  queue: normalizeQueue(raw.queue),
  messages: trimMessages(raw.messages),
  activityLog: trimActivityLog(raw.activityLog)
});

const isPidAlive = (pid: number | null) => {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function isFrontendHealthy() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(pyanchorConfig.healthcheckUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function isPeerBusy() {
  if (!pyanchorConfig.peerStateFile) {
    return false;
  }

  try {
    if (!existsSync(pyanchorConfig.peerStateFile)) {
      return false;
    }

    const raw = JSON.parse(await readFile(pyanchorConfig.peerStateFile, "utf8")) as {
      currentPid?: number | null;
      status?: string;
    };

    const busy = raw?.status === "running" || raw?.status === "promoting";
    return busy && isPidAlive(raw.currentPid ?? null);
  } catch {
    return false;
  }
}

function spawnRunner(jobId: string, prompt: string, targetPath: string, mode: AiEditMode) {
  const child = spawn(process.execPath, [pyanchorConfig.workerScript], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PYANCHOR_JOB_ID: jobId,
      PYANCHOR_JOB_PROMPT: prompt,
      PYANCHOR_JOB_TARGET_PATH: targetPath,
      PYANCHOR_JOB_MODE: mode,
      PYANCHOR_STATE_FILE_PATH: pyanchorConfig.stateFile
    }
  });

  child.unref();
  return child.pid ?? null;
}

export async function ensureStateDir() {
  await mkdir(pyanchorConfig.stateDir, { recursive: true });
}

export async function writeAiEditState(next: AiEditState) {
  await ensureStateDir();
  const payload = normalizeState({ ...next, updatedAt: new Date().toISOString() });
  await writeFile(pyanchorConfig.stateFile, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export async function readAiEditState(): Promise<AiEditState> {
  await ensureStateDir();

  if (!existsSync(pyanchorConfig.stateFile)) {
    return writeAiEditState(createInitialState());
  }

  const raw = JSON.parse(await readFile(pyanchorConfig.stateFile, "utf8")) as Partial<AiEditState>;
  const state = normalizeState(raw);

  if ((state.status === "running" || state.status === "canceling") && state.pid && !isPidAlive(state.pid)) {
    if (state.heartbeatLabel === "Restarting") {
      if (await isFrontendHealthy()) {
        return writeAiEditState({
          ...updateUserMessageStatus(state, state.jobId ?? "", "done"),
          status: "done",
          pid: null,
          currentStep: "수정 내용을 반영하고 서비스를 다시 시작했습니다.",
          heartbeatAt: new Date().toISOString(),
          heartbeatLabel: "Done",
          error: null,
          completedAt: new Date().toISOString()
        });
      }

      const restartAgeMs =
        state.heartbeatAt ? Date.now() - new Date(state.heartbeatAt).getTime() : Number.POSITIVE_INFINITY;

      if (restartAgeMs < 90_000) {
        return state;
      }
    }

    if (state.status === "canceling" || state.error === CANCELED_ERROR) {
      return writeAiEditState(
        pushMessage(
          {
            ...updateUserMessageStatus(state, state.jobId ?? "", "canceled"),
            status: "canceled",
            pid: null,
            currentStep: null,
            heartbeatAt: new Date().toISOString(),
            heartbeatLabel: "Canceled",
            error: CANCELED_ERROR,
            completedAt: new Date().toISOString(),
            activityLog: [...state.activityLog, stampLogLine("작업이 취소되었습니다.")].slice(-MAX_ACTIVITY_LOG)
          },
          createMessage({
            jobId: state.jobId,
            role: "system",
            mode: state.mode ?? "edit",
            text: CANCELED_ERROR,
            status: "canceled"
          })
        )
      );
    }

    return writeAiEditState(
      pushMessage(
        {
          ...updateUserMessageStatus(state, state.jobId ?? "", "failed"),
          status: "failed",
          pid: null,
          currentStep: null,
          heartbeatAt: new Date().toISOString(),
          heartbeatLabel: "Failed",
          error: "AI 수정 작업이 비정상 종료되었습니다.",
          completedAt: new Date().toISOString(),
          activityLog: [...state.activityLog, stampLogLine("작업이 비정상 종료되었습니다.")].slice(-MAX_ACTIVITY_LOG)
        },
        createMessage({
          jobId: state.jobId,
          role: "system",
          mode: state.mode ?? "edit",
          text: "AI 수정 작업이 비정상 종료되었습니다.",
          status: "failed"
        })
      )
    );
  }

  if (
    (state.status === "idle" ||
      state.status === "done" ||
      state.status === "failed" ||
      state.status === "canceled") &&
    state.queue.length > 0 &&
    !(await isPeerBusy())
  ) {
    const [next, ...remaining] = state.queue;
    const started = appendActivityLog(
      updateUserMessageStatus(
        {
          ...state,
          configured: isPyanchorConfigured(),
          status: "running",
          jobId: next.jobId,
          pid: null,
          prompt: next.prompt,
          targetPath: next.targetPath,
          mode: next.mode,
          currentStep: "대기 중이던 작업을 시작합니다.",
          heartbeatAt: null,
          heartbeatLabel: null,
          thinking: null,
          error: null,
          startedAt: new Date().toISOString(),
          completedAt: null,
          queue: remaining
        },
        next.jobId,
        "running"
      ),
      [stampLogLine(`${next.mode === "chat" ? "대화" : "수정"} 작업을 대기열에서 시작했습니다.`)]
    );

    await writeAiEditState(started);
    const pid = spawnRunner(next.jobId, next.prompt, next.targetPath, next.mode);
    return writeAiEditState({ ...started, pid });
  }

  const configured = isPyanchorConfigured();
  if (state.configured !== configured) {
    return writeAiEditState({ ...state, configured });
  }

  return state;
}

export async function startAiEdit(input: AiEditStartInput) {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error("요청 내용을 입력해 주세요.");
  }

  if (!isPyanchorConfigured()) {
    throw new Error("AI 수정 환경이 아직 서버에 준비되지 않았습니다.");
  }

  const targetPath = normalizeTargetPath(input.targetPath);
  const mode = input.mode === "chat" ? "chat" : "edit";
  const current = await readAiEditState();
  const isRunning = (current.status === "running" || current.status === "canceling") && isPidAlive(current.pid);
  const peerBusy = await isPeerBusy();
  const jobId = randomUUID();
  const userMessage = createMessage({
    jobId,
    role: "user",
    mode,
    text: prompt,
    status: isRunning || peerBusy ? "queued" : "running"
  });

  if (isRunning || peerBusy) {
    const item: AiEditQueueItem = {
      jobId,
      prompt,
      targetPath,
      enqueuedAt: new Date().toISOString(),
      mode
    };

    return writeAiEditState(
      appendActivityLog(
        pushMessage(
          {
            ...current,
            queue: [...current.queue, item],
            currentStep:
              current.currentStep ??
              (peerBusy
                ? "워크숍 작업이 끝나면 바로 처리합니다."
                : "현재 실행 중인 작업이 끝나면 바로 처리합니다.")
          },
          userMessage
        ),
        [stampLogLine(`${mode === "chat" ? "대화" : "수정"} 요청을 대기열에 추가했습니다.`)]
      )
    );
  }

  const nextState = appendActivityLog(
    pushMessage(
      {
        configured: true,
        status: "running",
        jobId,
        pid: null,
        prompt,
        targetPath,
        mode,
        currentStep: `${mode === "chat" ? "대화" : "수정"} 작업을 준비하고 있습니다.`,
        heartbeatAt: null,
        heartbeatLabel: null,
        thinking: null,
        activityLog: current.activityLog,
        error: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        updatedAt: new Date().toISOString(),
        queue: current.queue,
        messages: current.messages
      },
      userMessage
    ),
    [stampLogLine(`${mode === "chat" ? "대화" : "수정"} 작업을 시작했습니다.`)]
  );

  await writeAiEditState(nextState);
  nextState.pid = spawnRunner(jobId, prompt, targetPath, mode);
  return writeAiEditState(nextState);
}

export async function cancelAiEdit(input: AiEditCancelInput = {}) {
  const current = await readAiEditState();
  const targetJobId = input.jobId?.trim() || "";

  if (
    current.jobId &&
    current.pid &&
    isPidAlive(current.pid) &&
    (current.status === "running" || current.status === "canceling") &&
    (!targetJobId || targetJobId === current.jobId)
  ) {
    try {
      process.kill(current.pid, "SIGTERM");
    } catch {}

    return writeAiEditState(
      appendActivityLog(
        {
          ...current,
          status: "canceling",
          currentStep: "작업 취소를 요청했습니다.",
          heartbeatAt: new Date().toISOString(),
          heartbeatLabel: "Canceling",
          error: null
        },
        [stampLogLine("현재 실행 중인 작업에 취소 요청을 보냈습니다.")]
      )
    );
  }

  const queueIndex = targetJobId
    ? current.queue.findIndex((item) => item.jobId === targetJobId)
    : current.queue.length - 1;

  if (queueIndex >= 0) {
    const canceledItem = current.queue[queueIndex];
    const nextQueue = current.queue.filter((_, index) => index !== queueIndex);

    return writeAiEditState(
      appendActivityLog(
        pushMessage(
          updateUserMessageStatus(
            {
              ...current,
              queue: nextQueue
            },
            canceledItem.jobId,
            "canceled"
          ),
          createMessage({
            jobId: canceledItem.jobId,
            role: "system",
            mode: canceledItem.mode,
            text: "대기 중이던 요청을 취소했습니다.",
            status: "canceled"
          })
        ),
        [stampLogLine("대기 중이던 요청을 취소했습니다.")]
      )
    );
  }

  throw new Error("취소할 작업이 없습니다.");
}

export async function getAdminHealth(): Promise<AdminHealth> {
  return {
    configured: isPyanchorConfigured(),
    port: pyanchorConfig.port,
    host: pyanchorConfig.host,
    runtimeBasePath: pyanchorConfig.runtimeBasePath,
    runtimeAliasPath: pyanchorConfig.runtimeAliasPath,
    stateFile: pyanchorConfig.stateFile,
    workspaceDir: pyanchorConfig.workspaceDir,
    appDir: pyanchorConfig.appDir,
    workerScript: pyanchorConfig.workerScript,
    healthcheckUrl: pyanchorConfig.healthcheckUrl
  };
}
