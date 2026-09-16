import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNT_FAILURE_CONTROLS,
  REQUIRED_ACCOUNT_FAILURE_IDS,
} from "../src/domain/account_failure_catalog";
import { ACCOUNT_RATE_CATALOG, REQUIRED_ACCOUNT_RATE_ACTIONS } from "../src/domain/account_rate_catalog";

test("every ACCT-09 failure scenario maps to a recoverable state and a test", () => {
  const seen: { [id: string]: boolean } = {};
  assert.equal(ACCOUNT_FAILURE_CONTROLS.length, REQUIRED_ACCOUNT_FAILURE_IDS.length);
  for (let i = 0; i < ACCOUNT_FAILURE_CONTROLS.length; i++) {
    const row = ACCOUNT_FAILURE_CONTROLS[i];
    assert.equal(seen[row.id], undefined, "duplicate failure " + row.id);
    seen[row.id] = true;
    assert.ok(row.failure.length > 0, row.id);
    assert.ok(row.expectedState.length > 0, row.id);
    assert.ok(row.tests.length > 0, row.id);
  }
});

test("account failure catalog test files exist", () => {
  const serverRoot = join(__dirname, "..", "..");
  const repoRoot = join(serverRoot, "..");
  for (let i = 0; i < ACCOUNT_FAILURE_CONTROLS.length; i++) {
    const row = ACCOUNT_FAILURE_CONTROLS[i];
    for (let t = 0; t < row.tests.length; t++) {
      const name = row.tests[t];
      const paths = [
        join(serverRoot, "tests", name),
        join(repoRoot, "client", "tests", "app", name),
        join(repoRoot, "auth-gateway", "tests", name),
        join(repoRoot, "scripts", name),
      ];
      const found = paths.some(function (path) {
        return existsSync(path);
      });
      assert.equal(found, true, row.id + " missing test file " + name);
    }
  }
});

test("named account rate catalog covers every required public action", () => {
  const present: { [action: string]: boolean } = {};
  for (let i = 0; i < ACCOUNT_RATE_CATALOG.length; i++) {
    present[ACCOUNT_RATE_CATALOG[i].action] = true;
    assert.ok(ACCOUNT_RATE_CATALOG[i].maxEvents > 0, ACCOUNT_RATE_CATALOG[i].action);
    assert.ok(ACCOUNT_RATE_CATALOG[i].windowMs > 0, ACCOUNT_RATE_CATALOG[i].action);
  }
  for (let i = 0; i < REQUIRED_ACCOUNT_RATE_ACTIONS.length; i++) {
    const action = REQUIRED_ACCOUNT_RATE_ACTIONS[i];
    assert.equal(present[action], true, "missing rate action " + action);
  }
});
