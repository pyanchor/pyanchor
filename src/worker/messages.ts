/**
 * Pure helpers for state.messages mutations used by both the runner
 * (finalizeCancellation, processJob assistant message push) and the
 * lifecycle module (finalizeSuccess/Failure, dequeueNext). Extracted
 * so neither side has to re-export the other's helpers.
 *
 * Mirrors the same-named helpers in src/state.ts; kept duplicate
 * here so the worker process doesn't reach into the sidecar's
 * higher-level state module (which has spawn / fetch side effects).
 */

import { randomUUID } from "node:crypto";

import type {
  AiEditMessage,
  AiEditMessageStatus,
  AiEditMode,
  AiEditState
} from "../shared/types";

export interface CreateMessageInput {
  jobId: string | null;
  role: AiEditMessage["role"];
  mode: AiEditMode;
  text: string;
  status: AiEditMessageStatus | null;
}

export const createMessage = ({
  jobId,
  role,
  mode,
  text,
  status
}: CreateMessageInput): AiEditMessage => ({
  id: randomUUID(),
  jobId,
  role,
  mode,
  text,
  createdAt: new Date().toISOString(),
  status
});

export const updateUserMessageStatus = (
  state: AiEditState,
  jobId: string,
  status: AiEditMessageStatus
): AiEditState => ({
  ...state,
  messages: state.messages.map((message) =>
    message.jobId === jobId && message.role === "user" ? { ...message, status } : message
  )
});

export const pushMessageWithCap = (
  state: AiEditState,
  message: AiEditMessage,
  cap: number
): AiEditState => ({
  ...state,
  messages: [...state.messages, message].slice(-cap)
});
