import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_RATE_ACTIONS, ACCOUNT_RATE_POLICIES } from "../src/rate_limits/catalog";
import { GatewayRateLimits } from "../src/rate_limits/memory";
import { ACCOUNT_AUDIT_EVENTS, isAccountAuditEvent, sanitizeAuditFields } from "../src/logging/audit";

test("named account rate policies cover every required public action", () => {
  const required = [
    "registration",
    "verification_request",
    "verification_attempt",
    "login",
    "password_reset_request",
    "password_reset_attempt",
    "email_change_request",
    "email_change_attempt",
    "account_deletion_request",
    "account_deletion_attempt",
    "session_refresh",
  ];
  for (let i = 0; i < required.length; i++) {
    const action = required[i] as keyof typeof ACCOUNT_RATE_POLICIES;
    assert.ok(ACCOUNT_RATE_ACTIONS.indexOf(action) >= 0, action);
    assert.ok(ACCOUNT_RATE_POLICIES[action].maxEvents > 0, action);
    assert.ok(ACCOUNT_RATE_POLICIES[action].retryGuidance.indexOf("Wait") >= 0, action);
    assert.equal(ACCOUNT_RATE_POLICIES[action].retryGuidance.toLowerCase().indexOf("exist"), -1, action);
    assert.equal(ACCOUNT_RATE_POLICIES[action].retryGuidance.toLowerCase().indexOf("unknown"), -1, action);
  }
});

test("named limiters reject extra events without a permanent lockout", () => {
  const rates = new GatewayRateLimits();
  const now = 1_700_000_000_000;
  const policy = ACCOUNT_RATE_POLICIES.login;
  for (let i = 0; i < policy.maxEvents; i++) {
    assert.equal(rates.consume("login", "hash-a", now).allowed, true);
  }
  const blocked = rates.consume("login", "hash-a", now + 10);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  assert.equal(rates.consume("login", "hash-b", now).allowed, true);
  assert.equal(rates.consume("login", "hash-a", now + policy.windowMs).allowed, true);
});

test("audit sanitizer drops codes, tokens, secrets, and provider keys", () => {
  const cleaned = sanitizeAuditFields({
    event: "login_success",
    user_id: "u1",
    password: "nope",
    code: "ABCD-EFGH",
    verification_code: "ABCD",
    refresh_token: "tok",
    sendgrid_api_key: "sg",
    request_id: "req-1",
  });
  assert.equal(cleaned.user_id, "u1");
  assert.equal(cleaned.request_id, "req-1");
  assert.equal(cleaned.password, undefined);
  assert.equal(cleaned.code, undefined);
  assert.equal(cleaned.verification_code, undefined);
  assert.equal(cleaned.refresh_token, undefined);
  assert.equal(cleaned.sendgrid_api_key, undefined);
  for (let i = 0; i < ACCOUNT_AUDIT_EVENTS.length; i++) {
    assert.equal(isAccountAuditEvent(ACCOUNT_AUDIT_EVENTS[i]), true);
  }
});
