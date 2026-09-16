import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_CHALLENGE_MAX_ATTEMPTS,
  AUTH_CHALLENGE_PERMISSION_WRITE,
  consumeAuthChallenge,
  createAuthChallenge,
  invalidateAuthChallenge,
} from "../src/domain/auth_challenge";

const HASH_OK = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_BAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("challenges store hashes not plaintext and consume is single-use plus idempotent", () => {
  const created = createAuthChallenge({
    challengeId: "cid1",
    accountUserId: "user-1",
    emailLookupHash: "hmac1",
    purpose: "EMAIL_VERIFICATION",
    secretHash: HASH_OK,
    requestId: "req-1",
    nowMs: 1000,
    ttlMs: 60_000,
  });
  assert.equal(created.secret_hash, HASH_OK);
  assert.equal(AUTH_CHALLENGE_PERMISSION_WRITE, 0);
  const first = consumeAuthChallenge({ record: created, secretHash: HASH_OK, purpose: "EMAIL_VERIFICATION", nowMs: 2000 });
  assert.equal(first.ok, true);
  if (!first.ok) {
    throw new Error("expected consume");
  }
  assert.equal(first.idempotent, false);
  assert.equal(first.record.consumed_at, 2000);
  const again = consumeAuthChallenge({
    record: first.record,
    secretHash: HASH_OK,
    purpose: "EMAIL_VERIFICATION",
    nowMs: 3000,
  });
  assert.equal(again.ok, true);
  if (!again.ok) {
    throw new Error("expected idempotent consume");
  }
  assert.equal(again.idempotent, true);
});

test("wrong codes increment attempts until lock; expiry and invalidate fail closed", () => {
  const created = createAuthChallenge({
    challengeId: "cid2",
    accountUserId: "",
    emailLookupHash: "hmac2",
    purpose: "PASSWORD_RESET",
    secretHash: HASH_OK,
    requestId: "req-2",
    nowMs: 1000,
    ttlMs: 10,
  });
  let current = created;
  for (let i = 0; i < AUTH_CHALLENGE_MAX_ATTEMPTS - 1; i++) {
    const result = consumeAuthChallenge({
      record: current,
      secretHash: HASH_BAD,
      purpose: "PASSWORD_RESET",
      nowMs: 1000,
    });
    assert.equal(result.ok, false);
    if (result.ok || result.record === null) {
      throw new Error("expected wrong_code");
    }
    assert.equal(result.reason, "wrong_code");
    current = result.record;
  }
  const locked = consumeAuthChallenge({
    record: current,
    secretHash: HASH_BAD,
    purpose: "PASSWORD_RESET",
    nowMs: 1000,
  });
  assert.equal(locked.ok, false);
  if (locked.ok) {
    throw new Error("expected lock");
  }
  assert.equal(locked.reason, "locked");
  const expired = consumeAuthChallenge({
    record: created,
    secretHash: HASH_OK,
    purpose: "PASSWORD_RESET",
    nowMs: 2000,
  });
  assert.equal(expired.ok, false);
  if (expired.ok) {
    throw new Error("expected expiry");
  }
  assert.equal(expired.reason, "expired");
  const invalidated = consumeAuthChallenge({
    record: invalidateAuthChallenge(created, 1001),
    secretHash: HASH_OK,
    purpose: "PASSWORD_RESET",
    nowMs: 1001,
  });
  assert.equal(invalidated.ok, false);
  if (invalidated.ok) {
    throw new Error("expected invalidate");
  }
  assert.equal(invalidated.reason, "invalidated");
});
