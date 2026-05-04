/**
 * Gate-cookie JWT (HS256) — v0.37.0.
 *
 * Backwards-compatible upgrade path for the gate-cookie layer. Pre-v0.37
 * the cookie value was a literal `"1"` marker — any visitor who learned
 * the cookie *name* could forge it from devtools console with one line:
 *
 *     document.cookie = "pyanchor_dev=1; SameSite=Strict; Secure; Path=/"
 *
 * That made the gate-cookie layer a discoverability gate at best, not a
 * real privilege boundary. With this module, host apps (or the optional
 * /_pyanchor/unlock endpoint, see server.ts) issue a signed JWT instead;
 * the sidecar verifies the HMAC signature on every request, so a
 * forged cookie is rejected with 403 even if the attacker knows every
 * other public field on the page (token, cookie name, allowed origins).
 *
 * Self-contained — uses `node:crypto` only. No new runtime dep added to
 * the package; the JWT format is the standard HS256 (header.payload.sig)
 * three-part token so anyone can decode it with jwt.io to debug.
 *
 * Backward compatibility: if PYANCHOR_GATE_COOKIE_HMAC_SECRET is empty
 * the sidecar stays in v0.17 presence-only mode. Hosts opt in by
 * setting the secret + (re)issuing cookies as JWTs.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const HEADER_B64URL = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"; // {"alg":"HS256","typ":"JWT"}
export const JWT_TYP = "JWT";
export const JWT_ALG = "HS256";

export interface GateJwtPayload {
  /** issued-at, unix seconds */
  iat: number;
  /** expires-at, unix seconds */
  exp: number;
  /** payload version — bump if we ever change the field shape */
  v: 1;
  /** optional caller-supplied subject (e.g. user email, role); never trusted for auth */
  sub?: string;
}

export class GateJwtError extends Error {
  readonly code: "malformed" | "bad-signature" | "expired" | "wrong-alg" | "missing-secret";
  constructor(code: GateJwtError["code"], message: string) {
    super(message);
    this.name = "GateJwtError";
    this.code = code;
  }
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8");
  return b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  // Restore base64 padding so Buffer.from() accepts it.
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function hmacSha256(input: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(input).digest();
}

/**
 * Sign a gate-cookie JWT. `ttlSec` defaults to 30 days, matching the
 * pre-v0.37 demo cookie Max-Age. Caller may also pass an explicit
 * `iat` to make tests deterministic; production callers should not.
 */
export function signGateJwt(
  secret: string,
  options: { ttlSec?: number; sub?: string; iat?: number } = {}
): string {
  if (!secret) {
    throw new GateJwtError("missing-secret", "signGateJwt called without a secret");
  }
  const ttlSec = options.ttlSec ?? 60 * 60 * 24 * 30;
  if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
    throw new GateJwtError("malformed", `invalid ttlSec: ${ttlSec}`);
  }
  const iat = options.iat ?? Math.floor(Date.now() / 1000);
  const payload: GateJwtPayload = {
    iat,
    exp: iat + ttlSec,
    v: 1,
    ...(options.sub ? { sub: options.sub } : {})
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${HEADER_B64URL}.${payloadB64}`;
  const sig = b64url(hmacSha256(signingInput, secret));
  return `${signingInput}.${sig}`;
}

/**
 * Verify a gate-cookie JWT. Returns the decoded payload on success;
 * throws GateJwtError otherwise. The HMAC compare is timing-safe.
 *
 * `nowSec` is overridable so tests can pin clock; production callers
 * should leave it default.
 */
export function verifyGateJwt(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): GateJwtPayload {
  if (!secret) {
    throw new GateJwtError("missing-secret", "verifyGateJwt called without a secret");
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new GateJwtError("malformed", "token is empty");
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new GateJwtError("malformed", `expected 3 dot-separated parts, got ${parts.length}`);
  }
  const [headerPart, payloadPart, sigPart] = parts;

  // We only support our fixed HS256 header. Reject anything else even
  // if it would otherwise pass HMAC — this keeps the alg-confusion
  // attack surface (HS256 ↔ none, HS256 ↔ RS256-with-pubkey-as-secret)
  // closed at the parser layer.
  if (headerPart !== HEADER_B64URL) {
    let parsed: { alg?: unknown; typ?: unknown } = {};
    try {
      parsed = JSON.parse(b64urlDecode(headerPart).toString("utf8")) as typeof parsed;
    } catch {
      throw new GateJwtError("malformed", "header is not valid base64url JSON");
    }
    if (parsed.alg !== JWT_ALG || parsed.typ !== JWT_TYP) {
      throw new GateJwtError(
        "wrong-alg",
        `unsupported JWT header: alg=${String(parsed.alg)} typ=${String(parsed.typ)} (only HS256/JWT accepted)`
      );
    }
    // Header is HS256/JWT but in non-canonical form (different field
    // order or whitespace). Still reject so the canonical form is the
    // only thing we ever accept on the wire.
    throw new GateJwtError("wrong-alg", "JWT header must be in canonical HS256 form");
  }

  const expectedSig = hmacSha256(`${headerPart}.${payloadPart}`, secret);
  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sigPart);
  } catch {
    throw new GateJwtError("malformed", "signature is not valid base64url");
  }
  if (providedSig.length !== expectedSig.length) {
    // timingSafeEqual would throw on length mismatch; treat both as
    // bad-signature so an attacker can't probe length via the error.
    throw new GateJwtError("bad-signature", "HMAC signature did not match");
  }
  if (!timingSafeEqual(providedSig, expectedSig)) {
    throw new GateJwtError("bad-signature", "HMAC signature did not match");
  }

  let payload: GateJwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadPart).toString("utf8")) as GateJwtPayload;
  } catch {
    throw new GateJwtError("malformed", "payload is not valid base64url JSON");
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    payload.v !== 1
  ) {
    throw new GateJwtError("malformed", "payload missing required fields {iat, exp, v:1}");
  }
  if (payload.exp <= nowSec) {
    throw new GateJwtError("expired", `token expired at ${payload.exp}, now ${nowSec}`);
  }
  // No clock skew tolerance on `iat` — a future-dated token is suspect
  // (replay from before a clock fix, or attacker forgery attempt). Tests
  // pin `nowSec` so they can still test edge cases deterministically.
  if (payload.iat > nowSec + 60) {
    throw new GateJwtError("malformed", `token iat is in the future: iat=${payload.iat} now=${nowSec}`);
  }

  return payload;
}
