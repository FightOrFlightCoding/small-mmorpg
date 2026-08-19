import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_SECURITY_IDS,
  SECURITY_CONTROLS,
  securityControlById,
} from "../src/domain/security_catalog";

test("every required Prompt 34 attack has a seven-field control and at least one test", () => {
  const seen: { [id: string]: boolean } = {};
  for (let i = 0; i < SECURITY_CONTROLS.length; i++) {
    const row = SECURITY_CONTROLS[i];
    assert.equal(seen[row.id], undefined, "duplicate control " + row.id);
    seen[row.id] = true;
    assert.ok(row.threat.length > 0, row.id);
    assert.ok(row.validation.length > 0, row.id);
    assert.ok(row.rateLimit.length > 0, row.id);
    assert.ok(row.payloadLimit.length > 0, row.id);
    assert.ok(row.idempotency.length > 0, row.id);
    assert.ok(row.rejection.length > 0, row.id);
    assert.ok(row.tests.length > 0, row.id);
  }
  for (let i = 0; i < REQUIRED_SECURITY_IDS.length; i++) {
    const id = REQUIRED_SECURITY_IDS[i];
    const row = securityControlById(id);
    assert.notEqual(row, null, "missing control " + id);
    assert.equal(seen[id], true, "required id not in catalog " + id);
  }
});

test("catalog test files exist under server/tests or client/tests", () => {
  const serverRoot = join(__dirname, "..", "..");
  const repoRoot = join(serverRoot, "..");
  for (let i = 0; i < SECURITY_CONTROLS.length; i++) {
    const row = SECURITY_CONTROLS[i];
    for (let t = 0; t < row.tests.length; t++) {
      const name = row.tests[t];
      const serverPath = join(serverRoot, "tests", name);
      const clientPath = join(repoRoot, "client", "tests", "app", name);
      assert.equal(
        existsSync(serverPath) || existsSync(clientPath),
        true,
        row.id + " missing test file " + name,
      );
    }
  }
});
