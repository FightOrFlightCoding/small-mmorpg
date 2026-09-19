import assert from "node:assert/strict";
import test from "node:test";
import { scriptedRandom } from "../src/domain/combat_rng";
import {
  CORPSE_PRIVATE_SEC,
  claimCorpseItem,
  createCorpse,
  lootAllCorpse,
  tickCorpses,
  type CorpseLootContainer,
} from "../src/domain/corpse";
import { emptyGoldLedger } from "../src/domain/wallet";
import {
  emptyInventory,
  itemDefinitionsFromContent,
  makeInstance,
  type ItemDefinition,
  type PlayerInventory,
} from "../src/domain/inventory";
import {
  applyNeedGreedPublicBoundary,
  autoAwardSingleEligible,
  cloneLootRolls,
  openNeedGreedForCorpse,
  rollOneToHundred,
  submitLootRollChoice,
  type AwardInventoryBag,
  type LootRoll,
} from "../src/domain/loot_roll";
import { MATCH_TICK_RATE, addPlayer, createStarterZoneState, enemyDefinitionsFromContent, type MatchPlayer, type StarterZoneState } from "../src/domain/match_state";
import { applyMatchLoop } from "../src/domain/match_loop";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import { content, contentHash } from "../src/generated/content";

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
  map["item.rare_ore"] = {
    id: "item.rare_ore",
    maxStack: 5,
    rarity: "rarity.rare",
  };
  return map;
}

function defs(): { [id: string]: ItemDefinition } {
  return itemsById();
}

function envelope(extra: { [key: string]: unknown }): string {
  return JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...extra });
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

function fullBag(): PlayerInventory {
  const inventory = emptyInventory();
  for (let i = 0; i < 30; i++) {
    inventory.items.push(makeInstance("full-" + String(i), "item.uncommon_gem", 1, i));
  }
  return inventory;
}

function partyCorpse(overrides: Partial<CorpseLootContainer> = {}): CorpseLootContainer {
  const base = createCorpse({
    corpseId: "corpse-roll",
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
    newId: ids("e"),
  });
  const keys = Object.keys(overrides) as Array<keyof CorpseLootContainer>;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    (base as unknown as { [k: string]: unknown })[String(key)] = overrides[key] as unknown;
  }
  return base;
}

function openRoll(corpse: CorpseLootContainer): LootRoll {
  const rolls = openNeedGreedForCorpse({
    corpse: corpse,
    itemsById: defs(),
    newId: ids("roll"),
    openedAt: corpse.createdTick,
  });
  assert.equal(rolls.length, 1);
  return rolls[0];
}

function bags(aliceInv?: PlayerInventory, bobInv?: PlayerInventory): { [characterId: string]: AwardInventoryBag } {
  return {
    "char-alice": {
      characterId: "char-alice",
      userId: "user-alice",
      inventory: aliceInv !== undefined ? aliceInv : emptyInventory(),
    },
    "char-bob": {
      characterId: "char-bob",
      userId: "user-bob",
      inventory: bobInv !== undefined ? bobInv : emptyInventory(),
    },
  };
}

function resolveAtDeadline(
  corpse: CorpseLootContainer,
  rolls: LootRoll[],
  randomValues: number[],
  aliceInv?: PlayerInventory,
  bobInv?: PlayerInventory,
) {
  return applyNeedGreedPublicBoundary({
    corpses: [corpse],
    rolls: rolls,
    tick: corpse.privateUntilTick,
    context: {
      bags: bags(aliceInv, bobInv),
      itemsById: defs(),
      random: scriptedRandom(randomValues),
      nowMs: corpse.privateUntilTick * 100,
      namesByCharacterId: { "char-alice": "Alice", "char-bob": "Bob" },
    },
  });
}

test("rarity below Uncommon never opens a Need/Greed roll", () => {
  const corpse = createCorpse({
    corpseId: "corpse-common",
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
    loot: { items: [{ itemId: "item.stack_ore", quantity: 1, instanceId: "ore-1" }], gold: 0 },
    itemsById: defs(),
    newId: ids("c"),
  });
  assert.equal(corpse.items[0].state, "PRIVATE_AVAILABLE");
  const rolls = openNeedGreedForCorpse({ corpse: corpse, itemsById: defs(), newId: ids("r"), openedAt: 1 });
  assert.equal(rolls.length, 0);
});

test("quest items are excluded from Need/Greed", () => {
  const corpse = createCorpse({
    corpseId: "corpse-quest",
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
    loot: { items: [{ itemId: "item.slime_gel", quantity: 1, instanceId: "gel-1" }], gold: 0 },
    itemsById: defs(),
    newId: ids("q"),
  });
  assert.equal(corpse.items[0].state, "PRIVATE_AVAILABLE");
  const rolls = openNeedGreedForCorpse({ corpse: corpse, itemsById: defs(), newId: ids("r"), openedAt: 1 });
  assert.equal(rolls.length, 0);
});

test("solo-tagged drops do not use Need/Greed", () => {
  const corpse = createCorpse({
    corpseId: "corpse-solo",
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
    tagPartyId: "",
    encounterRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    deathEligibleRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    loot: { items: [{ itemId: "item.uncommon_gem", quantity: 1, instanceId: "gem-s" }], gold: 0 },
    itemsById: defs(),
    newId: ids("s"),
  });
  assert.equal(corpse.items[0].state, "PRIVATE_AVAILABLE");
  const rolls = openNeedGreedForCorpse({ corpse: corpse, itemsById: defs(), newId: ids("r"), openedAt: 1 });
  assert.equal(rolls.length, 0);
});

test("one eligible party member auto-awards without opening a roll UI", () => {
  const corpse = createCorpse({
    corpseId: "corpse-auto",
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
    deathEligibleRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    loot: { items: [{ itemId: "item.uncommon_gem", quantity: 1, instanceId: "gem-a" }], gold: 0 },
    itemsById: defs(),
    newId: ids("a"),
  });
  assert.equal(corpse.items[0].state, "PRIVATE_AVAILABLE");
  const rolls = openNeedGreedForCorpse({ corpse: corpse, itemsById: defs(), newId: ids("r"), openedAt: 1 });
  assert.equal(rolls.length, 0);
  const awarded = autoAwardSingleEligible({
    corpse: corpse,
    itemsById: defs(),
    bags: bags(),
    nowMs: 100,
  });
  assert.equal(corpse.items[0].state, "CLAIMED");
  assert.equal(awarded.inventories["char-alice"].items.length, 1);
  assert.equal(awarded.inventories["char-alice"].items[0].instanceId, "gem-a");
});

test("one eligible auto-award with a full bag becomes pending pickup", () => {
  const corpse = createCorpse({
    corpseId: "corpse-auto-full",
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
    deathEligibleRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    loot: { items: [{ itemId: "item.uncommon_gem", quantity: 1, instanceId: "gem-f" }], gold: 0 },
    itemsById: defs(),
    newId: ids("f"),
  });
  autoAwardSingleEligible({
    corpse: corpse,
    itemsById: defs(),
    bags: bags(fullBag()),
    nowMs: 100,
  });
  assert.equal(corpse.items[0].state, "AWARDED_PENDING_PICKUP");
  assert.equal(corpse.items[0].reservedToCharacterId, "char-alice");
});

test("Need wins when the winner has bag room", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  const need = submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "NEED",
    requestId: "req-need-alice1",
    tick: 11,
  });
  assert.equal(need.ok, true);
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-bob",
    choice: "GREED",
    requestId: "req-greed-bob01",
    tick: 11,
  });
  const mutation = resolveAtDeadline(corpse, [roll], [0.8]);
  assert.equal(roll.state, "AWARDED");
  assert.equal(roll.winnerCharacterId, "char-alice");
  assert.equal(roll.winningChoice, "NEED");
  assert.equal(roll.winningRoll, 81);
  assert.equal(corpse.items[0].state, "CLAIMED");
  assert.equal(mutation.inventories["char-alice"].items[0].instanceId, "gem-1");
});

test("Greed wins when the Need pool is empty", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "PASS",
    requestId: "req-pass-alice1",
    tick: 11,
  });
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-bob",
    choice: "GREED",
    requestId: "req-greed-bob02",
    tick: 11,
  });
  resolveAtDeadline(corpse, [roll], [0.4]);
  assert.equal(roll.winnerCharacterId, "char-bob");
  assert.equal(roll.winningChoice, "GREED");
  assert.equal(corpse.items[0].claimedByCharacterId, "char-bob");
});

test("Pass is a final choice and missing responses become Pass", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  const passed = submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "PASS",
    requestId: "req-pass-only01",
    tick: 11,
  });
  assert.equal(passed.ok, true);
  resolveAtDeadline(corpse, [roll], [0.9]);
  assert.equal(roll.choices["char-bob"].choice, "PASS");
  assert.equal(roll.state, "ALL_PASSED");
  assert.equal(corpse.items[0].state, "PUBLIC_AVAILABLE");
});

test("Need outranks Greed regardless of the Greed integer", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "NEED",
    requestId: "req-need-low001",
    tick: 11,
  });
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-bob",
    choice: "GREED",
    requestId: "req-greed-high01",
    tick: 11,
  });
  resolveAtDeadline(corpse, [roll], [0.01]);
  assert.equal(roll.winnerCharacterId, "char-alice");
  assert.equal(roll.winningChoice, "NEED");
  assert.equal(roll.winningRoll, 2);
});

test("tied Need rolls reroll among tied characters only", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "NEED",
    requestId: "req-need-tie-a1",
    tick: 11,
  });
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-bob",
    choice: "NEED",
    requestId: "req-need-tie-b1",
    tick: 11,
  });
  resolveAtDeadline(corpse, [roll], [0.5, 0.5, 0.9, 0.1]);
  assert.equal(roll.winnerCharacterId, "char-alice");
  assert.equal(roll.winningRoll, 91);
  assert.equal(roll.choices["char-bob"].roll, 11);
});

test("an accepted final choice cannot be changed", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "NEED",
    requestId: "req-final-need01",
    tick: 11,
  });
  const changed = submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "GREED",
    requestId: "req-final-greed1",
    tick: 12,
  });
  assert.equal(changed.ok, false);
  assert.equal(changed.code, "choice_already_submitted");
  assert.equal(roll.choices["char-alice"].choice, "NEED");
});

test("duplicate requestId returns the original result", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  const first = submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "GREED",
    requestId: "req-dup-choice01",
    tick: 11,
  });
  const replay = submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "PASS",
    requestId: "req-dup-choice01",
    tick: 12,
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.replay, true);
  assert.equal(replay.choice, first.choice);
  assert.equal(roll.choices["char-alice"].choice, "GREED");
});

test("eligible dead characters may still submit a choice", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 0, 0));
  state = addPlayer(state, playerAt("user-bob", "Bob", 0, 0));
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  state.corpses = [corpse];
  state.lootRolls = [roll];
  state.players["user-alice"].health = 0;
  const dead = applyMatchLoop(state, 12, contentHash, [
    {
      opcode: ClientOpcode.SUBMIT_LOOT_ROLL,
      raw: envelope({ rollId: roll.rollId, choice: "NEED", requestId: "req-dead-need001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(dead.state.lootRolls[0].choices["char-alice"].choice, "NEED");
});

test("a disconnected eligible character may choose after reconnecting before the deadline", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  let state = addPlayer(emptyZone(), playerAt("user-bob", "Bob", 0, 0));
  state.corpses = [corpse];
  state.lootRolls = [roll];
  state.disconnected["user-alice"] = {
    player: playerAt("user-alice", "Alice", 0, 0),
    expiresAtTick: 5000,
  };
  state = addPlayer(state, playerAt("user-alice", "Alice", 0, 0));
  const joined = applyMatchLoop(state, 14, contentHash, [
    {
      opcode: ClientOpcode.SUBMIT_LOOT_ROLL,
      raw: envelope({ rollId: roll.rollId, choice: "GREED", requestId: "req-rejoin-greed" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(joined.state.lootRolls[0].choices["char-alice"].choice, "GREED");
});

test("a submitted choice remains valid after disconnect", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "NEED",
    requestId: "req-keep-need001",
    tick: 11,
  });
  const cloned = cloneLootRolls([roll]);
  assert.equal(cloned[0].choices["char-alice"].choice, "NEED");
  resolveAtDeadline(corpse, cloned, [0.7]);
  assert.equal(cloned[0].winnerCharacterId, "char-alice");
});

test("winner without bag room gets a pending pickup", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "NEED",
    requestId: "req-full-need001",
    tick: 11,
  });
  const mutation = resolveAtDeadline(corpse, [roll], [0.6], fullBag(), emptyInventory());
  assert.equal(roll.state, "PENDING_PICKUP");
  assert.equal(corpse.items[0].state, "AWARDED_PENDING_PICKUP");
  assert.equal(corpse.items[0].reservedToCharacterId, "char-alice");
  assert.equal(mutation.notices.some(function (row) { return row.code === "inventory_full"; }), true);
});

test("pending winner can claim and a wrong claimant cannot", () => {
  const corpse = partyCorpse();
  corpse.items[0].state = "AWARDED_PENDING_PICKUP";
  corpse.items[0].reservedToCharacterId = "char-alice";
  const denied = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-bob",
    characterId: "char-bob",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-wrong-pend01",
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "not_eligible");
  const claimed = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-win-pend0001",
  });
  assert.equal(claimed.ok, true);
  assert.equal(corpse.items[0].state, "CLAIMED");
});

test("pending awards expire with the corpse and are not rerolled", () => {
  const corpse = partyCorpse();
  corpse.items[0].state = "AWARDED_PENDING_PICKUP";
  corpse.items[0].reservedToCharacterId = "char-alice";
  const ticked = tickCorpses([corpse], corpse.expiresAtTick, emptyGoldLedger(), {});
  assert.equal(ticked.corpses.length, 0);
});

test("all-pass items become public at the 60-second boundary", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  resolveAtDeadline(corpse, [roll], [0.2]);
  const ticked = tickCorpses([corpse], corpse.privateUntilTick, emptyGoldLedger(), {});
  assert.equal(ticked.corpses[0].items[0].state, "PUBLIC_AVAILABLE");
  assert.equal(ticked.corpses[0].publicTransitionDone, true);
  const stranger = claimCorpseItem({
    corpse: ticked.corpses[0],
    entryId: ticked.corpses[0].items[0].entryId,
    userId: "user-eve",
    characterId: "char-eve",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-public-pass1",
  });
  assert.equal(stranger.ok, true);
});

test("public transition cannot claim a rolling item before resolution", () => {
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  const raced = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-race-claim01",
  });
  assert.equal(raced.ok, false);
  assert.equal(raced.code, "roll_pending");
  assert.equal(roll.state, "OPEN");
  resolveAtDeadline(corpse, [roll], [0.3]);
  assert.equal(roll.state, "ALL_PASSED");
  assert.equal(corpse.items[0].state, "PUBLIC_AVAILABLE");
});

test("same-tick public claim cannot interleave before roll resolution", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 0, 0));
  state = addPlayer(state, playerAt("user-bob", "Bob", 0, 0));
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  state.corpses = [corpse];
  state.lootRolls = [roll];
  const raced = applyMatchLoop(state, corpse.privateUntilTick, contentHash, [
    {
      opcode: ClientOpcode.CLAIM_CORPSE_ITEM,
      raw: envelope({
        corpseId: corpse.corpseId,
        entryId: corpse.items[0].entryId,
        requestId: "req-race-loop001",
      }),
      userId: "user-alice",
    },
  ]);
  const results = raced.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { ok?: boolean; code?: string });
  assert.equal(results.length > 0, true);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].code, "roll_pending");
  assert.equal(raced.state.lootRolls[0].state, "ALL_PASSED");
  assert.equal(raced.state.corpses[0].items[0].state, "PUBLIC_AVAILABLE");
});

test("Loot All still skips open rolls", () => {
  const corpse = partyCorpse();
  openRoll(corpse);
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
    requestId: "req-lootall-roll",
    goldByUser: { "user-alice": 0 },
  });
  assert.equal(result.results[0].claimed, false);
  assert.equal(result.results[0].code, "roll_pending");
});

test("whole-stack awards fail closed when the entire quantity does not fit", () => {
  const corpse = createCorpse({
    corpseId: "corpse-stack",
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
    tagPartyId: "party.test",
    encounterRoster: [
      { characterId: "char-alice", userId: "user-alice" },
      { characterId: "char-bob", userId: "user-bob" },
    ],
    deathEligibleRoster: [
      { characterId: "char-alice", userId: "user-alice" },
      { characterId: "char-bob", userId: "user-bob" },
    ],
    loot: { items: [{ itemId: "item.rare_ore", quantity: 5, instanceId: "ore-5" }], gold: 0 },
    itemsById: defs(),
    newId: ids("st"),
  });
  const roll = openNeedGreedForCorpse({
    corpse: corpse,
    itemsById: defs(),
    newId: ids("rs"),
    openedAt: 10,
  })[0];
  submitLootRollChoice({
    rolls: [roll],
    rollId: roll.rollId,
    characterId: "char-alice",
    choice: "NEED",
    requestId: "req-stack-need01",
    tick: 11,
  });
  const packed = emptyInventory();
  packed.items.push(makeInstance("ore-partial", "item.rare_ore", 3, 0));
  for (let i = 1; i < 30; i++) {
    packed.items.push(makeInstance("occ-" + String(i), "item.uncommon_gem", 1, i));
  }
  resolveAtDeadline(corpse, [roll], [0.55], packed, emptyInventory());
  assert.equal(corpse.items[0].state, "AWARDED_PENDING_PICKUP");
  assert.equal(corpse.items[0].quantity, 5);
});

test("deterministic test RNG maps unit values onto 1–100", () => {
  const random = scriptedRandom([0, 0.49, 0.99]);
  assert.equal(rollOneToHundred(random), 1);
  assert.equal(rollOneToHundred(random), 50);
  assert.equal(rollOneToHundred(random), 100);
});

test("match loop rejects a client-supplied roll number", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 0, 0));
  const corpse = partyCorpse();
  const roll = openRoll(corpse);
  state.corpses = [corpse];
  state.lootRolls = [roll];
  const injected = applyMatchLoop(state, 12, contentHash, [
    {
      opcode: ClientOpcode.SUBMIT_LOOT_ROLL,
      raw: envelope({ rollId: roll.rollId, choice: "NEED", requestId: "req-inject-roll1", roll: 100 }),
      userId: "user-alice",
    },
  ]);
  assert.equal(injected.rejections.length > 0, true);
  assert.equal(injected.rejections[0].code, "stat_injection:roll");
});

test("private duration stays 60 seconds", () => {
  assert.equal(CORPSE_PRIVATE_SEC, 60);
});
