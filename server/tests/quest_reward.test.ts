import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addOrStackItem,
  countItem,
  initializeInventory,
  itemDefinitionsFromContent,
  emptyInventory,
  type PlayerInventory,
} from "../src/domain/inventory";
import {
  INVENTORY_COLLECTION,
  INVENTORY_KEY,
  INVENTORY_PERMISSION_WRITE,
} from "../src/domain/inventory_store";
import {
  QUEST_COLLECTION,
  QUEST_KEY,
  QUEST_PERMISSION_WRITE,
} from "../src/domain/quest_store";
import { storageKey } from "../src/domain/storage_scope";
import { commitQuestReward } from "../src/nakama/quest_reward_store";
import { MAIN_HAND_SLOT } from "../src/domain/equipment";
import {
  addPlayer,
  buildFullState,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import type { QuestRewardWrite, RewardCommitResult } from "../src/domain/quest_reward";

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

function bagWith(items: { itemId: string; quantity: number; instanceId: string }[]): PlayerInventory {
  let inventory = initializeInventory(null, ids("sword")).inventory;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    inventory = addOrStackItem(inventory, item.itemId, item.quantity, item.instanceId, itemsById()[item.itemId]);
  }
  return inventory;
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
    inventory: inventory !== undefined ? inventory : initializeInventory(null, ids(userId + "-sword")).inventory,
    gold: 0,
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

function elderPos() {
  return content.zones["zone.starter"].npcs[0];
}

function spawnPos() {
  return content.zones["zone.starter"].playerSpawn;
}

function readyAlice(inventory?: PlayerInventory): StarterZoneState {
  const elder = elderPos();
  const bag = inventory !== undefined ? inventory : bagWith([{ itemId: "item.slime_gel", quantity: 1, instanceId: "gel-1" }]);
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y, bag));
  return applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-turnin1" }),
      userId: "user-alice",
    },
  ]).state;
}

function turnIn(userId: string, extra: { [key: string]: unknown } = {}) {
  return {
    opcode: ClientOpcode.QUEST_TURN_IN,
    raw: envelope({
      questId: "quest.slime_problem",
      npcId: "npc.elder",
      requestId: "req-turnin-1",
      ...extra,
    }),
    userId: userId,
  };
}

function actionCodes(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { ok: boolean; code: string; requestId?: string });
}

function questPayloads(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.QUEST_STATE)
    .map((item) => JSON.parse(item.body) as { quests: Array<{ questId: string; status: string; objectives: Array<{ current: number; required: number }> }> });
}

function walletPayloads(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.WALLET_STATE)
    .map((item) => JSON.parse(item.body) as { gold: number });
}

function itemCountOf(state: StarterZoneState, userId: string, itemId: string): number {
  return countItem(state.players[userId].inventory, itemId);
}

test("picking up slime gel advances the accepted quest objective", () => {
  const elder = elderPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  state = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-progress1" }),
      userId: "user-alice",
    },
  ]).state;
  state.loot.push({
    id: "loot-gel-1",
    itemId: "item.slime_gel",
    quantity: 1,
    instanceId: "gel-drop-1",
    x: elder.x,
    y: elder.y,
    expiresAtTick: 400,
  });
  const result = applyMatchLoop(state, 3, contentHash, [
    {
      opcode: ClientOpcode.PICKUP,
      raw: envelope({ lootId: "loot-gel-1", requestId: "req-pickup-progress1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(result)[0].ok, true);
  const quests = questPayloads(result);
  assert.equal(quests.length, 1);
  assert.equal(quests[0].quests[0].objectives[0].current, 1);
  assert.equal(quests[0].quests[0].objectives[0].required, 1);
  assert.equal(result.persistQuests.length, 1);
  assert.equal(result.state.players["user-alice"].questLog.quests["quest.slime_problem"].objectives[0].current, 1);
});

test("accepting with slime gel already owned sets the objective to required", () => {
  const elder = elderPos();
  const state = addPlayer(
    emptyZone(),
    playerAt("user-alice", "Alice", elder.x, elder.y, bagWith([{ itemId: "item.slime_gel", quantity: 1, instanceId: "gel-owned" }])),
  );
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-ownedgel1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(questPayloads(result)[0].quests[0].objectives[0].current, 1);
});

test("valid turn-in consumes gel, grants iron sword and 25 gold, and completes the quest", () => {
  const result = applyMatchLoop(readyAlice(), 5, contentHash, [turnIn("user-alice")]);
  assert.equal(actionCodes(result)[0].ok, true);
  assert.equal(actionCodes(result)[0].code, "ok");
  assert.equal(result.state.players["user-alice"].questLog.quests["quest.slime_problem"].status, "completed");
  assert.equal(itemCountOf(result.state, "user-alice", "item.slime_gel"), 0);
  assert.equal(itemCountOf(result.state, "user-alice", "item.iron_sword"), 1);
  assert.equal(result.state.players["user-alice"].gold, 25);
  assert.equal(walletPayloads(result)[0].gold, 25);
  assert.equal(questPayloads(result)[0].quests[0].status, "completed");
  assert.equal(result.persistRewards.length, 1);
  assert.equal(result.persistRewards[0].request.goldDelta, 25);
  assert.equal(result.persistRewards[0].request.metadata.source, "quest_turn_in");
  const notice = result.outbound.filter((item) => item.opcode === ServerOpcode.SYSTEM_MESSAGE);
  assert.equal(notice.length, 1);
  assert.equal(JSON.parse(notice[0].body).code, "quest_complete");
});

test("turn-in too far from elder is out_of_range", () => {
  const spawn = spawnPos();
  const elder = elderPos();
  let state = addPlayer(
    emptyZone(),
    playerAt("user-alice", "Alice", elder.x, elder.y, bagWith([{ itemId: "item.slime_gel", quantity: 1, instanceId: "gel-1" }])),
  );
  state = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-far1" }),
      userId: "user-alice",
    },
  ]).state;
  state.players["user-alice"].x = spawn.x;
  state.players["user-alice"].y = spawn.y;
  const result = applyMatchLoop(state, 5, contentHash, [turnIn("user-alice")]);
  assert.equal(actionCodes(result)[0].ok, false);
  assert.equal(actionCodes(result)[0].code, "out_of_range");
  assert.equal(itemCountOf(result.state, "user-alice", "item.slime_gel"), 1);
  assert.equal(result.state.players["user-alice"].gold, 0);
});

test("turn-in without an accepted quest is invalid_id", () => {
  const elder = elderPos();
  const state = addPlayer(
    emptyZone(),
    playerAt("user-alice", "Alice", elder.x, elder.y, bagWith([{ itemId: "item.slime_gel", quantity: 1, instanceId: "gel-1" }])),
  );
  const result = applyMatchLoop(state, 5, contentHash, [turnIn("user-alice")]);
  assert.equal(actionCodes(result)[0].code, "invalid_id");
  assert.equal(result.state.players["user-alice"].gold, 0);
});

test("turn-in with incomplete objective is rejected", () => {
  const elder = elderPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  state = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-incomplete1" }),
      userId: "user-alice",
    },
  ]).state;
  const result = applyMatchLoop(state, 5, contentHash, [turnIn("user-alice")]);
  assert.equal(actionCodes(result)[0].code, "incomplete_objective");
  assert.equal(result.state.players["user-alice"].gold, 0);
});

test("turn-in with satisfied objective but missing gel is missing_item", () => {
  const state = readyAlice(initializeInventory(null, ids("sword")).inventory);
  state.players["user-alice"].questLog.quests["quest.slime_problem"].objectives[0].current = 1;
  const result = applyMatchLoop(state, 5, contentHash, [turnIn("user-alice")]);
  assert.equal(actionCodes(result)[0].code, "missing_item");
  assert.equal(itemCountOf(result.state, "user-alice", "item.iron_sword"), 0);
});

test("duplicate turn-in requestId does not grant again", () => {
  const first = applyMatchLoop(readyAlice(), 5, contentHash, [turnIn("user-alice")]);
  const replay = applyMatchLoop(first.state, 6, contentHash, [turnIn("user-alice")]);
  assert.equal(actionCodes(replay)[0].ok, true);
  assert.equal(actionCodes(replay)[0].code, "ok");
  assert.equal(itemCountOf(replay.state, "user-alice", "item.iron_sword"), 1);
  assert.equal(replay.state.players["user-alice"].gold, 25);
  assert.equal(replay.persistRewards.length, 0);
});

test("repeated turn-in with a different requestId is already_completed", () => {
  const first = applyMatchLoop(readyAlice(), 5, contentHash, [turnIn("user-alice")]);
  const second = applyMatchLoop(first.state, 6, contentHash, [
    turnIn("user-alice", { requestId: "req-turnin-2" }),
  ]);
  assert.equal(actionCodes(second)[0].ok, false);
  assert.equal(actionCodes(second)[0].code, "already_completed");
  assert.equal(itemCountOf(second.state, "user-alice", "item.iron_sword"), 1);
  assert.equal(second.state.players["user-alice"].gold, 25);
});

test("failure during persistence leaves quest inventory and gold unchanged", () => {
  const result = applyMatchLoop(
    readyAlice(),
    5,
    contentHash,
    [turnIn("user-alice")],
    undefined,
    function (): RewardCommitResult {
      return { ok: false, code: "persist_failed", gold: 0 };
    },
  );
  assert.equal(actionCodes(result)[0].ok, false);
  assert.equal(actionCodes(result)[0].code, "persist_failed");
  assert.equal(result.state.players["user-alice"].questLog.quests["quest.slime_problem"].status, "accepted");
  assert.equal(itemCountOf(result.state, "user-alice", "item.slime_gel"), 1);
  assert.equal(itemCountOf(result.state, "user-alice", "item.iron_sword"), 0);
  assert.equal(result.state.players["user-alice"].gold, 0);
  assert.equal(result.persistRewards.length, 0);
});

test("turn-in grants exactly one iron sword and 25 gold and consumes slime gel once", () => {
  const result = applyMatchLoop(readyAlice(), 5, contentHash, [turnIn("user-alice")]);
  const swords = result.state.players["user-alice"].inventory?.items.filter((item) => item.itemId === "item.iron_sword") ?? [];
  assert.equal(swords.length, 1);
  assert.equal(swords[0].quantity, 1);
  assert.equal(result.state.players["user-alice"].gold, 25);
  assert.equal(itemCountOf(result.state, "user-alice", "item.slime_gel"), 0);
  const later = applyMatchLoop(result.state, 6, contentHash, [turnIn("user-alice"), turnIn("user-alice", { requestId: "req-turnin-2" })]);
  assert.equal(itemCountOf(later.state, "user-alice", "item.iron_sword"), 1);
  assert.equal(later.state.players["user-alice"].gold, 25);
});

test("quest stays permanently completed after reload", () => {
  const result = applyMatchLoop(readyAlice(), 5, contentHash, [turnIn("user-alice")]);
  const body = JSON.parse(buildFullState(result.state, 9, "user-alice"));
  assert.equal(body.quests[0].status, "completed");
  assert.equal(body.wallet.gold, 25);
  assert.equal(body.inventory.items.some((item: { itemId: string }) => item.itemId === "item.iron_sword"), true);
  assert.equal(body.inventory.items.some((item: { itemId: string }) => item.itemId === "item.slime_gel"), false);
});

test("iron sword from turn-in can be equipped", () => {
  const turnedIn = applyMatchLoop(readyAlice(), 5, contentHash, [turnIn("user-alice")]);
  const inventory = turnedIn.state.players["user-alice"].inventory;
  const sword = inventory?.items.find((item) => item.itemId === "item.iron_sword");
  assert.equal(sword !== undefined, true);
  const equipped = applyMatchLoop(turnedIn.state, 6, contentHash, [
    {
      opcode: ClientOpcode.EQUIP,
      raw: envelope({ instanceId: sword?.instanceId, slot: MAIN_HAND_SLOT, requestId: "req-equip-iron1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(equipped)[0].ok, true);
  assert.equal(equipped.state.players["user-alice"].equipment?.slots.main_hand, sword?.instanceId);
  assert.equal(equipped.state.players["user-alice"].derivedAttack, content.player.attack + 5);
});

test("quest reward storage writes use multiUpdate with server-only permissions", () => {
  const turnedIn = applyMatchLoop(readyAlice(), 5, contentHash, [turnIn("user-alice")]);
  const request = turnedIn.persistRewards[0].request;
  const capturedWrites: nkruntime.StorageWriteRequest[] = [];
  const capturedWallets: nkruntime.WalletUpdate[] = [];
  let ledger: boolean | undefined;
  const nk = {
    storageRead: function () {
      return [];
    },
    accountGetId: function () {
      return { wallet: { gold: 0 } };
    },
    multiUpdate: function (
      _accounts: unknown,
      writes: nkruntime.StorageWriteRequest[] | null,
      _deletes: unknown,
      wallets: nkruntime.WalletUpdate[] | null,
      updateLedger?: boolean,
    ) {
      if (writes !== null) {
        for (let i = 0; i < writes.length; i++) {
          capturedWrites.push(writes[i]);
        }
      }
      if (wallets !== null) {
        for (let j = 0; j < wallets.length; j++) {
          capturedWallets.push(wallets[j]);
        }
      }
      ledger = updateLedger;
      return {
        storageWriteAcks: [],
        walletUpdateAcks: [{ userId: "user-alice", updated: { gold: 25 }, previous: { gold: 0 } }],
      };
    },
  } as unknown as nkruntime.Nakama;
  const committed = commitQuestReward(nk, request);
  assert.equal(committed.ok, true);
  assert.equal(committed.gold, 25);
  assert.equal(ledger, true);
  assert.equal(capturedWrites.length, 2);
  for (let i = 0; i < capturedWrites.length; i++) {
    assert.equal(capturedWrites[i].permissionWrite, 0);
  }
  const collections = capturedWrites.map((write) => write.collection + ":" + write.key).sort();
  const expected = [
    INVENTORY_COLLECTION + ":" + storageKey(INVENTORY_KEY, request.characterId),
    QUEST_COLLECTION + ":" + storageKey(QUEST_KEY, request.characterId),
  ].sort();
  assert.deepEqual(collections, expected);
  assert.equal(capturedWrites[0].permissionWrite, INVENTORY_PERMISSION_WRITE);
  assert.equal(capturedWrites[1].permissionWrite, QUEST_PERMISSION_WRITE);
  assert.equal(capturedWallets[0].changeset.gold, 25);
  assert.equal(capturedWallets[0].metadata?.questId, "quest.slime_problem");
  assert.equal(capturedWallets[0].metadata?.requestId, "req-turnin-1");
});

test("commitQuestReward does not grant when multiUpdate fails", () => {
  const turnedIn = applyMatchLoop(readyAlice(), 5, contentHash, [turnIn("user-alice")]);
  const request: QuestRewardWrite = turnedIn.persistRewards[0].request;
  const nk = {
    storageRead: function () {
      return [];
    },
    accountGetId: function () {
      return { wallet: { gold: 0 } };
    },
    multiUpdate: function () {
      throw new Error("storage unavailable");
    },
  } as unknown as nkruntime.Nakama;
  const committed = commitQuestReward(nk, request);
  assert.equal(committed.ok, false);
  assert.equal(committed.code, "persist_failed");
});

test("turn-in that cannot grant the item leaves quest gold and inventory unchanged", () => {
  const herald = content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.test_herald") as { x: number; y: number };
  const inventory = addOrStackItem(emptyInventory(1), "item.training_sword", 1, "sword-full", itemsById()["item.training_sword"]);
  const actor = playerAt("user-alice", "Alice", herald.x, herald.y, inventory);
  let state = addPlayer(emptyZone(), actor);
  state = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.test.reward", requestId: "req-accept-full01" }),
      userId: "user-alice",
    },
  ]).state;
  state = applyMatchLoop(state, 3, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-int-full0001" }),
      userId: "user-alice",
    },
  ]).state;
  const result = applyMatchLoop(state, 5, contentHash, [
    {
      opcode: ClientOpcode.QUEST_TURN_IN,
      raw: envelope({
        questId: "quest.test.reward",
        npcId: "npc.test_herald",
        requestId: "req-turnin-full1",
      }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(result)[0].ok, false);
  assert.equal(actionCodes(result)[0].code, "inventory_full");
  assert.equal(result.state.players["user-alice"].questLog.quests["quest.test.reward"].status, "accepted");
  assert.equal(result.state.players["user-alice"].gold, 0);
  assert.equal(itemCountOf(result.state, "user-alice", "item.test_pebble"), 0);
});
