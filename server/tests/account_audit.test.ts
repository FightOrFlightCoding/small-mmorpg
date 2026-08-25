import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_AUDIT_EVENTS, formatAccountAudit, isAccountAuditEvent } from "../src/domain/account_audit";
import { formatOpsLog } from "../src/domain/ops_metrics";

test("account audit formatting never includes secret field names", () => {
  const line = formatAccountAudit("login_failure", {
    user_id: "user-1",
    reason_category: "invalid_credentials",
    password: "secret-password-value",
    refresh_token: "stolen",
    code: "AAAA-BBBB-CCCC-DDDD",
  });
  assert.equal(line.indexOf("secret-password-value"), -1);
  assert.equal(line.indexOf("stolen"), -1);
  assert.equal(line.indexOf("AAAA-BBBB-CCCC-DDDD"), -1);
  assert.ok(line.indexOf("event=login_failure") >= 0);
  assert.ok(line.indexOf("user_id=user-1") >= 0);
  assert.ok(line.indexOf("reason_category=invalid_credentials") >= 0);
});

test("every listed account audit event is recognized", () => {
  for (let i = 0; i < ACCOUNT_AUDIT_EVENTS.length; i++) {
    assert.equal(isAccountAuditEvent(ACCOUNT_AUDIT_EVENTS[i]), true);
  }
  assert.equal(isAccountAuditEvent("password"), false);
  assert.equal(formatAccountAudit("email_verified", { request_id: "abc" }), formatOpsLog("email_verified", { request_id: "abc" }));
});
