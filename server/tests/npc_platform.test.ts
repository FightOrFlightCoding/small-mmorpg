import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { addPlayer, buildFullState, buildSnapshot } from "../src/domain/match_state";
import { isNpcRuntimeId } from "../src/domain/npc";
import { applySetTarget } from "../src/domain/targeting";
import { ClientOpcode, PROTOCOL_VERSION, parseClientMessage } from "../src/domain/protocol";
import { applyUnexpectedDisconnect } from "../src/domain/persistence";
import { cloneQuestLog } from "../src/domain/quest";
import {
  acceptMessage,
  buyMessage,
  chooseMessage,
  closeMessage,
  envelope,
  interactionPayload,
  openNpcSession,
  turnInMessage,
} from "./npc_session";
import { itemCount, npcPos, clonedInventory, playerGold, platformPlayer, platformZone } from "./npc_platform_fixtures";

function npcOf(state: ReturnType<typeof platformZone>, npcId: string) {
  return state.npcs.find((row) => row.npcId === npcId);
}

test("NPC-07 content-only proof is present without new opcodes", () => {
  assert.equal(content.npcs["npc.platform_greeter"].services.length, 1);
  assert.equal(content.npcs["npc.platform_greeter"].services[0].type, "dialogue");
  const greeterStart = content.dialogues["dialogue.npc.platform_greeter"].nodes.start;
  assert.equal("options" in greeterStart, false);
  assert.equal(content.npcs["npc.platform_guide"].routeId, "route.platform_weighted");
  assert.equal(content.dialogues["dialogue.npc.platform_guide"].nodes.start.options?.length, 1);
  assert.equal(content.npcs["npc.platform_quest"].services.some((row) => row.type === "quest_offer"), true);
  assert.equal(content.quests["quest.platform_talk"].acceptNpcId, "npc.platform_quest");
  assert.equal(
    content.npcs["npc.platform_merchant"].services.some(
      (row) => row.type === "vendor" && row.vendorId === "vendor.platform_kiosk",
    ),
    true,
  );
  assert.equal(content.vendors["vendor.platform_kiosk"].currencyId, "gold");
  assert.equal(content.vendors["vendor.platform_kiosk"].stock[0].buyPrice, 10);
  assert.equal(content.npcs["npc.platform_combined"].routeId, "route.platform_short_loop");
  assert.equal(content.npcRoutes["route.platform_short_loop"].routeType, "loop");
  assert.equal(content.npcRoutes["route.platform_weighted"].routeType, "weighted_route_graph");
  const parsed = parseClientMessage(
    ClientOpcode.INTERACT,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, targetId: "npc.platform_combined", requestId: "req-npc07-op01" }),
    contentHash,
  );
  assert.equal("code" in parsed, false);
});

test("NPC-07 two-client platform journey", () => {
  const combined = npcPos("npc.platform_combined");
  let state = addPlayer(platformZone(), platformPlayer("user-alice", "Alice", combined.x, combined.y, 20));
  state = addPlayer(state, platformPlayer("user-bob", "Bob", combined.x, combined.y, 0));
  for (let tick = 1; tick <= 6; tick++) {
    state = applyMatchLoop(state, tick, contentHash, []).state;
  }
  const walker = npcOf(state, "npc.platform_combined");
  assert.ok(walker);
  assert.equal(walker.routeId, "route.platform_short_loop");
  assert.equal(walker.movement?.phase, "moving");
  assert.ok(Math.abs(walker.x - combined.x) > 1);
  const aliceFull = JSON.parse(buildFullState(state, 6, "user-alice")) as {
    npcs: Array<{ npcId: string; x: number; y: number; movement: { revision: number; phase: string } }>;
  };
  const bobFull = JSON.parse(buildFullState(state, 6, "user-bob")) as {
    npcs: Array<{ npcId: string; x: number; y: number; movement: { revision: number; phase: string } }>;
  };
  const aliceNpc = aliceFull.npcs.find((row) => row.npcId === "npc.platform_combined");
  const bobNpc = bobFull.npcs.find((row) => row.npcId === "npc.platform_combined");
  assert.ok(aliceNpc);
  assert.ok(bobNpc);
  assert.equal(aliceNpc.x, bobNpc.x);
  assert.equal(aliceNpc.y, bobNpc.y);
  assert.equal(aliceNpc.movement.revision, bobNpc.movement.revision);

  const startX = state.players["user-alice"].x;
  for (let tick = 7; tick <= 12; tick++) {
    const step = applyMatchLoop(state, tick, contentHash, [
      {
        opcode: ClientOpcode.INPUT,
        raw: envelope({ seq: tick, axisX: 1, axisY: 0 }),
        userId: "user-alice",
      },
    ]);
    state = step.state;
  }
  assert.ok(state.players["user-alice"].x > startX);
  state.players["user-alice"].axisX = 0;
  state.players["user-alice"].axisY = 0;
  state.players["user-alice"].x = combined.x;
  state.players["user-alice"].y = combined.y;

  const slime = state.enemies.find((enemy) => enemy.enemyId === "enemy.green_slime");
  assert.ok(slime);
  for (let tick = 13; tick <= 16; tick++) {
    state = applyMatchLoop(state, tick, contentHash, []).state;
  }
  const slimeAfter = state.enemies.find((enemy) => enemy.enemyId === "enemy.green_slime");
  assert.ok(slimeAfter);
  assert.equal(isNpcRuntimeId(state.npcs, slimeAfter.aggroTarget), false);
  const hostile = applySetTarget(state, state.players["user-alice"], "npc.platform_combined", "hostile", "req-npc07-tgt01");
  assert.equal(hostile.ok, false);
  assert.equal(hostile.code, "invalid_target");

  const liveNpc = npcOf(state, "npc.platform_combined");
  assert.ok(liveNpc);
  state.players["user-alice"].axisX = 0;
  state.players["user-alice"].axisY = 0;
  state.players["user-alice"].x = liveNpc.x;
  state.players["user-alice"].y = liveNpc.y;
  state.players["user-bob"].x = liveNpc.x;
  state.players["user-bob"].y = liveNpc.y;

  const aliceOpen = openNpcSession(state, "user-alice", "npc.platform_combined", 17, "req-npc07-aopen");
  const bobOpen = openNpcSession(aliceOpen.state, "user-bob", "npc.platform_combined", 18, "req-npc07-bopen");
  assert.equal(interactionPayload(aliceOpen.result).ok, true);
  assert.equal(interactionPayload(bobOpen.result).ok, true);
  assert.notEqual(aliceOpen.sessionId, bobOpen.sessionId);
  const paused = npcOf(bobOpen.state, "npc.platform_combined");
  assert.equal(paused?.movement?.phase, "paused");

  const chosen = applyMatchLoop(bobOpen.state, 19, contentHash, [
    chooseMessage("user-alice", aliceOpen.sessionId, "opt.not_now", "req-npc07-achose"),
  ]);
  assert.equal(interactionPayload(chosen).ok, true);
  assert.equal(interactionPayload(chosen).currentNodeId, "farewell");

  const accepted = applyMatchLoop(chosen.state, 20, contentHash, [
    acceptMessage("user-bob", "quest.platform_combined", bobOpen.sessionId, bobOpen.npcInstanceId, "req-npc07-bacc01"),
  ]);
  assert.equal(accepted.state.players["user-bob"].questLog.quests["quest.platform_combined"].status, "accepted");
  const talked = openNpcSession(accepted.state, "user-bob", "npc.platform_combined", 21, "req-npc07-btalk");
  assert.equal(talked.state.players["user-bob"].questLog.quests["quest.platform_combined"].objectives[0].current, 1);
  const turned = applyMatchLoop(talked.state, 22, contentHash, [
    turnInMessage("user-bob", "quest.platform_combined", talked.sessionId, talked.npcInstanceId, "req-npc07-bturn"),
  ]);
  assert.equal(turned.state.players["user-bob"].questLog.quests["quest.platform_combined"].status, "completed");
  const bobClosed = applyMatchLoop(turned.state, 23, contentHash, [
    closeMessage("user-bob", talked.sessionId, talked.npcInstanceId, "req-npc07-bclose"),
  ]);

  const aliceShop = openNpcSession(bobClosed.state, "user-alice", "npc.platform_combined", 24, "req-npc07-ashop");
  const bought = applyMatchLoop(aliceShop.state, 25, contentHash, [
    buyMessage("user-alice", "item.test_potion", aliceShop.sessionId, aliceShop.npcInstanceId, "req-npc07-abuy"),
  ]);
  assert.equal(bought.state.players["user-alice"].gold, 10);
  assert.equal(itemCount(bought.state.players["user-alice"].inventory, "item.test_potion"), 1);
  const replay = applyMatchLoop(bought.state, 26, contentHash, [
    buyMessage("user-alice", "item.test_potion", aliceShop.sessionId, aliceShop.npcInstanceId, "req-npc07-abuy"),
  ]);
  assert.equal(replay.state.players["user-alice"].gold, 10);
  assert.equal(itemCount(replay.state.players["user-alice"].inventory, "item.test_potion"), 1);

  const left = applyUnexpectedDisconnect(replay.state, "user-alice", 27);
  assert.equal(left.state.players["user-alice"].interactionSession?.state, "invalidated");
  const resumed = npcOf(left.state, "npc.platform_combined");
  assert.notEqual(resumed?.movement?.phase, "paused");

  const quests = cloneQuestLog(left.state.players["user-bob"].questLog);
  const inventory = clonedInventory(left.state.players["user-alice"].inventory);
  const gold = playerGold(left.state.players["user-alice"].gold);
  const restoredAlice = platformPlayer("user-alice", "Alice", combined.x, combined.y, gold, {
    inventory: inventory,
  });
  const restoredBob = platformPlayer("user-bob", "Bob", combined.x, combined.y, 1, { questLog: quests });
  let restarted = addPlayer(platformZone(), restoredAlice);
  restarted = addPlayer(restarted, restoredBob);
  const restartFull = JSON.parse(buildFullState(restarted, 1, "user-alice")) as {
    wallet?: { gold?: number };
    inventory?: { items?: Array<{ itemId: string }> };
  };
  const restartBob = JSON.parse(buildFullState(restarted, 1, "user-bob")) as {
    quests?: Array<{ questId: string; status: string }>;
  };
  assert.equal(restartFull.wallet?.gold, 10);
  assert.equal(restartFull.inventory?.items?.some((row) => row.itemId === "item.test_potion"), true);
  assert.equal(restartBob.quests?.some((row) => row.questId === "quest.platform_combined" && row.status === "completed"), true);
  const restartedNpc = npcOf(restarted, "npc.platform_combined");
  assert.equal(restartedNpc?.x, combined.x);
  assert.equal(restartedNpc?.y, combined.y);
  const snap = JSON.parse(buildSnapshot(restarted, 1)) as { npcs?: unknown };
  assert.equal(snap.npcs, undefined);
});
