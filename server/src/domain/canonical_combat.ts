/**
 * Generic combat mechanics shared by every class.
 * Handlers subscribe by event type and mechanic kind. Do not branch on class ids here.
 */

import {
  CHANNEL_CRIT_DAMAGE,
  CHANNEL_OUTGOING,
  CHANNEL_TAKEN,
  collapseRankReplacements,
  evaluateCanonicalHit,
  formulaAttackInterval,
  formulaCastTime,
  productOfPctModifiers,
  scalePower,
  sumOfAddModifiers,
  type CanonicalHitResult,
  type CanonicalModifier,
  type PowerCategory,
} from "./canonical_stats";
import {
  createCombatEventBus,
  type CanonicalCombatEvent,
  type CombatEventBus,
  type CombatHandler,
  type CombatOriginTag,
} from "./combat_events";
import type { CombatRandom } from "./combat_rng";
import { asRandomFn } from "./combat_rng";

export const CHANNEL_COOLDOWN_RECOVERY = "cooldown_recovery";
export const CHANNEL_MANA_COST = "mana_cost";
export const CHANNEL_ATTACK_SPEED = "attack_speed";
export const CHANNEL_CAST_TIME = "cast_time";
export const CHANNEL_MOVE_SPEED = "movement_speed";
export const CHANNEL_CRIT_CHANCE = "crit_chance";
export const CHANNEL_FLAT_DR = "flat_damage_reduction";
export const CHANNEL_AUTO_ATTACK = "auto_attack";
export const CHANNEL_LIFESTEAL = "lifesteal";
export const CHANNEL_REFLECT = "reflect";

export const MECHANIC_KINDS = [
  "direct_melee_damage",
  "direct_ranged_damage",
  "direct_spell_damage",
  "direct_healing",
  "shield_absorb",
  "periodic_damage",
  "periodic_healing",
  "taunt",
  "threat_override",
  "interrupt",
  "stun",
  "root",
  "slow",
  "movement_speed_modifier",
  "damage_dealt_modifier",
  "damage_taken_modifier",
  "flat_damage_reduction",
  "critical_chance_modifier",
  "critical_damage_modifier",
  "mana_cost_modifier",
  "mana_restoration",
  "cooldown_recovery_modifier",
  "attack_speed_modifier",
  "cast_time_modifier",
  "auto_attack_modifier",
  "reflect_damage",
  "lifesteal",
  "once_per_combat",
  "health_threshold",
  "target_health",
  "standing_still",
  "moving",
  "enemy_proximity",
  "controlled_enemy_count",
  "shield_break",
  "shield_expiry",
  "kill_event",
  "effect_propagation",
  "cooldown_reset",
  "forced_movement",
  "line_targeting",
  "cone_targeting",
  "radius_targeting",
  "delayed_ground_targeting",
  "independent_multi_hit",
] as const;

export type MechanicKind = (typeof MECHANIC_KINDS)[number];

export type CombatConditionId =
  | "health_threshold"
  | "target_health"
  | "standing_still"
  | "moving"
  | "enemy_proximity"
  | "controlled_enemy_count"
  | "in_combat";

export interface CombatConditionState {
  health: number;
  maxHealth: number;
  targetHealth?: number;
  targetMaxHealth?: number;
  axisX: number;
  axisY: number;
  nearestEnemyDistance?: number;
  proximityRange?: number;
  controlledEnemyCount?: number;
  requiredControlled?: number;
  healthThreshold?: number;
  targetHealthThreshold?: number;
  inCombat?: boolean;
}

export interface ConditionalModifier extends CanonicalModifier {
  condition?: CombatConditionId;
}

export interface DirectHitRequest {
  base: number;
  category: PowerCategory;
  stats: { [id: string]: number };
  critChance: number;
  critMult: number;
  outgoingProduct: number;
  damageReduction: number;
  takenProduct: number;
  critDamageProduct: number;
  bonusCritChance?: number;
  guaranteedCrit?: boolean;
  isDot?: boolean;
  isShield?: boolean;
  shieldCanCrit?: boolean;
  random: CombatRandom;
  originTag?: CombatOriginTag;
  isReflection?: boolean;
  allowReflectCrit?: boolean;
}

export interface IndependentHit {
  index: number;
  result: CanonicalHitResult;
}

export interface DelayedGroundEffect {
  id: string;
  sourceId: string;
  sourceKind: "player" | "enemy";
  abilityId: string;
  x: number;
  y: number;
  radius: number;
  resolveTick: number;
  effectId: string;
  originTag?: CombatOriginTag;
}

export interface OncePerCombatTable {
  [id: string]: boolean;
}

export function mechanicKindCount(): number {
  return MECHANIC_KINDS.length;
}

export function hasMechanicKind(kind: string): boolean {
  for (let i = 0; i < MECHANIC_KINDS.length; i++) {
    if (MECHANIC_KINDS[i] === kind) {
      return true;
    }
  }
  return false;
}

export function conditionHolds(id: CombatConditionId, state: CombatConditionState): boolean {
  if (id === "standing_still") {
    return state.axisX === 0 && state.axisY === 0;
  }
  if (id === "moving") {
    return state.axisX !== 0 || state.axisY !== 0;
  }
  if (id === "in_combat") {
    return state.inCombat === true;
  }
  if (id === "health_threshold") {
    const threshold = numberOr(state.healthThreshold, 0);
    const max = state.maxHealth > 0 ? state.maxHealth : 1;
    return state.health / max <= threshold;
  }
  if (id === "target_health") {
    const threshold = numberOr(state.targetHealthThreshold, 0);
    const current = numberOr(state.targetHealth, 0);
    const max = numberOr(state.targetMaxHealth, 1);
    const denom = max > 0 ? max : 1;
    return current / denom <= threshold;
  }
  if (id === "enemy_proximity") {
    const range = numberOr(state.proximityRange, 0);
    const distance = numberOr(state.nearestEnemyDistance, range + 1);
    return distance <= range;
  }
  if (id === "controlled_enemy_count") {
    return numberOr(state.controlledEnemyCount, 0) >= numberOr(state.requiredControlled, 1);
  }
  return false;
}

export function activeConditionalModifiers(
  modifiers: ReadonlyArray<ConditionalModifier>,
  state: CombatConditionState,
): CanonicalModifier[] {
  const active: CanonicalModifier[] = [];
  for (let i = 0; i < modifiers.length; i++) {
    const modifier = modifiers[i];
    if (modifier.condition !== undefined && !conditionHolds(modifier.condition, state)) {
      continue;
    }
    active.push(modifier);
  }
  return collapseRankReplacements(active);
}

export function cooldownRecoveryRate(modifiers: ReadonlyArray<CanonicalModifier>): number {
  const rate = 1 + sumOfAddModifiers(modifiers, CHANNEL_COOLDOWN_RECOVERY);
  if (!(rate > 0) || !isFinite(rate)) {
    return 1;
  }
  return rate;
}

export function advanceCooldownRemaining(remainingTicks: number, recoveryRate: number, dtTicks: number): number {
  const remaining = numberOr(remainingTicks, 0);
  const rate = numberOr(recoveryRate, 1);
  const dt = numberOr(dtTicks, 0);
  const next = remaining - rate * dt;
  return next > 0 ? next : 0;
}

export function hasteDoesNotChangeCooldown(remainingTicks: number, _hasteMult: number): number {
  return remainingTicks;
}

export function hasteScaledCastTime(baseCastTime: number, hasteMult: number, castTimeProduct: number): number {
  const extra = castTimeProduct > 0 ? castTimeProduct : 1;
  return formulaCastTime(baseCastTime, hasteMult) / extra;
}

export function hasteScaledAttackInterval(weaponBase: number, hasteMult: number, attackSpeedProduct: number): number {
  const extra = attackSpeedProduct > 0 ? attackSpeedProduct : 1;
  return formulaAttackInterval(weaponBase, hasteMult) / extra;
}

export function manaCostMultiplier(modifiers: ReadonlyArray<CanonicalModifier>): number {
  const product = productOfPctModifiers(modifiers, CHANNEL_MANA_COST);
  return product > 0 ? product : 0;
}

export function scaledManaCost(baseCost: number, modifiers: ReadonlyArray<CanonicalModifier>): number {
  const scaled = numberOr(baseCost, 0) * manaCostMultiplier(modifiers);
  return scaled > 0 ? scaled : 0;
}

export function movementSpeedMultiplier(modifiers: ReadonlyArray<CanonicalModifier>, slowMagnitude: number): number {
  const pct = productOfPctModifiers(modifiers, CHANNEL_MOVE_SPEED);
  const slow = 1 + numberOr(slowMagnitude, 0);
  const combined = pct * slow;
  return combined > 0 ? combined : 0;
}

export function bonusCritChance(modifiers: ReadonlyArray<CanonicalModifier>): number {
  return sumOfAddModifiers(modifiers, CHANNEL_CRIT_CHANCE);
}

export function flatDamageReduction(modifiers: ReadonlyArray<CanonicalModifier>): number {
  const added = sumOfAddModifiers(modifiers, CHANNEL_FLAT_DR);
  if (added < 0) {
    return 0;
  }
  if (added > 0.95) {
    return 0.95;
  }
  return added;
}

export function autoAttackBase(base: number, modifiers: ReadonlyArray<CanonicalModifier>): number {
  return numberOr(base, 0) * productOfPctModifiers(modifiers, CHANNEL_AUTO_ATTACK);
}

export function lifestealFraction(modifiers: ReadonlyArray<CanonicalModifier>): number {
  const value = sumOfAddModifiers(modifiers, CHANNEL_LIFESTEAL);
  return value > 0 ? value : 0;
}

export function reflectFraction(modifiers: ReadonlyArray<CanonicalModifier>): number {
  const value = sumOfAddModifiers(modifiers, CHANNEL_REFLECT);
  return value > 0 ? value : 0;
}

export function evaluateDirectHit(request: DirectHitRequest): CanonicalHitResult {
  const reflectionBlocksCrit = request.isReflection === true && request.allowReflectCrit !== true;
  return evaluateCanonicalHit({
    base: request.base,
    category: request.category,
    stats: request.stats,
    critChance: request.critChance,
    critMult: request.critMult,
    outgoingProduct: request.outgoingProduct,
    damageReduction: request.damageReduction + 0,
    takenProduct: request.takenProduct,
    critDamageProduct: request.critDamageProduct,
    guaranteedCrit: reflectionBlocksCrit ? false : request.guaranteedCrit,
    bonusCritChance: reflectionBlocksCrit ? 0 : request.bonusCritChance,
    isDot: request.isDot === true,
    isShield: request.isShield === true,
    shieldCanCrit: request.shieldCanCrit === true,
    random: asRandomFn(request.random),
  });
}

export function evaluatePowerHit(
  category: PowerCategory,
  request: Omit<DirectHitRequest, "category">,
): CanonicalHitResult {
  return evaluateDirectHit({
    base: request.base,
    category: category,
    stats: request.stats,
    critChance: request.critChance,
    critMult: request.critMult,
    outgoingProduct: request.outgoingProduct,
    damageReduction: request.damageReduction,
    takenProduct: request.takenProduct,
    critDamageProduct: request.critDamageProduct,
    bonusCritChance: request.bonusCritChance,
    guaranteedCrit: request.guaranteedCrit,
    isDot: request.isDot,
    isShield: request.isShield,
    shieldCanCrit: request.shieldCanCrit,
    random: request.random,
    originTag: request.originTag,
    isReflection: request.isReflection,
    allowReflectCrit: request.allowReflectCrit,
  });
}

export function resolveIndependentHits(
  hitCount: number,
  request: DirectHitRequest,
): IndependentHit[] {
  const count = Math.floor(numberOr(hitCount, 0));
  const hits: IndependentHit[] = [];
  const safeCount = count > 0 ? count : 0;
  for (let i = 0; i < safeCount; i++) {
    hits.push({
      index: i,
      result: evaluateDirectHit(request),
    });
  }
  return hits;
}

export function canReflect(event: CanonicalCombatEvent): boolean {
  if (event.type !== "damage_taken" && event.type !== "damage_dealt") {
    return false;
  }
  if (event.isReflection === true || event.originTag === "reflect") {
    return false;
  }
  if (event.isDot === true) {
    return false;
  }
  return true;
}

export function reflectedDamageAmount(incoming: number, fraction: number, allowCrit: boolean, crit: boolean): number {
  const base = numberOr(incoming, 0) * numberOr(fraction, 0);
  if (allowCrit !== true && crit === true) {
    return base;
  }
  return base > 0 ? base : 0;
}

export function canPropagateHeal(event: CanonicalCombatEvent): boolean {
  if (event.type !== "healing_dealt") {
    return false;
  }
  if (event.originTag === "overflow" || event.originTag === "propagation") {
    return false;
  }
  return event.sourceId !== event.targetId;
}

export function secondaryHealAmount(primary: number, fraction: number): number {
  const amount = numberOr(primary, 0) * numberOr(fraction, 0);
  return amount > 0 ? amount : 0;
}

export function tryConsumeOncePerCombat(table: OncePerCombatTable, id: string): boolean {
  if (id.length === 0) {
    return false;
  }
  if (table[id] === true) {
    return false;
  }
  table[id] = true;
  return true;
}

export function resetOncePerCombat(table: OncePerCombatTable): void {
  const keys = Object.keys(table);
  for (let i = 0; i < keys.length; i++) {
    delete table[keys[i]];
  }
}

export function resetAbilityCooldown(cooldowns: { [abilityId: string]: number }, abilityId: string, tick: number): boolean {
  if (abilityId.length === 0) {
    return false;
  }
  const ready = cooldowns[abilityId];
  if (ready === undefined || ready <= tick) {
    return false;
  }
  cooldowns[abilityId] = tick;
  return true;
}

export function scheduleDelayedGround(
  pending: DelayedGroundEffect[],
  effect: DelayedGroundEffect,
): DelayedGroundEffect[] {
  const next: DelayedGroundEffect[] = [];
  for (let i = 0; i < pending.length; i++) {
    next.push(pending[i]);
  }
  next.push(effect);
  return next;
}

export function dueDelayedGround(pending: DelayedGroundEffect[], tick: number): {
  due: DelayedGroundEffect[];
  remaining: DelayedGroundEffect[];
} {
  const due: DelayedGroundEffect[] = [];
  const remaining: DelayedGroundEffect[] = [];
  for (let i = 0; i < pending.length; i++) {
    if (pending[i].resolveTick <= tick) {
      due.push(pending[i]);
    } else {
      remaining.push(pending[i]);
    }
  }
  return { due: due, remaining: remaining };
}

export function outgoingProduct(modifiers: ReadonlyArray<CanonicalModifier>): number {
  return productOfPctModifiers(modifiers, CHANNEL_OUTGOING);
}

export function takenProduct(modifiers: ReadonlyArray<CanonicalModifier>): number {
  return productOfPctModifiers(modifiers, CHANNEL_TAKEN);
}

export function critDamageProduct(modifiers: ReadonlyArray<CanonicalModifier>): number {
  return productOfPctModifiers(modifiers, CHANNEL_CRIT_DAMAGE);
}

export function attackSpeedProduct(modifiers: ReadonlyArray<CanonicalModifier>): number {
  const product = productOfPctModifiers(modifiers, CHANNEL_ATTACK_SPEED);
  return product > 0 ? product : 1;
}

export function castTimeProduct(modifiers: ReadonlyArray<CanonicalModifier>): number {
  const product = productOfPctModifiers(modifiers, CHANNEL_CAST_TIME);
  return product > 0 ? product : 1;
}

export function snapshotPower(base: number, category: PowerCategory, stats: { [id: string]: number }): number {
  return scalePower(base, category, stats);
}

export function originTagOrPrimary(tag: CombatOriginTag | undefined): CombatOriginTag {
  return tag !== undefined ? tag : "primary";
}

export function createGenericCombatBus(extra?: ReadonlyArray<CombatHandler>): CombatEventBus {
  const handlers = defaultMechanicHandlers();
  if (extra !== undefined) {
    for (let i = 0; i < extra.length; i++) {
      handlers.push(extra[i]);
    }
  }
  return createCombatEventBus(handlers);
}

export function defaultMechanicHandlers(): CombatHandler[] {
  const handlers: CombatHandler[] = [];
  for (let i = 0; i < MECHANIC_KINDS.length; i++) {
    handlers.push(stubHandler(MECHANIC_KINDS[i]));
  }
  return handlers;
}

export function reflectDamageHandler(fraction: number, allowCrit: boolean): CombatHandler {
  return {
    id: "reflect_damage",
    events: ["damage_taken"],
    handle: function (ctx, event): void {
      if (!canReflect(event)) {
        return;
      }
      const incoming = numberOr(event.amount, 0);
      const amount = reflectedDamageAmount(incoming, fraction, allowCrit, event.crit === true);
      if (!(amount > 0)) {
        return;
      }
      ctx.emit({
        type: "damage_dealt",
        tick: ctx.tick,
        sourceId: event.targetId,
        sourceKind: event.targetKind,
        targetId: event.sourceId,
        targetKind: event.sourceKind,
        amount: amount,
        abilityId: event.abilityId,
        originTag: "reflect",
        originalSourceId: event.sourceId,
        reflectorId: event.targetId,
        isReflection: true,
        crit: false,
      });
    },
  };
}

export function lifestealHandler(fraction: number): CombatHandler {
  return {
    id: "lifesteal",
    events: ["damage_dealt"],
    handle: function (ctx, event): void {
      if (event.originTag === "lifesteal" || event.originTag === "reflect" || event.isDot === true) {
        return;
      }
      const amount = secondaryHealAmount(numberOr(event.amount, 0), fraction);
      if (!(amount > 0)) {
        return;
      }
      ctx.emit({
        type: "healing_dealt",
        tick: ctx.tick,
        sourceId: event.sourceId,
        sourceKind: event.sourceKind,
        targetId: event.sourceId,
        targetKind: event.sourceKind,
        amount: amount,
        abilityId: event.abilityId,
        originTag: "lifesteal",
        originalSourceId: event.sourceId,
      });
    },
  };
}

export function overflowHealHandler(fraction: number): CombatHandler {
  return {
    id: "effect_propagation",
    events: ["healing_dealt"],
    handle: function (ctx, event): void {
      if (!canPropagateHeal(event)) {
        return;
      }
      const amount = secondaryHealAmount(numberOr(event.amount, 0), fraction);
      if (!(amount > 0)) {
        return;
      }
      ctx.emit({
        type: "healing_dealt",
        tick: ctx.tick,
        sourceId: event.sourceId,
        sourceKind: event.sourceKind,
        targetId: event.sourceId,
        targetKind: event.sourceKind,
        amount: amount,
        abilityId: event.abilityId,
        originTag: "overflow",
        originalSourceId: event.sourceId,
      });
    },
  };
}

function stubHandler(kind: MechanicKind): CombatHandler {
  return {
    id: kind,
    events: [],
    handle: function (_ctx, _event): void {
      return;
    },
  };
}

function numberOr(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !isFinite(value)) {
    return fallback;
  }
  return value;
}
