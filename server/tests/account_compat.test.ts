import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_COMPAT_COLLECTION,
  ACCOUNT_COMPAT_KEY,
  ACCOUNT_COMPAT_PERMISSION_WRITE,
  decideEmailLookup,
  emailIndexWriteValue,
  hmacIndexQuery,
} from "../src/domain/account_compat";

test("HMAC index objects never include raw email and are not client-writable", () => {
  const value = emailIndexWriteValue("user-1", "abc123");
  assert.equal(value.hmac, "abc123");
  assert.equal(value.userId, "user-1");
  assert.equal(Object.prototype.hasOwnProperty.call(value, "email"), false);
  assert.equal(ACCOUNT_COMPAT_COLLECTION, "account_compat");
  assert.equal(ACCOUNT_COMPAT_KEY, "email_index");
  assert.equal(ACCOUNT_COMPAT_PERMISSION_WRITE, 0);
  assert.equal(hmacIndexQuery("abc123"), "+value.hmac:abc123");
});

test("email lookup never trusts a stale or ambiguous index hit", () => {
  const hmac = "deadbeef";
  const hit = { hmac: hmac, userId: "user-1" };
  assert.deepEqual(decideEmailLookup([], null, hmac), { ok: false, reason: "missing" });
  assert.deepEqual(decideEmailLookup([hit, { hmac: hmac, userId: "user-2" }], hit, hmac), {
    ok: false,
    reason: "multiple",
  });
  assert.deepEqual(decideEmailLookup([hit], null, hmac), { ok: false, reason: "stale" });
  assert.deepEqual(decideEmailLookup([hit], { hmac: "other", userId: "user-1" }, hmac), {
    ok: false,
    reason: "mismatch",
  });
  assert.deepEqual(decideEmailLookup([hit], hit, hmac), { ok: true, userId: "user-1" });
});
