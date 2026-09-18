import assert from "node:assert/strict";
import test from "node:test";
import { contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { addPlayer, buildFullState } from "../src/domain/match_state";
import { applyPlayerLeave, applyPlayerTransfer, expireLinkDeadPlayers } from "../src/domain/persistence";
import { LINK_DEAD_TICKS } from "../src/domain/gameplay_lease";
import { assembleAccountExport } from "../src/domain/account_export";
import { cloneQuestLog } from "../src/domain/quest";
import { cloneInventory } from "../src/domain/inventory";
import { ServerOpcode } from "../src/domain/protocol";
import {
  acceptMessage,
  buyMessage,
  openNpcSession,
  resyncMessage,
  returnToSelectMessage,
  turnInMessage,
} from "./npc_session";
import { itemCount, npcPos, platformPlayer, platformZone } from "./npc_platform_fixtures";

function npcOf(state: ReturnType<typeof platformZone>, npcId: string) {
  return state.npcs.find((row) => row.npcId === npcId);
}

test("login join and full-state resync restore NPC catalog plus persisted quest and purchase", () => {
  const merchant = npcPos("npc.platform_merchant");
  const questNpc = npcPos("npc.platform_quest");
  let state = addPlayer(platformZone(), platformPlayer("user-alice", "Alice", questNpc.x, questNpc.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.platform_quest", 1, "req-npc07-lgn01");
  state = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.platform_talk", opened.sessionId, opened.npcInstanceId, "req-npc07-lgn02"),
  ]).state;
  state.players["user-alice"].x = merchant.x;
  state.players["user-alice"].y = merchant.y;
  const shop = openNpcSession(state, "user-alice", "npc.platform_merchant", 3, "req-npc07-lgn03");
  state = applyMatchLoop(shop.state, 4, contentHash, [
    buyMessage("user-alice", "item.test_potion", shop.sessionId, shop.npcInstanceId, "req-npc07-lgn04"),
  ]).state;
  const login = JSON.parse(buildFullState(state, 4, "user-alice")) as {
    npcs: Array<{ npcId: string }>;
    quests: Array<{ questId: string; status: string }>;
    wallet?: { gold?: number };
  };
  assert.ok(login.npcs.some((row) => row.npcId === "npc.elder"));
  assert.ok(login.npcs.some((row) => row.npcId === "npc.platform_combined"));
  assert.equal(login.quests.some((row) => row.questId === "quest.platform_talk" && row.status === "accepted"), true);
  assert.equal(login.wallet?.gold, 10);

  const resync = applyMatchLoop(state, 5, contentHash, [resyncMessage("user-alice")]);
  const full = resync.outbound.find((item) => item.opcode === ServerOpcode.FULL_STATE);
  assert.ok(full);
  const body = JSON.parse(full.body) as { wallet?: { gold?: number } };
  assert.equal(body.wallet?.gold, 10);
});

test("character switch does not leak sessions, quests, or inventory", () => {
  const questNpc = npcPos("npc.platform_quest");
  const opened = openNpcSession(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", questNpc.x, questNpc.y, 0, { characterId: "char-a" })),
    "user-alice",
    "npc.platform_quest",
    1,
    "req-npc07-sw01",
  );
  const accepted = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.platform_talk", opened.sessionId, opened.npcInstanceId, "req-npc07-sw02"),
  ]);
  const persisted = cloneQuestLog(accepted.state.players["user-alice"].questLog);
  const left = applyPlayerLeave(accepted.state, "user-alice", 3);
  assert.equal(left.state.players["user-alice"], undefined);
  const switched = addPlayer(
    left.state,
    platformPlayer("user-alice", "Other", questNpc.x, questNpc.y, 0, { characterId: "char-b" }),
  );
  assert.equal(switched.players["user-alice"].interactionSession, undefined);
  assert.equal(switched.players["user-alice"].questLog.quests["quest.platform_talk"], undefined);
  const restored = addPlayer(
    platformZone(),
    platformPlayer("user-alice", "Alice", questNpc.x, questNpc.y, 0, {
      characterId: "char-a",
      questLog: persisted,
    }),
  );
  assert.equal(restored.players["user-alice"].questLog.quests["quest.platform_talk"].status, "accepted");
});

test("unexpected disconnect invalidates the shop session and resumes the NPC", () => {
  const combined = npcPos("npc.platform_combined");
  const opened = openNpcSession(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", combined.x, combined.y, 20)),
    "user-alice",
    "npc.platform_combined",
    1,
    "req-npc07-dc01",
  );
  assert.equal(npcOf(opened.state, "npc.platform_combined")?.movement?.phase, "paused");
  const left = applyPlayerLeave(opened.state, "user-alice", 2);
  assert.equal(left.state.players["user-alice"].linkDead, true);
  assert.equal(left.state.players["user-alice"].interactionSession?.state, "invalidated");
  assert.notEqual(npcOf(left.state, "npc.platform_combined")?.movement?.phase, "paused");
  const buy = applyMatchLoop(left.state, 3, contentHash, [
    buyMessage(
      "user-alice",
      "item.test_potion",
      opened.sessionId,
      opened.npcInstanceId,
      "req-npc07-dc02",
    ),
  ]);
  const blocked = buy.outbound.find((item) => item.opcode === ServerOpcode.ACTION_RESULT);
  assert.ok(blocked);
  assert.equal(String((JSON.parse(blocked.body) as { code?: string }).code), "link_dead");
  assert.equal(buy.state.players["user-alice"].gold, 20);
});

test("ten-second link-dead hold keeps the avatar then despawns", () => {
  const greeter = npcPos("npc.platform_greeter");
  const opened = openNpcSession(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", greeter.x, greeter.y)),
    "user-alice",
    "npc.platform_greeter",
    5,
    "req-npc07-ldh01",
  );
  const left = applyPlayerLeave(opened.state, "user-alice", 6);
  const before = expireLinkDeadPlayers(left.state, 6 + LINK_DEAD_TICKS - 1);
  assert.equal(before.players.length, 0);
  assert.equal(left.state.players["user-alice"] !== undefined, true);
  const after = expireLinkDeadPlayers(left.state, 6 + LINK_DEAD_TICKS);
  assert.equal(after.players.length, 1);
  assert.equal(left.state.players["user-alice"], undefined);
});

test("safe return to character select persists quests and closes the session", () => {
  const questNpc = npcPos("npc.platform_quest");
  const opened = openNpcSession(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", questNpc.x, questNpc.y)),
    "user-alice",
    "npc.platform_quest",
    1,
    "req-npc07-ret01",
  );
  const accepted = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.platform_talk", opened.sessionId, opened.npcInstanceId, "req-npc07-ret02"),
  ]);
  const left = applyMatchLoop(accepted.state, 3, contentHash, [
    returnToSelectMessage("user-alice", "req-npc07-ret03"),
  ]);
  assert.equal(left.state.players["user-alice"], undefined);
  assert.equal(left.safeLeaveUserIds.indexOf("user-alice") !== -1, true);
  assert.equal(left.persistQuests.some((row) => row.userId === "user-alice"), true);
});

test("logout leave, match restart, and zone transfer drop movement but keep purchases", () => {
  const merchant = npcPos("npc.platform_merchant");
  const combined = npcPos("npc.platform_combined");
  const opened = openNpcSession(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", merchant.x, merchant.y, 20)),
    "user-alice",
    "npc.platform_merchant",
    1,
    "req-npc07-lg01",
  );
  const bought = applyMatchLoop(opened.state, 2, contentHash, [
    buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc07-lg02"),
  ]);
  const inventory = cloneInventory(bought.state.players["user-alice"].inventory);
  const gold = bought.state.players["user-alice"].gold;
  const loggedOut = applyMatchLoop(bought.state, 3, contentHash, [
    returnToSelectMessage("user-alice", "req-npc07-lg03"),
  ]);
  assert.equal(loggedOut.state.players["user-alice"], undefined);

  const restarted = addPlayer(
    platformZone(),
    platformPlayer("user-alice", "Alice", combined.x, combined.y, gold, { inventory: inventory }),
  );
  assert.equal(npcOf(restarted, "npc.platform_combined")?.x, combined.x);
  assert.equal(itemCount(restarted.players["user-alice"].inventory, "item.test_potion"), 1);

  const transferring = bought.state.players["user-alice"];
  transferring.transferState = "issued";
  const xferState = bought.state;
  xferState.players["user-alice"] = transferring;
  const transferred = applyPlayerTransfer(xferState, "user-alice");
  assert.equal(transferred.state.players["user-alice"], undefined);
  assert.notEqual(npcOf(transferred.state, "npc.platform_merchant")?.movement?.phase, "paused");
});

test("soft delete restoration keeps quest and purchase records", () => {
  const store: {
    quests: ReturnType<typeof cloneQuestLog> | null;
    inventory: ReturnType<typeof cloneInventory> | null;
    gold: number;
  } = { quests: null, inventory: null, gold: 0 };
  const questNpc = npcPos("npc.platform_quest");
  const merchant = npcPos("npc.platform_merchant");
  let state = addPlayer(platformZone(), platformPlayer("user-alice", "Alice", questNpc.x, questNpc.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.platform_quest", 1, "req-npc07-sd01");
  state = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.platform_talk", opened.sessionId, opened.npcInstanceId, "req-npc07-sd02"),
  ]).state;
  const talked = openNpcSession(state, "user-alice", "npc.platform_quest", 3, "req-npc07-sd03");
  state = applyMatchLoop(talked.state, 4, contentHash, [
    turnInMessage("user-alice", "quest.platform_talk", talked.sessionId, talked.npcInstanceId, "req-npc07-sd04"),
  ]).state;
  state.players["user-alice"].x = merchant.x;
  state.players["user-alice"].y = merchant.y;
  const shop = openNpcSession(state, "user-alice", "npc.platform_merchant", 5, "req-npc07-sd05");
  state = applyMatchLoop(shop.state, 6, contentHash, [
    buyMessage("user-alice", "item.test_potion", shop.sessionId, shop.npcInstanceId, "req-npc07-sd06"),
  ]).state;
  store.quests = cloneQuestLog(state.players["user-alice"].questLog);
  store.inventory = cloneInventory(state.players["user-alice"].inventory);
  store.gold = state.players["user-alice"].gold;
  const restored = addPlayer(
    platformZone(),
    platformPlayer("user-alice", "Alice", merchant.x, merchant.y, store.gold, {
      questLog: store.quests,
      inventory: store.inventory,
    }),
  );
  assert.equal(restored.players["user-alice"].questLog.quests["quest.platform_talk"].status, "completed");
  assert.equal(itemCount(restored.players["user-alice"].inventory, "item.test_potion"), 1);
  assert.equal(restored.players["user-alice"].interactionSession, undefined);
});

test("account export includes quests and gold and omits NPC movement", () => {
  const payload = assembleAccountExport({
    accountUserId: "user-alice",
    exportedAt: 1,
    gold: 10,
    characters: [
      {
        catalog: { characterId: "char-alice", name: "Alice" },
        quests: { quests: { "quest.platform_talk": { questId: "quest.platform_talk", status: "completed" } } },
        inventory: { items: [{ itemId: "item.test_potion", quantity: 1 }] },
      },
    ],
  });
  const text = JSON.stringify(payload);
  assert.equal(text.indexOf("quest.platform_talk") !== -1, true);
  assert.equal(text.indexOf("item.test_potion") !== -1, true);
  assert.equal(payload.gold, 10);
  assert.equal(text.indexOf("rngState"), -1);
  assert.equal(text.indexOf("npc.platform_combined"), -1);
});

test("account deletion drops character quest and inventory records", () => {
  const payload = assembleAccountExport({
    accountUserId: "user-alice",
    exportedAt: 2,
    gold: 0,
    characters: [],
  });
  const text = JSON.stringify(payload);
  assert.equal(Array.isArray(payload.characters) && payload.characters.length === 0, true);
  assert.equal(text.indexOf("quest.platform_talk"), -1);
  assert.equal(text.indexOf("item.test_potion"), -1);
});

test("NPC movement ticks do not persist", () => {
  const combined = npcPos("npc.platform_combined");
  let state = addPlayer(platformZone(), platformPlayer("user-alice", "Alice", combined.x, combined.y));
  for (let tick = 1; tick <= 8; tick++) {
    const step = applyMatchLoop(state, tick, contentHash, []);
    assert.equal(step.persistOpCount, 0);
    state = step.state;
  }
  assert.ok(npcOf(state, "npc.platform_combined"));
});
