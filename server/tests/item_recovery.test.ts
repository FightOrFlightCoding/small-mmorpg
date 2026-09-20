import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  applyGmToMatch,
} from "../src/domain/gm";
import {
  addOrStackItem,
  emptyInventory,
  itemDefinitionsFromContent,
  makeInstance,
  setItemLock,
} from "../src/domain/inventory";
import { JOURNAL_COMMITTING, emptyJournalRecord } from "../src/domain/item_journal";
import { LOCK_TYPE_TRADE } from "../src/domain/item_lock";
import {
  repairItemRecovery,
  scanItemRecovery,
} from "../src/domain/item_recovery_scan";
import { emptyOverflow } from "../src/domain/overflow";
import { addPlayer, createStarterZoneState, enemyDefinitionsFromContent, type MatchPlayer } from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { emptyEquipment } from "../src/domain/equipment";

function defs() {
  return itemDefinitionsFromContent(content.items);
}

function player(): MatchPlayer {
  return {
    userId: "user-ada",
    sessionId: "session-ada",
    username: "ada",
    characterId: "char-ada",
    name: "Ada",
    classId: "class.warrior",
    x: 240,
    y: 384,
    maxHealth: 20,
    health: 20,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    overflow: emptyOverflow(),
    gold: 0,
  };
}

function zone() {
  return createStarterZoneState(
    "hash",
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    questDefinitionsFromContent(content.quests),
    defs(),
  );
}

test("scan reports orphan locks duplicate slots overstack missing defs and overflow without deleting", () => {
  const inventory = emptyInventory();
  inventory.items.push(makeInstance("sword-a", "item.training_sword", 1, 0));
  inventory.items.push(makeInstance("sword-b", "item.training_sword", 1, 0));
  inventory.items.push(makeInstance("gel-over", "item.slime_gel", 50, 1));
  inventory.items.push(makeInstance("ghost-1", "item.does_not_exist", 1, 2));
  inventory.items[0].lockReason = "trade";
  inventory.items[0].lockType = LOCK_TYPE_TRADE;
  inventory.items[0].lockId = "dead-trade";
  inventory.items[0].lockQuantity = 1;
  const overflow = emptyOverflow();
  overflow.items.push(makeInstance("ov-1", "item.test_pebble", 2, -1));
  const report = scanItemRecovery({
    characterId: "char-ada",
    inventory: inventory,
    overflow: overflow,
    definitions: defs(),
    liveLockIds: [],
  });
  const kinds = report.findings.map(function (row) {
    return row.kind;
  });
  assert.ok(kinds.indexOf("orphaned_lock") !== -1);
  assert.ok(kinds.indexOf("duplicate_slot") !== -1);
  assert.ok(kinds.indexOf("quantity_above_max") !== -1);
  assert.ok(kinds.indexOf("missing_definition") !== -1);
  assert.ok(kinds.indexOf("overflow_migration") !== -1);
  assert.equal(inventory.items.length, 4);
  assert.equal(overflow.items.length, 1);
});

test("repair clears orphan locks and moves extras to overflow without deleting unexplained items", () => {
  let inventory = emptyInventory();
  inventory.items.push(makeInstance("sword-a", "item.training_sword", 1, 0));
  inventory.items.push(makeInstance("sword-b", "item.training_sword", 1, 0));
  inventory.items.push(makeInstance("gel-over", "item.slime_gel", 50, 1));
  inventory.items.push(makeInstance("ghost-1", "item.does_not_exist", 1, 2));
  inventory.items[0].lockReason = "trade";
  inventory.items[0].lockType = LOCK_TYPE_TRADE;
  inventory.items[0].lockId = "dead-trade";
  inventory.items[0].lockQuantity = 1;
  const repaired = repairItemRecovery({
    characterId: "char-ada",
    inventory: inventory,
    overflow: emptyOverflow(),
    definitions: defs(),
    liveLockIds: ["live-trade"],
    nowMs: 10,
  });
  assert.equal(repaired.deletedUnexplained, false);
  const ghost = repaired.inventory.items.filter(function (item) {
    return item.instanceId === "ghost-1";
  });
  const overflowGhost = repaired.overflow.items.filter(function (item) {
    return item.instanceId === "ghost-1";
  });
  assert.equal(ghost.length + overflowGhost.length, 1);
  const locked = repaired.inventory.items.filter(function (item) {
    return item.lockId === "dead-trade";
  });
  assert.equal(locked.length, 0);
  assert.ok(repaired.overflow.items.length >= 1);
  const gel = repaired.inventory.items.find(function (item) {
    return item.instanceId === "gel-over";
  });
  assert.ok(gel !== undefined);
  assert.equal(gel.quantity, 20);
});

test("incomplete journal drop and committing trade are reported not auto-deleted", () => {
  const inventory = emptyInventory();
  inventory.items.push(makeInstance("drop-1", "item.test_pebble", 1, 0));
  const record = emptyJournalRecord("txn-drop", "req-drop-1", "item_drop", ["char-ada"], 1);
  record.state = JOURNAL_COMMITTING;
  inventory.journalByRequestId = { "req-drop-1": record };
  const trades = {
    "trade-stuck": {
      tradeId: "trade-stuck",
      participantA: { characterId: "char-ada", accountUserId: "user-ada", displayName: "Ada" },
      participantB: { characterId: "char-bob", accountUserId: "user-bob", displayName: "Bob" },
      state: "committing" as const,
      revision: 1,
      offers: {},
      goldOffers: {},
      acceptanceRevisionByParticipant: {},
      inventoryRevisionByParticipant: {},
      capacityKeyByParticipant: {},
      createdAt: 0,
      expiresAt: 0,
      createdAtTick: 0,
      expiresAtTick: 10,
      inviteExpiresAtTick: 0,
      matchId: "m1",
      schemaVersion: 1,
      byRequestId: {},
    },
  };
  const report = scanItemRecovery({
    characterId: "char-ada",
    inventory: inventory,
    definitions: defs(),
    liveLockIds: ["trade-stuck"],
    trades: trades,
  });
  const kinds = report.findings.map(function (row) {
    return row.kind;
  });
  assert.ok(kinds.indexOf("incomplete_drop") !== -1);
  assert.ok(kinds.indexOf("incomplete_trade") !== -1);
  const repaired = repairItemRecovery({
    characterId: "char-ada",
    inventory: inventory,
    definitions: defs(),
    liveLockIds: ["trade-stuck"],
    trades: trades,
  });
  assert.equal(repaired.inventory.items.length, 1);
  assert.equal(repaired.deletedUnexplained, false);
});

test("GM scan and repair are audited match commands and never grant from the client", () => {
  let state = zone();
  const actor = player();
  actor.inventory = addOrStackItem(emptyInventory(), "item.training_sword", 1, "sword-1", defs()["item.training_sword"]);
  actor.inventory = setItemLock(actor.inventory, actor.inventory.items[0].instanceId, "trade", "gone", { lockType: LOCK_TYPE_TRADE });
  state = addPlayer(state, actor);
  const live = state.players[actor.userId];
  assert.ok(live !== undefined);
  if (live === undefined) {
    return;
  }
  const scanned = applyGmToMatch(
    state,
    live,
    {
      command: "scan_item_recovery",
      reason: "item-11 cert scan",
      characterId: actor.characterId,
      requestId: "gm-scan-1",
    },
    1,
    1,
    defs(),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(scanned.ok, true);
  assert.equal(scanned.persistInventory, false);
  const findings = scanned.result.findings as Array<{ kind: string }>;
  assert.ok(findings.some(function (row) {
    return row.kind === "orphaned_lock";
  }));
  const repaired = applyGmToMatch(
    state,
    live,
    {
      command: "repair_item_recovery",
      reason: "item-11 cert repair",
      characterId: actor.characterId,
      requestId: "gm-repair-1",
    },
    2,
    2,
    defs(),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(repaired.ok, true);
  assert.equal(repaired.result.deletedUnexplained, false);
  assert.ok(live.inventory !== undefined);
  if (live.inventory === undefined) {
    return;
  }
  assert.equal(live.inventory.items[0].lockId, "");
});
