import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { emptyEquipment, type PlayerEquipment } from "../src/domain/equipment";
import {
  applyGroundPickup,
  applyPlayerDrop,
  expireGroundItems,
  GROUND_DROP_LIMIT_CODE,
  GROUND_ITEM_NO_LONGER_AVAILABLE,
  GROUND_ITEM_TTL_SEC,
  GROUND_PUBLIC_AVAILABLE,
  PLAYER_GROUND_DROP_LIMIT,
  placeGroundDrop,
  publicGroundItems,
  rarityRequiresDropConfirm,
  type GroundItem,
  type PlayerDropInput,
} from "../src/domain/ground_item";
import { createDropIntent } from "../src/domain/item_intent";
import { JOURNAL_COMMITTING, emptyJournalRecord } from "../src/domain/item_journal";
import {
  emptyInventory,
  itemDefinitionsFromContent,
  makeInstance,
  setItemLock,
  type ItemDefinition,
  type PlayerInventory,
} from "../src/domain/inventory";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  MATCH_TICK_RATE,
  addPlayer,
  buildFullState,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import {
  QUEST_STATUS_ACCEPTED,
  emptyQuestLog,
  questDefinitionsFromContent,
  syncAcquireObjectives,
  type QuestLog,
} from "../src/domain/quest";

function ids(prefix = "id"): () => string {
  let n = 0;
  return function () {
    n += 1;
    return prefix + "-" + String(n);
  };
}

function itemsById(): { [id: string]: ItemDefinition } {
  const map = itemDefinitionsFromContent(content.items);
  map["item.ore"] = { id: "item.ore", maxStack: 99, equippable: false, droppable: true, rarity: "rarity.common" };
  map["item.pebble"] = { id: "item.pebble", maxStack: 1, equippable: false, droppable: true, rarity: "rarity.common" };
  map["item.undroppable"] = {
    id: "item.undroppable",
    maxStack: 1,
    droppable: false,
    rarity: "rarity.common",
  };
  return map;
}

function bagWith(id: string, itemId: string, qty: number, slot = 0): PlayerInventory {
  const inventory = emptyInventory(30);
  inventory.items.push(makeInstance(id, itemId, qty, slot));
  inventory.revision = 3;
  return inventory;
}

function bounds() {
  return { x: 0, y: 0, width: 400, height: 400 };
}

function dropInput(overrides: Partial<PlayerDropInput> & { inventory: PlayerInventory }): PlayerDropInput {
  return {
    playerHealth: overrides.playerHealth !== undefined ? overrides.playerHealth : 20,
    linkDead: overrides.linkDead,
    transferring: overrides.transferring,
    characterId: overrides.characterId !== undefined ? overrides.characterId : "char-a",
    playerX: overrides.playerX !== undefined ? overrides.playerX : 100,
    playerY: overrides.playerY !== undefined ? overrides.playerY : 100,
    facingX: overrides.facingX !== undefined ? overrides.facingX : 0,
    facingY: overrides.facingY !== undefined ? overrides.facingY : 1,
    hintDx: overrides.hintDx,
    hintDy: overrides.hintDy,
    inventory: overrides.inventory,
    overflow: overrides.overflow,
    equipment: overrides.equipment,
    instanceId: overrides.instanceId !== undefined ? overrides.instanceId : "ore-1",
    quantity: overrides.quantity,
    requestId: overrides.requestId !== undefined ? overrides.requestId : "req-drop-ok0001",
    expectedRevision: overrides.expectedRevision,
    groundItems: overrides.groundItems !== undefined ? overrides.groundItems : [],
    collisions: overrides.collisions !== undefined ? overrides.collisions : [],
    walkableBounds: overrides.walkableBounds !== undefined ? overrides.walkableBounds : bounds(),
    itemsById: overrides.itemsById !== undefined ? overrides.itemsById : itemsById(),
    tick: overrides.tick !== undefined ? overrides.tick : 10,
    tickRate: overrides.tickRate !== undefined ? overrides.tickRate : MATCH_TICK_RATE,
    nowMs: overrides.nowMs !== undefined ? overrides.nowMs : 1000,
    newIds: overrides.newIds !== undefined ? overrides.newIds : ids("g"),
    dropLimit: overrides.dropLimit,
    failBeforeEntity: overrides.failBeforeEntity,
  };
}

function pickupBase(
  ground: GroundItem,
  inventory: PlayerInventory,
  extra: Partial<Parameters<typeof applyGroundPickup>[0]> = {},
) {
  return applyGroundPickup({
    playerHealth: extra.playerHealth !== undefined ? extra.playerHealth : 20,
    linkDead: extra.linkDead,
    transferring: extra.transferring,
    characterId: extra.characterId !== undefined ? extra.characterId : "char-b",
    playerX: extra.playerX !== undefined ? extra.playerX : ground.x,
    playerY: extra.playerY !== undefined ? extra.playerY : ground.y,
    inventory: inventory,
    groundEntityId: ground.groundEntityId,
    requestId: extra.requestId !== undefined ? extra.requestId : "req-pick-ok0001",
    expectedRevision: extra.expectedRevision,
    groundItems: extra.groundItems !== undefined ? extra.groundItems : [ground],
    pickupRange: extra.pickupRange !== undefined ? extra.pickupRange : 40,
    itemsById: itemsById(),
    tick: 20,
    nowMs: 2000,
    newIds: ids("p"),
  });
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
    itemsById(),
  );
}

function playerAt(userId: string, name: string, x: number, y: number, inventory?: PlayerInventory): MatchPlayer {
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
  };
}

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function gelQuestLog(current: number): QuestLog {
  const log = emptyQuestLog();
  log.quests["quest.slime_problem"] = {
    questId: "quest.slime_problem",
    status: QUEST_STATUS_ACCEPTED,
    objectives: [
      {
        type: "acquire_item",
        itemId: "item.slime_gel",
        current: current,
        required: 1,
      },
    ],
  };
  return log;
}

test("anti-spam ground drop limit is the documented noncanonical default", () => {
  assert.equal(PLAYER_GROUND_DROP_LIMIT, 20);
  assert.equal(GROUND_ITEM_TTL_SEC, 300);
});

test("full-stack drop preserves instance id and is immediately public", () => {
  const first = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 6),
      instanceId: "ore-1",
      requestId: "req-drop-full01",
    }),
  );
  assert.equal(first.ok, true);
  assert.equal(first.inventory.items.length, 0);
  assert.equal(first.spawned !== null, true);
  if (first.spawned === null) {
    return;
  }
  assert.equal(first.spawned.itemInstanceId, "ore-1");
  assert.equal(first.spawned.quantity, 6);
  assert.equal(first.spawned.state, GROUND_PUBLIC_AVAILABLE);
  assert.equal(first.spawned.createdByCharacterId, "char-a");
  const published = publicGroundItems(first.groundItems);
  assert.equal(published.length, 1);
  assert.equal(published[0].itemInstanceId, undefined);
  assert.equal(published[0].createdByCharacterId, undefined);
  assert.equal(published[0].state, GROUND_PUBLIC_AVAILABLE);
});

test("partial-stack drop mints a new instance and leaves the remainder", () => {
  const first = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 6),
      instanceId: "ore-1",
      quantity: 2,
      requestId: "req-drop-part01",
      newIds: ids("part"),
    }),
  );
  assert.equal(first.ok, true);
  assert.equal(first.inventory.items.length, 1);
  assert.equal(first.inventory.items[0].quantity, 4);
  assert.equal(first.inventory.items[0].instanceId, "ore-1");
  assert.equal(first.spawned !== null, true);
  if (first.spawned === null) {
    return;
  }
  assert.equal(first.spawned.quantity, 2);
  assert.notEqual(first.spawned.itemInstanceId, "ore-1");
});

test("quantity outside 1..stack is rejected", () => {
  const zero = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 6),
      quantity: 0,
      requestId: "req-drop-qty000",
    }),
  );
  assert.equal(zero.ok, false);
  assert.equal(zero.code, "invalid_quantity");
  const over = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 6),
      quantity: 7,
      requestId: "req-drop-qty007",
    }),
  );
  assert.equal(over.ok, false);
  assert.equal(over.code, "invalid_quantity");
  assert.equal(over.inventory.items[0].quantity, 6);
});

test("equipped items are rejected until unequipped into the bag", () => {
  const equipment: PlayerEquipment = emptyEquipment();
  const sword = makeInstance("sword-1", "item.training_sword", 1, -1);
  equipment.slots.main_hand = "sword-1";
  equipment.items = [sword];
  const result = applyPlayerDrop(
    dropInput({
      inventory: emptyInventory(30),
      equipment: equipment,
      instanceId: "sword-1",
      requestId: "req-drop-equip1",
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "item_equipped");
  assert.equal(result.groundItems.length, 0);
});

test("locked items are rejected", () => {
  const locked = setItemLock(bagWith("ore-1", "item.ore", 4), "ore-1", "trade", "lock-1");
  const result = applyPlayerDrop(
    dropInput({
      inventory: locked,
      instanceId: "ore-1",
      requestId: "req-drop-lock01",
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "item_locked");
  assert.equal(result.inventory.items[0].quantity, 4);
});

test("dead, link-dead, and transferring characters cannot drop", () => {
  const dead = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 1),
      playerHealth: 0,
      requestId: "req-drop-dead01",
    }),
  );
  assert.equal(dead.ok, false);
  assert.equal(dead.code, "player_dead");
  const link = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 1),
      linkDead: true,
      requestId: "req-drop-link01",
    }),
  );
  assert.equal(link.ok, false);
  assert.equal(link.code, "link_dead");
  const transfer = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 1),
      transferring: true,
      requestId: "req-drop-xfer01",
    }),
  );
  assert.equal(transfer.ok, false);
  assert.equal(transfer.code, "already_transferring");
});

test("quest items may be dropped and possession progress decreases without failing the quest", () => {
  const inventory = bagWith("gel-1", "item.slime_gel", 1);
  const before = syncAcquireObjectives(gelQuestLog(1), inventory);
  assert.equal(before.log.quests["quest.slime_problem"].objectives[0].current, 1);
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: inventory,
      instanceId: "gel-1",
      requestId: "req-drop-quest1",
    }),
  );
  assert.equal(dropped.ok, true);
  const after = syncAcquireObjectives(before.log, dropped.inventory);
  assert.equal(after.changed, true);
  assert.equal(after.log.quests["quest.slime_problem"].status, QUEST_STATUS_ACCEPTED);
  assert.equal(after.log.quests["quest.slime_problem"].objectives[0].current, 0);
});

test("uncommon or higher rarities require drop confirmation copy", () => {
  assert.equal(rarityRequiresDropConfirm("rarity.common"), false);
  assert.equal(rarityRequiresDropConfirm("rarity.poor"), false);
  assert.equal(rarityRequiresDropConfirm("rarity.uncommon"), true);
  assert.equal(rarityRequiresDropConfirm("rarity.rare"), true);
  assert.equal(rarityRequiresDropConfirm("rarity.epic"), true);
  const sword = applyPlayerDrop(
    dropInput({
      inventory: bagWith("iron-1", "item.iron_sword", 1),
      instanceId: "iron-1",
      requestId: "req-drop-rare01",
    }),
  );
  assert.equal(sword.ok, true);
  assert.equal(sword.spawned !== null && sword.spawned.rarity, "rarity.uncommon");
});

test("placement stays inside walkable bounds", () => {
  const tight = { x: 0, y: 0, width: 50, height: 50 };
  const pose = placeGroundDrop({
    x: 40,
    y: 40,
    hintDx: 1,
    hintDy: 0,
    collisions: [],
    walkableBounds: tight,
  });
  assert.equal(pose.x >= 4 && pose.x <= 46, true);
  assert.equal(pose.y >= 4 && pose.y <= 46, true);
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 1),
      playerX: 40,
      playerY: 40,
      hintDx: 1,
      hintDy: 0,
      walkableBounds: tight,
      requestId: "req-drop-bound1",
    }),
  );
  assert.equal(dropped.ok, true);
  assert.equal(dropped.spawned !== null, true);
  if (dropped.spawned === null) {
    return;
  }
  assert.equal(dropped.spawned.x >= 4 && dropped.spawned.x <= 46, true);
  assert.equal(dropped.spawned.y >= 4 && dropped.spawned.y <= 46, true);
});

test("placement does not cross walls", () => {
  const wall = { x: 90, y: 120, width: 80, height: 20 };
  const pose = placeGroundDrop({
    x: 100,
    y: 100,
    hintDx: 0,
    hintDy: 1,
    collisions: [wall],
    walkableBounds: bounds(),
  });
  assert.equal(pose.y < 120, true);
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 1),
      hintDx: 0,
      hintDy: 1,
      collisions: [wall],
      requestId: "req-drop-wall01",
    }),
  );
  assert.equal(dropped.ok, true);
  if (dropped.spawned === null) {
    assert.equal(dropped.spawned !== null, true);
    return;
  }
  assert.equal(dropped.spawned.y < 120, true);
});

test("active-drop limit rejects the new drop and keeps older items", () => {
  const existing: GroundItem[] = [];
  for (let i = 0; i < PLAYER_GROUND_DROP_LIMIT; i++) {
    existing.push({
      groundEntityId: "old-" + String(i),
      itemInstanceId: "old-inst-" + String(i),
      itemId: "item.ore",
      quantity: 1,
      x: 10,
      y: 10,
      createdByCharacterId: "char-a",
      createdAtTick: 1,
      expiresAtTick: 9999,
      state: GROUND_PUBLIC_AVAILABLE,
      revision: 1,
      rarity: "rarity.common",
    });
  }
  const result = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 1),
      groundItems: existing,
      requestId: "req-drop-limit1",
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, GROUND_DROP_LIMIT_CODE);
  assert.equal(result.groundItems.length, PLAYER_GROUND_DROP_LIMIT);
  assert.equal(result.inventory.items[0].quantity, 1);
  assert.equal(result.groundItems[0].groundEntityId, "old-0");
});

test("public pickup grants the whole stack to another character", () => {
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 6),
      requestId: "req-drop-pub001",
    }),
  );
  assert.equal(dropped.spawned !== null, true);
  if (dropped.spawned === null) {
    return;
  }
  const taken = pickupBase(dropped.spawned, emptyInventory(30), { characterId: "char-b" });
  assert.equal(taken.ok, true);
  assert.equal(taken.inventory.items[0].quantity, 6);
  assert.equal(taken.groundItems.length, 0);
  assert.equal(taken.removed !== null, true);
});

test("concurrent pickup lets exactly one claimant succeed", () => {
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 2),
      requestId: "req-drop-race01",
    }),
  );
  if (dropped.spawned === null) {
    assert.equal(dropped.spawned !== null, true);
    return;
  }
  const first = pickupBase(dropped.spawned, emptyInventory(30), {
    characterId: "char-b",
    requestId: "req-pick-race-a",
  });
  assert.equal(first.ok, true);
  const second = pickupBase(dropped.spawned, emptyInventory(30), {
    characterId: "char-c",
    requestId: "req-pick-race-b",
    groundItems: first.groundItems,
  });
  assert.equal(second.ok, false);
  assert.equal(second.code, GROUND_ITEM_NO_LONGER_AVAILABLE);
  assert.equal(second.inventory.items.length, 0);
});

test("full bag rejects pickup and leaves the ground stack", () => {
  const packed = emptyInventory(30);
  for (let i = 0; i < 30; i++) {
    packed.items.push(makeInstance("peb-" + String(i), "item.pebble", 1, i));
  }
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 1),
      requestId: "req-drop-fullbg",
    }),
  );
  if (dropped.spawned === null) {
    assert.equal(dropped.spawned !== null, true);
    return;
  }
  const taken = pickupBase(dropped.spawned, packed, { requestId: "req-pick-fullbg" });
  assert.equal(taken.ok, false);
  assert.equal(taken.code, "inventory_full");
  assert.equal(taken.groundItems.length, 1);
  assert.equal(taken.groundItems[0].state, GROUND_PUBLIC_AVAILABLE);
});

test("partial stack capacity is all-or-nothing", () => {
  const packed = emptyInventory(30);
  packed.items.push(makeInstance("ore-bag", "item.ore", 97, 0));
  for (let i = 1; i < 30; i++) {
    packed.items.push(makeInstance("peb-" + String(i), "item.pebble", 1, i));
  }
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 5),
      requestId: "req-drop-partial",
    }),
  );
  if (dropped.spawned === null) {
    assert.equal(dropped.spawned !== null, true);
    return;
  }
  const taken = pickupBase(dropped.spawned, packed, { requestId: "req-pick-partial" });
  assert.equal(taken.ok, false);
  assert.equal(taken.code, "inventory_full");
  assert.equal(taken.groundItems[0].quantity, 5);
  assert.equal(packed.items[0].quantity, 97);
});

test("duplicate pickup requestId replays without a second grant", () => {
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 3),
      requestId: "req-drop-dup001",
    }),
  );
  if (dropped.spawned === null) {
    assert.equal(dropped.spawned !== null, true);
    return;
  }
  const first = pickupBase(dropped.spawned, emptyInventory(30), { requestId: "req-pick-dup001" });
  assert.equal(first.ok, true);
  const second = pickupBase(dropped.spawned, first.inventory, {
    requestId: "req-pick-dup001",
    groundItems: first.groundItems,
  });
  assert.equal(second.ok, true);
  assert.equal(second.replay, true);
  assert.equal(second.persist, false);
  assert.equal(second.inventory.items[0].quantity, 3);
});

test("interrupted drop compensates into the bag and does not spawn", () => {
  const result = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 6),
      requestId: "req-drop-fail01",
      failBeforeEntity: true,
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "destination_unavailable");
  assert.equal(result.spawned, null);
  assert.equal(result.groundItems.length, 0);
  assert.equal(result.inventory.items.some(function (item) { return item.itemId === "item.ore" && item.quantity === 6; }), true);
});

test("COMMITTING drop without a ground entity restores the bag", () => {
  const inventory = emptyInventory(30);
  inventory.revision = 4;
  const snapshot = makeInstance("ore-1", "item.ore", 6, 0);
  const record = emptyJournalRecord("txn-int-1", "req-drop-int001", "item_drop", ["char-a"], 50);
  record.state = JOURNAL_COMMITTING;
  inventory.journalByRequestId = { "req-drop-int001": record };
  inventory.intentsByRequestId = {
    "req-drop-int001": createDropIntent({
      intentId: "intent-int-1",
      requestId: "req-drop-int001",
      characterId: "char-a",
      item: snapshot,
      quantity: 6,
      nowMs: 50,
    }),
  };
  const result = applyPlayerDrop(
    dropInput({
      inventory: inventory,
      instanceId: "ore-1",
      requestId: "req-drop-int001",
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "destination_unavailable");
  assert.equal(result.groundItems.length, 0);
  assert.equal(result.inventory.items.some(function (item) { return item.itemId === "item.ore"; }), true);
});

test("committed drop replay does not spawn a second entity", () => {
  const first = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 6),
      requestId: "req-drop-ok0001",
      newIds: ids("once"),
    }),
  );
  assert.equal(first.ok, true);
  assert.equal(first.groundItems.length, 1);
  const second = applyPlayerDrop(
    dropInput({
      inventory: first.inventory,
      instanceId: "ore-1",
      requestId: "req-drop-ok0001",
      groundItems: first.groundItems,
      newIds: ids("twice"),
    }),
  );
  assert.equal(second.ok, true);
  assert.equal(second.replay, true);
  assert.equal(second.groundItems.length, 1);
  assert.equal(second.inventory.items.length, 0);
});

test("ground items expire at five minutes and are not kept", () => {
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 1),
      requestId: "req-drop-exp001",
      tick: 10,
      tickRate: MATCH_TICK_RATE,
    }),
  );
  assert.equal(dropped.spawned !== null, true);
  if (dropped.spawned === null) {
    return;
  }
  assert.equal(dropped.spawned.expiresAtTick, 10 + GROUND_ITEM_TTL_SEC * MATCH_TICK_RATE);
  const live = expireGroundItems(dropped.groundItems, 10 + GROUND_ITEM_TTL_SEC * MATCH_TICK_RATE - 1);
  assert.equal(live.items.length, 1);
  const gone = expireGroundItems(dropped.groundItems, 10 + GROUND_ITEM_TTL_SEC * MATCH_TICK_RATE);
  assert.equal(gone.items.length, 0);
  assert.equal(gone.removed.length, 1);
  assert.equal(gone.removed[0].state, "EXPIRED");
});

test("match restart does not reconstruct player ground items", () => {
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: bagWith("ore-1", "item.ore", 1),
      requestId: "req-drop-rst001",
    }),
  );
  assert.equal(dropped.ok, true);
  const persisted = dropped.inventory;
  const restarted = emptyZone();
  restarted.players["user-alice"] = playerAt("user-alice", "Alice", 240, 384, persisted);
  restarted.groundItems = [];
  const payload = JSON.parse(buildFullState(restarted, 1, "user-alice")) as {
    groundItems: Array<{ [key: string]: unknown }>;
    inventory: { items: Array<{ itemId: string }> };
  };
  assert.equal(payload.groundItems.length, 0);
  assert.equal(payload.inventory.items.some(function (item) { return item.itemId === "item.ore"; }), false);
});

test("picking up a quest item advances the picker's matching quest", () => {
  const dropped = applyPlayerDrop(
    dropInput({
      inventory: bagWith("gel-1", "item.slime_gel", 1),
      instanceId: "gel-1",
      requestId: "req-drop-qpick1",
    }),
  );
  if (dropped.spawned === null) {
    assert.equal(dropped.spawned !== null, true);
    return;
  }
  const taken = pickupBase(dropped.spawned, emptyInventory(30), {
    characterId: "char-b",
    requestId: "req-pick-qpick1",
  });
  assert.equal(taken.ok, true);
  const synced = syncAcquireObjectives(gelQuestLog(0), taken.inventory);
  assert.equal(synced.log.quests["quest.slime_problem"].objectives[0].current, 1);
  assert.equal(synced.log.quests["quest.slime_problem"].status, QUEST_STATUS_ACCEPTED);
});

test("FULL_STATE omits ground instance ids and creator identity", () => {
  const zone = emptyZone();
  const alice = playerAt("user-alice", "Alice", 240, 384, bagWith("ore-1", "item.ore", 2));
  let state = addPlayer(zone, alice);
  const result = applyMatchLoop(state, 5, contentHash, [
    {
      opcode: ClientOpcode.DROP_ITEM,
      raw: envelope({ instanceId: "ore-1", requestId: "req-drop-fs0001", quantity: 2 }),
      userId: "user-alice",
    },
  ], ids("fs"));
  state = result.state;
  const payload = JSON.parse(buildFullState(state, 5, "user-alice")) as {
    groundItems: Array<{ [key: string]: unknown }>;
  };
  assert.equal(payload.groundItems.length, 1);
  assert.equal(payload.groundItems[0].itemInstanceId, undefined);
  assert.equal(payload.groundItems[0].createdByCharacterId, undefined);
  assert.equal(payload.groundItems[0].itemId, "item.ore");
});

test("match loop expires ground items and broadcasts removal", () => {
  const zone = emptyZone();
  const alice = playerAt("user-alice", "Alice", 240, 384, bagWith("ore-1", "item.ore", 1));
  let state = addPlayer(zone, alice);
  const dropped = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.DROP_ITEM,
      raw: envelope({ instanceId: "ore-1", requestId: "req-drop-exp-ml" }),
      userId: "user-alice",
    },
  ], ids("ml"));
  state = dropped.state;
  assert.equal((state.groundItems !== undefined ? state.groundItems : []).length, 1);
  const expireTick = 1 + GROUND_ITEM_TTL_SEC * MATCH_TICK_RATE;
  const expired = applyMatchLoop(state, expireTick, contentHash, [], ids("ex"));
  assert.equal((expired.state.groundItems !== undefined ? expired.state.groundItems : []).length, 0);
  const removed = expired.outbound.filter(function (item) { return item.opcode === ServerOpcode.GROUND_ITEM_REMOVED; });
  assert.equal(removed.length >= 1, true);
  const body = JSON.parse(removed[0].body) as { groundEntityId: string; reason: string };
  assert.equal(body.reason, "expired");
});

test("match loop concurrent pickup is single-winner", () => {
  const zone = emptyZone();
  const aliceInv = bagWith("ore-1", "item.ore", 4);
  let state = addPlayer(zone, playerAt("user-alice", "Alice", 240, 384, aliceInv));
  state = addPlayer(state, playerAt("user-bob", "Bob", 240, 384, emptyInventory(30)));
  const dropped = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.DROP_ITEM,
      raw: envelope({ instanceId: "ore-1", requestId: "req-drop-race-ml" }),
      userId: "user-alice",
    },
  ], ids("race"));
  state = dropped.state;
  const entity = (state.groundItems !== undefined ? state.groundItems : [])[0];
  assert.equal(entity !== undefined, true);
  state.players["user-alice"].x = entity.x;
  state.players["user-alice"].y = entity.y;
  state.players["user-bob"].x = entity.x;
  state.players["user-bob"].y = entity.y;
  const raced = applyMatchLoop(state, 3, contentHash, [
    {
      opcode: ClientOpcode.PICKUP_GROUND_ITEM,
      raw: envelope({ groundEntityId: entity.groundEntityId, requestId: "req-pick-alice1" }),
      userId: "user-alice",
    },
    {
      opcode: ClientOpcode.PICKUP_GROUND_ITEM,
      raw: envelope({ groundEntityId: entity.groundEntityId, requestId: "req-pick-bob001" }),
      userId: "user-bob",
    },
  ], ids("win"));
  const actions = raced.outbound
    .filter(function (item) { return item.opcode === ServerOpcode.ACTION_RESULT; })
    .map(function (item) { return JSON.parse(item.body) as { ok: boolean; code: string; requestId?: string }; });
  const ok = actions.filter(function (item) { return item.ok === true; });
  const denied = actions.filter(function (item) { return item.code === GROUND_ITEM_NO_LONGER_AVAILABLE; });
  assert.equal(ok.length, 1);
  assert.equal(denied.length, 1);
  assert.equal((raced.state.groundItems !== undefined ? raced.state.groundItems : []).length, 0);
});
