/**
 * X-Pyanchor-Actor header verification (v0.27.0+).
 *
 * Background:
 *   Pre-v0.27, pyanchor accepted any value the host put in the
 *   `X-Pyanchor-Actor` header and recorded it verbatim into the audit
 *   log. The threat model said: "Pyanchor doesn't verify identity —
 *   the host owns auth." That's a fine first cut, but it also means a
 *   compromised host (or a misconfigured reverse proxy that forwards
 *   client headers) can spoof actor identities into the audit trail.
 *
 * v0.27 adds OPTIONAL HMAC verification:
 *   - When PYANCHOR_ACTOR_SIGNING_SECRET is unset (default), behavior
 *     is unchanged: header value is taken at face, capped at 256 chars,
 *     stored as-is. Backward compatible — existing deployments don't
 *     need to do anything.
 *   - When the env is set, the header is treated as `<actor>.<sig>`
 *     where <sig> is hex(HMAC-SHA256(secret, actor)). Mismatched or
 *     malformed values cause the actor to be silently dropped (the
 *     edit still proceeds — the host's other auth gates already let
 *     the request through; we just don't trust the actor field).
 *
 * Why opt-in?
 *   - Stable @ 1.0 surface: existing hosts must not break on upgrade.
 *   - Threat model still says host owns identity. HMAC just lets you
 *     bind the audit trail to a key only the host knows, so a leaked
 *     pyanchor token can't fabricate audit lines for arbitrary users.
 *
 * Why not JWT?
 *   - HMAC is one dep (node:crypto, already in use), one line to
 *     verify, no parsing surface. JWT brings clock-skew, alg=none
 *     vulnerabilities, kid/jwks complexity. The "actor" field doesn't
 *     need expiry or claims — it's just an identity string.
 *
 * Header format reference (when signing is on):
 *   X-Pyanchor-Actor: alice@example.com.7e3f...c2 (lowercase hex)
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Result of a header parse + verify pass. */
export type ActorVerification =
  | { kind: "ok"; actor: string }
  | { kind: "unsigned"; actor: string }
  | { kind: "rejected"; reason: "malformed" | "bad_signature" | "empty" };

const MAX_ACTOR_LEN = 256;

/**
 * Sign an actor identity. Used by host apps that want to mint a header
 * value, and by tests. Pure helper; no env dependency so the host can
 * call it with their own key.
 */
export function signActor(actor: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(actor, "utf8").digest("hex");
  return `${actor}.${sig}`;
}

/**
 * Verify and unpack an X-Pyanchor-Actor header value.
 *
 * @param raw     Raw header value (already string-coerced by the caller).
 * @param secret  HMAC secret if signing is enforced; null/empty disables.
 * @returns       Verification result. Callers should record `actor` only
 *                when kind === "ok" or kind === "unsigned".
 */
export function verifyActorHeader(
  raw: string | null | undefined,
  secret: string | null
): ActorVerification {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { kind: "rejected", reason: "empty" };
  }
  const trimmed = raw.trim().slice(0, MAX_ACTOR_LEN);

  // Signing not configured — pass through with the historic 256-char cap.
  if (!secret) {
    return { kind: "unsigned", actor: trimmed };
  }

  // Signing enforced — split on the LAST '.' so actor strings containing
  // dots (e.g. emails) still parse. Hex sig is fixed 64 chars.
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot < 1 || trimmed.length - lastDot - 1 !== 64) {
    return { kind: "rejected", reason: "malformed" };
  }
  const actor = trimmed.slice(0, lastDot);
  const providedHex = trimmed.slice(lastDot + 1).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(providedHex)) {
    return { kind: "rejected", reason: "malformed" };
  }

  const expectedHex = createHmac("sha256", secret)
    .update(actor, "utf8")
    .digest("hex");

  // Constant-time compare on equal-length hex buffers.
  const a = Buffer.from(providedHex, "hex");
  const b = Buffer.from(expectedHex, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { kind: "rejected", reason: "bad_signature" };
  }
  return { kind: "ok", actor };
}
