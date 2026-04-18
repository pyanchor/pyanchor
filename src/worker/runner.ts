import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { randomUUID } from "node:crypto";

import { pyanchorConfig } from "../config";
import {
  OPENCLAW_INLINE,
  selectAgent,
  type AgentEvent,
  type AgentRunner
} from "../agents";
import type { AiEditMessage, AiEditMessageStatus, AiEditMode, AiEditState } from "../shared/types";

const resolvedStateFile = process.env.PYANCHOR_STATE_FILE_PATH;

if (!resolvedStateFile) {
  console.error("PYANCHOR_STATE_FILE_PATH is required (worker is normally spawned by the sidecar).");
  process.exit(1);
}

const stateFile = resolvedStateFile;
const sudoBin = "/usr/bin/sudo";
const flockBin = "/usr/bin/flock";
const MAX_MESSAGES = 24;
const MAX_ACTIVITY_LOG = 80;
const MAX_THINKING_CHARS = 8000;
const CANCELED_ERROR = "사용자가 작업을 취소했습니다.";

const shouldRestartAfterEdit =
  process.env.PYANCHOR_RESTART_AFTER_EDIT === "true" ||
  (!Object.prototype.hasOwnProperty.call(process.env, "PYANCHOR_RESTART_AFTER_EDIT") &&
    process.platform === "linux" &&
    fsSync.existsSync(pyanchorConfig.restartFrontendScript));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const activeJob = {
  jobId: process.env.PYANCHOR_JOB_ID || "",
  prompt: process.env.PYANCHOR_JOB_PROMPT || "",
  targetPath: process.env.PYANCHOR_JOB_TARGET_PATH || "",
  mode: process.env.PYANCHOR_JOB_MODE === "chat" ? "chat" : "edit"
} as const;

let stateLock = Promise.resolve();
let cancelRequested = false;
let cancelHandled = false;
const cancelController = new AbortController();
let pendingLogLines: string[] = [];
let pendingThinkingSegments: string[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let stdoutBuffer = "";
let stderrBuffer = "";

const activeChildren = new Set<ChildProcess>();

const withStateLock = async <T>(task: () => Promise<T>) => {
  const next = stateLock.then(task, task);
  stateLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
};

async function readStateUnlocked() {
  const raw = JSON.parse(await fs.readFile(stateFile, "utf8")) as AiEditState;
  if (!Array.isArray(raw.queue)) {
    raw.queue = [];
  }
  if (!Array.isArray(raw.messages)) {
    raw.messages = [];
  }
  if (!Array.isArray(raw.activityLog)) {
    raw.activityLog = [];
  }
  return raw;
}

async function readState() {
  return withStateLock(() => readStateUnlocked());
}

async function writeStateUnlocked(state: AiEditState) {
  const next = { ...state, updatedAt: new Date().toISOString() };
  await fs.writeFile(stateFile, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function writeState(state: AiEditState) {
  return withStateLock(() => writeStateUnlocked(state));
}

async function updateState(mutator: (state: AiEditState) => AiEditState | Promise<AiEditState>) {
  return withStateLock(async () => {
    const current = await readStateUnlocked();
    const next = await mutator(clone(current));
    return writeStateUnlocked(next);
  });
}

const trimLog = (lines: string[]) => lines.filter(Boolean).slice(-MAX_ACTIVITY_LOG);

const mergeThinking = (current: string | null, incoming: string | null) => {
  const next = incoming?.trim();
  if (!next) {
    return current;
  }

  if (!current) {
    return next.slice(-MAX_THINKING_CHARS);
  }

  if (next.includes(current)) {
    return next.slice(-MAX_THINKING_CHARS);
  }

  if (current.includes(next)) {
    return current.slice(-MAX_THINKING_CHARS);
  }

  return `${current}\n\n${next}`.slice(-MAX_THINKING_CHARS);
};

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

const updateUserMessageStatus = (
  state: AiEditState,
  jobId: string,
  status: AiEditMessageStatus
) => ({
  ...state,
  messages: state.messages.map((message) =>
    message.jobId === jobId && message.role === "user" ? { ...message, status } : message
  )
});

const pushMessage = (state: AiEditState, message: AiEditMessage) => ({
  ...state,
  messages: [...state.messages, message].slice(-MAX_MESSAGES)
});

function queueLog(lines: string[]) {
  const next = lines
    .flatMap((line) => line.split(/\r?\n/g))
    .map((line) => line.trim())
    .filter(Boolean)
    .map(stampLogLine);

  if (next.length === 0) {
    return;
  }

  pendingLogLines.push(...next);
  scheduleRuntimeFlush();
}

function queueThinking(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  pendingThinkingSegments.push(trimmed);
  scheduleRuntimeFlush();
}

function scheduleRuntimeFlush() {
  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushRuntimeBuffers();
  }, 500);
}

async function flushRuntimeBuffers() {
  const logLines = pendingLogLines;
  const thinkingSegments = pendingThinkingSegments;
  pendingLogLines = [];
  pendingThinkingSegments = [];

  if (logLines.length === 0 && thinkingSegments.length === 0) {
    return;
  }

  await updateState((state) => ({
    ...state,
    activityLog: trimLog([...state.activityLog, ...logLines]),
    thinking: thinkingSegments.reduce((acc, segment) => mergeThinking(acc, segment), state.thinking)
  }));
}

async function pulseState({ step, label }: { step?: string | null; label?: string | null }) {
  const timestamp = new Date().toISOString();
  await flushRuntimeBuffers();
  await updateState((state) => ({
    ...state,
    currentStep: step ?? state.currentStep,
    heartbeatAt: timestamp,
    heartbeatLabel: label ?? state.heartbeatLabel
  }));
}

async function withHeartbeat<T>(
  config: { step: string; label: string; intervalMs?: number },
  task: () => Promise<T>
) {
  queueLog([config.step]);
  await pulseState({ step: config.step, label: config.label });

  const timer = setInterval(() => {
    void pulseState({ step: config.step, label: config.label }).catch(() => undefined);
  }, config.intervalMs ?? 8000);

  try {
    return await task();
  } finally {
    clearInterval(timer);
  }
}

function killChild(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) {
    return;
  }

  try {
    child.kill(signal);
  } catch {}
}

async function cancelActiveChildren() {
  const children = Array.from(activeChildren);
  for (const child of children) {
    killChild(child, "SIGTERM");
  }

  await new Promise((resolve) => setTimeout(resolve, 200));

  for (const child of children) {
    killChild(child, "SIGKILL");
  }
}

async function finalizeCancellation(signal: NodeJS.Signals) {
  if (cancelHandled) {
    return;
  }

  cancelHandled = true;
  cancelRequested = true;
  cancelController.abort();
  queueLog([`취소 신호를 받았습니다. (${signal})`, "실행 중인 하위 작업을 정리합니다."]);
  await flushRuntimeBuffers();
  await cancelActiveChildren();

  const state = await readState();

  await writeState(
    pushMessage(
      updateUserMessageStatus(
        {
          ...state,
          status: "canceled",
          pid: null,
          currentStep: null,
          heartbeatAt: new Date().toISOString(),
          heartbeatLabel: "Canceled",
          error: CANCELED_ERROR,
          completedAt: new Date().toISOString(),
          activityLog: trimLog([...state.activityLog, stampLogLine("작업이 취소되었습니다.")])
        },
        activeJob.jobId,
        "canceled"
      ),
      createMessage({
        jobId: activeJob.jobId,
        role: "system",
        mode: activeJob.mode,
        text: CANCELED_ERROR,
        status: "canceled"
      })
    )
  );

  process.exit(0);
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeoutMs?: number;
    onStdoutChunk?: (text: string) => void;
    onStderrChunk?: (text: string) => void;
  } = {}
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"]
    });

    activeChildren.add(child);

    let stdout = "";
    let stderr = "";
    let timeoutId: NodeJS.Timeout | null = null;

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        killChild(child, "SIGTERM");
        setTimeout(() => killChild(child, "SIGKILL"), 5000).unref();
      }, options.timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdoutChunk?.(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderrChunk?.(text);
    });

    child.on("error", (error) => {
      activeChildren.delete(child);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(error);
    });

    child.on("close", (code, signal) => {
      activeChildren.delete(child);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (cancelRequested) {
        reject(new Error(CANCELED_ERROR));
        return;
      }

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      if (signal) {
        reject(new Error(`${command} was terminated by ${signal}`));
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`));
    });

    if (options.input) {
      child.stdin.write(options.input);
    }

    child.stdin.end();
  });
}

const runAsOpenClaw = (args: string[], options: Parameters<typeof runCommand>[2] = {}) =>
  runCommand(sudoBin, ["-u", pyanchorConfig.openClawUser, ...args], options);

const runAsOpenClawInDir = (
  workingDir: string,
  args: string[],
  options: Parameters<typeof runCommand>[2] = {}
) =>
  runAsOpenClaw(["bash", "-lc", 'cd "$1" && shift && exec "$@"', "--", workingDir, ...args], options);

function getRouteHints(jobTargetPath: string) {
  if (jobTargetPath === "/login" || jobTargetPath === "/signup") {
    return [
      "- Start with auth files only: app/(auth)/login/page.tsx, app/(auth)/signup/page.tsx, components/auth/, app/(auth)/layout.tsx, app/globals.css.",
      "- Preserve the Korean UI copy and the existing login/signup behavior.",
      "- Prefer a shared auth component if the change affects both login and signup tabs.",
      "- For this route, animations should be subtle and product-like: short fade/slide transitions, tab indicator movement, no flashy motion."
    ];
  }

  return [
    "- Start with the target route file and the components that route imports.",
    "- Only touch app/globals.css if the visual change needs shared styling."
  ];
}

function formatConversationContext(messages: AiEditState["messages"]) {
  if (messages.length === 0) {
    return "- No prior conversation.";
  }

  return messages
    .slice(-6)
    .map((message) => {
      const label =
        message.role === "assistant" ? "Assistant" : message.role === "system" ? "System" : "User";
      return `- ${label} [${message.mode}]${message.status ? ` (${message.status})` : ""}: ${message.text}`;
    })
    .join("\n");
}

async function prepareWorkspace() {
  await runCommand(sudoBin, ["rm", "-rf", pyanchorConfig.workspaceDir]);
  await runCommand(sudoBin, ["mkdir", "-p", pyanchorConfig.workspaceDir]);

  await runCommand(flockBin, [
    "-s",
    "-w",
    "60",
    pyanchorConfig.appDirLock,
    sudoBin,
    "rsync",
    "-a",
    "--delete",
    "--exclude",
    ".git",
    "--exclude",
    "node_modules",
    "--exclude",
    ".next",
    `${pyanchorConfig.appDir}/`,
    `${pyanchorConfig.workspaceDir}/`
  ]);

  await runCommand(sudoBin, [
    "chown",
    "-R",
    `${pyanchorConfig.openClawUser}:${pyanchorConfig.openClawUser}`,
    pyanchorConfig.workspaceDir
  ]);
}

function createBrief(
  jobPrompt: string,
  jobTargetPath: string,
  mode: AiEditMode,
  messages: AiEditState["messages"]
) {
  return [
    "# AI UI Request",
    "",
    `Mode: ${mode}`,
    `Target page: ${jobTargetPath || "not specified"}`,
    "",
    "## Current request",
    jobPrompt,
    "",
    "## Recent conversation",
    formatConversationContext(messages),
    "",
    "## Constraints",
    "- This project uses custom CSS, not Tailwind.",
    "- Keep Korean UI copy unless the request explicitly asks for text changes.",
    "- Stay focused on the current page and the components it directly uses.",
    ...(mode === "edit"
      ? [
          "- Preserve route flow, API logic, and data behavior.",
          "- Prefer production-ready UI changes over placeholder landing-page styling.",
          "- Do not create unrelated files or refactor unrelated areas."
        ]
      : [
          "- Do not modify files unless the user explicitly asked for a code change.",
          "- Answer clearly in Korean, based on the actual code and structure you inspected.",
          "- If you infer something, say that it is an inference."
        ]),
    "",
    "## Project hints",
    ...getRouteHints(jobTargetPath),
    "",
    "## Output",
    ...(mode === "edit"
      ? [
          "- Implement the requested UI change completely in this workspace.",
          "- Review modified files for obvious TypeScript or JSX mistakes before finishing.",
          "- Keep the final response to 2 or 3 concise lines."
        ]
      : [
          "- Explain the answer directly and concisely.",
          "- If no code change is required, do not change files.",
          "- Keep the final response to 3 to 6 concise sentences."
        ])
  ].join("\n");
}

async function writeBrief(
  jobPrompt: string,
  jobTargetPath: string,
  mode: AiEditMode,
  messages: AiEditState["messages"]
) {
  await runAsOpenClaw(["tee", `${pyanchorConfig.workspaceDir}/EDIT_BRIEF.md`], {
    input: createBrief(jobPrompt, jobTargetPath, mode, messages)
  });
}

async function ensureAgent() {
  const result = await runAsOpenClaw([pyanchorConfig.openClawBin, "agents", "list", "--json"]);
  const agents = JSON.parse(result.stdout || "[]") as Array<{ id?: string }>;

  if (agents.some((agent) => agent.id === pyanchorConfig.agentId)) {
    return pyanchorConfig.agentId;
  }

  await runAsOpenClaw([
    pyanchorConfig.openClawBin,
    "agents",
    "add",
    pyanchorConfig.agentId,
    "--workspace",
    pyanchorConfig.workspaceDir,
    "--model",
    pyanchorConfig.model,
    "--non-interactive",
    "--json"
  ]);

  return pyanchorConfig.agentId;
}

function installWorkspaceDependencies() {
  return runAsOpenClawInDir(
    pyanchorConfig.workspaceDir,
    ["/usr/bin/corepack", "yarn", "install", "--frozen-lockfile"],
    {
      timeoutMs: pyanchorConfig.installTimeoutMs,
      onStdoutChunk: (text) => queueLog([`[install] ${text}`]),
      onStderrChunk: (text) => queueLog([`[install] ${text}`])
    }
  );
}

function extractAgentSignals(node: unknown, bucket: { texts: string[]; thinkings: string[]; logs: string[] }) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      extractAgentSignals(item, bucket);
    }
    return;
  }

  const record = node as Record<string, unknown>;

  if (record.type === "thinking" && typeof record.thinking === "string") {
    bucket.thinkings.push(record.thinking);
  }

  if (typeof record.text === "string" && record.text.trim()) {
    bucket.texts.push(record.text.trim());
  }

  if (typeof record.message === "string" && record.message.trim()) {
    bucket.logs.push(record.message.trim());
  }

  if (typeof record.event === "string" && record.event.trim()) {
    bucket.logs.push(`event: ${record.event.trim()}`);
  }

  if (typeof record.status === "string" && record.status.trim()) {
    bucket.logs.push(`status: ${record.status.trim()}`);
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      extractAgentSignals(value, bucket);
    }
  }
}

function processAgentChunk(chunk: string, channel: "stdout" | "stderr") {
  const nextBuffer = channel === "stdout" ? stdoutBuffer + chunk : stderrBuffer + chunk;
  const lines = nextBuffer.split(/\r?\n/g);
  const remainder = lines.pop() ?? "";

  if (channel === "stdout") {
    stdoutBuffer = remainder;
  } else {
    stderrBuffer = remainder;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as unknown;
      const bucket = { texts: [] as string[], thinkings: [] as string[], logs: [] as string[] };
      extractAgentSignals(parsed, bucket);
      if (bucket.texts.length > 0) {
        queueLog(bucket.texts.map((text) => `[agent] ${text}`));
      }
      if (bucket.logs.length > 0) {
        queueLog(bucket.logs.map((text) => `[agent] ${text}`));
      }
      if (bucket.thinkings.length > 0) {
        queueThinking(bucket.thinkings.join("\n\n"));
      }
      continue;
    } catch {}

    const looksLikeJsonFragment =
      /^[\[\]{},"0-9.\-]+$/.test(line) ||
      line.includes('":') ||
      line.endsWith(",") ||
      line === "]";

    if (channel === "stderr" || !looksLikeJsonFragment) {
      queueLog([`[${channel}] ${line}`]);
    }
  }
}

function flushAgentChunkRemainders() {
  for (const [channel, buffer] of [
    ["stdout", stdoutBuffer],
    ["stderr", stderrBuffer]
  ] as const) {
    const line = buffer.trim();
    if (!line) {
      continue;
    }
    processAgentChunk(`${line}\n`, channel);
  }
  stdoutBuffer = "";
  stderrBuffer = "";
}

function runAgent(agentId: string, jobId: string, jobTargetPath: string, mode: AiEditMode) {
  const routeFocus =
    jobTargetPath === "/login" || jobTargetPath === "/signup"
      ? "Focus on the auth routes, their shared auth components, and auth-related CSS only."
      : "Focus only on the target route and the components that route directly uses.";

  const agentMessage =
    mode === "edit"
      ? [
          "Read EDIT_BRIEF.md first.",
          routeFocus,
          "Do not scan or refactor the whole repository.",
          "Implement the requested UI change completely in this workspace.",
          "Run a production build in this workspace and fix any issues until it passes.",
          "Keep behavior intact, then review the modified files for obvious issues.",
          "Respond in 2 or 3 lines summarizing the actual changes you made."
        ].join(" ")
      : [
          "Read EDIT_BRIEF.md first.",
          routeFocus,
          "Inspect the relevant files and answer the user's question in Korean.",
          "Do not modify files unless the request explicitly asked for a code change.",
          "Do not run installs or builds for this answer.",
          "Be concise, concrete, and cite file paths in the response when relevant."
        ].join(" ");

  stdoutBuffer = "";
  stderrBuffer = "";

  return runAsOpenClawInDir(
    pyanchorConfig.workspaceDir,
    [
      pyanchorConfig.openClawBin,
      "agent",
      "--agent",
      agentId,
      "--session-id",
      jobId,
      "--thinking",
      pyanchorConfig.thinking,
      "--timeout",
      String(pyanchorConfig.agentTimeoutSeconds),
      "--json",
      "-m",
      agentMessage
    ],
    {
      timeoutMs: (pyanchorConfig.agentTimeoutSeconds + 120) * 1000,
      onStdoutChunk: (text) => processAgentChunk(text, "stdout"),
      onStderrChunk: (text) => processAgentChunk(text, "stderr")
    }
  ).finally(() => {
    flushAgentChunkRemainders();
  });
}

function collectTextPayloads(payloads: Array<{ text?: string; thinking?: string; type?: string }>) {
  const summaryParts: string[] = [];
  const thinkingParts: string[] = [];

  for (const item of payloads) {
    if (item.type === "thinking" && item.thinking) {
      thinkingParts.push(item.thinking);
      continue;
    }

    if (typeof item.text === "string" && item.text.trim()) {
      summaryParts.push(item.text);
    }
  }

  return {
    summary: summaryParts.join("\n").trim(),
    thinking: thinkingParts.join("\n\n").trim() || null
  };
}

function detectAgentFailure(rawOutput: string, summary: string) {
  const haystack = `${rawOutput}\n${summary}`.toLowerCase();

  if (haystack.includes("request timed out before a response was generated")) {
    return "AI 응답 시간이 초과됐습니다. 요청 범위를 조금 좁히거나 다시 시도해 주세요.";
  }

  if (haystack.includes("timed out") && haystack.includes("response")) {
    return "AI 응답 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (haystack.includes("unauthorized") || haystack.includes("401")) {
    return "AI 에이전트 인증에 문제가 있습니다.";
  }

  return null;
}

function parseAgentResult(stdout: string) {
  try {
    const payload = JSON.parse(stdout) as {
      content?: Array<{ text?: string; thinking?: string; type?: string }>;
      result?: { payloads?: Array<{ text?: string; thinking?: string; type?: string }> };
    };
    const payloads = payload?.result?.payloads ?? payload?.content ?? [];
    const { summary, thinking } = collectTextPayloads(Array.isArray(payloads) ? payloads : []);
    const failure = detectAgentFailure(stdout, summary);

    return {
      summary: summary || "변경 작업을 완료했습니다.",
      thinking,
      failure
    };
  } catch {
    const failure = detectAgentFailure(stdout, stdout);
    return {
      summary: stdout.trim() || "변경 작업을 완료했습니다.",
      thinking: null,
      failure
    };
  }
}

function buildWorkspace() {
  return runAsOpenClawInDir(
    pyanchorConfig.workspaceDir,
    ["env", "NEXT_TELEMETRY_DISABLED=1", "/usr/bin/node", "./node_modules/next/dist/bin/next", "build"],
    {
      timeoutMs: pyanchorConfig.buildTimeoutMs,
      onStdoutChunk: (text) => queueLog([`[build] ${text}`]),
      onStderrChunk: (text) => queueLog([`[build] ${text}`])
    }
  );
}

async function syncToAppDir() {
  await runCommand(flockBin, [
    "-x",
    "-w",
    "60",
    pyanchorConfig.appDirLock,
    sudoBin,
    "rsync",
    "-a",
    "--delete",
    "--exclude",
    ".git",
    "--exclude",
    "node_modules",
    "--exclude",
    ".openclaw",
    "--exclude",
    "AGENTS.md",
    "--exclude",
    "BOOTSTRAP.md",
    "--exclude",
    "EDIT_BRIEF.md",
    "--exclude",
    "HEARTBEAT.md",
    "--exclude",
    "IDENTITY.md",
    "--exclude",
    "SOUL.md",
    "--exclude",
    "TOOLS.md",
    "--exclude",
    "USER.md",
    `${pyanchorConfig.workspaceDir}/`,
    `${pyanchorConfig.appDir}/`
  ]);

  if (process.platform === "linux") {
    await runCommand(sudoBin, ["chown", "-R", pyanchorConfig.appDirOwner, pyanchorConfig.appDir]);
  }
}

function restartFrontend() {
  return runCommand(pyanchorConfig.restartFrontendScript, []);
}

async function dequeueNext() {
  const state = await readState();
  if (state.queue.length === 0) {
    return null;
  }

  const [next, ...remaining] = state.queue;

  await writeState(
    updateUserMessageStatus(
      {
        ...state,
        status: "running",
        jobId: next.jobId,
        pid: process.pid,
        prompt: next.prompt,
        targetPath: next.targetPath,
        mode: next.mode,
        currentStep: `대기 중이던 ${next.mode === "chat" ? "대화" : "수정"} 작업을 시작합니다. (남은 대기 ${remaining.length}건)`,
        heartbeatAt: null,
        heartbeatLabel: null,
        thinking: null,
        error: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        queue: remaining,
        activityLog: trimLog([...state.activityLog, stampLogLine("다음 대기 작업을 시작합니다.")])
      },
      next.jobId,
      "running"
    )
  );

  return next;
}

async function finalizeSuccess(summary: string, thinking: string | null, mode: AiEditMode) {
  await flushRuntimeBuffers();
  const state = await readState();

  await writeState(
    pushMessage(
      updateUserMessageStatus(
        {
          ...state,
          status: "done",
          pid: null,
          currentStep: summary,
          heartbeatAt: new Date().toISOString(),
          heartbeatLabel: "Done",
          thinking: mergeThinking(state.thinking, thinking),
          error: null,
          completedAt: new Date().toISOString(),
          activityLog: trimLog([...state.activityLog, stampLogLine("작업을 완료했습니다.")])
        },
        activeJob.jobId,
        "done"
      ),
      createMessage({
        jobId: activeJob.jobId,
        role: "assistant",
        mode,
        text: summary,
        status: "done"
      })
    )
  );
}

async function finalizeFailure(message: string, status: "failed" | "canceled", mode: AiEditMode) {
  if (status === "canceled" && cancelHandled) {
    return;
  }

  await flushRuntimeBuffers();
  const state = await readState();

  const nextState = updateUserMessageStatus(
    {
      ...state,
      status,
      pid: null,
      currentStep: null,
      heartbeatAt: new Date().toISOString(),
      heartbeatLabel: status === "canceled" ? "Canceled" : "Failed",
      error: message,
      completedAt: new Date().toISOString(),
      activityLog: trimLog([...state.activityLog, stampLogLine(message)])
    },
    activeJob.jobId,
    status
  );

  await writeState(
    pushMessage(
      nextState,
      createMessage({
        jobId: activeJob.jobId,
        role: status === "failed" ? "system" : "system",
        mode,
        text: message,
        status
      })
    )
  );
}

async function runAdapterAgent(
  agent: AgentRunner,
  jobId: string,
  jobPrompt: string,
  jobTargetPath: string,
  mode: AiEditMode,
  recentMessages: AiEditState["messages"]
): Promise<{ summary: string; thinking: string | null; failure: string | null }> {
  let summary = "";
  let thinking: string | null = null;
  const summaryParts: string[] = [];
  const thinkingParts: string[] = [];

  try {
    if (agent.prepare) {
      await agent.prepare({
        workspaceDir: pyanchorConfig.workspaceDir,
        timeoutMs: pyanchorConfig.agentTimeoutSeconds * 1000,
        model: pyanchorConfig.model,
        thinking: pyanchorConfig.thinking,
        signal: cancelController.signal
      });
    }

    const stream = agent.run(
      {
        prompt: jobPrompt,
        targetPath: jobTargetPath,
        mode,
        recentMessages,
        jobId
      },
      {
        workspaceDir: pyanchorConfig.workspaceDir,
        timeoutMs: pyanchorConfig.agentTimeoutSeconds * 1000,
        model: pyanchorConfig.model,
        thinking: pyanchorConfig.thinking,
        signal: cancelController.signal
      }
    );

    for await (const event of stream as AsyncIterable<AgentEvent>) {
      if (cancelRequested) break;

      switch (event.type) {
        case "log":
          queueLog([`[agent] ${event.text}`]);
          break;
        case "thinking":
          queueThinking(event.text);
          thinkingParts.push(event.text);
          break;
        case "step":
          await pulseState({ step: event.description ?? event.label, label: event.label });
          break;
        case "result":
          summaryParts.push(event.summary);
          if (event.thinking) thinkingParts.push(event.thinking);
          break;
      }
    }
  } catch (error) {
    if (cancelRequested) {
      throw new Error(CANCELED_ERROR);
    }
    const message = error instanceof Error ? error.message : String(error);
    return { summary: "", thinking: null, failure: message };
  }

  summary = summaryParts.join("\n\n").trim() || (mode === "edit" ? "변경 작업을 완료했습니다." : "");
  thinking = thinkingParts.join("\n\n").trim() || null;
  return { summary, thinking, failure: null };
}

async function processJob(jobId: string, jobPrompt: string, jobTargetPath: string, mode: AiEditMode) {
  const stateBefore = await readState();
  const agent = selectAgent();
  const isOpenClawInline = agent === OPENCLAW_INLINE;

  await withHeartbeat(
    {
      step: "워크스페이스를 준비하고 있습니다.",
      label: "Preparing"
    },
    async () => {
      await prepareWorkspace();
      if (isOpenClawInline) {
        await writeBrief(jobPrompt, jobTargetPath, mode, stateBefore.messages);
      }
    }
  );

  if (mode === "edit") {
    await withHeartbeat(
      {
        step: "AI 작업 호환성을 준비하고 있습니다.",
        label: "Install"
      },
      () => installWorkspaceDependencies()
    );
  }

  await pulseState({
    step: "AI 에이전트를 초기화하고 있습니다.",
    label: "Initializing"
  });

  let summary: string;
  let thinking: string | null;
  let failure: string | null;

  if (isOpenClawInline) {
    const agentId = await ensureAgent();
    queueLog(["AI 에이전트를 준비했습니다.", "모델 응답을 기다리는 중입니다."]);

    const agentResult = await withHeartbeat(
      {
        step: mode === "chat" ? "코드를 읽고 질문에 답하는 중입니다." : "코드를 분석하고 화면을 수정하는 중입니다.",
        label: "Thinking"
      },
      () => runAgent(agentId, jobId, jobTargetPath, mode)
    );

    ({ summary, thinking, failure } = parseAgentResult(agentResult.stdout));
  } else {
    queueLog([`AI 에이전트(${agent.name})를 준비했습니다.`, "모델 응답을 기다리는 중입니다."]);

    const result = await withHeartbeat(
      {
        step: mode === "chat" ? "코드를 읽고 질문에 답하는 중입니다." : "코드를 분석하고 화면을 수정하는 중입니다.",
        label: "Thinking"
      },
      () => runAdapterAgent(agent, jobId, jobPrompt, jobTargetPath, mode, stateBefore.messages)
    );

    summary = result.summary;
    thinking = result.thinking;
    failure = result.failure;
  }

  await flushRuntimeBuffers();

  if (failure) {
    throw new Error(failure);
  }

  if (mode === "chat") {
    await finalizeSuccess(summary, thinking, mode);
    return true;
  }

  await withHeartbeat(
    {
      step: "수정 결과를 워크스페이스에서 빌드 검증하고 있습니다.",
      label: "Build"
    },
    () => buildWorkspace()
  );

  await withHeartbeat(
    {
      step: "변경 사항을 서비스 코드에 반영하고 있습니다.",
      label: "Syncing"
    },
    () => syncToAppDir()
  );

  if (shouldRestartAfterEdit) {
    await updateState((state) =>
      pushMessage(
        {
          ...state,
          status: "running",
          pid: process.pid,
          currentStep: summary,
          heartbeatAt: new Date().toISOString(),
          heartbeatLabel: "Restarting",
          thinking: mergeThinking(state.thinking, thinking),
          error: null,
          completedAt: null
        },
        createMessage({
          jobId,
          role: "assistant",
          mode,
          text: summary,
          status: "done"
        })
      )
    );

    await restartFrontend();
    return false;
  }

  await finalizeSuccess(summary, thinking, mode);
  return true;
}

process.on("SIGTERM", () => {
  void finalizeCancellation("SIGTERM");
});

process.on("SIGINT", () => {
  void finalizeCancellation("SIGINT");
});

async function main() {
  let currentJobId = activeJob.jobId;
  let currentPrompt = activeJob.prompt;
  let currentTargetPath = activeJob.targetPath;
  let currentMode = activeJob.mode;

  while (true) {
    try {
      const canContinue = await processJob(currentJobId, currentPrompt, currentTargetPath, currentMode);
      if (!canContinue) {
        break;
      }
    } catch (error) {
      if (cancelRequested || (error instanceof Error && error.message === CANCELED_ERROR)) {
        await finalizeFailure(CANCELED_ERROR, "canceled", currentMode);
      } else {
        await finalizeFailure(
          error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
          "failed",
          currentMode
        );
      }
    }

    const next = await dequeueNext();
    if (!next) {
      break;
    }

    currentJobId = next.jobId;
    currentPrompt = next.prompt;
    currentTargetPath = next.targetPath;
    currentMode = next.mode;
  }
}

void main().catch(async (error) => {
  if (cancelRequested) {
    await finalizeFailure(CANCELED_ERROR, "canceled", activeJob.mode);
    return;
  }

  await finalizeFailure(
    error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
    "failed",
    activeJob.mode
  );
});
