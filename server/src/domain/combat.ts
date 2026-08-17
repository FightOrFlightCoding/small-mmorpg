import { dict } from "./maps";
import type { MatchEnemy, MatchPlayer, StarterZoneState } from "./match_state";
import { equipmentModifiersFromGear, emptyModifierMap, evaluateStats, resourceIdForRole } from "./stats";

export const PLAYER_RESPAWN_DELAY_SEC = 3;
export const NEVER_ATTACKED_TICK = -1;

export interface CombatEvent {
  type: "hit" | "heal" | "death" | "respawn" | "interrupt" | "effect_applied" | "effect_tick" | "resource" | "threat" | "credit" | "message";
  sourceId: string;
  sourceKind: "player" | "enemy";
  targetId: string;
  targetKind: "player" | "enemy";
  damage?: number;
  healing?: number;
  remainingHealth?: number;
  x?: number;
  y?: number;
  respawnDelaySec?: number;
  interruptReason?: string;
  effectId?: string;
  abilityId?: string;
  resourceId?: string;
  resourceDelta?: number;
  message?: string;
}

export function applyDamageAmount(health: number, amount: number): number {
  let remaining = health - amount;
  if (remaining < 0) {
    remaining = 0;
  }
  return remaining;
}

export function applyHealAmount(health: number, maxHealth: number, amount: number): number {
  let remaining = health + amount;
  if (remaining > maxHealth) {
    remaining = maxHealth;
  }
  return remaining;
}

export interface PlayerAttackInput {
  player: MatchPlayer | undefined;
  targetId: string;
  requestId: string;
  tick: number;
  enemies: MatchEnemy[];
  attack: number;
  attackRange: number;
  attackCooldownSec: number;
  tickRate: number;
  match?: StarterZoneState;
}

export interface PlayerAttackDecision {
  ok: boolean;
  code: string;
  replay: boolean;
}

export function cooldownTicks(seconds: number, tickRate: number): number {
  return Math.round(seconds * tickRate);
}

export function isCooldownReady(lastTick: number, tick: number, ticks: number): boolean {
  if (lastTick === NEVER_ATTACKED_TICK) {
    return true;
  }
  return tick - lastTick >= ticks;
}

export function findEnemy(enemies: ReadonlyArray<MatchEnemy>, targetId: string): MatchEnemy | null {
  const wanted = String(targetId);
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (String(enemy.id) === wanted || String(enemy.enemyId) === wanted) {
      return enemy;
    }
  }
  return null;
}

export function killEnemy(
  enemy: MatchEnemy,
  tick: number,
  sourceId: string,
  tickRate: number,
  events: CombatEvent[],
): void {
  if (enemy.aiState === "dead" && enemy.health <= 0) {
    return;
  }
  enemy.health = 0;
  enemy.aiState = "dead";
  enemy.aggroTarget = "";
  enemy.deadUntilTick = tick + cooldownTicks(enemy.respawnDelaySec, tickRate);
  enemy.deathCount = (enemy.deathCount !== undefined ? enemy.deathCount : 0) + 1;
  enemy.effects = [];
  events.push({
    type: "death",
    sourceId: sourceId,
    sourceKind: "player",
    targetId: enemy.id,
    targetKind: "enemy",
    remainingHealth: 0,
    x: enemy.x,
    y: enemy.y,
    respawnDelaySec: enemy.respawnDelaySec,
  });
}

export function killPlayer(
  player: MatchPlayer,
  tick: number,
  sourceId: string,
  respawnDelaySec: number,
  tickRate: number,
  events: CombatEvent[],
  sourceKind: "player" | "enemy" = "enemy",
): void {
  player.health = 0;
  player.axisX = 0;
  player.axisY = 0;
  player.deadUntilTick = tick + cooldownTicks(respawnDelaySec, tickRate);
  if (player.activeCast !== undefined && player.activeCast.interruptReason === "") {
    events.push({
      type: "interrupt",
      sourceId: sourceId,
      sourceKind: sourceKind,
      targetId: player.userId,
      targetKind: "player",
      interruptReason: "death",
      abilityId: player.activeCast.abilityId,
      remainingHealth: 0,
      x: player.x,
      y: player.y,
    });
    player.activeCast = undefined;
  }
  player.effects = [];
  events.push({
    type: "death",
    sourceId: sourceId,
    sourceKind: sourceKind,
    targetId: player.userId,
    targetKind: "player",
    remainingHealth: 0,
    x: player.x,
    y: player.y,
    respawnDelaySec: respawnDelaySec,
  });
}

export function rememberAttack(player: MatchPlayer, requestId: string, code: string, ok: boolean): void {
  player.lastAttackRequestId = requestId;
  player.lastAttackResultCode = code;
  player.lastAttackResultOk = ok;
}

export function respawnDestination(state: StarterZoneState, player: MatchPlayer): { x: number; y: number } {
  if (typeof player.bindX === "number" && isFinite(player.bindX) && typeof player.bindY === "number" && isFinite(player.bindY)) {
    return { x: player.bindX, y: player.bindY };
  }
  return { x: state.playerSpawnX, y: state.playerSpawnY };
}

export function restoreRespawnVitals(state: StarterZoneState, player: MatchPlayer): void {
  player.health = player.maxHealth;
  if (state.progressionCatalog === undefined || player.classId === undefined || player.progression === undefined) {
    return;
  }
  const manaId = resourceIdForRole(state.progressionCatalog, "mana");
  if (manaId.length === 0) {
    return;
  }
  const evaluated = evaluateStats(state.progressionCatalog, {
    classId: player.classId,
    level: player.progression.level,
    allocatedAttributes: player.progression.allocatedAttributes,
    equipmentModifiers: equipmentModifiersFromGear(player.equipment, player.inventory, state.itemsById),
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  const resources = dict(player.resources);
  resources[manaId] = evaluated.maxMana;
  player.resources = resources;
}
