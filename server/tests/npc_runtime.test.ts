import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { PLAYER_RESPAWN_DELAY_SEC, type CombatEvent } from "../src/domain/combat";
import { applyCombat, applyPlayerAttack } from "../src/domain/combat_pipeline";
import {
  addPlayer,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import {
  createNpcRuntimeInstance,
  isNpcRuntimeId,
  npcDefinitionsFromContent,
} from "../src/domain/npc";
import { applySetTarget, entitiesInRadius, findMatchEntity } from "../src/domain/targeting";
import { selectThreatTarget, DEFAULT_AI_PROFILE } from "../src/domain/threat";

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
    {},
    { npcsById: npcDefinitionsFromContent(content.npcs) },
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

function elderPose(): { x: number; y: number } {
  const row = content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.elder") as {
    x: number;
    y: number;
  };
  return { x: row.x, y: row.y };
}

test("generic NpcRuntimeInstance spawns from content without combat fields", () => {
  const definitions = npcDefinitionsFromContent(content.npcs);
  const elderDef = definitions["npc.elder"];
  assert.ok(elderDef);
  assert.equal(elderDef.routeId, "route.stationary");
  assert.equal(elderDef.homeX, elderDef.x);
  assert.equal(elderDef.homeY, elderDef.y);
  assert.deepEqual(
    elderDef.services.map((service) => service.type),
    ["dialogue", "quest_offer", "quest_turn_in"],
  );
  const instance = createNpcRuntimeInstance({
    npcId: elderDef.id,
    x: elderDef.x,
    y: elderDef.y,
    zoneId: elderDef.zoneId,
    definition: elderDef,
    defaultInteractionRange: 48,
  });
  assert.equal(instance.id, "npc.elder");
  assert.equal(instance.npcId, "npc.elder");
  assert.equal(instance.routeId, "route.stationary");
  assert.equal(instance.homeX, 1440);
  assert.equal(instance.homeY, 1344);
  assert.equal("health" in instance, false);
  assert.equal("threatByPlayerId" in instance, false);
  assert.equal("aiState" in instance, false);
  const state = emptyZone();
  const spawned = state.npcs.find((npc) => npc.npcId === "npc.elder");
  assert.ok(spawned);
  assert.equal(spawned.routeId, "route.stationary");
  assert.equal(isNpcRuntimeId(state.npcs, "npc.elder"), true);
  assert.equal(isNpcRuntimeId(state.npcs, state.enemies[0].id), false);
});

test("NPCs are excluded from targeting, AoE, threat, damage, healing, and loot", () => {
  const pose = elderPose();
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", pose.x, pose.y));
  const lootBefore = state.loot.length;
  const npcHealthKeys = Object.keys(state.npcs[0]);
  assert.equal(npcHealthKeys.indexOf("health"), -1);

  assert.equal(findMatchEntity(state, "npc.elder"), null);
  const hostile = applySetTarget(state, state.players["user-alice"], "npc.elder", "hostile", "req-npc-h1");
  assert.equal(hostile.ok, false);
  assert.equal(hostile.code, "invalid_target");
  const friendly = applySetTarget(state, state.players["user-alice"], "npc.elder", "friendly", "req-npc-f1");
  assert.equal(friendly.ok, false);
  assert.equal(friendly.code, "invalid_target");
  assert.equal(state.players["user-alice"].hostileTargetId, "");
  assert.equal(state.players["user-alice"].friendlyTargetId, "");

  const nearby = entitiesInRadius(state, pose.x, pose.y, 64);
  assert.equal(
    nearby.some((row) => row.id === "npc.elder" || row.kind === ("npc" as "player")),
    false,
  );

  const events: CombatEvent[] = [];
  const attack = applyPlayerAttack(
    {
      player: state.players["user-alice"],
      targetId: "npc.elder",
      requestId: "req-atk-npc",
      tick: 8,
      enemies: state.enemies,
      attack: content.player.attack,
      attackRange: 128,
      attackCooldownSec: 0.1,
      tickRate: 10,
      match: state,
    },
    events,
  );
  assert.equal(attack.ok, false);
  assert.equal(attack.code, "invalid_target");

  const damage = applyCombat(
    state,
    {
      action: "damage",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: "npc.elder",
      targetKind: "enemy",
      formula: { base: 4 },
      tick: 9,
      eventId: "dmg:npc",
    },
    events,
  );
  assert.equal(damage.ok, false);
  assert.equal(damage.code, "invalid_target");

  const heal = applyCombat(
    state,
    {
      action: "heal",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: "npc.elder",
      targetKind: "player",
      formula: { base: 4 },
      tick: 10,
      eventId: "heal:npc",
    },
    events,
  );
  assert.equal(heal.ok, false);
  assert.equal(heal.code, "invalid_target");
  assert.equal(state.loot.length, lootBefore);

  const enemy = state.enemies[0];
  enemy.x = pose.x;
  enemy.y = pose.y;
  enemy.aggroRadius = 8;
  const threatId = selectThreatTarget(state, enemy, DEFAULT_AI_PROFILE, 11);
  assert.notEqual(threatId, "npc.elder");
  assert.equal(isNpcRuntimeId(state.npcs, threatId), false);
});

test("respec trainers stay on the generic NPC definition", () => {
  const definitions = npcDefinitionsFromContent(content.npcs);
  assert.equal(
    definitions["npc.test_innkeeper"].services.some((service) => service.type === "respec"),
    true,
  );
  assert.equal(definitions["npc.test_innkeeper"].routeId, "route.stationary");
  if (definitions["npc.lab_trainer"] !== undefined) {
    assert.equal(
      definitions["npc.lab_trainer"].services.some((service) => service.type === "respec"),
      true,
    );
  }
});
