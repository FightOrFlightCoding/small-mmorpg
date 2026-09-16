import assert from "node:assert/strict";
import test from "node:test";
import { rpcFailureCode, rpcFailurePayload, throwRpcFailure } from "../src/domain/rpc_error";
import { rpcCharacterList } from "../src/rpcs/character_lifecycle";

function silentLogger(): nkruntime.Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  } as unknown as nkruntime.Logger;
}

test("rpcFailureCode reads thrown strings and Error messages", () => {
  assert.equal(rpcFailureCode("email_verification_required"), "email_verification_required");
  assert.equal(rpcFailureCode(new Error("account_disabled")), "account_disabled");
  assert.equal(rpcFailureCode(""), "internal_error");
  assert.equal(rpcFailureCode(new Error("")), "internal_error");
  assert.equal(rpcFailureCode(null), "internal_error");
});

test("rpcFailureCode strips Nakama/Goja stack wrapping", () => {
  const stacked = new Error(
    "Error: email_verification_required\n    at requirePlayableUser (index.js:19158:11(18))\n    at rpcCharacterList (index.js:19201:18)",
  );
  assert.equal(rpcFailureCode(stacked), "email_verification_required");
  assert.equal(
    rpcFailureCode("Error: account_disabled at requirePlayableUser (index.js:12:3)"),
    "account_disabled",
  );
  assert.equal(rpcFailureCode(new Error("unknown_field:foo")), "unknown_field:foo");
  assert.equal(rpcFailureCode(new Error("something exploded in storage")), "internal_error");
});

test("throwRpcFailure still throws a primitive string for before-hooks with no return channel", () => {
  try {
    throwRpcFailure("email_verification_required");
    assert.fail("expected throw");
  } catch (error) {
    assert.equal(typeof error, "string");
    assert.equal(error, "email_verification_required");
  }
});

test("character_list adapter returns JSON instead of throwing", () => {
  const ctx = { userId: "", sessionId: "session-1" } as nkruntime.Context;
  const body = rpcCharacterList(ctx, silentLogger(), {} as nkruntime.Nakama, "{}");
  assert.deepEqual(JSON.parse(body), { ok: false, code: "unauthenticated" });
  assert.equal(body.toLowerCase().includes("stack"), false);
  assert.equal(body.includes("index.js"), false);
});

test("throwRpcFailure unwraps Error.message before throwing", () => {
  try {
    throwRpcFailure(
      new Error("Error: account_deleting\n    at requirePlayableUser (index.js:1:1)"),
    );
    assert.fail("expected throw");
  } catch (error) {
    assert.equal(typeof error, "string");
    assert.equal(error, "account_deleting");
  }
});

test("rpcFailurePayload is HTTP-safe JSON without a stack", () => {
  const payload = rpcFailurePayload(
    new Error("Error: email_verification_required\n    at throwRpcFailure (index.js:1:1)"),
  );
  assert.equal(payload, JSON.stringify({ ok: false, code: "email_verification_required" }));
  assert.equal(payload.toLowerCase().includes("stack"), false);
  assert.equal(payload.includes("index.js"), false);
});
