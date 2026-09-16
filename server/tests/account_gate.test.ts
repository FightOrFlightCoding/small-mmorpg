import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_GATE_DELETING,
  ACCOUNT_GATE_DISABLED,
  ACCOUNT_GATE_UNVERIFIED,
  ACCOUNT_STATUS_ACTIVE,
  ACCOUNT_STATUS_DELETING,
  ACCOUNT_STATUS_DISABLED,
  ACCOUNT_STATUS_PENDING_VERIFICATION,
} from "../src/domain/account_status";
import { evaluateLoginAccount, evaluatePlayableAccount, type AccountGateSnapshot } from "../src/domain/account_gate";
import { evaluateUnverifiedCleanup, type UnverifiedCleanupInput } from "../src/domain/unverified_cleanup";
import { generateInternalUsername, usernameLooksEmailDerived } from "../src/domain/internal_username";
import { parseAccountProfileValue } from "../src/domain/account_profile";

test("device accounts without a profile remain playable", () => {
  const result = evaluatePlayableAccount({
    userId: "dev-alice",
    hasEmail: false,
    disableTime: 0,
    profile: null,
  });
  assert.equal(result.ok, true);
});

test("email accounts without a profile cannot enter gameplay", () => {
  const result = evaluatePlayableAccount({
    userId: "user-1",
    hasEmail: true,
    disableTime: 0,
    profile: null,
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("expected reject");
  }
  assert.equal(result.code, ACCOUNT_GATE_UNVERIFIED);
});

test("pending verification is rejected until ACTIVE and verified_at", () => {
  const pending = evaluatePlayableAccount({
    userId: "user-1",
    hasEmail: true,
    disableTime: 0,
    profile: { status: ACCOUNT_STATUS_PENDING_VERIFICATION, verifiedAt: 0 },
  });
  assert.equal(pending.ok, false);
  const active = evaluatePlayableAccount({
    userId: "user-1",
    hasEmail: true,
    disableTime: 0,
    profile: { status: ACCOUNT_STATUS_ACTIVE, verifiedAt: 1000 },
  });
  assert.equal(active.ok, true);
});

test("disabled and deleting accounts are rejected", () => {
  const disabled = evaluatePlayableAccount({
    userId: "user-1",
    hasEmail: true,
    disableTime: 10,
    profile: { status: ACCOUNT_STATUS_ACTIVE, verifiedAt: 1 },
  });
  assert.equal(disabled.ok, false);
  if (!disabled.ok) {
    assert.equal(disabled.code, ACCOUNT_GATE_DISABLED);
  }
  const deleting = evaluatePlayableAccount({
    userId: "user-1",
    hasEmail: true,
    disableTime: 0,
    profile: { status: ACCOUNT_STATUS_DELETING, verifiedAt: 1 },
  });
  assert.equal(deleting.ok, false);
  if (!deleting.ok) {
    assert.equal(deleting.code, ACCOUNT_GATE_DELETING);
  }
  const statusDisabled = evaluatePlayableAccount({
    userId: "user-1",
    hasEmail: true,
    disableTime: 0,
    profile: { status: ACCOUNT_STATUS_DISABLED, verifiedAt: 1 },
  });
  assert.equal(statusDisabled.ok, false);
});

test("login returns EMAIL_VERIFICATION_REQUIRED only after valid credentials", () => {
  const snapshot: AccountGateSnapshot = {
    userId: "user-1",
    hasEmail: true,
    disableTime: 0,
    profile: { status: ACCOUNT_STATUS_PENDING_VERIFICATION, verifiedAt: 0 },
  };
  const wrong = evaluateLoginAccount(snapshot, false);
  assert.equal(wrong.ok, false);
  if (!wrong.ok) {
    assert.equal(wrong.code, "invalid_credentials");
  }
  const right = evaluateLoginAccount(snapshot, true);
  assert.equal(right.ok, false);
  if (!right.ok) {
    assert.equal(right.code, ACCOUNT_GATE_UNVERIFIED);
  }
});

test("unverified cleanup is idempotent and requires retention plus empty roster", () => {
  const base: UnverifiedCleanupInput = {
    status: ACCOUNT_STATUS_PENDING_VERIFICATION,
    verifiedAt: 0,
    createdAt: 1,
    nowMs: 1 + 8 * 24 * 60 * 60 * 1000,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    liveCharacterCount: 0,
    hasActiveGameplaySession: false,
  };
  assert.equal(evaluateUnverifiedCleanup(base).purge, true);
  assert.equal(evaluateUnverifiedCleanup({ ...base, liveCharacterCount: 1 }).purge, false);
  assert.equal(evaluateUnverifiedCleanup({ ...base, verifiedAt: 9 }).purge, false);
  assert.equal(evaluateUnverifiedCleanup({ ...base, nowMs: 1000 }).purge, false);
  const again = evaluateUnverifiedCleanup({ ...base, status: ACCOUNT_STATUS_DELETING });
  assert.equal(again.purge, false);
});

test("internal usernames are not derived from the email local part", () => {
  const username = generateInternalUsername(() => "abcdef0123456789abcdef0123456789ffff");
  assert.equal(username, "uabcdef0123456789abcdef0123456789");
  assert.equal(usernameLooksEmailDerived(username, "player+tag@example.com"), false);
  assert.equal(usernameLooksEmailDerived("player", "player@example.com"), true);
});

test("legacy profile rows infer PENDING vs ACTIVE from verifiedAt", () => {
  const pending = parseAccountProfileValue({ hmac: "abc", userId: "u1", verifiedAt: 0 }, "u1");
  assert.ok(pending);
  assert.equal(pending.status, ACCOUNT_STATUS_PENDING_VERIFICATION);
  const active = parseAccountProfileValue({ hmac: "abc", userId: "u1", verifiedAt: 42 }, "u1");
  assert.ok(active);
  assert.equal(active.status, ACCOUNT_STATUS_ACTIVE);
});
