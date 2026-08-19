import assert from "node:assert/strict";
import test from "node:test";
import { signRpcEnvelope } from "../src/nakama/assertion";

test("signed RPC envelopes hash the body without the assertion and never embed secrets as plaintext fields", () => {
  const body = { op: "ping" };
  const signed = signRpcEnvelope("local-gateway-hmac-secret-not-production", "ping", body, "req-1", 1_700_000_000_000);
  assert.equal(signed.assertion.operation, "ping");
  assert.equal(signed.assertion.payload_hash.length, 64);
  assert.equal(signed.assertion.signature.length, 64);
  assert.equal(JSON.stringify(signed.envelope).indexOf("local-gateway-hmac-secret-not-production"), -1);
  assert.deepEqual(signed.envelope.op, "ping");
});
