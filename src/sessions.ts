/**
 * Opaque session-ID store for the cookie auth path.
 *
 * v0.2.5/v0.2.6 stored the raw bearer token directly in the
 * pyanchor_session cookie. That meant any cookie theft (XSS, dev-tools
 * leak, log scrape) handed an attacker a permanent bearer credential
 * indistinguishable from the one configured in PYANCHOR_TOKEN.
 *
 * v0.2.7 introduces an opaque session id: the cookie holds a random
 * 32-byte token that maps server-side to "this client is authenticated
 * until <expiresAt>". Revoking it is a Map.delete; rotating PYANCHOR_TOKEN
 * does not have to invalidate every active overlay.
 *
 * The store is in-memory only (Map). Server restart wipes all sessions —
 * acceptable for a single-process self-hosted sidecar; documented in
 * SECURITY.md as expected.
 */

import { randomBytes } from "node:crypto";

interface SessionRecord {
  expiresAt: number; // epoch ms
}

const sessions = new Map<string, SessionRecord>();
const MAX_SESSIONS = 4096;

/**
 * Issue a new session id. Returns the opaque token string the caller
 * should set as the cookie value, plus its TTL in milliseconds.
 */
export function createSession(ttlMs: number): { id: string; ttlMs: number } {
  pruneIfFull();
  const id = randomBytes(32).toString("hex");
  sessions.set(id, { expiresAt: Date.now() + ttlMs });
  return { id, ttlMs };
}

/**
 * Returns true iff the given id refers to an active, non-expired
 * session. Side effect: deletes the entry on expiry to keep the
 * Map bounded.
 */
export function validateSession(id: string): boolean {
  if (!id) return false;
  const record = sessions.get(id);
  if (!record) return false;
  if (Date.now() >= record.expiresAt) {
    sessions.delete(id);
    return false;
  }
  return true;
}

/** Drop a specific session — used by an explicit logout endpoint. */
export function revokeSession(id: string): void {
  if (!id) return;
  sessions.delete(id);
}

/** Drop every session — used by tests and by future "rotate token" flows. */
export function clearAllSessions(): void {
  sessions.clear();
}

/** Internal: count, exposed for tests / observability. */
export function activeSessionCount(): number {
  return sessions.size;
}

function pruneIfFull(): void {
  if (sessions.size < MAX_SESSIONS) return;
  const now = Date.now();
  for (const [id, record] of sessions) {
    if (record.expiresAt <= now) sessions.delete(id);
  }
  // If still full after expiry sweep, drop the oldest half. Hard cap
  // matters more than fairness here; the sidecar isn't multi-tenant.
  if (sessions.size >= MAX_SESSIONS) {
    const toDrop = Math.floor(MAX_SESSIONS / 2);
    let dropped = 0;
    for (const id of sessions.keys()) {
      sessions.delete(id);
      if (++dropped >= toDrop) break;
    }
  }
}
