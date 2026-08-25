import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNT_SECURITY_CONTROLS,
  REQUIRED_ACCOUNT_SECURITY_IDS,
  accountSecurityControlById,
  assertAuditEventKnown,
} from "../src/domain/account_security_catalog";
import { ACCOUNT_AUDIT_EVENTS } from "../src/domain/account_audit";

test("every ACCT-09 threat has validation, rate limit, idempotency, error, test, and audit mapping", () => {
  const seen: { [id: string]: boolean } = {};
  assert.equal(ACCOUNT_SECURITY_CONTROLS.length, 85);
  assert.equal(ACCOUNT_SECURITY_CONTROLS.length, REQUIRED_ACCOUNT_SECURITY_IDS.length);
  for (let i = 0; i < ACCOUNT_SECURITY_CONTROLS.length; i++) {
    const row = ACCOUNT_SECURITY_CONTROLS[i];
    assert.equal(seen[row.id], undefined, "duplicate control " + row.id);
    seen[row.id] = true;
    assert.ok(row.threat.length > 0, row.id);
    assert.ok(row.validation.length > 0, row.id);
    assert.ok(row.rateLimit.length > 0, row.id);
    assert.ok(row.idempotency.length > 0, row.id);
    assert.ok(row.expectedError.length > 0, row.id);
    assert.ok(row.tests.length > 0, row.id);
    assert.equal(assertAuditEventKnown(row.auditEvent), true, row.id + " unknown audit " + row.auditEvent);
  }
  for (let i = 0; i < REQUIRED_ACCOUNT_SECURITY_IDS.length; i++) {
    const id = REQUIRED_ACCOUNT_SECURITY_IDS[i];
    assert.notEqual(accountSecurityControlById(id), null, "missing control " + id);
  }
});

test("account security catalog test files exist", () => {
  const serverRoot = join(__dirname, "..", "..");
  const repoRoot = join(serverRoot, "..");
  for (let i = 0; i < ACCOUNT_SECURITY_CONTROLS.length; i++) {
    const row = ACCOUNT_SECURITY_CONTROLS[i];
    for (let t = 0; t < row.tests.length; t++) {
      const name = row.tests[t];
      const paths = [
        join(serverRoot, "tests", name),
        join(repoRoot, "client", "tests", "app", name),
        join(repoRoot, "auth-gateway", "tests", name),
      ];
      const found = paths.some(function (path) {
        return existsSync(path);
      });
      assert.equal(found, true, row.id + " missing test file " + name);
    }
  }
});

test("required audit event names stay aligned with the runtime list", () => {
  assert.ok(ACCOUNT_AUDIT_EVENTS.indexOf("login_failure") >= 0);
  assert.ok(ACCOUNT_AUDIT_EVENTS.indexOf("account_deletion_completed") >= 0);
  assert.ok(ACCOUNT_AUDIT_EVENTS.indexOf("lease_link_dead") >= 0);
});
