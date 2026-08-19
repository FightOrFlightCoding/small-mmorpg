import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMaintenancePatch,
  emptyMaintenance,
  parseMaintenancePayload,
  shouldRejectGameplayJoin,
  shouldWarnShutdown,
  transactionsBlocked,
} from "../src/domain/maintenance";
import { COMPAT_MIGRATION_REQUIRED } from "../src/domain/compatibility";

test("maintenance payload is strict and defaults rejectJoins when enabled", () => {
  assert.throws(() => parseMaintenancePayload("{}"), /malformed_json/);
  assert.throws(() => parseMaintenancePayload('{"enabled":true,"extra":1}'), /unknown_field:extra/);
  const patch = parseMaintenancePayload(JSON.stringify({ enabled: true, reason: "deploy window", message: "Updating." }));
  const next = applyMaintenancePatch(emptyMaintenance(), patch, 1000);
  assert.equal(next.enabled, true);
  assert.equal(next.rejectJoins, true);
  assert.equal(next.blockTransactions, false);
  assert.equal(next.message, "Updating.");
  assert.equal(shouldRejectGameplayJoin(next, false), true);
  assert.equal(shouldRejectGameplayJoin(next, true), false);
});

test("migration windows block transactions and warn before shutdown", () => {
  const next = applyMaintenancePatch(
    emptyMaintenance(),
    { enabled: true, blockTransactions: true, shutdownAt: 10_000, warnAt: 4_000, message: "Migrating." },
    1_000,
  );
  assert.equal(transactionsBlocked(next), true);
  assert.equal(shouldWarnShutdown(next, 5_000), true);
  assert.equal(shouldWarnShutdown(next, 2_000), false);
  assert.equal(COMPAT_MIGRATION_REQUIRED, "migration_required");
  const cleared = applyMaintenancePatch(next, { enabled: false }, 11_000);
  assert.equal(cleared.enabled, false);
  assert.equal(transactionsBlocked(cleared), false);
  assert.equal(cleared.message, "");
});
