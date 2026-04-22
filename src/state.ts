import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

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

const MAX_MESSAGES = pyanchorConfig.maxMessages;
const MAX_ACTIVITY_LOG = pyanchorConfig.maxActivityLog;
const CANCELED_ERROR = "Job canceled by user.";

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
      mode: (item.mode === "chat" ? "chat" : "edit") as AiEditMode,
      // v0.19.0: preserve actor passthrough across state.json round-trips
      // so queued jobs keep identity context until they actually run.
      ...(typeof item.actor === "string" && item.actor ? { actor: item.actor } : {})
    }))
    .slice(-MAX_MESSAGES);

const appendActivityLog = (state: AiEditState, lines: string[]) => ({
  ...state,
  activityLog: [...state.activityLog, ...lines.filter(Boolean)].slice(-MAX_ACTIVITY_LOG)
});

const stampLogLine = (message: string) => {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
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

function spawnRunner(
  jobId: string,
  prompt: string,
  targetPath: string,
  mode: AiEditMode,
  actor: string | null
) {
  const child = spawn(process.execPath, [pyanchorConfig.workerScript], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PYANCHOR_JOB_ID: jobId,
      PYANCHOR_JOB_PROMPT: prompt,
      PYANCHOR_JOB_TARGET_PATH: targetPath,
      PYANCHOR_JOB_MODE: mode,
      PYANCHOR_STATE_FILE_PATH: pyanchorConfig.stateFile,
      // v0.19.0 passthrough — worker reads this and includes in audit.
      ...(actor ? { PYANCHOR_JOB_ACTOR: actor } : {})
    }
  });

  child.unref();
  return child.pid ?? null;
}

export async function ensureStateDir() {
  await mkdir(pyanchorConfig.stateDir, { recursive: true });
}

// v0.33.0 — server-local reentrant mutex around state read/write.
// Pre-fix the server's `startAiEdit` did `current =
// readAiEditState()` → `if (current.status === "idle") { ...
// writeAiEditState(...) }` without holding a lock across the
// read+write. Two simultaneous `/api/edit` requests could both
// observe `status === "idle"`, both spawn workers, and the second
// `writeAiEditState` would clobber the first's `pid`. Caught by
// codex static audit.
//
// AsyncLocalStorage flag makes the lock reentrant — when an RMW
// caller (startAiEdit) already holds the lock and calls
// writeAiEditState (which also wraps in withServerStateLock), the
// inner call short-circuits to the task instead of waiting on
// itself (which would deadlock).
//
// Cross-process (server ↔ worker) coordination still relies on the
// worker's own state-io lock + the atomic rename pattern below;
// per-process unique temp files prevent the two processes from
// clobbering each other's in-flight tmp.
const __lockHolder = new AsyncLocalStorage<true>();
let __serverStateLock: Promise<unknown> = Promise.resolve();
async function withServerStateLock<T>(task: () => Promise<T>): Promise<T> {
  if (__lockHolder.getStore() === true) {
    // Already inside a holder — reentrant call. Run inline.
    return task();
  }
  const run = () => __lockHolder.run(true, task);
  const next = __serverStateLock.then(run, run);
  __serverStateLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function writeAiEditStateUnlocked(next: AiEditState) {
  await ensureStateDir();
  const payload = normalizeState({ ...next, updatedAt: new Date().toISOString() });
  // Atomic write: per-process unique tmp + rename. v0.33.0 added
  // PID + random suffix so server and worker can't clobber each
  // other's in-flight write (pre-fix both used the exact same
  // `${target}.tmp`).
  const target = pyanchorConfig.stateFile;
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  await rename(tmp, target);
  return payload;
}

export async function writeAiEditState(next: AiEditState) {
  return withServerStateLock(() => writeAiEditStateUnlocked(next));
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
          currentStep: "Edit applied. Frontend restarted.",
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
            activityLog: [...state.activityLog, stampLogLine("Job canceled.")].slice(-MAX_ACTIVITY_LOG)
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
          error: "Edit job exited abnormally.",
          completedAt: new Date().toISOString(),
          activityLog: [...state.activityLog, stampLogLine("Job exited abnormally.")].slice(-MAX_ACTIVITY_LOG)
        },
        createMessage({
          jobId: state.jobId,
          role: "system",
          mode: state.mode ?? "edit",
          text: "Edit job exited abnormally.",
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
          currentStep: "Starting queued job.",
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
      [stampLogLine(`Started queued ${next.mode} job.`)]
    );

    await writeAiEditState(started);
    const pid = spawnRunner(next.jobId, next.prompt, next.targetPath, next.mode, next.actor ?? null);
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
    throw new Error("Prompt is required.");
  }

  if (prompt.length > pyanchorConfig.promptMaxLength) {
    // v0.33.0 — typed status (HttpError) so the global error handler
    // returns 413 instead of 500. Pre-fix this user-input error was
    // indistinguishable from a server crash.
    const err = new Error(
      `Prompt is too long (${prompt.length} > ${pyanchorConfig.promptMaxLength} chars). ` +
        `Raise PYANCHOR_PROMPT_MAX_LENGTH if this is expected.`
    ) as Error & { status: number };
    err.status = 413;
    throw err;
  }

  if (!isPyanchorConfigured()) {
    // v0.33.0 — 503 (Service Unavailable) is more accurate than 500.
    // The sidecar isn't crashed — it's not yet ready to serve edits.
    const err = new Error("Sidecar is not fully configured yet.") as Error & { status: number };
    err.status = 503;
    throw err;
  }

  // v0.33.0 — RMW serialization. Pre-fix two simultaneous /api/edit
  // POSTs could both observe `current.status === "idle"` between the
  // read and the write, both spawn workers, and the second
  // writeAiEditState would clobber the first's pid. Serialize the
  // entire read→decision→write sequence behind the server-state
  // lock. Caught by codex static audit.
  return withServerStateLock(async () => startAiEditUnlocked(input, prompt));
}

async function startAiEditUnlocked(input: AiEditStartInput, prompt: string) {
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
      mode,
      ...(input.actor ? { actor: input.actor } : {})
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
                ? "Will run as soon as the peer job finishes."
                : "Will run as soon as the current job finishes.")
          },
          userMessage
        ),
        [stampLogLine(`Queued ${mode} request.`)]
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
        currentStep: `Preparing ${mode} job.`,
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
    [stampLogLine(`Started ${mode} job.`)]
  );

  await writeAiEditState(nextState);
  nextState.pid = spawnRunner(jobId, prompt, targetPath, mode, input.actor ?? null);
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
          currentStep: "Cancel requested.",
          heartbeatAt: new Date().toISOString(),
          heartbeatLabel: "Canceling",
          error: null
        },
        [stampLogLine("Cancel request sent to the running job.")]
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
            text: "Queued request canceled.",
            status: "canceled"
          })
        ),
        [stampLogLine("Queued request canceled.")]
      )
    );
  }

  throw new Error("No job to cancel.");
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
    healthcheckUrl: pyanchorConfig.healthcheckUrl,
    agent: pyanchorConfig.agent,
    fastReload: pyanchorConfig.fastReload
  };
}
