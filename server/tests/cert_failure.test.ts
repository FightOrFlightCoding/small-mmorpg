import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { applyPlayerLeave, applyPlayerTransfer, takeGracePlayer } from "../src/domain/persistence";
import { emptyEquipment } from "../src/domain/equipment";
import { initializeInventory } from "../src/domain/inventory";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  playerCount,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { itemDefinitionsFromContent } from "../src/domain/inventory";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { expireCave, memoryCaveRepository, terminateCave } from "../src/domain/cave";
import { evaluateJoinPresence } from "../src/domain/location";
import { publicWorldLocation } from "../src/domain/instance";
import { recoverCommittingTrades } from "../src/domain/match_trade";
import type { TradeCommitter } from "../src/domain/trade";

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function zone(emptyTimeoutTicks = 4, reconnectGraceTicks = 6): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      emptyTimeoutTicks: emptyTimeoutTicks,
      reconnectGraceTicks: reconnectGraceTicks,
    },
  );
}

function playerAt(userId: string, x: number, y: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: "char-" + userId,
    name: userId,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    gold: 4,
    questLog: emptyQuestLog(),
    inventory: initializeInventory(null, function () {
      return userId + "-sword";
    }).inventory,
    equipment: emptyEquipment(),
  };
}

test("one client disconnect parks grace and reconnect restores the player", () => {
  let state = addPlayer(zone(), playerAt("user-alice", 240, 384));
  const left = applyPlayerLeave(state, "user-alice", 3);
  state = left.state;
  assert.equal(playerCount(state), 0);
  assert.ok(state.disconnected["user-alice"] !== undefined);
  const restored = takeGracePlayer(state, "user-alice", 4);
  assert.notEqual(restored, null);
  assert.equal(state.disconnected["user-alice"], undefined);
});

test("multiple disconnects expire without ghost presences", () => {
  let state = addPlayer(zone(), playerAt("user-alice", 240, 384));
  state = addPlayer(state, playerAt("user-bob", 260, 384));
  state = applyPlayerLeave(state, "user-alice", 1).state;
  state = applyPlayerLeave(state, "user-bob", 1).state;
  let next = state;
  for (let tick = 2; tick <= 12; tick++) {
    next = applyMatchLoop(next, tick, contentHash, []).state;
  }
  assert.equal(playerCount(next), 0);
  assert.equal(Object.keys(next.disconnected).length, 0);
  const empty = applyMatchLoop(next, 13, contentHash, []);
  assert.equal(empty.terminate, true);
});

test("delayed and duplicate match messages do not crash or double-grant", () => {
  let state = addPlayer(zone(), playerAt("user-alice", 400, 400));
  state.loot.push({
    id: "loot-delay",
    itemId: "item.slime_gel",
    quantity: 1,
    instanceId: "loot-delay-inst",
    x: 400,
    y: 400,
    expiresAtTick: 9999,
  });
  const first = applyMatchLoop(state, 1, contentHash, [
    { opcode: ClientOpcode.PICKUP, raw: envelope({ lootId: "loot-delay", requestId: "req-dup-pick1" }), userId: "user-alice" },
  ]);
  const firstInv = first.state.players["user-alice"].inventory;
  const gelAfter = firstInv !== undefined ? firstInv.items.filter((item) => item.itemId === "item.slime_gel") : [];
  const count = gelAfter.reduce((sum, item) => sum + item.quantity, 0);
  const delayedSeq = applyMatchLoop(first.state, 2, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 1, axisX: -1, axisY: 0 }), userId: "user-alice" },
  ]);
  const duplicate = applyMatchLoop(delayedSeq.state, 3, contentHash, [
    { opcode: ClientOpcode.PICKUP, raw: envelope({ lootId: "loot-delay", requestId: "req-dup-pick1" }), userId: "user-alice" },
  ]);
  const dupInv = duplicate.state.players["user-alice"].inventory;
  const gelDup = dupInv !== undefined ? dupInv.items.filter((item) => item.itemId === "item.slime_gel") : [];
  assert.equal(gelDup.reduce((sum, item) => sum + item.quantity, 0), count);
  assert.equal(duplicate.terminate, false);
});

test("cave termination and stale cave records do not remain reusable", () => {
  const repo = memoryCaveRepository();
  const now = 1_000_000;
  repo.putCave({
    instanceId: "cave-stale",
    zoneTemplateId: "zone.cave",
    matchId: "match-stale",
    ownerCharacterId: "char-alice",
    createdAt: now - 10_000,
    lastActiveAt: now - 10_000,
    expiresAt: now - 1,
    lifecycleState: "active",
    contentVersion: contentHash,
    completionState: "none",
    schemaVersion: 1,
  });
  const stored = repo.getCave("cave-stale");
  assert.notEqual(stored, null);
  const expired = expireCave(repo, stored as NonNullable<typeof stored>, now);
  assert.equal(expired.lifecycleState, "expired");
  const terminated = terminateCave(repo, expired, now + 1);
  assert.equal(terminated.lifecycleState, "terminated");
  assert.equal(repo.getCave("cave-stale")?.lifecycleState, "terminated");
});

test("stale public-match presence is not a second live location", () => {
  const live = publicWorldLocation("match-live", "char-alice", "user-alice", 240, 384, Date.now());
  const decision = evaluateJoinPresence({
    location: live,
    joiningMatchId: "match-other",
    joiningInstanceType: "public_world",
    hasTransferTicket: false,
    originPresenceLive: true,
    destinationCaveAlive: false,
  });
  assert.equal(decision.accept, false);
  assert.equal(decision.rejectMessage, "already_elsewhere");
});

test("transfer leave does not park a ghost reconnect pose", () => {
  let state = addPlayer(zone(), playerAt("user-alice", 240, 384));
  state.players["user-alice"].transferState = "issued";
  const left = applyPlayerTransfer(state, "user-alice");
  assert.equal(left.state.players["user-alice"], undefined);
  assert.equal(left.state.disconnected["user-alice"], undefined);
});

test("interrupted committing trades are recovered rather than duplicated", () => {
  let state = addPlayer(zone(), playerAt("user-alice", 240, 384));
  state = addPlayer(state, playerAt("user-bob", 250, 384));
  const committer: TradeCommitter = function () {
    throw new Error("no committing snapshot");
  };
  recoverCommittingTrades(state, committer);
  assert.equal(Object.keys(state.trades).length, 0);
});
