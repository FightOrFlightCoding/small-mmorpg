import assert from "node:assert/strict";
import test from "node:test";
import { productionOverwriteAllowed, recoveryFor, RECOVERY_PROCEDURES, DEPLOY_ORDER, PRODUCTION_OVERWRITE_TOKEN, STAGING_OVERWRITE_TOKEN } from "../src/domain/recovery";
import { publicSaveRejectCode, REASON_UNSUPPORTED_FUTURE_VERSION } from "../src/domain/save_schema";
import { isSensitiveLogKey, formatOpsLog, incrementCounter, resetOpsCounters, snapshotCounters } from "../src/domain/ops_metrics";

test("every documented recovery scenario has an operator procedure", () => {
  assert.equal(RECOVERY_PROCEDURES.length, 9);
  assert.equal(recoveryFor("corrupted_character_location").gmCommand, "repair_invalid_location");
  assert.equal(recoveryFor("interrupted_trade").gmCommand, "cancel_trade");
  assert.equal(recoveryFor("accidental_item_grant").gmCommand, "remove_test_item");
  assert.equal(recoveryFor("accidentally_completed_quest").gmCommand, "reset_quest");
  assert.equal(recoveryFor("incompatible_client").blocksGameplay, true);
  assert.equal(recoveryFor("missing_cave_match").blocksGameplay, false);
});

test("production restore requires an explicit overwrite token", () => {
  assert.equal(productionOverwriteAllowed("local", ""), true);
  assert.equal(productionOverwriteAllowed("automated_test", ""), true);
  assert.equal(productionOverwriteAllowed("staging", ""), false);
  assert.equal(productionOverwriteAllowed("staging", STAGING_OVERWRITE_TOKEN), true);
  assert.equal(productionOverwriteAllowed("production", ""), false);
  assert.equal(productionOverwriteAllowed("production", PRODUCTION_OVERWRITE_TOKEN), true);
  assert.deepEqual(DEPLOY_ORDER.slice(), [
    "backup",
    "content_validation",
    "migration_dry_run",
    "server_deployment",
    "migration_application",
    "client_compatibility_update",
    "smoke_test",
    "maintenance_removal",
  ]);
});

test("future saves surface unsupported_save_version and logs omit secrets", () => {
  assert.equal(publicSaveRejectCode(REASON_UNSUPPORTED_FUTURE_VERSION), "unsupported_save_version");
  assert.equal(isSensitiveLogKey("password"), true);
  assert.equal(isSensitiveLogKey("refresh_token"), true);
  assert.equal(isSensitiveLogKey("session"), true);
  const line = formatOpsLog("authentication_failure", { reason: "invalid_credentials", password: "secret", user_id: "u1" });
  assert.equal(line.indexOf("secret"), -1);
  assert.equal(line.indexOf("password="), -1);
  assert.match(line, /event=authentication_failure/);
});

test("ops counters increment through lexical storage", () => {
  resetOpsCounters();
  incrementCounter("transferFailures");
  incrementCounter("rejectedActions", 2);
  incrementCounter("connectedPlayers", -5);
  const snap = snapshotCounters();
  assert.equal(snap.transferFailures, 1);
  assert.equal(snap.rejectedActions, 2);
  assert.equal(snap.connectedPlayers, 0);
  resetOpsCounters();
  assert.equal(snapshotCounters().transferFailures, 0);
  assert.equal(snapshotCounters().rejectedActions, 0);
});
