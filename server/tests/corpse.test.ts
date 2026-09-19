import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import {
  CORPSE_EXPIRE_SEC,
  CORPSE_PRIVATE_SEC,
  ERROR_LOOT_ITEM_NO_LONGER_AVAILABLE,
  ERROR_NOT_ELIGIBLE,
  buildDeathEligibleRoster,
  claimCorpseGold,
  claimCorpseItem,
  createCorpse,
  generateCorpseLoot,
  lootAllCorpse,
  planGoldShares,
  qualifiesForNeedGreed,
  splitGeneratedStacks,
  tickCorpses,
  type CorpseLootContainer,
} from "../src/domain/corpse";
import { applyFirstDamagingHitTag, resetEnemyTag } from "../src/domain/enemy_tag";
import {
  emptyInventory,
  itemDefinitionsFromContent,
  makeInstance,
  type ItemDefinition,
  type PlayerInventory,
} from "../src/domain/inventory";
import { emptyGoldLedger } from "../src/domain/wallet";
import { MATCH_TICK_RATE, addPlayer, createStarterZoneState, enemyDefinitionsFromContent, type MatchPlayer, type StarterZoneState } from "../src/domain/match_state";
import { applyMatchLoop } from "../src/domain/match_loop";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { resetEnemyToSpawn } from "../src/domain/spawn_controller";
import { rollLootTable } from "../src/domain/loot_table";
import { memoryCommitter } from "../src/domain/transaction";

function ids(prefix: string): () => string {
  let n = 0;
  return function () {
    n += 1;
    return prefix + String(n);
  };
}

function itemsById(): { [id: string]: ItemDefinition } {
  const map = itemDefinitionsFromContent(content.items);
  map["item.stack_ore"] = {
    id: "item.stack_ore",
    maxStack: 5,
    rarity: "rarity.common",
  };
  map["item.uncommon_gem"] = {
    id: "item.uncommon_gem",
    maxStack: 1,
    rarity: "rarity.uncommon",
  };
  return map;
}

function defs(): { [id: string]: ItemDefinition } {
  return itemsById();
}

function gel(): ItemDefinition {
  return defs()["item.slime_gel"];
}

function makeCorpse(overrides: Partial<CorpseLootContainer> = {}): CorpseLootContainer {
  const newId = ids("c");
  const base = createCorpse({
    corpseId: "corpse-1",
    enemyInstanceId: "enemy.green_slime:0",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "match-1",
    x: 10,
    y: 10,
    tick: 10,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-alice",
    tagOwnerUserId: "user-alice",
    tagPartyId: "",
    encounterRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    deathEligibleRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    loot: { items: [{ itemId: "item.slime_gel", quantity: 1, instanceId: "inst-gel" }], gold: 0 },
    itemsById: defs(),
    newId: newId,
  });
  const keys = Object.keys(overrides) as Array<keyof CorpseLootContainer>;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    (base as unknown as { [k: string]: unknown })[String(key)] = overrides[key] as unknown;
  }
  return base;
}

function emptyZone(): StarterZoneState {
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
    defs(),
  );
}

function playerAt(userId: string, name: string, x: number, y: number, inventory?: PlayerInventory): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId.replace("user-", ""),
    name: name,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: inventory !== undefined ? inventory : emptyInventory(),
    gold: 0,
  };
}

function envelope(extra: { [key: string]: unknown }): string {
  return JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...extra });
}

test("quest items never qualify for Need/Greed", () => {
  assert.equal(qualifiesForNeedGreed(gel(), 2), false);
  assert.equal(qualifiesForNeedGreed(defs()["item.uncommon_gem"], 2), true);
  assert.equal(qualifiesForNeedGreed(defs()["item.uncommon_gem"], 1), false);
});

test("loot generation splits stacks at maximum stack size once", () => {
  const stacks = splitGeneratedStacks("item.stack_ore", 12, defs()["item.stack_ore"], ids("s"));
  assert.equal(stacks.length, 3);
  assert.deepEqual(
    stacks.map(function (row) {
      return row.quantity;
    }),
    [5, 5, 2],
  );
  const pile = generateCorpseLoot(
    [
      { itemId: "item.stack_ore", quantity: 12, kind: "item" },
      { itemId: "", quantity: 7, kind: "gold" },
    ],
    defs(),
    ids("g"),
  );
  assert.equal(pile.gold, 7);
  assert.equal(pile.items.length, 3);
});

test("solo corpse grants private access to the tag owner", () => {
  const corpse = makeCorpse();
  const claimed = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-solo-claim1",
  });
  assert.equal(claimed.ok, true);
  assert.equal(corpse.items[0].state, "CLAIMED");
  assert.equal(corpse.state, "REMOVED");
});

test("party ordinary loot is first successful claimant", () => {
  const corpse = makeCorpse({
    tagPartyId: "party.test",
    encounterRoster: [
      { characterId: "char-alice", userId: "user-alice" },
      { characterId: "char-bob", userId: "user-bob" },
    ],
    deathEligibleRoster: [
      { characterId: "char-alice", userId: "user-alice" },
      { characterId: "char-bob", userId: "user-bob" },
    ],
  });
  const bob = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-bob",
    characterId: "char-bob",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-bob-first1",
  });
  assert.equal(bob.ok, true);
  const alice = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-alice-late1",
  });
  assert.equal(alice.ok, false);
  assert.equal(alice.code, ERROR_LOOT_ITEM_NO_LONGER_AVAILABLE);
});

test("death-eligible roster excludes out-of-range members and keeps recently dead ones", () => {
  const roster = [
    { characterId: "char-alice", userId: "user-alice" },
    { characterId: "char-bob", userId: "user-bob" },
    { characterId: "char-cara", userId: "user-cara" },
  ];
  const eligible = buildDeathEligibleRoster({
    roster: roster,
    presence: {},
    players: {
      "user-alice": { userId: "user-alice", characterId: "char-alice", x: 0, y: 0, health: 10 },
      "user-bob": { userId: "user-bob", characterId: "char-bob", x: 4000, y: 0, health: 10 },
      "user-cara": { userId: "user-cara", characterId: "char-cara", x: 4000, y: 0, health: 0, lastDeathTick: 8 },
    },
    disconnected: {},
    enemyX: 0,
    enemyY: 0,
    tick: 10,
    tickRate: MATCH_TICK_RATE,
  });
  assert.deepEqual(
    eligible.map(function (row) {
      return row.characterId;
    }),
    ["char-alice", "char-cara"],
  );
});

test("private access rejects characters who are not death-eligible", () => {
  const corpse = makeCorpse();
  const denied = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-eve",
    characterId: "char-eve",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-eve-private1",
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, ERROR_NOT_ELIGIBLE);
});

test("public transition opens remaining unreserved items and gold", () => {
  const corpse = makeCorpse({ goldAmount: 9, goldState: "PRIVATE_AVAILABLE" });
  const ticked = tickCorpses([corpse], corpse.privateUntilTick, emptyGoldLedger(), { "user-alice": 0 });
  assert.equal(ticked.corpses.length, 1);
  assert.equal(ticked.corpses[0].items[0].state, "PUBLIC_AVAILABLE");
  assert.equal(ticked.corpses[0].goldState, "PUBLIC_AVAILABLE");
  assert.equal(ticked.corpses[0].publicTransitionDone, true);
});

test("five-minute expiration expires remaining entries and removes the corpse", () => {
  const corpse = makeCorpse();
  const ticked = tickCorpses([corpse], corpse.expiresAtTick, emptyGoldLedger(), {});
  assert.equal(ticked.removed.indexOf("corpse-1") >= 0, true);
  assert.equal(ticked.corpses.length, 0);
});

test("empty corpse is removed immediately after the last claim", () => {
  const corpse = makeCorpse();
  claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-empty-last1",
  });
  assert.equal(corpse.state, "REMOVED");
  const ticked = tickCorpses([corpse], 11, emptyGoldLedger(), {});
  assert.equal(ticked.removed.indexOf("corpse-1") >= 0, true);
});

test("concurrent claims: the second request receives loot_item_no_longer_available", () => {
  const corpse = makeCorpse({
    deathEligibleRoster: [
      { characterId: "char-alice", userId: "user-alice" },
      { characterId: "char-bob", userId: "user-bob" },
    ],
  });
  const first = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-conc-a1xxxx",
  });
  const second = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-bob",
    characterId: "char-bob",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-conc-b1xxxx",
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.code, ERROR_LOOT_ITEM_NO_LONGER_AVAILABLE);
});

test("duplicate successful requestId returns the original claim result", () => {
  const corpse = makeCorpse();
  const inventory = emptyInventory();
  const first = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: inventory,
    itemsById: defs(),
    requestId: "req-dup-item01",
  });
  const replay = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-dup-item01",
  });
  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  assert.equal(replay.replay, true);
  assert.equal(replay.persist, false);
});

test("Loot All takes gold then fitting items and reports the rest", () => {
  const newId = ids("la");
  const corpse = createCorpse({
    corpseId: "corpse-all",
    enemyInstanceId: "e1",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m1",
    x: 0,
    y: 0,
    tick: 10,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-alice",
    tagOwnerUserId: "user-alice",
    tagPartyId: "",
    encounterRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    deathEligibleRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    loot: {
      items: [
        { itemId: "item.slime_gel", quantity: 1, instanceId: "g1" },
        { itemId: "item.uncommon_gem", quantity: 1, instanceId: "g2" },
      ],
      gold: 4,
    },
    itemsById: defs(),
    newId: newId,
  });
  const inventory = emptyInventory(1);
  inventory.items = [makeInstance("sword-1", "item.training_sword", 1, 0)];
  const result = lootAllCorpse({
    corpse: corpse,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: inventory,
    itemsById: defs(),
    requestId: "req-loot-all01",
    goldByUser: { "user-alice": 1 },
    goldLedger: emptyGoldLedger(),
  });
  assert.equal(result.ok, true);
  const goldRow = result.results[0];
  assert.equal(goldRow.kind, "gold");
  assert.equal(goldRow.claimed, true);
  assert.equal(result.goldByUser["user-alice"], 5);
  const claimedItems = result.results.filter(function (row) {
    return row.kind === "item" && row.claimed;
  });
  const leftItems = result.results.filter(function (row) {
    return row.kind === "item" && !row.claimed;
  });
  assert.equal(claimedItems.length + leftItems.length, 2);
  assert.equal(leftItems.length >= 1, true);
});

test("gold solo claim grants the full amount once", () => {
  const corpse = makeCorpse({ goldAmount: 11, goldState: "PRIVATE_AVAILABLE", items: [] });
  const first = claimCorpseGold({
    corpse: corpse,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    requestId: "req-gold-solo1",
    goldByUser: { "user-alice": 3 },
    goldLedger: emptyGoldLedger(),
  });
  assert.equal(first.ok, true);
  assert.equal(first.goldByUser["user-alice"], 14);
  assert.equal(corpse.goldState, "CLAIMED");
  const replay = claimCorpseGold({
    corpse: corpse,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    requestId: "req-gold-solo1",
    goldByUser: { "user-alice": 14 },
    goldLedger: emptyGoldLedger(),
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.persist, false);
});

test("party gold splits with remainder to the tag owner then ascending character id", () => {
  const corpse = makeCorpse({
    goldAmount: 10,
    goldState: "PRIVATE_AVAILABLE",
    tagOwnerCharacterId: "char-zoe",
    tagOwnerUserId: "user-zoe",
    deathEligibleRoster: [
      { characterId: "char-alice", userId: "user-alice" },
      { characterId: "char-bob", userId: "user-bob" },
      { characterId: "char-zoe", userId: "user-zoe" },
    ],
    items: [],
  });
  const plan = planGoldShares(corpse, "req-gold-party1");
  assert.equal(plan.recipients[0].characterId, "char-zoe");
  assert.equal(plan.recipients[0].amount, 4);
  assert.equal(plan.recipients[1].characterId, "char-alice");
  assert.equal(plan.recipients[1].amount, 3);
  assert.equal(plan.recipients[2].characterId, "char-bob");
  assert.equal(plan.recipients[2].amount, 3);
  const granted = claimCorpseGold({
    corpse: corpse,
    userId: "user-bob",
    characterId: "char-bob",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    requestId: "req-gold-party1",
    goldByUser: { "user-alice": 0, "user-bob": 0, "user-zoe": 0 },
    goldLedger: emptyGoldLedger(),
  });
  assert.equal(granted.ok, true);
  assert.equal(granted.goldByUser["user-zoe"], 4);
  assert.equal(granted.goldByUser["user-alice"], 3);
  assert.equal(granted.goldByUser["user-bob"], 3);
});

test("disconnected gold recipient still receives an idempotent share", () => {
  const corpse = makeCorpse({
    goldAmount: 5,
    goldState: "PRIVATE_AVAILABLE",
    deathEligibleRoster: [
      { characterId: "char-alice", userId: "user-alice" },
      { characterId: "char-bob", userId: "user-bob" },
    ],
    items: [],
  });
  const granted = claimCorpseGold({
    corpse: corpse,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    requestId: "req-gold-dc01xx",
    goldByUser: { "user-alice": 1, "user-bob": 8 },
    goldLedger: emptyGoldLedger(),
  });
  assert.equal(granted.ok, true);
  assert.equal(granted.goldByUser["user-alice"] + granted.goldByUser["user-bob"], 14);
  const again = claimCorpseGold({
    corpse: corpse,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    requestId: "req-gold-dc02xx",
    goldByUser: granted.goldByUser,
    goldLedger: emptyGoldLedger(),
  });
  assert.equal(again.ok, false);
  assert.equal(again.code, ERROR_LOOT_ITEM_NO_LONGER_AVAILABLE);
});

test("public gold goes to the first valid claimant", () => {
  const corpse = makeCorpse({
    goldAmount: 6,
    goldState: "PUBLIC_AVAILABLE",
    publicTransitionDone: true,
    deathEligibleRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    items: [],
  });
  const stranger = claimCorpseGold({
    corpse: corpse,
    userId: "user-eve",
    characterId: "char-eve",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    requestId: "req-gold-pub01",
    goldByUser: { "user-eve": 2 },
    goldLedger: emptyGoldLedger(),
  });
  assert.equal(stranger.ok, true);
  assert.equal(stranger.goldByUser["user-eve"], 8);
});

test("ROLL_PENDING party uncommon drops are reserved for ITEM-06 and skipped by Loot All", () => {
  const corpse = createCorpse({
    corpseId: "corpse-roll",
    enemyInstanceId: "e1",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m1",
    x: 0,
    y: 0,
    tick: 1,
    tickRate: MATCH_TICK_RATE,
    tagOwnerCharacterId: "char-alice",
    tagOwnerUserId: "user-alice",
    tagPartyId: "party.test",
    encounterRoster: [
      { characterId: "char-alice", userId: "user-alice" },
      { characterId: "char-bob", userId: "user-bob" },
    ],
    deathEligibleRoster: [
      { characterId: "char-alice", userId: "user-alice" },
      { characterId: "char-bob", userId: "user-bob" },
    ],
    loot: { items: [{ itemId: "item.uncommon_gem", quantity: 1, instanceId: "gem-1" }], gold: 0 },
    itemsById: defs(),
    newId: ids("r"),
  });
  assert.equal(corpse.items[0].state, "ROLL_PENDING");
  const result = lootAllCorpse({
    corpse: corpse,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-skip-roll01",
    goldByUser: { "user-alice": 0 },
  });
  assert.equal(result.results[0].claimed, false);
  assert.equal(result.results[0].code, "roll_pending");
  assert.equal(corpse.items[0].state, "ROLL_PENDING");
});

test("leash reset clears the first-attacker tag", () => {
  const state = emptyZone();
  const enemy = state.enemies[0];
  applyFirstDamagingHitTag({
    enemy: enemy,
    attackerUserId: "user-alice",
    attackerCharacterId: "char-alice",
    tick: 2,
  });
  resetEnemyToSpawn(enemy, true);
  assert.equal(enemy.tagOwnerCharacterId, "");
  resetEnemyTag(enemy);
  assert.equal(enemy.tagRevision !== undefined && enemy.tagRevision >= 2, true);
});

test("slime death creates a corpse and a linked sparkle without persisting inventory", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.enemies[0].health = content.player.attack;
  const kill = applyMatchLoop(state, 8, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "req-atk-corpse1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(kill.state.loot.length, 1);
  assert.equal(kill.state.corpses.length, 1);
  assert.equal(kill.state.corpses[0].items[0].itemId, "item.slime_gel");
  assert.equal(kill.state.loot[0].corpseId, kill.state.corpses[0].corpseId);
  assert.equal(kill.persistInventories.length, 0);
  assert.equal(CORPSE_PRIVATE_SEC, 60);
  assert.equal(CORPSE_EXPIRE_SEC, 300);
});

test("match restart does not reconstruct corpses; claimed bag gold remains on the player object", () => {
  const corpse = makeCorpse({ goldAmount: 4, goldState: "PRIVATE_AVAILABLE", items: [] });
  const granted = claimCorpseGold({
    corpse: corpse,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    requestId: "req-restart-g01",
    goldByUser: { "user-alice": 2 },
    goldLedger: emptyGoldLedger(),
  });
  assert.equal(granted.goldByUser["user-alice"], 6);
  const restarted = emptyZone();
  assert.equal(restarted.corpses.length, 0);
  assert.equal(restarted.loot.length, 0);
});

test("weighted gold and item loot table entries roll independently", () => {
  const drops = rollLootTable(
    {
      id: "loot.test.gold",
      ownershipPolicy: "ground_free",
      entries: [
        {
          itemDefinitionId: "item.slime_gel",
          minimumQuantity: 1,
          maximumQuantity: 1,
          chance: 1,
          guaranteed: true,
          kind: "item",
        },
        {
          itemDefinitionId: "currency.gold",
          minimumQuantity: 3,
          maximumQuantity: 3,
          chance: 1,
          guaranteed: true,
          kind: "gold",
        },
      ],
    },
    function () {
      return 0;
    },
  );
  assert.equal(drops.length, 2);
  assert.equal(drops[1].kind, "gold");
  assert.equal(drops[1].quantity, 3);
});

test("loot is generated once; a later tick does not spawn a second corpse", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.enemies[0].health = content.player.attack;
  const kill = applyMatchLoop(state, 8, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "req-atk-once001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(kill.state.corpses.length, 1);
  const again = applyMatchLoop(kill.state, 9, contentHash, []);
  assert.equal(again.state.corpses.length, 1);
  assert.equal(again.state.loot.length, 1);
});

test("match gold persist with a wallet committer grants each share once", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 10, 10));
  state.corpses = [
    makeCorpse({
      goldAmount: 11,
      goldState: "PRIVATE_AVAILABLE",
      items: [],
    }),
  ];
  const commit = memoryCommitter(state.goldLedger);
  const claimed = applyMatchLoop(state, 12, contentHash, [
    {
      opcode: ClientOpcode.CLAIM_CORPSE_GOLD,
      raw: envelope({ corpseId: "corpse-1", requestId: "req-gold-txn01" }),
      userId: "user-alice",
    },
  ], undefined, undefined, commit);
  assert.equal(claimed.state.players["user-alice"].gold, 11);
  const replay = applyMatchLoop(claimed.state, 13, contentHash, [
    {
      opcode: ClientOpcode.CLAIM_CORPSE_GOLD,
      raw: envelope({ corpseId: "corpse-1", requestId: "req-gold-txn01" }),
      userId: "user-alice",
    },
  ], undefined, undefined, commit);
  assert.equal(replay.state.players["user-alice"].gold, 11);
});

test("drag to an occupied incompatible bag slot rejects without moving the bag item", () => {
  const corpse = makeCorpse();
  const inventory = emptyInventory();
  inventory.items = [makeInstance("sword-1", "item.training_sword", 1, 0)];
  const denied = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: inventory,
    itemsById: defs(),
    requestId: "req-pref-slot01",
    preferredSlot: 0,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "invalid_slot");
  assert.equal(inventory.items[0].itemId, "item.training_sword");
  assert.equal(corpse.items[0].state, "PRIVATE_AVAILABLE");
});
