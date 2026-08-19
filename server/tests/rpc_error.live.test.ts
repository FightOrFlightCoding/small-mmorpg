import assert from "node:assert/strict";
import test from "node:test";
import { authenticateEmail, errorMessage, rpcJson, sessionFromAuth, uniqueEmail, uniquePassword } from "./helpers/nakama_http";

const LIVE = process.env.ACCT_RPC_LIVE === "1";
const OPTIONS = { skip: !LIVE, timeout: 60000 };

function assertNoStackLeak(text: string, body: unknown): void {
  const blob = text + " " + JSON.stringify(body);
  assert.equal(blob.toLowerCase().includes("stacktrace"), false, blob);
  assert.equal(blob.includes("index.js"), false, blob);
  assert.equal(blob.toLowerCase().includes("uncaught exception"), false, blob);
  assert.equal(blob.toLowerCase().includes("throwrpcfailure"), false, blob);
}

function rpcBody(body: unknown): { [key: string]: unknown } {
  if (body === null || typeof body !== "object") {
    return {};
  }
  const data = body as { [key: string]: unknown };
  if (typeof data.payload === "string") {
    try {
      const parsed = JSON.parse(data.payload) as unknown;
      if (parsed !== null && typeof parsed === "object") {
        return parsed as { [key: string]: unknown };
      }
    } catch {
      return data;
    }
  }
  return data;
}

test("live unverified character_list rejects without a stack trace", OPTIONS, async () => {
  const email = uniqueEmail("unverified-rpc");
  const password = uniquePassword("unverified-rpc");
  const auth = await authenticateEmail(email, password, true);
  assert.equal(auth.ok, true, errorMessage(auth.body));
  const session = sessionFromAuth(auth.body);
  const listed = await rpcJson(session.token, "character_list", {});
  assert.equal(listed.status, 200, listed.text);
  assertNoStackLeak(listed.text, listed.body);
  const data = rpcBody(listed.body);
  assert.equal(data.ok, false, listed.text);
  assert.equal(data.code, "email_verification_required", listed.text);
});
