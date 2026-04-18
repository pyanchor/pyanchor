/**
 * Pure parsers for the OpenClaw streaming JSON event format.
 *
 * The CLI emits one JSON object per line on stdout; the final response
 * is a single JSON document with `result.payloads` (or `content`)
 * carrying assistant text and reasoning blocks.
 */

export interface AgentSignalBucket {
  /** Plain text emitted by the agent (rendered as activity log items). */
  texts: string[];
  /** Reasoning / thinking traces. */
  thinkings: string[];
  /** Status messages (event/status/message fields). */
  logs: string[];
}

/**
 * Recursively walks a parsed JSON node and pushes any agent signals it
 * finds into `bucket`. Tolerant: arrays, objects, primitives, nulls all
 * handled.
 */
export function extractAgentSignals(node: unknown, bucket: AgentSignalBucket): void {
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

interface AgentPayload {
  text?: string;
  thinking?: string;
  type?: string;
}

/**
 * Reduces an array of payloads (the final-response shape) into a
 * single summary string and an optional thinking string.
 */
export function collectTextPayloads(payloads: AgentPayload[]): {
  summary: string;
  thinking: string | null;
} {
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

/**
 * Pattern-matches OpenClaw output for known failure modes and returns a
 * user-friendly message, or null when nothing recognizable is found.
 */
export function detectAgentFailure(rawOutput: string, summary: string): string | null {
  const haystack = `${rawOutput}\n${summary}`.toLowerCase();

  if (haystack.includes("request timed out before a response was generated")) {
    return "Agent response timed out. Try narrowing the request and retry.";
  }

  if (haystack.includes("timed out") && haystack.includes("response")) {
    return "Agent response timed out. Try again shortly.";
  }

  if (haystack.includes("unauthorized") || haystack.includes("401")) {
    return "Agent authentication failed.";
  }

  return null;
}

export interface AgentResult {
  summary: string;
  thinking: string | null;
  failure: string | null;
}

/**
 * Top-level parser for the final agent response. Accepts either a raw
 * stdout string (JSON document) or non-JSON fallback text. Always
 * returns a usable AgentResult; failure detection runs against both
 * the raw output and the extracted summary.
 */
export function parseAgentResult(stdout: string): AgentResult {
  try {
    const payload = JSON.parse(stdout) as {
      content?: AgentPayload[];
      result?: { payloads?: AgentPayload[] };
    };
    const payloads = payload?.result?.payloads ?? payload?.content ?? [];
    const { summary, thinking } = collectTextPayloads(Array.isArray(payloads) ? payloads : []);
    const failure = detectAgentFailure(stdout, summary);

    return {
      summary: summary || "Edit complete.",
      thinking,
      failure
    };
  } catch {
    const failure = detectAgentFailure(stdout, stdout);
    return {
      summary: stdout.trim() || "Edit complete.",
      thinking: null,
      failure
    };
  }
}
