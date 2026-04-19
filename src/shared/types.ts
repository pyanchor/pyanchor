export type AiEditStatus = "idle" | "running" | "canceling" | "done" | "failed" | "canceled";

export type AiEditMode = "edit" | "chat";

export type AiEditMessageRole = "user" | "assistant" | "system";

export type AiEditMessageStatus = "queued" | "running" | "done" | "failed" | "canceled";

export interface AiEditQueueItem {
  jobId: string;
  prompt: string;
  targetPath: string;
  enqueuedAt: string;
  mode: AiEditMode;
  /** Actor passthrough (v0.19.0+). Carried so queued jobs preserve
   *  identity context until they actually run. Optional for backward
   *  compatibility with state.json files written before v0.19. */
  actor?: string;
}

export interface AiEditMessage {
  id: string;
  jobId: string | null;
  role: AiEditMessageRole;
  mode: AiEditMode;
  text: string;
  createdAt: string;
  status: AiEditMessageStatus | null;
}

export interface AiEditState {
  configured: boolean;
  status: AiEditStatus;
  jobId: string | null;
  pid: number | null;
  prompt: string;
  targetPath: string;
  mode: AiEditMode | null;
  currentStep: string | null;
  heartbeatAt: string | null;
  heartbeatLabel: string | null;
  thinking: string | null;
  activityLog: string[];
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  queue: AiEditQueueItem[];
  messages: AiEditMessage[];
}

export interface AiEditStartInput {
  prompt: string;
  targetPath?: string;
  mode?: AiEditMode;
  /**
   * Optional identity passthrough (v0.19.0+). The host app's auth
   * middleware reads its own session and injects this via the
   * `X-Pyanchor-Actor` request header; pyanchor records the value
   * verbatim in the audit log + PR body, but does NOT verify it —
   * identity is the host's responsibility. Maxes at 256 chars.
   */
  actor?: string;
}

export interface AiEditCancelInput {
  jobId?: string;
}

export interface AdminHealth {
  configured: boolean;
  port: number;
  host: string;
  runtimeBasePath: string;
  runtimeAliasPath: string;
  stateFile: string;
  workspaceDir: string;
  appDir: string;
  workerScript: string;
  healthcheckUrl: string;
  agent: string;
  fastReload: boolean;
}
