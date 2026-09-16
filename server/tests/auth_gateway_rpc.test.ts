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

function signedBody(body: { [key: string]: unknown }, nowMs: number): string {
  const payloadJson = JSON.stringify(body);
  const operation = typeof body.op === "string" ? body.op : "ping";
  const unsigned = {
    request_id: "req-" + operation,
    timestamp: nowMs,
    nonce: randomBytes(16).toString("hex"),
    operation: operation,
    payload_hash: canonicalPayloadHash(payloadJson),
  };
  const assertion = {
    ...unsigned,
    signature: signGatewayAssertion(SECRET, unsigned),
  };
  return JSON.stringify({ assertion: assertion, ...body });
}

function signedPing(nowMs: number): string {
  return signedBody({ op: "ping" }, nowMs);
}

function httpCtx(): nkruntime.Context {
  return {
    env: { VIBECODE_GATEWAY_HMAC_SECRET: SECRET },
    executionMode: "rpc",
    node: "local",
    version: "3.40.0",
  } as nkruntime.Context;
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
  assert.deepEqual(JSON.parse(rpcAuthGateway(ctx, fakeLogger(), fakeNk(), JSON.stringify({ op: "ping" }))), {
    ok: false,
    code: "gateway_rpc_forbidden",
  });
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
  assert.deepEqual(JSON.parse(rpcAuthGateway(ctx, fakeLogger(), fakeNk(), signedPing(Date.now()))), {
    ok: false,
    code: "gateway_rpc_forbidden",
  });
});

test("auth_gateway rejects HTTP-key calls without a signed assertion", () => {
  const ctx = {
    env: { VIBECODE_GATEWAY_HMAC_SECRET: SECRET },
    executionMode: "rpc",
    node: "local",
    version: "3.40.0",
  } as nkruntime.Context;
  assert.deepEqual(JSON.parse(rpcAuthGateway(ctx, fakeLogger(), fakeNk(), JSON.stringify({ op: "ping" }))), {
    ok: false,
    code: "missing_assertion",
  });
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

test("support_snapshot never returns an email address", () => {
  const nk = {
    ...fakeNk(),
    accountGetId() {
      return {
        email: "hidden@example.com",
        disableTime: 0,
        user: { userId: "user-1" },
      };
    },
    storageRead() {
      return [];
    },
  } as unknown as nkruntime.Nakama;
  const body = JSON.parse(
    rpcAuthGateway(httpCtx(), fakeLogger(), nk, signedBody({ op: "support_snapshot", user_id: "user-1" }, Date.now())),
  );
  assert.equal(body.ok, true);
  assert.equal(body.op, "support_snapshot");
  assert.equal(body.user_id, "user-1");
  assert.equal(body.email, undefined);
  assert.equal(JSON.stringify(body).indexOf("hidden@example.com"), -1);
  assert.equal(JSON.stringify(body).indexOf("@"), -1);
});
