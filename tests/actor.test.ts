/**
 * Tests for the v0.27.0 X-Pyanchor-Actor HMAC verification path.
 *
 * Locks the contract documented in src/actor.ts:
 *   - secret unset → unsigned pass-through (backward compat)
 *   - secret set → strict HMAC verification
 *   - actor strings containing '.' (e.g. emails) parse correctly
 *   - constant-time compare; we don't unit-test timing here but
 *     we DO assert that mismatched valid-shape sigs reject
 *   - 256-char cap is applied before split
 */

import { describe, expect, it } from "vitest";

import { signActor, verifyActorHeader } from "../src/actor";

const SECRET = "test-secret-32-bytes-long-1234567890abcdef";

describe("verifyActorHeader (no secret = unsigned pass-through)", () => {
  it("returns unsigned for any non-empty value when secret is null", () => {
    const r = verifyActorHeader("alice@example.com", null);
    expect(r.kind).toBe("unsigned");
    if (r.kind === "unsigned") expect(r.actor).toBe("alice@example.com");
  });

  it("returns unsigned when secret is empty string", () => {
    const r = verifyActorHeader("alice", "");
    expect(r.kind).toBe("unsigned");
  });

  it("rejects empty header even without secret", () => {
    expect(verifyActorHeader("", null).kind).toBe("rejected");
    expect(verifyActorHeader("   ", null).kind).toBe("rejected");
    expect(verifyActorHeader(null, null).kind).toBe("rejected");
    expect(verifyActorHeader(undefined, null).kind).toBe("rejected");
  });

  it("trims whitespace and caps at 256 chars in unsigned mode", () => {
    const long = "x".repeat(300);
    const r = verifyActorHeader(`  ${long}  `, null);
    expect(r.kind).toBe("unsigned");
    if (r.kind === "unsigned") expect(r.actor.length).toBe(256);
  });
});

describe("verifyActorHeader (secret set = strict HMAC)", () => {
  it("accepts a correctly signed actor", () => {
    const signed = signActor("alice@example.com", SECRET);
    const r = verifyActorHeader(signed, SECRET);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.actor).toBe("alice@example.com");
  });

  it("handles actors containing dots (emails) by splitting on LAST dot", () => {
    const signed = signActor("user.name@sub.example.com", SECRET);
    const r = verifyActorHeader(signed, SECRET);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.actor).toBe("user.name@sub.example.com");
  });

  it("rejects when no signature segment present", () => {
    const r = verifyActorHeader("alice@example.com", SECRET);
    expect(r.kind).toBe("rejected");
    if (r.kind === "rejected") expect(r.reason).toBe("malformed");
  });

  it("rejects when signature is not 64 hex chars", () => {
    const r = verifyActorHeader("alice.deadbeef", SECRET);
    expect(r.kind).toBe("rejected");
    if (r.kind === "rejected") expect(r.reason).toBe("malformed");
  });

  it("rejects when signature is 64 chars but not hex", () => {
    const fake = "alice." + "z".repeat(64);
    const r = verifyActorHeader(fake, SECRET);
    expect(r.kind).toBe("rejected");
    if (r.kind === "rejected") expect(r.reason).toBe("malformed");
  });

  it("rejects when signature was made with a different secret", () => {
    const signed = signActor("alice", "different-secret");
    const r = verifyActorHeader(signed, SECRET);
    expect(r.kind).toBe("rejected");
    if (r.kind === "rejected") expect(r.reason).toBe("bad_signature");
  });

  it("rejects when actor was tampered after signing", () => {
    const signed = signActor("alice", SECRET);
    // Replace actor segment but keep signature
    const sig = signed.slice(signed.lastIndexOf("."));
    const tampered = `bob${sig}`;
    const r = verifyActorHeader(tampered, SECRET);
    expect(r.kind).toBe("rejected");
    if (r.kind === "rejected") expect(r.reason).toBe("bad_signature");
  });

  it("rejects empty header in signed mode", () => {
    expect(verifyActorHeader("", SECRET).kind).toBe("rejected");
    expect(verifyActorHeader(null, SECRET).kind).toBe("rejected");
  });

  it("uppercase hex signatures are also accepted (lowercased internally)", () => {
    const signed = signActor("alice", SECRET);
    const upper = signed.replace(/\.([0-9a-f]+)$/, (_, sig) => "." + sig.toUpperCase());
    const r = verifyActorHeader(upper, SECRET);
    expect(r.kind).toBe("ok");
  });
});

describe("signActor (deterministic + reversible)", () => {
  it("produces stable output for same input", () => {
    expect(signActor("alice", SECRET)).toBe(signActor("alice", SECRET));
  });

  it("produces different output for different actors", () => {
    expect(signActor("alice", SECRET)).not.toBe(signActor("bob", SECRET));
  });

  it("produces different output for different secrets", () => {
    expect(signActor("alice", "secret-a")).not.toBe(signActor("alice", "secret-b"));
  });

  it("output is round-trippable via verifyActorHeader", () => {
    const signed = signActor("operator-42", SECRET);
    const r = verifyActorHeader(signed, SECRET);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.actor).toBe("operator-42");
  });
});
