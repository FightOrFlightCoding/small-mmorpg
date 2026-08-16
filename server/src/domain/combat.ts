import { distance } from "./movement";
import type { MatchEnemy, MatchPlayer } from "./match_state";

export const PLAYER_RESPAWN_DELAY_SEC = 3;
export const NEVER_ATTACKED_TICK = -1;

export interface CombatEvent {
  type: "hit" | "heal" | "death" | "respawn" | "interrupt" | "effect_applied" | "effect_tick" | "resource";
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

export function applyPlayerAttack(input: PlayerAttackInput, events: CombatEvent[]): PlayerAttackDecision {
  const player = input.player;
  if (player === undefined) {
    return { ok: false, code: "player_missing", replay: false };
  }
  if (player.lastAttackRequestId === input.requestId && player.lastAttackRequestId !== "") {
    return {
      ok: player.lastAttackResultOk === true,
      code: player.lastAttackResultCode !== undefined && player.lastAttackResultCode !== ""
        ? player.lastAttackResultCode
        : "ok",
      replay: true,
    };
  }
  if (player.health <= 0) {
    rememberAttack(player, input.requestId, "player_dead", false);
    return { ok: false, code: "player_dead", replay: false };
  }
  const enemy = findEnemy(input.enemies, input.targetId);
  if (enemy === null) {
    rememberAttack(player, input.requestId, "invalid_target", false);
    return { ok: false, code: "invalid_target", replay: false };
  }
  if (enemy.health <= 0 || enemy.aiState === "dead") {
    rememberAttack(player, input.requestId, "target_dead", false);
    return { ok: false, code: "target_dead", replay: false };
  }
  if (distance(player.x, player.y, enemy.x, enemy.y) > input.attackRange) {
    rememberAttack(player, input.requestId, "out_of_range", false);
    return { ok: false, code: "out_of_range", replay: false };
  }
  const ticks = cooldownTicks(input.attackCooldownSec, input.tickRate);
  const lastTick = player.lastAttackTick !== undefined ? player.lastAttackTick : NEVER_ATTACKED_TICK;
  if (!isCooldownReady(lastTick, input.tick, ticks)) {
    rememberAttack(player, input.requestId, "on_cooldown", false);
    return { ok: false, code: "on_cooldown", replay: false };
  }

  const damage = input.attack;
  let remaining = enemy.health - damage;
  if (remaining < 0) {
    remaining = 0;
  }
  enemy.health = remaining;
  player.lastAttackTick = input.tick;
  events.push({
    type: "hit",
    sourceId: player.userId,
    sourceKind: "player",
    targetId: enemy.id,
    targetKind: "enemy",
    damage: damage,
    remainingHealth: remaining,
    x: enemy.x,
    y: enemy.y,
  });
  if (remaining <= 0) {
    killEnemy(enemy, input.tick, player.userId, input.tickRate, events);
  }
  rememberAttack(player, input.requestId, "ok", true);
  return { ok: true, code: "ok", replay: false };
}

export function killEnemy(
  enemy: MatchEnemy,
  tick: number,
  sourceId: string,
  tickRate: number,
  events: CombatEvent[],
): void {
  enemy.health = 0;
  enemy.aiState = "dead";
  enemy.aggroTarget = "";
  enemy.deadUntilTick = tick + cooldownTicks(enemy.respawnDelaySec, tickRate);
  enemy.deathCount = (enemy.deathCount !== undefined ? enemy.deathCount : 0) + 1;
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
): void {
  player.health = 0;
  player.axisX = 0;
  player.axisY = 0;
  player.deadUntilTick = tick + cooldownTicks(respawnDelaySec, tickRate);
  events.push({
    type: "death",
    sourceId: sourceId,
    sourceKind: "enemy",
    targetId: player.userId,
    targetKind: "player",
    remainingHealth: 0,
    x: player.x,
    y: player.y,
    respawnDelaySec: respawnDelaySec,
  });
}

function rememberAttack(player: MatchPlayer, requestId: string, code: string, ok: boolean): void {
  player.lastAttackRequestId = requestId;
  player.lastAttackResultCode = code;
  player.lastAttackResultOk = ok;
}
