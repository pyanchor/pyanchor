/**
 * v0.37.0 — gate-cookie HS256 JWT helper unit tests.
 *
 * Pure unit tests against src/gate-jwt.ts. No env, no module reset
 * needed — the helper is stateless.
 */

import { describe, expect, it } from "vitest";

import {
  GateJwtError,
  signGateJwt,
  verifyGateJwt
} from "../src/gate-jwt";

const SECRET = "test-secret-deadbeef-deadbeef-deadbeef-deadbeef";
const OTHER_SECRET = "another-secret-cafebabe-cafebabe-cafebabe-cafe";

describe("signGateJwt", () => {
  it("produces a 3-part JWT (header.payload.signature)", () => {
    const token = signGateJwt(SECRET);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(parts[1].length).toBeGreaterThan(0);
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it("base64url-encodes the payload (no `=` padding, no `+`/`/`)", () => {
    const token = signGateJwt(SECRET);
    const [, payloadB64] = token.split(".");
    expect(payloadB64).not.toMatch(/=/);
    expect(payloadB64).not.toMatch(/\+/);
    expect(payloadB64).not.toMatch(/\//);
  });

  it("payload contains iat + exp + v=1", () => {
    const iat = 1_700_000_000;
    const ttlSec = 3600;
    const token = signGateJwt(SECRET, { iat, ttlSec });
    const [, payloadB64] = token.split(".");
    const padded =
      payloadB64.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (payloadB64.length % 4)) % 4);
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    expect(parsed).toEqual({ iat, exp: iat + ttlSec, v: 1 });
  });

  it("includes optional `sub` claim when provided", () => {
    const token = signGateJwt(SECRET, { sub: "alice@example.com" });
    const [, payloadB64] = token.split(".");
    const padded =
      payloadB64.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (payloadB64.length % 4)) % 4);
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    expect(parsed.sub).toBe("alice@example.com");
  });

  it("throws missing-secret when secret is empty", () => {
    expect(() => signGateJwt("")).toThrowError(GateJwtError);
  });

  it("throws on invalid ttlSec (negative, zero, NaN)", () => {
    expect(() => signGateJwt(SECRET, { ttlSec: 0 })).toThrowError(GateJwtError);
    expect(() => signGateJwt(SECRET, { ttlSec: -1 })).toThrowError(GateJwtError);
    expect(() => signGateJwt(SECRET, { ttlSec: Number.NaN })).toThrowError(GateJwtError);
  });
});

describe("verifyGateJwt — happy path", () => {
  it("round-trips a freshly signed token", () => {
    const iat = Math.floor(Date.now() / 1000);
    const token = signGateJwt(SECRET, { iat, ttlSec: 600 });
    const payload = verifyGateJwt(token, SECRET, iat + 1);
    expect(payload.iat).toBe(iat);
    expect(payload.exp).toBe(iat + 600);
    expect(payload.v).toBe(1);
  });

  it("preserves the `sub` claim through round-trip", () => {
    const iat = 1_700_000_000;
    const token = signGateJwt(SECRET, { iat, sub: "reviewer", ttlSec: 60 });
    const payload = verifyGateJwt(token, SECRET, iat + 1);
    expect(payload.sub).toBe("reviewer");
  });
});

describe("verifyGateJwt — rejection paths", () => {
  it("rejects empty / null / non-string tokens (malformed)", () => {
    expect(() => verifyGateJwt("", SECRET)).toThrow(/empty/);
    expect(() => verifyGateJwt(null as unknown as string, SECRET)).toThrow(/empty/);
    expect(() => verifyGateJwt(123 as unknown as string, SECRET)).toThrow(/empty/);
  });

  it("rejects tokens with the wrong number of dot-parts (malformed)", () => {
    expect(() => verifyGateJwt("only.two", SECRET)).toThrow(/3 dot-separated/);
    expect(() => verifyGateJwt("a.b.c.d", SECRET)).toThrow(/3 dot-separated/);
    expect(() => verifyGateJwt("notajwt", SECRET)).toThrow(/3 dot-separated/);
  });

  it("rejects tokens signed with a different secret (bad-signature)", () => {
    const iat = Math.floor(Date.now() / 1000);
    const token = signGateJwt(OTHER_SECRET, { iat, ttlSec: 600 });
    let caught: GateJwtError | undefined;
    try {
      verifyGateJwt(token, SECRET, iat + 1);
    } catch (err) {
      caught = err as GateJwtError;
    }
    expect(caught).toBeInstanceOf(GateJwtError);
    expect(caught?.code).toBe("bad-signature");
  });

  it("rejects tokens with a tampered payload (bad-signature)", () => {
    const iat = Math.floor(Date.now() / 1000);
    const token = signGateJwt(SECRET, { iat, ttlSec: 600 });
    const [header, , sig] = token.split(".");
    // Forge a payload with a future `exp` but keep the original signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({ iat, exp: iat + 999_999, v: 1 })
    )
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const tampered = `${header}.${forgedPayload}.${sig}`;

    let caught: GateJwtError | undefined;
    try {
      verifyGateJwt(tampered, SECRET, iat + 1);
    } catch (err) {
      caught = err as GateJwtError;
    }
    expect(caught?.code).toBe("bad-signature");
  });

  it("rejects expired tokens (expired)", () => {
    const iat = 1_700_000_000;
    const token = signGateJwt(SECRET, { iat, ttlSec: 60 });
    let caught: GateJwtError | undefined;
    try {
      verifyGateJwt(token, SECRET, iat + 61); // 1s after expiry
    } catch (err) {
      caught = err as GateJwtError;
    }
    expect(caught?.code).toBe("expired");
  });

  it("rejects tokens whose iat is too far in the future (malformed)", () => {
    const iat = 1_700_000_000;
    const token = signGateJwt(SECRET, { iat, ttlSec: 60 });
    let caught: GateJwtError | undefined;
    try {
      verifyGateJwt(token, SECRET, iat - 120); // verifier clock 2min behind issuer
    } catch (err) {
      caught = err as GateJwtError;
    }
    expect(caught?.code).toBe("malformed");
  });

  it("tolerates ≤60s clock skew on iat", () => {
    const iat = 1_700_000_000;
    const token = signGateJwt(SECRET, { iat, ttlSec: 60 });
    // Verifier clock is 30s behind — should still pass.
    expect(() => verifyGateJwt(token, SECRET, iat - 30)).not.toThrow();
  });

  it("rejects alg-confusion attempts (alg=none)", () => {
    // Forged "none"-alg JWT — payload + signature crafted to pass JSON
    // shape but header is the alg=none classic exploit.
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const payload = Buffer.from(
      JSON.stringify({ iat: 1, exp: 99_999_999_999, v: 1 })
    )
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const forged = `${noneHeader}.${payload}.`;

    let caught: GateJwtError | undefined;
    try {
      verifyGateJwt(forged, SECRET);
    } catch (err) {
      caught = err as GateJwtError;
    }
    expect(caught?.code).toBe("wrong-alg");
  });

  it("rejects alg-confusion attempts (alg=RS256)", () => {
    const rsHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" }))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const payload = Buffer.from(JSON.stringify({ iat: 1, exp: 99_999_999_999, v: 1 }))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    let caught: GateJwtError | undefined;
    try {
      verifyGateJwt(`${rsHeader}.${payload}.deadbeef`, SECRET);
    } catch (err) {
      caught = err as GateJwtError;
    }
    expect(caught?.code).toBe("wrong-alg");
  });

  it("rejects HS256 in non-canonical header form (whitespace / field-order)", () => {
    // Same alg/typ but different JSON serialization → different b64 → reject.
    const wonkyHeader = Buffer.from(JSON.stringify({ typ: "JWT", alg: "HS256" }))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const payload = Buffer.from(JSON.stringify({ iat: 1, exp: 99_999_999_999, v: 1 }))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    let caught: GateJwtError | undefined;
    try {
      verifyGateJwt(`${wonkyHeader}.${payload}.deadbeef`, SECRET);
    } catch (err) {
      caught = err as GateJwtError;
    }
    expect(caught?.code).toBe("wrong-alg");
  });

  it("rejects payloads missing required fields (malformed)", async () => {
    // Sign a payload that lacks `v: 1`.
    const header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const badPayload = Buffer.from(JSON.stringify({ iat: 1, exp: 99_999_999_999 }))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    // Must use a real HMAC over THIS payload so signature passes — only
    // payload-shape check should reject.
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", SECRET)
      .update(`${header}.${badPayload}`)
      .digest()
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    let caught: GateJwtError | undefined;
    try {
      verifyGateJwt(`${header}.${badPayload}.${sig}`, SECRET);
    } catch (err) {
      caught = err as GateJwtError;
    }
    expect(caught?.code).toBe("malformed");
  });

  it("rejects when verifier secret is empty (missing-secret)", () => {
    const token = signGateJwt(SECRET);
    expect(() => verifyGateJwt(token, "")).toThrowError(GateJwtError);
  });
});
