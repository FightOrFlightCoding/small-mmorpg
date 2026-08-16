import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  INVENTORY_CAPACITY,
  STARTER_ITEM_ID,
  addOrStackItem,
  applyDestroyItem,
  applyMoveItem,
  applySplitStack,
  initializeInventory,
  itemDefinitionsFromContent,
  setItemLock,
  type PlayerInventory,
} from "../src/domain/inventory";
import {
  INVENTORY_COLLECTION,
  INVENTORY_KEY,
  INVENTORY_PERMISSION_READ,
  INVENTORY_PERMISSION_WRITE,
  storedInventoryFromValue,
  storedInventoryWriteValue,
} from "../src/domain/inventory_store";
import { buildInventoryWrite } from "../src/nakama/inventory_store";
import { LOOT_TTL_SEC, applyPickup, expireLoot, lootExpireTicks } from "../src/domain/loot";
import {
  MATCH_TICK_RATE,
  addPlayer,
  buildFullState,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchLoot,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";

function ids(prefix = "id"): () => string {
  let n = 0;
  return function () {
    n += 1;
    return prefix + "-" + String(n);
  };
}

function itemsById() {
  return itemDefinitionsFromContent(content.items);
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

function starterInventory(newId = ids("sword")): PlayerInventory {
  return initializeInventory(null, newId).inventory;
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
    inventory: inventory !== undefined ? inventory : starterInventory(ids(userId + "-item")),
  };
}

function gelLoot(id: string, x: number, y: number, instanceId = id + "-inst"): MatchLoot {
  return {
    id: id,
    itemId: "item.slime_gel",
    quantity: 1,
    instanceId: instanceId,
    x: x,
    y: y,
    expiresAtTick: 9999,
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

function pickup(userId: string, lootId: string, requestId: string) {
  return {
    opcode: ClientOpcode.PICKUP,
    raw: envelope({ lootId: lootId, requestId: requestId }),
    userId: userId,
  };
}

function actionCodes(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body));
}

function inventoryMessages(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.INVENTORY_STATE)
    .map((item) => JSON.parse(item.body));
}

function gelCount(inventory: PlayerInventory | undefined): number {
  if (inventory === undefined) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i].itemId === "item.slime_gel") {
      total += inventory.items[i].quantity;
    }
  }
  return total;
}

test("inventory initialization grants one training sword and capacity 20", () => {
  const first = initializeInventory(null, ids("init"));
  assert.equal(first.created, true);
  assert.equal(first.inventory.capacity, INVENTORY_CAPACITY);
  assert.equal(first.inventory.capacity, 20);
  assert.equal(first.inventory.items.length, 1);
  assert.equal(first.inventory.items[0].itemId, STARTER_ITEM_ID);
  assert.equal(first.inventory.items[0].quantity, 1);
  assert.equal(first.inventory.items[0].instanceId, "init-1");
  assert.equal(first.inventory.items[0].sourceType, "starter");
  assert.equal(first.inventory.items[0].slotIndex, 0);
  assert.deepEqual(first.inventory.items[0].metadata, {});
});

test("duplicate inventory initialization does not grant another sword", () => {
  const first = initializeInventory(null, ids("once"));
  const second = initializeInventory(first.inventory, ids("twice"));
  assert.equal(second.created, false);
  assert.equal(second.inventory.items.length, 1);
  assert.equal(second.inventory.items[0].instanceId, first.inventory.items[0].instanceId);
  assert.equal(second.inventory.items[0].itemId, STARTER_ITEM_ID);
});

test("inventory storage writes are server-only", () => {
  const inventory = starterInventory(ids("store"));
  const write = buildInventoryWrite("user-alice", inventory);
  assert.equal(write.collection, INVENTORY_COLLECTION);
  assert.equal(write.key, INVENTORY_KEY);
  assert.equal(write.userId, "user-alice");
  assert.equal(write.permissionRead, INVENTORY_PERMISSION_READ);
  assert.equal(write.permissionWrite, INVENTORY_PERMISSION_WRITE);
  assert.equal(write.permissionWrite, 0);
  const roundTrip = storedInventoryFromValue(storedInventoryWriteValue(inventory));
  assert.equal(roundTrip !== null, true);
  if (roundTrip !== null) {
    assert.equal(roundTrip.items[0].itemId, STARTER_ITEM_ID);
    assert.equal(roundTrip.capacity, 20);
  }
});

test("loot expires after the documented ttl and is not persisted", () => {
  assert.equal(LOOT_TTL_SEC, 30);
  assert.equal(lootExpireTicks(MATCH_TICK_RATE), 300);
  const loot = [gelLoot("loot-ttl", 960, 400)];
  loot[0].expiresAtTick = 10;
  const kept = expireLoot(loot, 9);
  const gone = expireLoot(loot, 10);
  assert.equal(kept.length, 1);
  assert.equal(gone.length, 0);
});

test("valid pickup adds slime gel, persists inventory, and broadcasts removal", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.loot = [gelLoot("loot-gel-1", spawn.x, spawn.y)];
  const result = applyMatchLoop(state, 4, contentHash, [pickup("user-alice", "loot-gel-1", "req-pickup-ok1")], ids("loop"));
  assert.equal(actionCodes(result)[0].ok, true);
  assert.equal(actionCodes(result)[0].code, "ok");
  assert.equal(result.state.loot.length, 0);
  assert.equal(gelCount(result.state.players["user-alice"].inventory), 1);
  assert.equal(result.persistInventories.length, 1);
  assert.equal(result.persistInventories[0].userId, "user-alice");
  const inv = inventoryMessages(result);
  assert.equal(inv.length, 1);
  assert.equal(inv[0].capacity, 20);
  const snap = JSON.parse(result.outbound.filter((item) => item.opcode === ServerOpcode.SNAPSHOT)[0].body);
  assert.deepEqual(snap.loot, []);
});

test("out-of-range pickup is rejected", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const home = content.zones["zone.starter"].playerSpawn;
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", home.x, home.y));
  state.loot = [gelLoot("loot-far", spawn.x, spawn.y)];
  const result = applyMatchLoop(state, 4, contentHash, [pickup("user-alice", "loot-far", "req-pickup-far1")], ids("loop"));
  assert.equal(actionCodes(result)[0].code, "out_of_range");
  assert.equal(result.state.loot.length, 1);
  assert.equal(gelCount(result.state.players["user-alice"].inventory), 0);
  assert.equal(result.persistInventories.length, 0);
});

test("missing loot pickup is invalid_target", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const result = applyMatchLoop(state, 4, contentHash, [pickup("user-alice", "loot-missing", "req-pickup-miss1")], ids("loop"));
  assert.equal(actionCodes(result)[0].code, "invalid_target");
  assert.equal(result.persistInventories.length, 0);
});

test("full inventory rejects a new unstackable grant", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const full = starterInventory(ids("full"));
  const sword = content.items["item.training_sword"];
  while (full.items.length < INVENTORY_CAPACITY) {
    const next = addOrStackItem(full, STARTER_ITEM_ID, 1, "sword-extra-" + String(full.items.length), sword);
    full.items = next.items;
  }
  assert.equal(full.items.length, 20);
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, full));
  state.loot = [gelLoot("loot-full", spawn.x, spawn.y)];
  const result = applyMatchLoop(state, 4, contentHash, [pickup("user-alice", "loot-full", "req-pickup-full1")], ids("loop"));
  assert.equal(actionCodes(result)[0].code, "inventory_full");
  assert.equal(result.state.loot.length, 1);
  assert.equal(gelCount(result.state.players["user-alice"].inventory), 0);
  assert.equal(result.persistInventories.length, 0);
});

test("slime gel stacks into an existing instance", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const inventory = starterInventory(ids("stack"));
  const stacked = addOrStackItem(inventory, "item.slime_gel", 1, "gel-first", content.items["item.slime_gel"]);
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, stacked));
  state.loot = [gelLoot("loot-stack", spawn.x, spawn.y, "gel-second")];
  const result = applyMatchLoop(state, 4, contentHash, [pickup("user-alice", "loot-stack", "req-pickup-stack1")], ids("loop"));
  assert.equal(actionCodes(result)[0].code, "ok");
  const bags = result.state.players["user-alice"].inventory;
  assert.equal(bags !== undefined, true);
  if (bags !== undefined) {
    const gels = bags.items.filter((item) => item.itemId === "item.slime_gel");
    assert.equal(gels.length, 1);
    assert.equal(gels[0].quantity, 2);
    assert.equal(gels[0].instanceId, "gel-first");
  }
});

test("duplicate pickup requestId does not grant twice", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.loot = [gelLoot("loot-dup", spawn.x, spawn.y)];
  const first = applyMatchLoop(state, 4, contentHash, [pickup("user-alice", "loot-dup", "req-pickup-dup1")], ids("loop"));
  const second = applyMatchLoop(first.state, 5, contentHash, [pickup("user-alice", "loot-dup", "req-pickup-dup1")], ids("loop"));
  assert.equal(actionCodes(first)[0].code, "ok");
  assert.equal(actionCodes(second)[0].code, "ok");
  assert.equal(gelCount(second.state.players["user-alice"].inventory), 1);
  assert.equal(second.persistInventories.length, 0);
  assert.equal(inventoryMessages(second).length, 1);
});

test("two players picking the same loot: first valid pickup wins", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", spawn.x, spawn.y));
  state.loot = [gelLoot("loot-race", spawn.x, spawn.y)];
  const result = applyMatchLoop(
    state,
    4,
    contentHash,
    [
      pickup("user-alice", "loot-race", "req-pickup-alice1"),
      pickup("user-bob", "loot-race", "req-pickup-bob1"),
    ],
    ids("loop"),
  );
  const codes = actionCodes(result);
  assert.equal(codes[0].code, "ok");
  assert.equal(codes[0].requestId, "req-pickup-alice1");
  assert.equal(codes[1].code, "invalid_target");
  assert.equal(result.state.loot.length, 0);
  assert.equal(gelCount(result.state.players["user-alice"].inventory), 1);
  assert.equal(gelCount(result.state.players["user-bob"].inventory), 0);
  assert.equal(result.persistInventories.length, 1);
  assert.equal(result.persistInventories[0].userId, "user-alice");
});

test("unknown item definition on loot is invalid_id", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.loot = [
    {
      id: "loot-unknown",
      itemId: "item.does_not_exist",
      quantity: 1,
      instanceId: "inst-unknown",
      x: spawn.x,
      y: spawn.y,
      expiresAtTick: 9999,
    },
  ];
  const result = applyMatchLoop(state, 4, contentHash, [pickup("user-alice", "loot-unknown", "req-pickup-unk1")], ids("loop"));
  assert.equal(actionCodes(result)[0].code, "invalid_id");
  assert.equal(result.state.loot.length, 1);
  assert.equal(result.persistInventories.length, 0);
});

test("client-generated item instance ids are rejected", () => {
  const injected = parseClientMessage(
    ClientOpcode.PICKUP,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      lootId: "loot-1",
      requestId: "req-pickup-inject1",
      instanceId: "client-forged-id",
    }),
    contentHash,
  );
  assert.equal(isProtocolError(injected), true);
  if (isProtocolError(injected)) {
    assert.equal(injected.code, "stat_injection:instanceId");
  }
  const grant = parseClientMessage(
    ClientOpcode.PICKUP,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      lootId: "loot-1",
      requestId: "req-pickup-inject2",
      items: [{ itemId: "item.slime_gel", quantity: 99 }],
    }),
    contentHash,
  );
  assert.equal(isProtocolError(grant), true);
  if (isProtocolError(grant)) {
    assert.equal(grant.code, "stat_injection:items");
  }
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.loot = [gelLoot("loot-inject", spawn.x, spawn.y)];
  const result = applyMatchLoop(
    state,
    4,
    contentHash,
    [
      {
        opcode: ClientOpcode.PICKUP,
        raw: JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          lootId: "loot-inject",
          requestId: "req-pickup-inject3",
          instanceId: "client-forged-id",
        }),
        userId: "user-alice",
      },
    ],
    ids("loop"),
  );
  assert.equal(result.outbound[0].opcode, ServerOpcode.SYSTEM_MESSAGE);
  assert.equal(JSON.parse(result.outbound[0].body).code, "stat_injection:instanceId");
  assert.equal(result.state.loot.length, 1);
  assert.equal(gelCount(result.state.players["user-alice"].inventory), 0);
});

test("match init enemy catalog keeps guaranteed slime gel drops", () => {
  const mapped = enemyDefinitionsFromContent(content.enemies);
  const drops = mapped["enemy.green_slime"].loot;
  assert.equal(drops !== undefined, true);
  if (drops !== undefined) {
    assert.equal(drops.length, 1);
    assert.equal(drops[0].itemId, "item.slime_gel");
    assert.equal(drops[0].quantity, 1);
    assert.equal(drops[0].guaranteed, true);
  }
  const state = createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    mapped,
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
      pickupRange: content.player.pickupRange,
    },
    questDefinitionsFromContent(content.quests),
    itemsById(),
  );
  assert.equal(state.enemyLootById["enemy.green_slime"][0].itemId, "item.slime_gel");
});

test("slime death creates one unpersisted gel loot entity at the death pose", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.enemies[0].health = content.player.attack;
  const kill = applyMatchLoop(
    state,
    8,
    contentHash,
    [
      {
        opcode: ClientOpcode.ATTACK,
        raw: envelope({ targetId: state.enemies[0].id, requestId: "req-atk-loot1" }),
        userId: "user-alice",
      },
    ],
    ids("loot"),
  );
  assert.equal(kill.state.enemies[0].aiState, "dead");
  assert.equal(kill.state.loot.length, 1);
  assert.equal(kill.state.loot[0].itemId, "item.slime_gel");
  assert.equal(kill.state.loot[0].quantity, 1);
  assert.equal(kill.state.loot[0].x, spawn.x);
  assert.equal(kill.state.loot[0].y, spawn.y);
  assert.equal(kill.state.loot[0].expiresAtTick, 8 + lootExpireTicks(MATCH_TICK_RATE));
  assert.equal(kill.persistInventories.length, 0);
  const snap = JSON.parse(kill.outbound.filter((item) => item.opcode === ServerOpcode.SNAPSHOT)[0].body);
  assert.equal(snap.loot.length, 1);
  assert.equal(snap.loot[0].itemId, "item.slime_gel");
  assert.equal(Object.prototype.hasOwnProperty.call(snap.loot[0], "instanceId"), false);
  const full = JSON.parse(buildFullState(kill.state, 8, "user-alice"));
  assert.equal(full.inventory.items[0].itemId, STARTER_ITEM_ID);
  assert.equal(Object.prototype.hasOwnProperty.call(full.loot[0], "instanceId"), false);
});

test("dead player cannot pick up loot", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const actor = playerAt("user-alice", "Alice", spawn.x, spawn.y);
  actor.health = 0;
  let state = addPlayer(emptyZone(), actor);
  state.loot = [gelLoot("loot-dead", spawn.x, spawn.y)];
  const result = applyMatchLoop(state, 4, contentHash, [pickup("user-alice", "loot-dead", "req-pickup-dead1")], ids("loop"));
  assert.equal(actionCodes(result)[0].code, "player_dead");
  assert.equal(result.state.loot.length, 1);
});

test("applyPickup domain path matches match-loop success", () => {
  const inventory = starterInventory(ids("dom"));
  const loot = [gelLoot("loot-dom", 10, 10)];
  const decision = applyPickup({
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    inventory: inventory,
    lootId: "loot-dom",
    requestId: "req-pickup-dom1",
    loot: loot,
    pickupRange: 40,
    itemsById: itemsById(),
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.persist, true);
  assert.equal(decision.loot.length, 0);
  assert.equal(gelCount(decision.inventory), 1);
});

test("Prompt 18 inventory blobs keep instance ids and fill slot fields", () => {
  const parsed = storedInventoryFromValue({
    capacity: 20,
    items: [
      { instanceId: "p18-sword", itemId: "item.training_sword", quantity: 1, metadata: {} },
      { instanceId: "p18-gel", itemId: "item.slime_gel", quantity: 3, metadata: { note: "keep" } },
    ],
    pickupByRequestId: {},
  });
  assert.equal(parsed !== null, true);
  if (parsed === null) {
    return;
  }
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].instanceId, "p18-sword");
  assert.equal(parsed.items[1].instanceId, "p18-gel");
  assert.equal(parsed.items[1].quantity, 3);
  assert.equal(parsed.items[0].sourceType, "migration");
  assert.equal(parsed.items[0].slotIndex, 0);
  assert.equal(parsed.items[1].slotIndex, 1);
  assert.equal(parsed.items[1].metadata.note, "keep");
  const again = storedInventoryFromValue(storedInventoryWriteValue(parsed));
  assert.equal(again !== null, true);
  if (again !== null) {
    assert.equal(again.items[0].instanceId, "p18-sword");
    assert.equal(again.items[1].instanceId, "p18-gel");
  }
});

test("stack merge, split, move, destroy, and locked items", () => {
  const defs = itemsById();
  let inventory = initializeInventory(null, ids("mut")).inventory;
  inventory = addOrStackItem(inventory, "item.test_cloth", 8, "cloth-a", defs["item.test_cloth"]);
  inventory = addOrStackItem(inventory, "item.test_cloth", 5, "cloth-b", defs["item.test_cloth"]);
  const cloths = inventory.items.filter((item) => item.itemId === "item.test_cloth");
  assert.equal(cloths.length, 1);
  assert.equal(cloths[0].quantity, 13);
  assert.equal(cloths[0].instanceId, "cloth-a");
  const split = applySplitStack({
    playerHealth: 100,
    inventory: inventory,
    equippedInstanceIds: [],
    instanceId: "cloth-a",
    quantity: 4,
    requestId: "req-split-ok1",
    itemsById: defs,
    newId: ids("split"),
  });
  assert.equal(split.ok, true);
  assert.equal(split.newInstanceId, "split-1");
  const afterSplit = split.inventory.items.filter((item) => item.itemId === "item.test_cloth");
  assert.equal(afterSplit.length, 2);
  const moved = applyMoveItem({
    playerHealth: 100,
    inventory: split.inventory,
    instanceId: "split-1",
    toSlotIndex: 10,
    requestId: "req-move-ok1",
    itemsById: defs,
  });
  assert.equal(moved.ok, true);
  const relocated = moved.inventory.items.find((item) => item.instanceId === "split-1");
  assert.equal(relocated !== undefined, true);
  if (relocated !== undefined) {
    assert.equal(relocated.slotIndex, 10);
  }
  const emptyMove = applyMoveItem({
    playerHealth: 100,
    inventory: moved.inventory,
    instanceId: "split-1",
    toSlotIndex: 11,
    requestId: "req-move-empty1",
    itemsById: defs,
  });
  assert.equal(emptyMove.ok, true);
  const destroyed = applyDestroyItem({
    playerHealth: 100,
    inventory: emptyMove.inventory,
    equippedInstanceIds: [],
    instanceId: "split-1",
    requestId: "req-destroy-ok1",
    itemsById: defs,
  });
  assert.equal(destroyed.ok, true);
  assert.equal(destroyed.inventory.items.filter((item) => item.instanceId === "split-1").length, 0);
  const gel = addOrStackItem(destroyed.inventory, "item.slime_gel", 1, "gel-locked", defs["item.slime_gel"]);
  const blocked = applyDestroyItem({
    playerHealth: 100,
    inventory: gel,
    equippedInstanceIds: [],
    instanceId: "gel-locked",
    requestId: "req-destroy-gel1",
    itemsById: defs,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "not_destroyable");
  const lockedInv = setItemLock(destroyed.inventory, "cloth-a", "quest", "lock-1");
  const locked = applyDestroyItem({
    playerHealth: 100,
    inventory: lockedInv,
    equippedInstanceIds: [],
    instanceId: "cloth-a",
    requestId: "req-destroy-lock1",
    itemsById: defs,
  });
  assert.equal(locked.ok, false);
  assert.equal(locked.code, "item_locked");
});

test("match-loop split uses a server-generated instance id and duplicate requests do not split twice", () => {
  const defs = itemsById();
  let inventory = starterInventory(ids("alice-split"));
  inventory = addOrStackItem(inventory, "item.test_cloth", 6, "cloth-live", defs["item.test_cloth"]);
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 640, 400, inventory));
  const first = applyMatchLoop(
    state,
    4,
    contentHash,
    [
      {
        opcode: ClientOpcode.SPLIT_STACK,
        raw: envelope({ instanceId: "cloth-live", quantity: 2, requestId: "req-split-live1" }),
        userId: "user-alice",
      },
    ],
    ids("srv"),
  );
  assert.equal(actionCodes(first)[0].code, "ok");
  const cloths = first.state.players["user-alice"].inventory?.items.filter((item) => item.itemId === "item.test_cloth") ?? [];
  assert.equal(cloths.length, 2);
  const generated = cloths.find((item) => item.instanceId !== "cloth-live");
  assert.equal(generated !== undefined, true);
  if (generated !== undefined) {
    assert.equal(generated.instanceId.indexOf("srv-") === 0, true);
    assert.equal(generated.sourceType, "split");
    assert.equal(generated.quantity, 2);
  }
  const second = applyMatchLoop(
    first.state,
    5,
    contentHash,
    [
      {
        opcode: ClientOpcode.SPLIT_STACK,
        raw: envelope({ instanceId: "cloth-live", quantity: 2, requestId: "req-split-live1" }),
        userId: "user-alice",
      },
    ],
    ids("srv2"),
  );
  assert.equal(actionCodes(second)[0].code, "ok");
  assert.equal(second.persistInventories.length, 0);
  const again = second.state.players["user-alice"].inventory?.items.filter((item) => item.itemId === "item.test_cloth") ?? [];
  assert.equal(again.length, 2);
});

test("unique character items cannot be granted twice", () => {
  const defs = itemsById();
  let inventory = starterInventory(ids("unique"));
  inventory = addOrStackItem(inventory, "item.test_relic_blade", 1, "relic-1", defs["item.test_relic_blade"]);
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, inventory));
  state.loot = [
    {
      id: "loot-relic",
      itemId: "item.test_relic_blade",
      quantity: 1,
      instanceId: "relic-2",
      x: spawn.x,
      y: spawn.y,
      expiresAtTick: 9999,
    },
  ];
  const result = applyMatchLoop(state, 4, contentHash, [pickup("user-alice", "loot-relic", "req-pickup-relic1")], ids("loop"));
  assert.equal(actionCodes(result)[0].code, "unique_restricted");
});

test("inventory mutations survive reconnect into a restarted match", () => {
  const defs = itemsById();
  let inventory = starterInventory(ids("restart"));
  inventory = addOrStackItem(inventory, "item.test_cloth", 4, "cloth-restart", defs["item.test_cloth"]);
  const split = applySplitStack({
    playerHealth: 100,
    inventory: inventory,
    equippedInstanceIds: [],
    instanceId: "cloth-restart",
    quantity: 1,
    requestId: "req-split-restart1",
    itemsById: defs,
    newId: ids("restart-id"),
  });
  const storedIds = split.inventory.items.map((item) => item.instanceId).sort();
  const restarted = emptyZone();
  const player = playerAt("user-alice", "Alice", 640, 400, split.inventory);
  const next = addPlayer(restarted, player);
  const liveIds = next.players["user-alice"].inventory?.items.map((item) => item.instanceId).sort();
  assert.deepEqual(liveIds, storedIds);
  const replay = applySplitStack({
    playerHealth: 100,
    inventory: next.players["user-alice"].inventory as PlayerInventory,
    equippedInstanceIds: [],
    instanceId: "cloth-restart",
    quantity: 1,
    requestId: "req-split-restart1",
    itemsById: defs,
    newId: ids("should-not"),
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.persist, false);
});
