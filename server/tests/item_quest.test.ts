import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { claimCorpseItem, createCorpse, qualifiesForNeedGreed } from "../src/domain/corpse";
import { emptyEquipment } from "../src/domain/equipment";
import { applyGroundPickup, applyPlayerDrop } from "../src/domain/ground_item";
import { emptyOverflow } from "../src/domain/overflow";
import {
  addOrStackItem,
  countItem,
  emptyInventory,
  itemDefinitionsFromContent,
  makeInstance,
  occupiedSlots,
} from "../src/domain/inventory";
import { openNeedGreedForCorpse } from "../src/domain/loot_roll";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  MATCH_TICK_RATE,
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import { dialogueDefinitionsFromContent } from "../src/domain/dialogue";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import {
  QUEST_STATUS_ACCEPTED,
  countQuestPossession,
  createAcceptedProgress,
  emptyQuestLog,
  questDefinitionsFromContent,
  syncAcquireObjectives,
} from "../src/domain/quest";
import { applyQuestTurnIn } from "../src/domain/quest_reward";
import {
  acceptTradeInvite,
  acceptTradeRevision,
  createTradeInvite,
  offeredQuantitiesForCharacter,
  setTradeOffer,
  type TradeActor,
} from "../src/domain/trade";
import { openNpcSession, turnInMessage } from "./npc_session";

const defs = itemDefinitionsFromContent(content.items);
const quests = questDefinitionsFromContent(content.quests);

function ids(prefix: string): () => string {
  let n = 0;
  return function () {
    n += 1;
    return prefix + "-" + String(n);
  };
}

function bagWith(itemId: string, instanceId: string, quantity = 1) {
  return addOrStackItem(emptyInventory(30), itemId, quantity, instanceId, defs[itemId]);
}

function gelLog() {
  const log = emptyQuestLog();
  log.quests["quest.slime_problem"] = createAcceptedProgress(quests["quest.slime_problem"]);
  return log;
}

function actor(input: { userId: string; name: string; inventory: ReturnType<typeof emptyInventory>; x?: number }): TradeActor {
  return {
    userId: input.userId,
    characterId: "char-" + input.userId,
    displayName: input.name,
    x: input.x !== undefined ? input.x : 0,
    y: 0,
    health: 100,
    gold: 20,
    inventory: input.inventory,
    equipment: emptyEquipment(),
    online: true,
  };
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
    quests,
    defs,
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      dialoguesById: dialogueDefinitionsFromContent(content.dialogues),
    },
  );
}

function playerAt(userId: string, name: string, x: number, y: number, inventory?: ReturnType<typeof emptyInventory>): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: inventory !== undefined ? inventory : emptyInventory(30),
    gold: 0,
  };
}

test("possession counts bag stacks minus trade offers and ignores overflow", () => {
  const inventory = bagWith("item.slime_gel", "gel-1", 3);
  const overflow = emptyOverflow();
  overflow.items.push(makeInstance("gel-ov", "item.slime_gel", 5, -1));
  assert.equal(countQuestPossession(inventory, "item.slime_gel"), 3);
  assert.equal(countQuestPossession(inventory, "item.slime_gel", { offeredQuantities: { "gel-1": 1 } }), 2);
  assert.equal(countQuestPossession(inventory, "item.slime_gel", { offeredQuantities: { "gel-1": 3 } }), 0);
  assert.equal(overflow.items[0].quantity, 5);
  assert.equal(countQuestPossession(inventory, "item.slime_gel"), 3);
});

test("equipment counts only when the objective opts in", () => {
  const inventory = emptyInventory(30);
  const equipped = [makeInstance("sword-eq", "item.training_sword", 1, -1)];
  assert.equal(countQuestPossession(inventory, "item.training_sword", { equipment: equipped }, false), 0);
  assert.equal(countQuestPossession(inventory, "item.training_sword", { equipment: equipped }, true), 1);
});

test("quest item never qualifies for Need/Greed and stays first-come on the corpse", () => {
  assert.equal(qualifiesForNeedGreed(defs["item.slime_gel"], 2), false);
  const corpse = createCorpse({
    corpseId: "corpse-gel",
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
    itemsById: defs,
    newId: ids("c"),
  });
  assert.equal(corpse.items[0].state, "PRIVATE_AVAILABLE");
  const rolls = openNeedGreedForCorpse({ corpse: corpse, itemsById: defs, newId: ids("r"), openedAt: 1 });
  assert.equal(rolls.length, 0);
  const bob = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-bob",
    characterId: "char-bob",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(30),
    itemsById: defs,
    requestId: "req-gel-first",
  });
  assert.equal(bob.ok, true);
  assert.equal(corpse.items[0].state, "CLAIMED");
  const alice = claimCorpseItem({
    corpse: corpse,
    entryId: corpse.items[0].entryId,
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 0,
    playerY: 0,
    pickupRange: 40,
    inventory: emptyInventory(30),
    itemsById: defs,
    requestId: "req-gel-second",
  });
  assert.equal(alice.ok, false);
});

test("quest items may be traded and possession moves with commit", () => {
  const aliceInv = bagWith("item.slime_gel", "gel-trade", 1);
  const bobInv = emptyInventory(30);
  const alice = actor({ userId: "alice", name: "Alice", inventory: aliceInv });
  const bob = actor({ userId: "bob", name: "Bob", inventory: bobInv, x: 8 });
  const invited = createTradeInvite({
    tradeId: "trade-gel",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1000,
    matchId: "m1",
    requestId: "req-inv",
    trades: {},
  });
  assert.equal(invited.ok, true);
  const accepted = acceptTradeInvite({
    trade: invited.trade,
    actor: bob,
    other: alice,
    tick: 2,
    nowMs: 1100,
    requestId: "req-acc",
  });
  assert.equal(accepted.ok, true);
  const offered = setTradeOffer({
    trade: accepted.trade,
    actor: { ...alice, inventory: aliceInv },
    other: bob,
    instanceId: "gel-trade",
    quantity: 1,
    itemsById: defs,
    requestId: "req-off",
  });
  assert.equal(offered.ok, true);
  alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : aliceInv;
  const offeredQty = offeredQuantitiesForCharacter(offered.trade, alice.characterId);
  const whileOffered = syncAcquireObjectives(gelLog(), alice.inventory, {
    offeredQuantities: offeredQty,
  });
  assert.equal(whileOffered.log.quests["quest.slime_problem"].objectives[0].current, 0);
  const acceptA = acceptTradeRevision({
    trade: offered.trade,
    actor: alice,
    other: bob,
    revision: offered.trade.revision,
    itemsById: defs,
    makeId: ids("ta"),
    requestId: "req-acc-a",
  });
  assert.equal(acceptA.ok, true);
  const acceptB = acceptTradeRevision({
    trade: acceptA.trade,
    actor: bob,
    other: alice,
    revision: acceptA.trade.revision,
    itemsById: defs,
    makeId: ids("tb"),
    requestId: "req-acc-b",
  });
  assert.equal(acceptB.ok, true);
  assert.equal(acceptB.shouldCommit, true);
  assert.ok(acceptB.prepared !== undefined);
  if (acceptB.prepared === undefined) {
    return;
  }
  assert.equal(countItem(acceptB.prepared.inventoryA, "item.slime_gel"), 0);
  assert.equal(countItem(acceptB.prepared.inventoryB, "item.slime_gel"), 1);
  const afterA = syncAcquireObjectives(gelLog(), acceptB.prepared.inventoryA);
  const afterB = syncAcquireObjectives(gelLog(), acceptB.prepared.inventoryB);
  assert.equal(afterA.log.quests["quest.slime_problem"].objectives[0].current, 0);
  assert.equal(afterB.log.quests["quest.slime_problem"].objectives[0].current, 1);
});

test("dropping a quest item reduces possession and picking it up increases it", () => {
  const inventory = bagWith("item.slime_gel", "gel-drop", 1);
  const before = syncAcquireObjectives(gelLog(), inventory);
  assert.equal(before.log.quests["quest.slime_problem"].objectives[0].current, 1);
  const dropped = applyPlayerDrop({
    playerHealth: 100,
    characterId: "char-alice",
    playerX: 40,
    playerY: 40,
    inventory: inventory,
    instanceId: "gel-drop",
    quantity: 1,
    requestId: "req-drop-gel",
    groundItems: [],
    collisions: [],
    walkableBounds: { x: 0, y: 0, width: 400, height: 400 },
    itemsById: defs,
    tick: 1,
    tickRate: MATCH_TICK_RATE,
    nowMs: 100,
    newIds: ids("drop"),
  });
  assert.equal(dropped.ok, true);
  assert.ok(dropped.spawned !== null);
  const afterDrop = syncAcquireObjectives(before.log, dropped.inventory);
  assert.equal(afterDrop.log.quests["quest.slime_problem"].status, QUEST_STATUS_ACCEPTED);
  assert.equal(afterDrop.log.quests["quest.slime_problem"].objectives[0].current, 0);
  const picked = applyGroundPickup({
    playerHealth: 100,
    characterId: "char-alice",
    playerX: 40,
    playerY: 40,
    inventory: dropped.inventory,
    groundEntityId: dropped.spawned !== null ? dropped.spawned.groundEntityId : "",
    requestId: "req-pick-gel",
    groundItems: dropped.groundItems,
    pickupRange: 40,
    itemsById: defs,
    nowMs: 200,
    newIds: ids("pick"),
  });
  assert.equal(picked.ok, true);
  const afterPick = syncAcquireObjectives(afterDrop.log, picked.inventory);
  assert.equal(afterPick.log.quests["quest.slime_problem"].objectives[0].current, 1);
});

test("turn-in consumes required items atomically and rejects a full bag without rewards", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  let full = emptyInventory(30);
  full = addOrStackItem(full, "item.slime_gel", 5, "gel-turn", defs["item.slime_gel"]);
  for (let i = 1; i < 30; i++) {
    full = addOrStackItem(full, "item.training_sword", 1, "sword-" + String(i), defs["item.training_sword"]);
  }
  assert.equal(occupiedSlots(full), 30);
  const player = playerAt("user-alice", "Alice", elder.x, elder.y, full);
  player.questLog = gelLog();
  player.questLog.quests["quest.slime_problem"].objectives[0].current = 1;
  let state = addPlayer(emptyZone(), player);
  const opened = openNpcSession(state, "user-alice", "npc.elder", 1, "req-full-int");
  const result = applyMatchLoop(opened.state, 2, contentHash, [
    turnInMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-full-turn"),
  ]);
  const actions = result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { ok: boolean; code: string; message?: string });
  assert.equal(actions[0].ok, false);
  assert.equal(actions[0].code, "inventory_full");
  assert.equal(typeof actions[0].message, "string");
  assert.match(actions[0].message !== undefined ? actions[0].message : "", /Need .+ free bag slot/);
  assert.equal(result.state.players["user-alice"].questLog.quests["quest.slime_problem"].status, "accepted");
  assert.equal(countItem(result.state.players["user-alice"].inventory!, "item.slime_gel"), 5);
  assert.equal(countItem(result.state.players["user-alice"].inventory!, "item.iron_sword"), 0);
  assert.equal(result.state.players["user-alice"].gold, 0);
});

test("applyQuestTurnIn consumes gel then grants the sword when a slot is freed", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const inventory = bagWith("item.slime_gel", "gel-ok", 1);
  const npcs = [
    { id: "npc.elder", npcId: "npc.elder", x: elder.x, y: elder.y, interactionRange: 48 },
  ];
  const log = gelLog();
  log.quests["quest.slime_problem"].objectives[0].current = 1;
  const outcome = applyQuestTurnIn({
    playerHealth: 100,
    playerX: elder.x,
    playerY: elder.y,
    questLog: log,
    inventory: inventory,
    gold: 0,
    questId: "quest.slime_problem",
    npcId: "npc.elder",
    requestId: "req-ok-turn",
    npcs: npcs,
    interactionRange: 64,
    questsById: quests,
    itemsById: defs,
    newId: ids("turn"),
    tick: 1,
  });
  assert.equal(outcome.ok, true);
  assert.equal(countItem(outcome.inventory, "item.slime_gel"), 0);
  assert.equal(countItem(outcome.inventory, "item.iron_sword"), 1);
  assert.equal(outcome.gold, 25);
  assert.equal(outcome.log.quests["quest.slime_problem"].status, "completed");
});

test("link-dead players cannot run item actions", () => {
  const spawn = content.zones["zone.starter"].playerSpawn;
  const actor = playerAt("user-alice", "Alice", spawn.x, spawn.y, bagWith("item.test_pebble", "peb-1", 1));
  actor.linkDead = true;
  const state = addPlayer(emptyZone(), actor);
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.DESTROY_ITEM,
      raw: JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        instanceId: "peb-1",
        requestId: "req-dead-destroy",
      }),
      userId: "user-alice",
    },
  ]);
  const actions = result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { code: string });
  assert.equal(actions[0].code, "link_dead");
  assert.equal(countItem(result.state.players["user-alice"].inventory!, "item.test_pebble"), 1);
});
