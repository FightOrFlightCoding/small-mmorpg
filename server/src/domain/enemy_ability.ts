import { cooldownTicks, isCooldownReady, NEVER_ATTACKED_TICK, type CombatEvent } from "./combat";
import {
  applyEffectDefinition,
  playerAsTarget,
  writeTarget,
} from "./effects";
import { dict } from "./maps";
import { distance } from "./movement";
import type { MatchEnemy, MatchPlayer, StarterZoneState } from "./match_state";
import type { AbilityDefinition } from "./ability";

export function tryEnemyAbility(
  state: StarterZoneState,
  enemy: MatchEnemy,
  target: MatchPlayer,
  tick: number,
  tickRate: number,
  events: CombatEvent[],
): boolean {
  const definition = pickReadyAbility(state, enemy, target, tick, tickRate);
  if (definition === null) {
    return false;
  }
  const castTicks = cooldownTicks(definition.castTime, tickRate);
  startCooldowns(enemy, definition, tick, tickRate);
  enemy.lastAttackTick = tick;
  if (castTicks > 0) {
    enemy.activeCast = {
      abilityId: definition.id,
      casterId: enemy.id,
      targetId: target.userId,
      targetX: target.x,
      targetY: target.y,
      startTick: tick,
      completionTick: tick + castTicks,
      channelUntilTick: 0,
      phase: "casting",
      interruptReason: "",
      requestId: "enemy:" + enemy.id + ":" + String(tick),
    };
    enemy.aiState = "casting";
    return true;
  }
  applyEnemyAbility(state, enemy, definition, target, tick, events);
  return true;
}

export function tickEnemyCasts(
  state: StarterZoneState,
  tick: number,
  _tickRate: number,
  events: CombatEvent[],
): void {
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    const cast = enemy.activeCast;
    if (cast === undefined || cast.interruptReason !== "") {
      continue;
    }
    if (tick < cast.completionTick) {
      enemy.aiState = "casting";
      continue;
    }
    const definition = state.abilitiesById !== undefined ? state.abilitiesById[cast.abilityId] : undefined;
    const target = dict(state.players)[cast.targetId];
    enemy.activeCast = undefined;
    if (definition === undefined || target === undefined || target.health <= 0 || enemy.health <= 0) {
      continue;
    }
    applyEnemyAbility(state, enemy, definition, target, tick, events);
  }
}

export function interruptEnemyCast(enemy: MatchEnemy, reason: string, _tick: number, events: CombatEvent[]): void {
  if (enemy.activeCast === undefined || enemy.activeCast.interruptReason !== "") {
    return;
  }
  events.push({
    type: "interrupt",
    sourceId: enemy.id,
    sourceKind: "enemy",
    targetId: enemy.id,
    targetKind: "enemy",
    interruptReason: reason,
    abilityId: enemy.activeCast.abilityId,
    remainingHealth: enemy.health,
    x: enemy.x,
    y: enemy.y,
  });
  enemy.activeCast.interruptReason = reason;
  enemy.activeCast = undefined;
}

function pickReadyAbility(
  state: StarterZoneState,
  enemy: MatchEnemy,
  target: MatchPlayer,
  tick: number,
  tickRate: number,
): AbilityDefinition | null {
  const loadout = enemy.abilityLoadout !== undefined ? enemy.abilityLoadout : [];
  const catalog = state.abilitiesById;
  if (catalog === undefined || loadout.length === 0) {
    return null;
  }
  const range = distance(enemy.x, enemy.y, target.x, target.y);
  for (let i = 0; i < loadout.length; i++) {
    const definition = catalog[loadout[i]];
    if (definition === undefined) {
      continue;
    }
    if (range > definition.range) {
      continue;
    }
    if (!abilityReady(enemy, definition, tick, tickRate)) {
      continue;
    }
    return definition;
  }
  return null;
}

function abilityReady(enemy: MatchEnemy, definition: AbilityDefinition, tick: number, tickRate: number): boolean {
  const cooldowns = dict(enemy.abilityCooldowns);
  const readyAt = cooldowns[definition.id] !== undefined ? cooldowns[definition.id] : NEVER_ATTACKED_TICK;
  if (readyAt > NEVER_ATTACKED_TICK && tick < readyAt) {
    return false;
  }
  const gcd = enemy.globalCooldownUntilTick !== undefined ? enemy.globalCooldownUntilTick : 0;
  if (tick < gcd) {
    return false;
  }
  const autoTicks = cooldownTicks(enemy.attackCooldownSec, tickRate);
  if (!isCooldownReady(enemy.lastAttackTick !== undefined ? enemy.lastAttackTick : NEVER_ATTACKED_TICK, tick, autoTicks) && definition.individualCooldown <= 0) {
    return false;
  }
  return true;
}

function startCooldowns(enemy: MatchEnemy, definition: AbilityDefinition, tick: number, tickRate: number): void {
  const cooldowns = dict(enemy.abilityCooldowns);
  const icd = cooldownTicks(definition.individualCooldown, tickRate);
  if (icd > 0) {
    cooldowns[definition.id] = tick + icd;
  }
  enemy.abilityCooldowns = cooldowns;
  const gcd = cooldownTicks(definition.globalCooldown, tickRate);
  if (gcd > 0) {
    enemy.globalCooldownUntilTick = tick + gcd;
  }
}

function applyEnemyAbility(
  state: StarterZoneState,
  enemy: MatchEnemy,
  definition: AbilityDefinition,
  target: MatchPlayer,
  tick: number,
  events: CombatEvent[],
): void {
  const effectTarget = playerAsTarget(target);
  for (let e = 0; e < definition.effects.length; e++) {
    applyEffectDefinition(
      state,
      definition.effects[e],
      definition.id,
      { id: enemy.id, kind: "enemy" },
      effectTarget,
      null,
      enemy.damage,
      tick,
      events,
    );
    writeTarget(state, effectTarget);
  }
}
