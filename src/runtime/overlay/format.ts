/**
 * Pure formatting helpers used by the overlay templates.
 *
 * Extracted out of the 1074-LOC overlay.ts so they can be unit-tested
 * without spinning up jsdom. Every function is total, deterministic,
 * and free of module state.
 */

/**
 * Five-character HTML escape (& < > " '). Matches the same escape set
 * the admin renderer uses on the server side (src/admin.ts) so values
 * round-trip identically across both contexts.
 */
export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/**
 * Locale-agnostic HH:MM:SS in the viewer's local timezone. Returns
 * null on null input or unparseable date strings — callers render an
 * em-dash placeholder for null. Mirrors the worker's stampLogLine
 * format so log lines and heartbeats display identically.
 */
export const formatTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  const hh = String(value.getHours()).padStart(2, "0");
  const mm = String(value.getMinutes()).padStart(2, "0");
  const ss = String(value.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

/**
 * Returns the first non-blank line from a multi-line string, trimmed.
 * Used to summarize the agent's "thinking" text into a one-line
 * status preview without re-rendering the entire stream.
 */
export const takeFirstLine = (value: string | null): string => {
  if (!value) return "";
  return (
    value
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
};

/**
 * Truncate at `max` characters, appending an ellipsis when shortened.
 * Default max = 120 — matches the original overlay default. The
 * ellipsis takes one of the `max` slots so the returned string never
 * exceeds the cap.
 */
export const shorten = (value: string, max = 120): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;
