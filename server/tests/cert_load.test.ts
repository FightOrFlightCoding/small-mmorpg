import assert from "node:assert/strict";
import test from "node:test";
import {
  CERT_CAPACITY_CAVE_INSTANCES,
  CERT_CAPACITY_PUBLIC_PLAYERS,
  CERT_SOAK_AUTOMATED_TICKS,
  runCapacityScenario,
  runSoakScenario,
  soakCertificationTicks,
} from "../src/domain/cert_load";
import { MATCH_MAX_PLAYERS, MATCH_TICK_RATE } from "../src/domain/match_state";

test("capacity scenario measures 20 public-world characters and multiple caves", () => {
  const report = runCapacityScenario(12);
  assert.equal(report.scenario, "capacity");
  assert.equal(report.publicPlayers, CERT_CAPACITY_PUBLIC_PLAYERS);
  assert.equal(report.publicMatchCapDefault, MATCH_MAX_PLAYERS);
  assert.equal(report.caveInstances, CERT_CAPACITY_CAVE_INSTANCES);
  assert.equal(report.cavePlayersEach, 5);
  assert.equal(report.ticks, 12);
  assert.ok(report.messagesPerSecond >= 0);
  assert.ok(report.bytesPerPlayerApprox >= 0);
  assert.equal(report.caveCleanupOk, true);
  assert.equal(report.ghostPresences, 0);
  assert.equal(report.transactionFailures, 0);
  assert.ok(report.tick.meanMs >= 0);
});

test("soak scenario does not leak gold, locks, trades, parties, or ghosts", () => {
  const report = runSoakScenario(CERT_SOAK_AUTOMATED_TICKS, 34);
  assert.equal(report.scenario, "soak");
  assert.equal(report.bots, 4);
  assert.ok(report.actionsPerformed > 0);
  assert.equal(report.errors, 0);
  assert.equal(report.matchCountBefore, 1);
  assert.equal(report.matchCountAfter, 1);
  assert.equal(report.caveCountBefore, 0);
  assert.equal(report.caveCountAfter, 0);
  assert.equal(report.ghostEntities, 0);
  assert.equal(report.unreleasedItemLocks, 0);
  assert.equal(report.unreleasedTradeRecords, 0);
  assert.equal(report.unreleasedPartyRecords, 0);
  assert.equal(report.goldUnchanged, true);
});

test("manual certification duration maps seconds to ticks at the match rate", () => {
  assert.equal(soakCertificationTicks(3600), 3600 * MATCH_TICK_RATE);
});
