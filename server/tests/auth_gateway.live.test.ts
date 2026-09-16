import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { canonicalPayloadHash, signGatewayAssertion } from "../src/domain/gateway_assertion";
import { authenticateEmail, errorMessage, httpJson, rpcJson, sessionFromAuth, uniqueEmail, uniquePassword } from "./helpers/nakama_http";

const LIVE = process.env.ACCT_GATEWAY_LIVE === "1";
const OPTIONS = { skip: !LIVE, timeout: 60000 };
const SECRET = process.env.VIBECODE_GATEWAY_HMAC_SECRET !== undefined && process.env.VIBECODE_GATEWAY_HMAC_SECRET.length > 0
  ? process.env.VIBECODE_GATEWAY_HMAC_SECRET
  : "local-gateway-hmac-secret-not-production";
const HTTP_KEY = process.env.NAKAMA_HTTP_KEY !== undefined && process.env.NAKAMA_HTTP_KEY.length > 0 ? process.env.NAKAMA_HTTP_KEY : "defaulthttpkey";

function signedPing(): { [key: string]: unknown } {
  const body = { op: "ping" };
  const unsigned = {
    request_id: "live-ping",
    timestamp: Date.now(),
    nonce: randomBytes(16).toString("hex"),
    operation: "ping",
    payload_hash: canonicalPayloadHash(JSON.stringify(body)),
  };
  return {
    assertion: { ...unsigned, signature: signGatewayAssertion(SECRET, unsigned) },
    op: "ping",
  };
}

async function rpcHttpKey(payload: { [key: string]: unknown }) {
  const host = process.env.NAKAMA_HTTP !== undefined && process.env.NAKAMA_HTTP.length > 0 ? process.env.NAKAMA_HTTP : "http://127.0.0.1:7350";
  return httpJson(
    "POST",
    host + "/v2/rpc/auth_gateway?http_key=" + encodeURIComponent(HTTP_KEY) + "&unwrap=true",
    { "Content-Type": "application/json" },
    payload,
  );
}

test("live HTTP-key auth_gateway ping succeeds with a signed assertion", OPTIONS, async () => {
  const response = await rpcHttpKey(signedPing());
  assert.equal(response.ok, true, errorMessage(response.body));
  const body = response.body as { ok?: boolean; op?: string; payload?: string };
  if (typeof body.payload === "string") {
    assert.equal(JSON.parse(body.payload).ok, true);
  } else {
    assert.equal(body.ok, true);
    assert.equal(body.op, "ping");
  }
});

test("live session invocation of auth_gateway is rejected", OPTIONS, async () => {
  const email = uniqueEmail("gw");
  const password = uniquePassword("gw");
  const created = await authenticateEmail(email, password, true);
  assert.equal(created.ok, true, errorMessage(created.body));
  const session = sessionFromAuth(created.body);
  const response = await rpcJson(session.token, "auth_gateway", { op: "ping" });
  assert.equal(response.status, 200, response.text);
  const blob = response.text + " " + JSON.stringify(response.body);
  assert.equal(blob.toLowerCase().includes("stacktrace"), false, blob);
  assert.equal(blob.includes("index.js"), false, blob);
  const body = response.body as { ok?: boolean; code?: string; payload?: string };
  let data: { ok?: boolean; code?: string } = body;
  if (typeof body.payload === "string") {
    data = JSON.parse(body.payload) as { ok?: boolean; code?: string };
  }
  assert.equal(data.ok, false);
  assert.equal(data.code, "gateway_rpc_forbidden");
});
