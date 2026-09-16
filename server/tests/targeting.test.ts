import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { PLAYER_RESPAWN_DELAY_SEC } from "../src/domain/combat";
import {
  addPlayer,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { applySetTarget, entitiesInRadius, resolveTargetQuery } from "../src/domain/targeting";

function emptyZone(): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    { "enemy.green_slime": content.enemies["enemy.green_slime"] },
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
      attack: content.player.attack,
      attackRange: content.player.attackRange,
      attackCooldown: content.player.attackCooldown,
      respawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
    },
    questDefinitionsFromContent(content.quests),
  );
}

function playerAt(userId: string, name: string, x: number, y: number): MatchPlayer {
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
  };
}

test("self, current hostile, and current friendly resolve against match ids", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", spawn.x + 8, spawn.y));
  const self = resolveTargetQuery(state, "user-alice", { mode: "self" });
  assert.equal(self.ok, true);
  assert.equal(self.primary !== null ? self.primary.id : "", "user-alice");
  state.players["user-alice"].hostileTargetId = state.enemies[0].id;
  const hostile = resolveTargetQuery(state, "user-alice", { mode: "hostile_current" });
  assert.equal(hostile.ok, true);
  assert.equal(hostile.primary !== null ? hostile.primary.kind : "", "enemy");
  state.players["user-alice"].friendlyTargetId = "user-bob";
  const friendly = resolveTargetQuery(state, "user-alice", { mode: "friendly_current" });
  assert.equal(friendly.ok, true);
  assert.equal(friendly.primary !== null ? friendly.primary.id : "", "user-bob");
  const missing = resolveTargetQuery(state, "user-alice", { mode: "entity", entityId: "nobody" });
  assert.equal(missing.code, "invalid_target");
});

test("area around a target point includes nearby living entities", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const area = resolveTargetQuery(state, "user-alice", {
    mode: "area_point",
    x: spawn.x,
    y: spawn.y,
    radius: 16,
  });
  assert.equal(area.ok, true);
  assert.ok(area.entities.length >= 2);
  const nearby = entitiesInRadius(state, spawn.x, spawn.y, 16);
  assert.ok(nearby.some((row) => row.kind === "player"));
  assert.ok(nearby.some((row) => row.kind === "enemy"));
});

test("set-target stores hostile enemies and friendly players", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", spawn.x + 8, spawn.y));
  const enemy = applySetTarget(state, state.players["user-alice"], state.enemies[0].id, "", "req-target-e1");
  assert.equal(enemy.ok, true);
  assert.equal(state.players["user-alice"].hostileTargetId, state.enemies[0].id);
  const friend = applySetTarget(state, state.players["user-alice"], "user-bob", "friendly", "req-target-f1");
  assert.equal(friend.ok, true);
  assert.equal(state.players["user-alice"].friendlyTargetId, "user-bob");
  const cleared = applySetTarget(state, state.players["user-alice"], "", "", "req-target-c1");
  assert.equal(cleared.ok, true);
  assert.equal(state.players["user-alice"].hostileTargetId, "");
});
