import {
  NEVER_ATTACKED_TICK,
  cooldownTicks,
  isCooldownReady,
  type CombatEvent,
} from "./combat";
import { applyCombat, tickPlayerRespawns } from "./combat_pipeline";
import type { MatchEnemy, MatchPlayer, StarterZoneState } from "./match_state";
import { distance, resolveMove } from "./movement";
import { hasControlTag } from "./effects";

export const EnemyAiState = {
  Idle: "idle",
  Chasing: "chasing",
  Attacking: "attacking",
  Returning: "returning",
  Dead: "dead",
} as const;

export type EnemyAiState = (typeof EnemyAiState)[keyof typeof EnemyAiState];

const ARRIVE_DISTANCE = 1.5;

export function simulateCombatants(
  state: StarterZoneState,
  tick: number,
  dt: number,
  tickRate: number,
  events: CombatEvent[],
): void {
  tickPlayerRespawns(state, tick, events);
  simulateEnemies(state, tick, dt, tickRate, events);
}

function simulateEnemies(
  state: StarterZoneState,
  tick: number,
  dt: number,
  tickRate: number,
  events: CombatEvent[],
): void {
  for (let i = 0; i < state.enemies.length; i++) {
    stepEnemy(state, state.enemies[i], tick, dt, tickRate, events);
  }
}

function stepEnemy(
  state: StarterZoneState,
  enemy: MatchEnemy,
  tick: number,
  dt: number,
  tickRate: number,
  events: CombatEvent[],
): void {
  if (enemy.aiState === EnemyAiState.Dead || enemy.health <= 0) {
    const until = enemy.deadUntilTick !== undefined ? enemy.deadUntilTick : 0;
    if (until > 0 && tick >= until) {
      respawnEnemy(enemy, events);
    }
    return;
  }
  if (hasControlTag(enemy.effects, "stun")) {
    return;
  }

  const fromSpawn = distance(enemy.x, enemy.y, enemy.spawnX, enemy.spawnY);
  if (enemy.aiState === EnemyAiState.Returning || fromSpawn > enemy.leashRadius) {
    enemy.aiState = EnemyAiState.Returning;
    enemy.aggroTarget = "";
    if (hasControlTag(enemy.effects, "root")) {
      return;
    }
    const arrived = moveToward(
      enemy,
      enemy.spawnX,
      enemy.spawnY,
      dt,
      state,
    );
    if (arrived) {
      enemy.x = enemy.spawnX;
      enemy.y = enemy.spawnY;
      enemy.aiState = EnemyAiState.Idle;
    }
    return;
  }

  const targetId = acquireTarget(state, enemy);
  enemy.aggroTarget = targetId;
  if (targetId === "") {
    enemy.aiState = EnemyAiState.Idle;
    return;
  }
  const target = state.players[targetId];
  const range = distance(enemy.x, enemy.y, target.x, target.y);
  if (range <= enemy.attackRange) {
    enemy.aiState = EnemyAiState.Attacking;
    tryEnemyAttack(state, enemy, target, tick, tickRate, events);
    return;
  }
  if (hasControlTag(enemy.effects, "root")) {
    enemy.aiState = EnemyAiState.Idle;
    return;
  }
  enemy.aiState = EnemyAiState.Chasing;
  moveToward(enemy, target.x, target.y, dt, state);
}

function acquireTarget(state: StarterZoneState, enemy: MatchEnemy): string {
  const current = enemy.aggroTarget;
  if (current !== undefined && current !== "") {
    const held = state.players[current];
    if (held !== undefined && held.health > 0) {
      return current;
    }
  }
  return nearestPlayerInAggro(state, enemy);
}

function nearestPlayerInAggro(state: StarterZoneState, enemy: MatchEnemy): string {
  const ids = Object.keys(state.players);
  ids.sort();
  let bestId = "";
  let bestDistance = 0;
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    if (player.health <= 0) {
      continue;
    }
    const range = distance(enemy.x, enemy.y, player.x, player.y);
    if (range > enemy.aggroRadius) {
      continue;
    }
    if (bestId === "" || range < bestDistance || (range === bestDistance && ids[i] < bestId)) {
      bestDistance = range;
      bestId = ids[i];
    }
  }
  return bestId;
}

function tryEnemyAttack(
  state: StarterZoneState,
  enemy: MatchEnemy,
  target: MatchPlayer,
  tick: number,
  tickRate: number,
  events: CombatEvent[],
): void {
  const lastTick = enemy.lastAttackTick !== undefined ? enemy.lastAttackTick : NEVER_ATTACKED_TICK;
  const ticks = cooldownTicks(enemy.attackCooldownSec, tickRate);
  if (!isCooldownReady(lastTick, tick, ticks)) {
    return;
  }
  const result = applyCombat(
    state,
    {
      action: "damage",
      sourceId: enemy.id,
      sourceKind: "enemy",
      targetId: target.userId,
      targetKind: "player",
      formula: { base: enemy.damage },
      tick: tick,
      respawnDelaySec: state.playerRespawnDelaySec,
      tickRate: tickRate,
    },
    events,
  );
  if (!result.ok) {
    return;
  }
  enemy.lastAttackTick = tick;
}

function respawnEnemy(enemy: MatchEnemy, events: CombatEvent[]): void {
  enemy.x = enemy.spawnX;
  enemy.y = enemy.spawnY;
  enemy.health = enemy.maxHealth;
  enemy.aiState = EnemyAiState.Idle;
  enemy.aggroTarget = "";
  enemy.lastAttackTick = NEVER_ATTACKED_TICK;
  enemy.deadUntilTick = 0;
  events.push({
    type: "respawn",
    sourceId: "",
    sourceKind: "enemy",
    targetId: enemy.id,
    targetKind: "enemy",
    remainingHealth: enemy.health,
    x: enemy.x,
    y: enemy.y,
  });
}

function moveToward(
  enemy: MatchEnemy,
  targetX: number,
  targetY: number,
  dt: number,
  state: StarterZoneState,
): boolean {
  const dist = distance(enemy.x, enemy.y, targetX, targetY);
  if (dist <= ARRIVE_DISTANCE) {
    return true;
  }
  const maxStep = enemy.moveSpeed * dt;
  let dx = targetX - enemy.x;
  let dy = targetY - enemy.y;
  if (dist > maxStep && dist > 0) {
    dx = (dx / dist) * maxStep;
    dy = (dy / dist) * maxStep;
  }
  const next = resolveMove(
    enemy.x,
    enemy.y,
    dx,
    dy,
    state.playerHalfExtent,
    state.collisions,
    state.walkableBounds,
  );
  enemy.x = next.x;
  enemy.y = next.y;
  return distance(enemy.x, enemy.y, targetX, targetY) <= ARRIVE_DISTANCE;
}
