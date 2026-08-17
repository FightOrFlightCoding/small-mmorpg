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
import { maybeResetBoss, tickBossPhases } from "./boss";
import { interruptEnemyCast, tickEnemyCasts, tryEnemyAbility } from "./enemy_ability";
import { despawnSpawn, resetEnemyToSpawn, respawnExistingIfDue, tickRespawns } from "./spawn_controller";
import {
  clearThreat,
  profileForEnemy,
  selectThreatTarget,
  type AiProfileContent,
} from "./threat";
import { dict } from "./maps";

export const EnemyAiState = {
  Idle: "idle",
  Acquiring: "acquiring",
  Chasing: "chasing",
  Positioning: "positioning",
  Casting: "casting",
  Attacking: "attacking",
  Returning: "returning",
  Stunned: "stunned",
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
  tickEnemyCasts(state, tick, tickRate, events);
  tickRespawns(state, tick, events, dict(state.enemiesById));
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
  if (respawnExistingIfDue(enemy, tick, events)) {
    return;
  }
  if (enemy.aiState === EnemyAiState.Dead || enemy.health <= 0) {
    enemy.aiState = EnemyAiState.Dead;
    return;
  }
  if (hasControlTag(enemy.effects, "stun")) {
    interruptEnemyCast(enemy, "stun", tick, events);
    enemy.aiState = EnemyAiState.Stunned;
    return;
  }
  const profile = profileForEnemy(state, enemy);
  if (maybeResetBoss(state, enemy, events)) {
    enemy.aiState = EnemyAiState.Idle;
    return;
  }
  tickBossPhases(state, enemy, tick, tickRate, events);

  const fromSpawn = distance(enemy.x, enemy.y, enemy.spawnX, enemy.spawnY);
  if (enemy.aiState === EnemyAiState.Returning || fromSpawn > enemy.leashRadius) {
    returnToSpawn(state, enemy, profile, dt, events);
    return;
  }

  if (enemy.activeCast !== undefined && enemy.activeCast.interruptReason === "") {
    enemy.aiState = EnemyAiState.Casting;
    return;
  }

  const targetId = selectThreatTarget(state, enemy, profile);
  enemy.aggroTarget = targetId;
  if (targetId === "") {
    enemy.aiState = EnemyAiState.Idle;
    return;
  }
  if (enemy.combatEnteredTick === undefined || enemy.combatEnteredTick <= 0) {
    enemy.combatEnteredTick = tick;
  }
  const target = state.players[targetId];
  const range = distance(enemy.x, enemy.y, target.x, target.y);
  const preferred = profile.preferredRange > 0 ? profile.preferredRange : enemy.attackRange;
  if (profile.style === "ranged" || profile.style === "caster") {
    stepRangedOrCaster(state, enemy, target, profile, range, preferred, tick, dt, tickRate, events);
    return;
  }
  if (range <= enemy.attackRange) {
    enemy.aiState = EnemyAiState.Attacking;
    tryAttack(state, enemy, target, tick, tickRate, events);
    return;
  }
  if (hasControlTag(enemy.effects, "root")) {
    enemy.aiState = EnemyAiState.Idle;
    return;
  }
  enemy.aiState = EnemyAiState.Chasing;
  moveToward(enemy, target.x, target.y, dt, state);
}

function stepRangedOrCaster(
  state: StarterZoneState,
  enemy: MatchEnemy,
  target: MatchPlayer,
  profile: AiProfileContent,
  range: number,
  preferred: number,
  tick: number,
  dt: number,
  tickRate: number,
  events: CombatEvent[],
): void {
  if (profile.kiteRange > 0 && range < profile.kiteRange) {
    if (hasControlTag(enemy.effects, "root")) {
      enemy.aiState = EnemyAiState.Idle;
      return;
    }
    enemy.aiState = EnemyAiState.Positioning;
    const dx = enemy.x - target.x;
    const dy = enemy.y - target.y;
    moveToward(enemy, enemy.x + dx, enemy.y + dy, dt, state);
    return;
  }
  if (range <= preferred || range <= enemy.attackRange) {
    enemy.aiState = EnemyAiState.Attacking;
    tryAttack(state, enemy, target, tick, tickRate, events);
    return;
  }
  if (hasControlTag(enemy.effects, "root")) {
    enemy.aiState = EnemyAiState.Idle;
    return;
  }
  enemy.aiState = EnemyAiState.Chasing;
  moveToward(enemy, target.x, target.y, dt, state);
}

function tryAttack(
  state: StarterZoneState,
  enemy: MatchEnemy,
  target: MatchPlayer,
  tick: number,
  tickRate: number,
  events: CombatEvent[],
): void {
  if (tryEnemyAbility(state, enemy, target, tick, tickRate, events)) {
    return;
  }
  tryEnemyAutoAttack(state, enemy, target, tick, tickRate, events);
}

function tryEnemyAutoAttack(
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

function returnToSpawn(
  state: StarterZoneState,
  enemy: MatchEnemy,
  profile: AiProfileContent,
  dt: number,
  events: CombatEvent[],
): void {
  enemy.aiState = EnemyAiState.Returning;
  if (profile.resetThreatOnReturn) {
    clearThreat(enemy);
  } else {
    enemy.aggroTarget = "";
  }
  interruptEnemyCast(enemy, "leash", 0, events);
  if (hasControlTag(enemy.effects, "root")) {
    return;
  }
  const arrived = moveToward(enemy, enemy.spawnX, enemy.spawnY, dt, state);
  if (!arrived) {
    return;
  }
  enemy.x = enemy.spawnX;
  enemy.y = enemy.spawnY;
  if (profile.style === "boss" || profile.resetHealthOnReturn) {
    const phases = Array.isArray(enemy.phases) ? enemy.phases : [];
    for (let p = 0; p < phases.length; p++) {
      const spawnId = phases[p].triggerSpawnId;
      if (spawnId !== undefined && spawnId.length > 0) {
        despawnSpawn(state, spawnId);
      }
    }
    resetEnemyToSpawn(enemy, true);
    return;
  }
  enemy.aiState = EnemyAiState.Idle;
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
