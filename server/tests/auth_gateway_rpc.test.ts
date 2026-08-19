import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { signGatewayAssertion, canonicalPayloadHash } from "../src/domain/gateway_assertion";
import { rpcAuthGateway } from "../src/rpcs/auth_gateway";

const SECRET = "local-gateway-hmac-secret-not-production";

function fakeLogger(): nkruntime.Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  } as unknown as nkruntime.Logger;
}

function fakeNk(): nkruntime.Nakama {
  return {
    hmacSha256Hash(input: string, key: string): ArrayBuffer {
      const digest = createHmac("sha256", key).update(input, "utf8").digest();
      return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
    },
    base16Encode(buffer: ArrayBuffer): string {
      return Buffer.from(buffer).toString("hex");
    },
  } as unknown as nkruntime.Nakama;
}

function signedPing(nowMs: number): string {
  const body = { op: "ping" };
  const payloadJson = JSON.stringify(body);
  const unsigned = {
    request_id: "req-ping",
    timestamp: nowMs,
    nonce: randomBytes(16).toString("hex"),
    operation: "ping",
    payload_hash: canonicalPayloadHash(payloadJson),
  };
  const assertion = {
    ...unsigned,
    signature: signGatewayAssertion(SECRET, unsigned),
  };
  return JSON.stringify({ assertion: assertion, op: "ping" });
}

test("auth_gateway rejects ordinary session invocation", () => {
  const ctx = {
    env: { VIBECODE_GATEWAY_HMAC_SECRET: SECRET },
    executionMode: "rpc",
    node: "local",
    version: "3.40.0",
    userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    sessionId: "session-1",
  } as nkruntime.Context;
  assert.throws(
    () => rpcAuthGateway(ctx, fakeLogger(), fakeNk(), JSON.stringify({ op: "ping" })),
    /gateway_rpc_forbidden/,
  );
});

test("auth_gateway rejects a signed ping from a session even when the assertion is valid", () => {
  const ctx = {
    env: { VIBECODE_GATEWAY_HMAC_SECRET: SECRET },
    executionMode: "rpc",
    node: "local",
    version: "3.40.0",
    userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    sessionId: "session-1",
  } as nkruntime.Context;
  assert.throws(() => rpcAuthGateway(ctx, fakeLogger(), fakeNk(), signedPing(Date.now())), /gateway_rpc_forbidden/);
});

test("auth_gateway rejects HTTP-key calls without a signed assertion", () => {
  const ctx = {
    env: { VIBECODE_GATEWAY_HMAC_SECRET: SECRET },
    executionMode: "rpc",
    node: "local",
    version: "3.40.0",
  } as nkruntime.Context;
  assert.throws(() => rpcAuthGateway(ctx, fakeLogger(), fakeNk(), JSON.stringify({ op: "ping" })), /missing_assertion/);
});

test("auth_gateway accepts HTTP-key ping with a valid assertion", () => {
  const ctx = {
    env: { VIBECODE_GATEWAY_HMAC_SECRET: SECRET },
    executionMode: "rpc",
    node: "local",
    version: "3.40.0",
  } as nkruntime.Context;
  const body = rpcAuthGateway(ctx, fakeLogger(), fakeNk(), signedPing(Date.now()));
  assert.deepEqual(JSON.parse(body), { ok: true, op: "ping" });
});

test("payload hash helper matches Node SHA-256", () => {
  const payload = JSON.stringify({ op: "ping" });
  assert.equal(canonicalPayloadHash(payload), createHash("sha256").update(payload, "utf8").digest("hex"));
});
