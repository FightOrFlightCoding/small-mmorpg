import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import { scriptedRandom } from "../src/domain/combat_rng";
import { claimCorpseItem, createCorpse, tickCorpses } from "../src/domain/corpse";
import { emptyEquipment } from "../src/domain/equipment";
import {
  GROUND_ITEM_NO_LONGER_AVAILABLE,
  GROUND_PUBLIC_AVAILABLE,
  applyGroundPickup,
  type GroundItem,
} from "../src/domain/ground_item";
import {
  addOrStackItem,
  emptyInventory,
  isItemLocked,
  itemDefinitionsFromContent,
  makeInstance,
} from "../src/domain/inventory";
import { applyNeedGreedPublicBoundary, openNeedGreedForCorpse, submitLootRollChoice } from "../src/domain/loot_roll";
import { MATCH_TICK_RATE } from "../src/domain/match_state";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import {
  acceptTradeInvite,
  acceptTradeRevision,
  cancelTrade,
  createTradeInvite,
  memoryTradeCommitter,
  recoverInterruptedTrade,
  setTradeOffer,
  unlockTradeInventories,
  type TradeActor,
} from "../src/domain/trade";
import { applyVendorBuy, stockEntryIdFor, vendorDefinitionsFromContent } from "../src/domain/vendor";
import { emptyGoldLedger } from "../src/domain/wallet";

function defs() {
  const map = itemDefinitionsFromContent(content.items);
  map["item.uncommon_gem"] = {
    id: "item.uncommon_gem",
    maxStack: 1,
    rarity: "rarity.uncommon",
  };
  return map;
}

function actor(userId: string, inventory = emptyInventory()): TradeActor {
  return {
    userId: userId,
    characterId: "char-" + userId,
    displayName: userId,
    x: 0,
    y: 0,
    health: 100,
    gold: 40,
    inventory: inventory,
    equipment: emptyEquipment(),
    online: true,
  };
}

test("concurrent corpse claims yield one winner", () => {
  const corpse = createCorpse({
    corpseId: "corpse-race",
    enemyInstanceId: "e1",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m1",
    x: 10,
    y: 10,
    tick: 1,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-a",
    tagOwnerUserId: "user-a",
    tagPartyId: "party.five",
    encounterRoster: [
      { characterId: "char-a", userId: "user-a" },
      { characterId: "char-b", userId: "user-b" },
    ],
    deathEligibleRoster: [
      { characterId: "char-a", userId: "user-a" },
      { characterId: "char-b", userId: "user-b" },
    ],
    loot: { items: [{ itemId: "item.slime_gel", quantity: 1, instanceId: "gel-race" }], gold: 0 },
    itemsById: defs(),
    newId: function () {
      return "entry-1";
    },
  });
  const first = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-a",
    characterId: "char-a",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-claim-a",
  });
  const second = claimCorpseItem({
    corpse: first.corpse !== null ? first.corpse : corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-b",
    characterId: "char-b",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-claim-b",
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
});

test("concurrent ground pickup yields one winner", () => {
  const ground: GroundItem[] = [
    {
      groundEntityId: "g-1",
      itemInstanceId: "peb-1",
      itemId: "item.test_pebble",
      quantity: 1,
      x: 10,
      y: 10,
      createdByCharacterId: "char-a",
      createdAtTick: 1,
      expiresAtTick: 10000,
      state: GROUND_PUBLIC_AVAILABLE,
      revision: 1,
      rarity: "rarity.common",
    },
  ];
  const first = applyGroundPickup({
    playerHealth: 100,
    characterId: "char-a",
    playerX: 10,
    playerY: 10,
    inventory: emptyInventory(),
    groundEntityId: "g-1",
    requestId: "req-pick-a",
    groundItems: ground,
    pickupRange: 40,
    itemsById: defs(),
    nowMs: 1,
    newIds: function () {
      return "new-a";
    },
  });
  const second = applyGroundPickup({
    playerHealth: 100,
    characterId: "char-b",
    playerX: 10,
    playerY: 10,
    inventory: emptyInventory(),
    groundEntityId: "g-1",
    requestId: "req-pick-b",
    groundItems: first.groundItems,
    pickupRange: 40,
    itemsById: defs(),
    nowMs: 1,
    newIds: function () {
      return "new-b";
    },
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.code, GROUND_ITEM_NO_LONGER_AVAILABLE);
});

test("loot request retry replays the original Need choice", () => {
  const corpse = createCorpse({
    corpseId: "corpse-retry",
    enemyInstanceId: "e2",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m1",
    x: 0,
    y: 0,
    tick: 1,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-a",
    tagOwnerUserId: "user-a",
    tagPartyId: "party.five",
    encounterRoster: [
      { characterId: "char-a", userId: "user-a" },
      { characterId: "char-b", userId: "user-b" },
    ],
    deathEligibleRoster: [
      { characterId: "char-a", userId: "user-a" },
      { characterId: "char-b", userId: "user-b" },
    ],
    loot: { items: [{ itemId: "item.uncommon_gem", quantity: 1, instanceId: "gem-1" }], gold: 0 },
    itemsById: defs(),
    newId: function () {
      return "gem-entry";
    },
  });
  const rolls = openNeedGreedForCorpse({
    corpse: corpse,
    itemsById: defs(),
    newId: function () {
      return "roll-1";
    },
    openedAt: 1,
  });
  assert.equal(rolls.length, 1);
  const first = submitLootRollChoice({
    rolls: rolls,
    rollId: rolls[0].rollId,
    characterId: "char-a",
    choice: "NEED",
    requestId: "req-need-a",
    tick: 2,
  });
  const retry = submitLootRollChoice({
    rolls: rolls,
    rollId: rolls[0].rollId,
    characterId: "char-a",
    choice: "GREED",
    requestId: "req-need-a",
    tick: 3,
  });
  assert.equal(first.ok, true);
  assert.equal(retry.replay, true);
  assert.equal(retry.choice, "NEED");
});

test("merchant buy retries replay without a second gold debit", () => {
  const items = defs();
  const vendors = vendorDefinitionsFromContent(content.vendors);
  const npcs = npcDefinitionsFromContent(content.npcs);
  const buy = {
    playerHealth: 100,
    playerX: 1360,
    playerY: 1664,
    gold: 40,
    inventory: emptyInventory(),
    npcId: "npc.test_vendor",
    requestId: "req-buy-retry1",
    npcs: [{ id: "npc.test_vendor", npcId: "npc.test_vendor", x: 1360, y: 1664 }],
    interactionRange: 48,
    npcById: npcs,
    vendorsById: vendors,
    itemsById: items,
    equippedInstanceIds: [],
    vendorId: "vendor.test_general",
    stockEntryId: stockEntryIdFor("vendor.test_general", "item.test_potion"),
    quantity: 1,
    newId: function () {
      return "potion-buy-1";
    },
  };
  const first = applyVendorBuy(buy);
  const retry = applyVendorBuy({ ...buy, inventory: first.inventory, gold: first.gold });
  assert.equal(first.ok, true);
  assert.equal(first.gold, 30);
  assert.equal(retry.ok, true);
  assert.equal(retry.replay, true);
  assert.equal(retry.gold, 30);
  assert.equal(retry.inventory.items.filter(function (row) {
    return row.itemId === "item.test_potion";
  }).length, 1);
});

test("Need/Greed resolves before public claims at the 60s boundary", () => {
  const corpse = createCorpse({
    corpseId: "corpse-boundary",
    enemyInstanceId: "e3",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m1",
    x: 0,
    y: 0,
    tick: 10,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-a",
    tagOwnerUserId: "user-a",
    tagPartyId: "party.five",
    encounterRoster: [
      { characterId: "char-a", userId: "user-a" },
      { characterId: "char-b", userId: "user-b" },
    ],
    deathEligibleRoster: [
      { characterId: "char-a", userId: "user-a" },
      { characterId: "char-b", userId: "user-b" },
    ],
    loot: { items: [{ itemId: "item.uncommon_gem", quantity: 1, instanceId: "gem-b" }], gold: 0 },
    itemsById: defs(),
    newId: function () {
      return "gem-b-entry";
    },
  });
  const rolls = openNeedGreedForCorpse({
    corpse: corpse,
    itemsById: defs(),
    newId: function () {
      return "roll-b";
    },
    openedAt: 10,
  });
  const early = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-a",
    characterId: "char-a",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-early-public",
  });
  assert.equal(early.ok, false);
  assert.equal(early.code, "roll_pending");
  applyNeedGreedPublicBoundary({
    corpses: [corpse],
    rolls: rolls,
    tick: corpse.privateUntilTick,
    context: {
      bags: {
        "char-a": { characterId: "char-a", userId: "user-a", inventory: emptyInventory() },
        "char-b": { characterId: "char-b", userId: "user-b", inventory: emptyInventory() },
      },
      itemsById: defs(),
      random: scriptedRandom([0.2]),
      nowMs: 1000,
    },
  });
  assert.equal(rolls[0].state, "ALL_PASSED");
  const ticked = tickCorpses([corpse], corpse.privateUntilTick, emptyGoldLedger(), {});
  assert.equal(ticked.corpses[0].items[0].state, "PUBLIC_AVAILABLE");
});

test("simultaneous trade accepts of different revisions keep one winner path", () => {
  const items = defs();
  const aliceInv = addOrStackItem(emptyInventory(), "item.test_pebble", 2, "peb-a", items["item.test_pebble"]);
  const bobInv = addOrStackItem(emptyInventory(), "item.test_potion", 1, "pot-b", items["item.test_potion"]);
  const alice = actor("alice", aliceInv);
  const bob = actor("bob", bobInv);
  bob.x = 8;
  const invited = createTradeInvite({
    tradeId: "trade-race",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1,
    matchId: "m1",
    requestId: "req-inv-race",
    trades: {},
  });
  const opened = acceptTradeInvite({
    trade: invited.trade,
    actor: bob,
    other: alice,
    tick: 2,
    nowMs: 2,
    requestId: "req-acc-inv",
  });
  const offered = setTradeOffer({
    trade: opened.trade,
    actor: alice,
    other: bob,
    instanceId: "peb-a",
    quantity: 1,
    itemsById: items,
    requestId: "req-off-1",
  });
  alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : alice.inventory;
  const acceptStale = acceptTradeRevision({
    trade: offered.trade,
    actor: alice,
    other: bob,
    revision: offered.trade.revision - 1,
    itemsById: items,
    makeId: function () {
      return "new-stale";
    },
    requestId: "req-acc-stale",
  });
  const acceptFresh = acceptTradeRevision({
    trade: offered.trade,
    actor: bob,
    other: alice,
    revision: offered.trade.revision,
    itemsById: items,
    makeId: function () {
      return "new-fresh";
    },
    requestId: "req-acc-fresh",
  });
  assert.equal(acceptStale.ok, false);
  assert.equal(acceptStale.code, "revision_mismatch");
  assert.equal(acceptFresh.ok, true);
  assert.equal(offered.trade.state, "open");
});

test("inventory mutation while a trade is open does not transfer ownership", () => {
  const items = defs();
  const aliceInv = addOrStackItem(emptyInventory(), "item.test_pebble", 2, "peb-mut", items["item.test_pebble"]);
  aliceInv.items.push(makeInstance("sword-mut", "item.training_sword", 1, 1));
  const alice = actor("alice", aliceInv);
  const bob = actor("bob", emptyInventory());
  bob.x = 8;
  const invited = createTradeInvite({
    tradeId: "trade-mut",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1,
    matchId: "m1",
    requestId: "req-inv-mut",
    trades: {},
  });
  const opened = acceptTradeInvite({
    trade: invited.trade,
    actor: bob,
    other: alice,
    tick: 2,
    nowMs: 2,
    requestId: "req-acc-mut",
  });
  const offered = setTradeOffer({
    trade: opened.trade,
    actor: alice,
    other: bob,
    instanceId: "peb-mut",
    quantity: 1,
    itemsById: items,
    requestId: "req-off-mut",
  });
  assert.equal(offered.ok, true);
  const locked = offered.inventoryA !== undefined ? offered.inventoryA.items.find(function (row) {
    return row.instanceId === "peb-mut";
  }) : undefined;
  assert.ok(locked !== undefined && isItemLocked(locked));
  assert.equal(bob.inventory.items.length, 0);
});

test("disconnect of an open trade cancels and releases every lock", () => {
  const items = defs();
  const aliceInv = addOrStackItem(emptyInventory(), "item.test_pebble", 1, "peb-disc", items["item.test_pebble"]);
  const alice = actor("alice", aliceInv);
  const bob = actor("bob", emptyInventory());
  bob.x = 8;
  const invited = createTradeInvite({
    tradeId: "trade-disc",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1,
    matchId: "m1",
    requestId: "req-inv-disc",
    trades: {},
  });
  const opened = acceptTradeInvite({
    trade: invited.trade,
    actor: bob,
    other: alice,
    tick: 2,
    nowMs: 2,
    requestId: "req-acc-disc",
  });
  const offered = setTradeOffer({
    trade: opened.trade,
    actor: alice,
    other: bob,
    instanceId: "peb-disc",
    quantity: 1,
    itemsById: items,
    requestId: "req-off-disc",
  });
  alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : alice.inventory;
  const cancelled = cancelTrade(offered.trade, "disconnected");
  const unlocked = unlockTradeInventories(cancelled.trade, alice.inventory, bob.inventory);
  assert.equal(cancelled.trade.state, "cancelled");
  assert.equal(unlocked.inventoryA.items.some(function (row) {
    return isItemLocked(row);
  }), false);
});

test("interrupted commit recovers once and does not duplicate gold", () => {
  const items = defs();
  const aliceInv = addOrStackItem(emptyInventory(), "item.test_pebble", 1, "peb-rec", items["item.test_pebble"]);
  const alice = actor("alice", aliceInv);
  const bob = actor("bob", emptyInventory());
  bob.x = 8;
  bob.gold = 20;
  const invited = createTradeInvite({
    tradeId: "trade-rec",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1,
    matchId: "m1",
    requestId: "req-inv-rec",
    trades: {},
  });
  const opened = acceptTradeInvite({
    trade: invited.trade,
    actor: bob,
    other: alice,
    tick: 2,
    nowMs: 2,
    requestId: "req-acc-inv-rec",
  });
  const offered = setTradeOffer({
    trade: opened.trade,
    actor: alice,
    other: bob,
    instanceId: "peb-rec",
    quantity: 1,
    itemsById: items,
    requestId: "req-off-rec",
  });
  alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : alice.inventory;
  const acceptA = acceptTradeRevision({
    trade: offered.trade,
    actor: alice,
    other: bob,
    revision: offered.trade.revision,
    itemsById: items,
    makeId: function () {
      return "new-rec-a";
    },
    requestId: "req-acc-a-rec",
  });
  const acceptB = acceptTradeRevision({
    trade: acceptA.trade,
    actor: bob,
    other: alice,
    revision: acceptA.trade.revision,
    itemsById: items,
    makeId: function () {
      return "new-rec-b";
    },
    requestId: "req-acc-b-rec",
  });
  assert.equal(acceptB.shouldCommit, true);
  assert.ok(acceptB.prepared !== undefined);
  const committing = acceptB.trade;
  committing.state = "committing";
  committing.commitRequestId = "req-acc-b-rec";
  committing.commitSnapshot = {
    inventoryA: acceptB.prepared.inventoryA,
    inventoryB: acceptB.prepared.inventoryB,
    goldA: acceptB.prepared.goldA,
    goldB: acceptB.prepared.goldB,
    goldDeltaA: acceptB.prepared.goldDeltaA,
    goldDeltaB: acceptB.prepared.goldDeltaB,
    requestId: "req-acc-b-rec",
  };
  const recovered = recoverInterruptedTrade(committing, memoryTradeCommitter(), alice.gold, bob.gold);
  assert.equal(recovered.ok, true);
  const replay = recoverInterruptedTrade(recovered.trade, memoryTradeCommitter(), recovered.goldA, recovered.goldB);
  assert.equal(replay.replay, true);
  assert.equal(replay.goldA, recovered.goldA);
  assert.equal(replay.goldB, recovered.goldB);
});
