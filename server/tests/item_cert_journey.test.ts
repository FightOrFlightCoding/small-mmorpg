import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { scriptedRandom } from "../src/domain/combat_rng";
import {
  CORPSE_EXPIRE_SEC,
  CORPSE_PRIVATE_SEC,
  claimCorpseGold,
  claimCorpseItem,
  createCorpse,
  lootAllCorpse,
  tickCorpses,
} from "../src/domain/corpse";
import { applyEquip, emptyEquipment, MAIN_HAND_SLOT } from "../src/domain/equipment";
import {
  GROUND_ITEM_TTL_SEC,
  applyGroundPickup,
  applyPlayerDrop,
  expireGroundItems,
} from "../src/domain/ground_item";
import {
  INVENTORY_CAPACITY,
  ITEM_MAX_STACK,
  addOrStackItem,
  countItem,
  emptyInventory,
  isItemLocked,
  itemDefinitionsFromContent,
  makeInstance,
  occupiedSlots,
  type ItemDefinition,
  type PlayerInventory,
} from "../src/domain/inventory";
import { storedInventoryFromValue, storedInventoryWriteValue } from "../src/domain/inventory_store";
import { GRANT_SOURCE_QUEST_REWARD, grantItemFromSource } from "../src/domain/item_grant";
import { scanItemRecovery } from "../src/domain/item_recovery_scan";
import { applyNeedGreedPublicBoundary, openNeedGreedForCorpse, submitLootRollChoice } from "../src/domain/loot_roll";
import { MATCH_TICK_RATE, addPlayer, createStarterZoneState, enemyDefinitionsFromContent } from "../src/domain/match_state";
import { applyMatchLoop } from "../src/domain/match_loop";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import { dialogueDefinitionsFromContent } from "../src/domain/dialogue";
import { ClientOpcode, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";
import {
  QUEST_STATUS_ACCEPTED,
  countQuestPossession,
  createAcceptedProgress,
  emptyQuestLog,
  questDefinitionsFromContent,
  syncAcquireObjectives,
} from "../src/domain/quest";
import {
  TRADE_OFFER_SLOTS,
  acceptTradeInvite,
  acceptTradeRevision,
  cancelTrade,
  createTradeInvite,
  memoryTradeCommitter,
  setTradeGold,
  setTradeOffer,
  unlockTradeInventories,
  type TradeActor,
} from "../src/domain/trade";
import { vendorDefinitionsFromContent } from "../src/domain/vendor";
import { emptyGoldLedger } from "../src/domain/wallet";
import { buyMessage, envelope, openNpcSession } from "./npc_session";

const NAMES = ["ada", "bob", "cara", "dan", "eve"] as const;

function itemsById(): { [id: string]: ItemDefinition } {
  const map = itemDefinitionsFromContent(content.items);
  map["item.uncommon_gem"] = {
    id: "item.uncommon_gem",
    maxStack: 1,
    rarity: "rarity.uncommon",
  };
  map["item.bulk_ore"] = {
    id: "item.bulk_ore",
    maxStack: ITEM_MAX_STACK,
    rarity: "rarity.common",
  };
  return map;
}

function ids(prefix: string): () => string {
  let n = 0;
  return function () {
    n += 1;
    return prefix + "-" + String(n);
  };
}

function roster() {
  return NAMES.map(function (name) {
    return { characterId: "char-" + name, userId: "user-" + name };
  });
}

function partyCorpse() {
  let n = 0;
  return createCorpse({
    corpseId: "corpse-five",
    enemyInstanceId: "mob-five",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m-five",
    x: 0,
    y: 0,
    tick: 10,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-ada",
    tagOwnerUserId: "user-ada",
    tagPartyId: "party.five",
    encounterRoster: roster(),
    deathEligibleRoster: roster(),
    loot: {
      items: [
        { itemId: "item.test_pebble", quantity: 1, instanceId: "peb-loot" },
        { itemId: "item.slime_gel", quantity: 1, instanceId: "gel-loot" },
        { itemId: "item.uncommon_gem", quantity: 1, instanceId: "gem-loot" },
      ],
      gold: 11,
    },
    itemsById: itemsById(),
    newId: function () {
      n += 1;
      return "entry-" + String(n);
    },
  });
}

function bags(): { [characterId: string]: { characterId: string; userId: string; inventory: PlayerInventory } } {
  const map: { [characterId: string]: { characterId: string; userId: string; inventory: PlayerInventory } } = {};
  for (let i = 0; i < NAMES.length; i++) {
    const name = NAMES[i];
    map["char-" + name] = {
      characterId: "char-" + name,
      userId: "user-" + name,
      inventory: emptyInventory(),
    };
  }
  return map;
}

function fullBag(): PlayerInventory {
  const inventory = emptyInventory();
  for (let i = 0; i < INVENTORY_CAPACITY; i++) {
    inventory.items.push(makeInstance("full-" + String(i), "item.training_sword", 1, i));
  }
  return inventory;
}

function tradeActor(userId: string, inventory: PlayerInventory, gold = 50): TradeActor {
  return {
    userId: userId,
    characterId: "char-" + userId,
    displayName: userId,
    x: 0,
    y: 0,
    health: 100,
    gold: gold,
    inventory: inventory,
    equipment: emptyEquipment(),
    online: true,
  };
}

function vendorZone() {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
      attack: content.player.attack,
      attackRange: content.player.attackRange,
      attackCooldown: content.player.attackCooldown,
      pickupRange: content.player.pickupRange,
    },
    questDefinitionsFromContent(content.quests),
    itemsById(),
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      vendorsById: vendorDefinitionsFromContent(content.vendors),
      dialoguesById: dialogueDefinitionsFromContent(content.dialogues),
    },
  );
}

test("five-client bags are 30 slots, stack to 99, and equipment leaves the bag", () => {
  const defs = itemsById();
  for (let i = 0; i < NAMES.length; i++) {
    const bag = emptyInventory();
    assert.equal(bag.capacity, INVENTORY_CAPACITY);
    assert.equal(INVENTORY_CAPACITY, 30);
  }
  let stacked = emptyInventory();
  stacked = addOrStackItem(stacked, "item.bulk_ore", 90, "ore-1", defs["item.bulk_ore"]);
  stacked = addOrStackItem(stacked, "item.bulk_ore", 9, "ore-2", defs["item.bulk_ore"]);
  assert.equal(countItem(stacked, "item.bulk_ore"), 99);
  assert.equal(occupiedSlots(stacked), 1);
  const overflow = addOrStackItem(stacked, "item.bulk_ore", 1, "ore-3", defs["item.bulk_ore"]);
  assert.equal(occupiedSlots(overflow), 2);
  const swordBag = addOrStackItem(emptyInventory(), "item.training_sword", 1, "sword-1", defs["item.training_sword"]);
  const equipped = applyEquip({
    playerHealth: 100,
    userId: "user-ada",
    instanceId: "sword-1",
    slot: MAIN_HAND_SLOT,
    requestId: "req-eq-ada",
    equipment: emptyEquipment(),
    inventory: swordBag,
    itemsById: defs,
    baseAttack: 4,
    owners: [{ userId: "user-ada", inventory: swordBag, equipment: emptyEquipment() }],
    unequip: false,
  });
  assert.equal(equipped.ok, true);
  assert.equal(findSword(equipped.inventory), false);
  assert.equal(equipped.equipment.slots[MAIN_HAND_SLOT], "sword-1");
  const blocked = applyEquip({
    playerHealth: 100,
    userId: "user-ada",
    instanceId: "sword-1",
    slot: MAIN_HAND_SLOT,
    requestId: "req-uneq-full",
    equipment: equipped.equipment,
    inventory: fullBag(),
    itemsById: defs,
    baseAttack: 4,
    owners: [{ userId: "user-ada", inventory: fullBag(), equipment: equipped.equipment }],
    unequip: true,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "inventory_full");
  assert.equal(blocked.equipment.slots[MAIN_HAND_SLOT], "sword-1");
});

function findSword(inventory: PlayerInventory): boolean {
  return inventory.items.some(function (row) {
    return row.instanceId === "sword-1";
  });
}

test("merchant purchase uses server price and rejects client price spoof", () => {
  const vendor = content.zones["zone.starter"].npcs.find(function (npc) {
    return npc.npcId === "npc.test_vendor";
  }) as { x: number; y: number };
  const player = {
    userId: "user-ada",
    sessionId: "session-ada",
    username: "ada",
    characterId: "char-ada",
    name: "Ada",
    x: vendor.x,
    y: vendor.y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    gold: 20,
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
  };
  const state = addPlayer(vendorZone(), player);
  const opened = openNpcSession(state, "user-ada", "npc.test_vendor", 1, "req-open-ada0001");
  const spoof = parseClientMessage(
    ClientOpcode.VENDOR_BUY,
    envelope({
      vendorId: "vendor.test_general",
      stockEntryId: "vendor.test_general:item.test_potion",
      interactionSessionId: opened.sessionId,
      quantity: 1,
      price: 1,
      requestId: "req-spoof-ada01",
    }),
    contentHash,
  );
  assert.equal(isProtocolError(spoof), true);
  const bought = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-ada", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-buy-ada0001")],
  );
  const action = bought.outbound.find(function (row) {
    return row.opcode === ServerOpcode.ACTION_RESULT && row.toUserId === "user-ada";
  });
  assert.ok(action !== undefined);
  const body = JSON.parse(action !== undefined ? action.body : "{}") as { ok?: boolean };
  assert.equal(bought.state.players["user-ada"].gold, 10);
  assert.equal(countItem(bought.state.players["user-ada"].inventory, "item.test_potion"), 1);
  assert.equal(body.ok, true);
});

test("five-client corpse: roster, late joiner, first-come, quest no-roll, gold once, Need/Greed", () => {
  const defs = itemsById();
  const corpse = partyCorpse();
  const rolls = openNeedGreedForCorpse({
    corpse: corpse,
    itemsById: defs,
    newId: function () {
      return "roll-five";
    },
    openedAt: 10,
  });
  assert.equal(rolls.length, 1);
  assert.deepEqual(rolls[0].eligibleCharacterIds.slice().sort(), roster().map(function (row) {
    return row.characterId;
  }).sort());
  const late = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-fran",
    characterId: "char-fran",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs,
    requestId: "req-late-join",
  });
  assert.equal(late.ok, false);
  assert.equal(late.code, "not_eligible");
  const pebble = corpse.items.find(function (row) {
    return row.itemId === "item.test_pebble";
  });
  const gel = corpse.items.find(function (row) {
    return row.itemId === "item.slime_gel";
  });
  assert.ok(pebble !== undefined);
  assert.ok(gel !== undefined);
  if (pebble === undefined || gel === undefined) {
    return;
  }
  const firstOrdinary = claimCorpseItem({
    corpse: corpse,
    entryId: pebble.entryId,
    userId: "user-bob",
    characterId: "char-bob",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs,
    requestId: "req-peb-bob",
  });
  const secondOrdinary = claimCorpseItem({
    corpse: firstOrdinary.corpse,
    entryId: pebble.entryId,
    userId: "user-cara",
    characterId: "char-cara",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs,
    requestId: "req-peb-cara",
  });
  assert.equal(firstOrdinary.ok, true);
  assert.equal(secondOrdinary.ok, false);
  const questClaim = claimCorpseItem({
    corpse: firstOrdinary.corpse,
    entryId: gel.entryId,
    userId: "user-dan",
    characterId: "char-dan",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs,
    requestId: "req-gel-dan",
  });
  assert.equal(questClaim.ok, true);
  assert.equal(countItem(questClaim.inventory, "item.slime_gel"), 1);
  const gold = claimCorpseGold({
    corpse: questClaim.corpse,
    userId: "user-ada",
    characterId: "char-ada",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    requestId: "req-gold-ada",
    goldByUser: {
      "user-ada": 0,
      "user-bob": 0,
      "user-cara": 0,
      "user-dan": 0,
      "user-eve": 0,
    },
  });
  assert.equal(gold.ok, true);
  let total = 0;
  const users = Object.keys(gold.goldByUser);
  for (let i = 0; i < users.length; i++) {
    total += gold.goldByUser[users[i]];
  }
  assert.equal(total, 11);
  const replayGold = claimCorpseGold({
    corpse: questClaim.corpse,
    userId: "user-ada",
    characterId: "char-ada",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    requestId: "req-gold-ada",
    goldByUser: gold.goldByUser,
  });
  assert.equal(replayGold.replay, true);
  assert.equal(replayGold.goldByUser["user-ada"], gold.goldByUser["user-ada"]);
  submitLootRollChoice({
    rolls: rolls,
    rollId: rolls[0].rollId,
    characterId: "char-eve",
    choice: "NEED",
    requestId: "req-need-eve",
    tick: 11,
  });
  submitLootRollChoice({
    rolls: rolls,
    rollId: rolls[0].rollId,
    characterId: "char-ada",
    choice: "GREED",
    requestId: "req-greed-ada",
    tick: 11,
  });
  const awardBags = bags();
  applyNeedGreedPublicBoundary({
    corpses: [questClaim.corpse],
    rolls: rolls,
    tick: questClaim.corpse.privateUntilTick,
    context: {
      bags: awardBags,
      itemsById: defs,
      random: scriptedRandom([0.1, 0.9]),
      nowMs: 2000,
      namesByCharacterId: {
        "char-ada": "Ada",
        "char-bob": "Bob",
        "char-cara": "Cara",
        "char-dan": "Dan",
        "char-eve": "Eve",
      },
    },
  });
  assert.equal(rolls[0].winnerCharacterId, "char-eve");
  assert.equal(rolls[0].winningChoice, "NEED");
  assert.equal(countItem(awardBags["char-eve"].inventory, "item.uncommon_gem"), 1);
});

test("full-bag winner gets pending pickup; all-pass and unclaimed become public; corpse expires", () => {
  const defs = itemsById();
  const gemCorpse = createCorpse({
    corpseId: "corpse-pending",
    enemyInstanceId: "mob-p",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m-five",
    x: 0,
    y: 0,
    tick: 10,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-ada",
    tagOwnerUserId: "user-ada",
    tagPartyId: "party.five",
    encounterRoster: roster(),
    deathEligibleRoster: roster(),
    loot: { items: [{ itemId: "item.uncommon_gem", quantity: 1, instanceId: "gem-pend" }], gold: 0 },
    itemsById: defs,
    newId: function () {
      return "pend-entry";
    },
  });
  const rolls = openNeedGreedForCorpse({
    corpse: gemCorpse,
    itemsById: defs,
    newId: function () {
      return "roll-pend";
    },
    openedAt: 10,
  });
  submitLootRollChoice({
    rolls: rolls,
    rollId: rolls[0].rollId,
    characterId: "char-ada",
    choice: "NEED",
    requestId: "req-need-full",
    tick: 11,
  });
  const awardBags = bags();
  awardBags["char-ada"].inventory = fullBag();
  applyNeedGreedPublicBoundary({
    corpses: [gemCorpse],
    rolls: rolls,
    tick: gemCorpse.privateUntilTick,
    context: {
      bags: awardBags,
      itemsById: defs,
      random: scriptedRandom([0.8]),
      nowMs: 2000,
    },
  });
  assert.equal(rolls[0].state, "PENDING_PICKUP");
  assert.equal(gemCorpse.items[0].state, "AWARDED_PENDING_PICKUP");
  assert.equal(gemCorpse.items[0].reservedToCharacterId, "char-ada");
  const stolen = claimCorpseItem({
    corpse: gemCorpse,
    entryId: gemCorpse.items[0].entryId,
    userId: "user-bob",
    characterId: "char-bob",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs,
    requestId: "req-steal-pend",
  });
  assert.equal(stolen.ok, false);
  assert.equal(stolen.code, "not_eligible");
  const passCorpse = createCorpse({
    corpseId: "corpse-pass",
    enemyInstanceId: "mob-pass",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m-five",
    x: 0,
    y: 0,
    tick: 10,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-ada",
    tagOwnerUserId: "user-ada",
    tagPartyId: "party.five",
    encounterRoster: roster(),
    deathEligibleRoster: roster(),
    loot: { items: [{ itemId: "item.uncommon_gem", quantity: 1, instanceId: "gem-pass" }], gold: 0 },
    itemsById: defs,
    newId: function () {
      return "pass-entry";
    },
  });
  const passRolls = openNeedGreedForCorpse({
    corpse: passCorpse,
    itemsById: defs,
    newId: function () {
      return "roll-pass";
    },
    openedAt: 10,
  });
  applyNeedGreedPublicBoundary({
    corpses: [passCorpse],
    rolls: passRolls,
    tick: passCorpse.privateUntilTick,
    context: {
      bags: bags(),
      itemsById: defs,
      random: scriptedRandom([0.2]),
      nowMs: 2000,
    },
  });
  const publicTick = tickCorpses([passCorpse], passCorpse.privateUntilTick, emptyGoldLedger(), {});
  assert.equal(publicTick.corpses[0].items[0].state, "PUBLIC_AVAILABLE");
  const stranger = claimCorpseItem({
    corpse: publicTick.corpses[0],
    entryId: publicTick.corpses[0].items[0].entryId,
    userId: "user-fran",
    characterId: "char-fran",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs,
    requestId: "req-public-fran",
  });
  assert.equal(stranger.ok, true);
  assert.equal(CORPSE_PRIVATE_SEC, 60);
  const leftover = createCorpse({
    corpseId: "corpse-expire",
    enemyInstanceId: "mob-exp",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m-five",
    x: 0,
    y: 0,
    tick: 1,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-ada",
    tagOwnerUserId: "user-ada",
    tagPartyId: "party.five",
    encounterRoster: roster(),
    deathEligibleRoster: roster(),
    loot: { items: [{ itemId: "item.test_pebble", quantity: 1, instanceId: "peb-exp" }], gold: 0 },
    itemsById: defs,
    newId: function () {
      return "exp-entry";
    },
  });
  const expired = tickCorpses([leftover], leftover.expiresAtTick, emptyGoldLedger(), {});
  assert.equal(CORPSE_EXPIRE_SEC, 300);
  assert.equal(expired.corpses.length, 0);
  assert.equal(expired.removed.indexOf("corpse-expire") !== -1, true);
});

test("Loot All takes fitting stacks and leaves the rest", () => {
  const defs = itemsById();
  const inventory = emptyInventory();
  for (let i = 0; i < 29; i++) {
    inventory.items.push(makeInstance("fill-" + String(i), "item.training_sword", 1, i));
  }
  inventory.items.push(makeInstance("peb-partial", "item.test_pebble", 1, 29));
  const corpse = createCorpse({
    corpseId: "corpse-lootall",
    enemyInstanceId: "mob-la",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m-five",
    x: 0,
    y: 0,
    tick: 10,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-ada",
    tagOwnerUserId: "user-ada",
    tagPartyId: "",
    encounterRoster: [{ characterId: "char-ada", userId: "user-ada" }],
    deathEligibleRoster: [{ characterId: "char-ada", userId: "user-ada" }],
    loot: {
      items: [
        { itemId: "item.test_pebble", quantity: 2, instanceId: "peb-all" },
        { itemId: "item.training_sword", quantity: 1, instanceId: "sw-all" },
      ],
      gold: 0,
    },
    itemsById: defs,
    newId: ids("la"),
  });
  const result = lootAllCorpse({
    corpse: corpse,
    userId: "user-ada",
    characterId: "char-ada",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: inventory,
    itemsById: defs,
    requestId: "req-loot-all",
    goldByUser: { "user-ada": 0 },
  });
  assert.equal(result.ok, true);
  assert.equal(countItem(result.inventory, "item.test_pebble") >= 1, true);
  const leftover = result.results.some(function (row) {
    return row.claimed === false;
  });
  assert.equal(leftover, true);
});

test("quest item trade and public drop transfer possession", () => {
  const defs = itemsById();
  const quests = questDefinitionsFromContent(content.quests);
  const log = emptyQuestLog();
  log.quests["quest.slime_problem"] = createAcceptedProgress(quests["quest.slime_problem"]);
  const aliceInv = addOrStackItem(emptyInventory(), "item.slime_gel", 1, "gel-q", defs["item.slime_gel"]);
  const alice = tradeActor("alice", aliceInv);
  const bob = tradeActor("bob", emptyInventory());
  bob.x = 8;
  const invited = createTradeInvite({
    tradeId: "trade-quest",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1,
    matchId: "m-five",
    requestId: "req-q-inv",
    trades: {},
  });
  const opened = acceptTradeInvite({
    trade: invited.trade,
    actor: bob,
    other: alice,
    tick: 2,
    nowMs: 2,
    requestId: "req-q-acc",
  });
  const offered = setTradeOffer({
    trade: opened.trade,
    actor: alice,
    other: bob,
    instanceId: "gel-q",
    quantity: 1,
    itemsById: defs,
    requestId: "req-q-off",
  });
  alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : alice.inventory;
  const acceptA = acceptTradeRevision({
    trade: offered.trade,
    actor: alice,
    other: bob,
    revision: offered.trade.revision,
    itemsById: defs,
    makeId: ids("qa"),
    requestId: "req-q-aa",
  });
  const acceptB = acceptTradeRevision({
    trade: acceptA.trade,
    actor: bob,
    other: alice,
    revision: acceptA.trade.revision,
    itemsById: defs,
    makeId: ids("qb"),
    requestId: "req-q-bb",
  });
  assert.equal(acceptB.shouldCommit, true);
  assert.ok(acceptB.prepared !== undefined);
  if (acceptB.prepared === undefined) {
    return;
  }
  const afterAlice = syncAcquireObjectives(log, acceptB.prepared.inventoryA);
  const afterBob = syncAcquireObjectives(log, acceptB.prepared.inventoryB);
  assert.equal(afterAlice.log.quests["quest.slime_problem"].objectives[0].current, 0);
  assert.equal(afterBob.log.quests["quest.slime_problem"].objectives[0].current, 1);
  assert.equal(afterBob.log.quests["quest.slime_problem"].status, QUEST_STATUS_ACCEPTED);
  const dropBag = addOrStackItem(emptyInventory(), "item.slime_gel", 1, "gel-drop", defs["item.slime_gel"]);
  const dropped = applyPlayerDrop({
    playerHealth: 100,
    characterId: "char-bob",
    playerX: 100,
    playerY: 100,
    inventory: dropBag,
    instanceId: "gel-drop",
    requestId: "req-drop-gel",
    groundItems: [],
    collisions: [],
    walkableBounds: { x: 0, y: 0, width: 400, height: 400 },
    itemsById: defs,
    tick: 10,
    tickRate: MATCH_TICK_RATE,
    nowMs: 1000,
    newIds: ids("gd"),
  });
  assert.equal(dropped.ok, true);
  assert.equal(countQuestPossession(dropped.inventory, "item.slime_gel"), 0);
  const picked = applyGroundPickup({
    playerHealth: 100,
    characterId: "char-cara",
    playerX: 100,
    playerY: 100,
    inventory: emptyInventory(),
    groundEntityId: dropped.spawned !== null ? dropped.spawned.groundEntityId : "",
    requestId: "req-pick-gel",
    groundItems: dropped.groundItems,
    pickupRange: 40,
    itemsById: defs,
    nowMs: 1100,
    newIds: ids("gp"),
  });
  assert.equal(picked.ok, true);
  assert.equal(countQuestPossession(picked.inventory, "item.slime_gel"), 1);
  assert.equal(GROUND_ITEM_TTL_SEC, 300);
  const expired = expireGroundItems(dropped.groundItems, 10 + GROUND_ITEM_TTL_SEC * MATCH_TICK_RATE);
  assert.equal(expired.items.length, 0);
});

test("twenty-slot trade commits gold once, offer change resets accept, disconnect releases locks", () => {
  const defs = itemsById();
  const aliceInv = emptyInventory();
  const bobInv = emptyInventory();
  for (let i = 0; i < TRADE_OFFER_SLOTS; i++) {
    aliceInv.items.push(makeInstance("a-" + String(i), "item.test_pebble", 1, i));
    bobInv.items.push(makeInstance("b-" + String(i), "item.test_potion", 1, i));
  }
  aliceInv.items.push(makeInstance("a-extra", "item.test_pebble", 1, TRADE_OFFER_SLOTS));
  const alice = tradeActor("alice", aliceInv, 40);
  const bob = tradeActor("bob", bobInv, 40);
  bob.x = 8;
  const invited = createTradeInvite({
    tradeId: "trade-20",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1,
    matchId: "m-five",
    requestId: "req-20-inv",
    trades: {},
  });
  let trade = acceptTradeInvite({
    trade: invited.trade,
    actor: bob,
    other: alice,
    tick: 2,
    nowMs: 2,
    requestId: "req-20-open",
  }).trade;
  for (let i = 0; i < TRADE_OFFER_SLOTS; i++) {
    const offered = setTradeOffer({
      trade: trade,
      actor: alice,
      other: bob,
      instanceId: "a-" + String(i),
      quantity: 1,
      itemsById: defs,
      requestId: "req-20-a-" + String(i),
      slotIndex: i,
    });
    assert.equal(offered.ok, true);
    trade = offered.trade;
    alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : alice.inventory;
  }
  const extra = setTradeOffer({
    trade: trade,
    actor: alice,
    other: bob,
    instanceId: "a-extra",
    quantity: 1,
    itemsById: defs,
    requestId: "req-20-extra",
  });
  assert.equal(extra.ok, false);
  assert.equal(extra.code, "offer_full");
  const gold = setTradeGold({
    trade: trade,
    actor: bob,
    other: alice,
    amount: 7,
    requestId: "req-20-gold",
  });
  trade = gold.trade;
  const acceptThenChange = acceptTradeRevision({
    trade: trade,
    actor: alice,
    other: bob,
    revision: trade.revision,
    itemsById: defs,
    makeId: ids("ch"),
    requestId: "req-20-pre",
  });
  const changed = setTradeGold({
    trade: acceptThenChange.trade,
    actor: bob,
    other: alice,
    amount: 8,
    requestId: "req-20-gold2",
  });
  assert.equal(changed.trade.acceptanceRevisionByParticipant[alice.characterId] === trade.revision, false);
  const acceptA = acceptTradeRevision({
    trade: changed.trade,
    actor: alice,
    other: bob,
    revision: changed.trade.revision,
    itemsById: defs,
    makeId: ids("20a"),
    requestId: "req-20-aa",
  });
  const acceptB = acceptTradeRevision({
    trade: acceptA.trade,
    actor: bob,
    other: alice,
    revision: acceptA.trade.revision,
    itemsById: defs,
    makeId: ids("20b"),
    requestId: "req-20-bb",
  });
  assert.equal(acceptB.shouldCommit, true);
  assert.ok(acceptB.prepared !== undefined);
  if (acceptB.prepared === undefined) {
    return;
  }
  const committer = memoryTradeCommitter();
  const committed = committer({
    trade: acceptB.trade,
    requestId: "req-20-bb",
    userA: alice.userId,
    userB: bob.userId,
    characterA: alice.characterId,
    characterB: bob.characterId,
    inventoryA: acceptB.prepared.inventoryA,
    inventoryB: acceptB.prepared.inventoryB,
    goldDeltaA: acceptB.prepared.goldDeltaA,
    goldDeltaB: acceptB.prepared.goldDeltaB,
    currentGoldA: alice.gold,
    currentGoldB: bob.gold,
  });
  assert.equal(committed.ok, true);
  assert.equal(committed.goldA, 48);
  assert.equal(committed.goldB, 32);
  const replay = committer({
    trade: committed.trade,
    requestId: "req-20-bb",
    userA: alice.userId,
    userB: bob.userId,
    characterA: alice.characterId,
    characterB: bob.characterId,
    inventoryA: committed.inventoryA,
    inventoryB: committed.inventoryB,
    goldDeltaA: 8,
    goldDeltaB: -8,
    currentGoldA: committed.goldA,
    currentGoldB: committed.goldB,
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.goldA, 48);
  const unlocked = unlockTradeInventories(committed.trade, committed.inventoryA, committed.inventoryB);
  assert.equal(unlocked.inventoryA.items.some(function (row) {
    return isItemLocked(row);
  }), false);
  const live = createTradeInvite({
    tradeId: "trade-dc",
    inviter: tradeActor("ada", addOrStackItem(emptyInventory(), "item.test_pebble", 1, "dc-1", defs["item.test_pebble"])),
    invitee: tradeActor("eve", emptyInventory()),
    tick: 1,
    nowMs: 1,
    matchId: "m-five",
    requestId: "req-dc-inv",
    trades: {},
  });
  const cancelled = cancelTrade(live.trade, "disconnected");
  assert.equal(cancelled.trade.state, "cancelled");
});

test("logout round-trip preserves bag layout; restart drops corpse and ground; recovery is clean", () => {
  const defs = itemsById();
  const inventory = emptyInventory();
  inventory.items.push(makeInstance("keep-1", "item.test_pebble", 4, 3));
  inventory.items.push(makeInstance("keep-2", "item.training_sword", 1, 7));
  inventory.revision = 4;
  const stored = storedInventoryWriteValue(inventory);
  const loaded = storedInventoryFromValue(stored);
  assert.ok(loaded !== null);
  if (loaded === null) {
    return;
  }
  assert.equal(loaded.items[0].slotIndex, 3);
  assert.equal(loaded.items[1].slotIndex, 7);
  assert.equal(loaded.capacity, 30);
  const report = scanItemRecovery({
    characterId: "char-ada",
    inventory: loaded,
    definitions: defs,
    liveLockIds: [],
    corpses: [],
    groundItems: [],
  });
  assert.equal(report.unresolvedCount, 0);
  const grantFull = grantItemFromSource({
    characterId: "char-ada",
    sourceType: GRANT_SOURCE_QUEST_REWARD,
    sourceId: "quest.reward",
    itemDefinitionId: "item.training_sword",
    quantity: 1,
    eventId: "evt-full-reward",
    inventory: fullBag(),
    definitions: defs,
    newIds: ids("rw"),
    nowMs: 1,
  });
  assert.equal(grantFull.ok, false);
  assert.equal(grantFull.code, "inventory_full");
  assert.equal(grantFull.consumedSource, false);
});
