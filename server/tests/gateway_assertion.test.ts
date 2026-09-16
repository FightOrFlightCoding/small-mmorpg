import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalPayloadHash,
  isGatewayHttpInvocation,
  parseGatewayAssertion,
  signGatewayAssertion,
  verifyGatewayAssertion,
} from "../src/domain/gateway_assertion";

const SECRET = "local-gateway-hmac-secret-not-production";

function makeAssertion(nowMs: number, operation: string, payloadJson: string, nonce = "0123456789abcdef") {
  const payload_hash = canonicalPayloadHash(payloadJson);
  const unsigned = {
    request_id: "req-1",
    timestamp: nowMs,
    nonce: nonce,
    operation: operation,
    payload_hash: payload_hash,
  };
  return {
    ...unsigned,
    signature: signGatewayAssertion(SECRET, unsigned),
  };
}

test("HTTP-key invocation has no user or session id; session invocation is distinct", () => {
  assert.equal(isGatewayHttpInvocation(undefined, undefined), true);
  assert.equal(isGatewayHttpInvocation("", ""), true);
  assert.equal(isGatewayHttpInvocation("user-1", undefined), false);
  assert.equal(isGatewayHttpInvocation(undefined, "session-1"), false);
});

test("gateway assertion accepts a fresh signed payload and rejects tamper, replay, and skew", () => {
  const now = 1_700_000_000_000;
  const payloadJson = JSON.stringify({ op: "ping" });
  const assertion = makeAssertion(now, "ping", payloadJson);
  assert.equal(parseGatewayAssertion(assertion)?.signature, assertion.signature);
  assert.deepEqual(
    verifyGatewayAssertion({
      assertion: assertion,
      secret: SECRET,
      operation: "ping",
      payloadJson: payloadJson,
      nowMs: now,
      seenNonce: false,
    }),
    { ok: true },
  );
  assert.equal(
    verifyGatewayAssertion({
      assertion: assertion,
      secret: SECRET,
      operation: "ping",
      payloadJson: payloadJson,
      nowMs: now,
      seenNonce: true,
    }).ok,
    false,
  );
  assert.equal(
    verifyGatewayAssertion({
      assertion: { ...assertion, operation: "lookup_email" },
      secret: SECRET,
      operation: "lookup_email",
      payloadJson: payloadJson,
      nowMs: now,
      seenNonce: false,
    }).ok,
    false,
  );
  assert.equal(
    verifyGatewayAssertion({
      assertion: assertion,
      secret: SECRET,
      operation: "ping",
      payloadJson: payloadJson,
      nowMs: now + 120000,
      seenNonce: false,
    }).ok,
    false,
  );
});
