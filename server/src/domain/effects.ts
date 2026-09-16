import { cooldownTicks, type CombatEvent } from "./combat";
import { applyCombat } from "./combat_pipeline";
import { distance, SNAPSHOT_RATE_HZ } from "./movement";
import type { MatchEnemy, MatchPlayer, StarterZoneState } from "./match_state";
import { dict } from "./maps";
import { evaluateStats, playerStatContext, resourceIdForRole, type EvaluatedStats } from "./stats";
import { formulaDotTickInterval, formulaHeal, scalePower } from "./canonical_stats";
import { applyTaunt } from "./threat";
import { conditionalTalentModifierValue, passiveTalentModifierValue, resolveAbilityTalentModifiers } from "./talent_modifiers";

export const NEARBY_EFFECT_RADIUS = 80;

export type EffectType =
  | "direct_damage"
  | "direct_heal"
  | "resource_change"
  | "timed_stat_modifier"
  | "periodic_damage"
  | "periodic_heal"
  | "stun"
  | "root"
  | "slow"
  | "shield_absorb"
  | "taunt"
  | "interrupt"
  | "reflect"
  | "forced_movement"
  | "movement"
  | "cooldown_reset_on_kill"
  | "passive_stacker";

export type StackPolicy = "replace" | "refresh" | "stack" | "ignore";
export type RefreshPolicy = "refresh" | "extend" | "ignore";

export interface MagnitudeFormula {
  kind: "constant" | "stat_role" | "stat_id" | "percent_max_health";
  value?: number;
  role?: string;
  statId?: string;
  scale?: number;
}

export interface EffectDefinition {
  id: string;
  type: EffectType;
  source: "caster";
  target: "primary" | "area" | "self";
  magnitude: MagnitudeFormula;
  duration: number;
  tickInterval: number;
  stackPolicy: StackPolicy;
  maxStacks: number;
  refreshPolicy: RefreshPolicy;
  removalReason: string;
  tags: ReadonlyArray<string>;
  statChannel?: string;
  resourceRole?: string;
  powerCategory?: "melee" | "ranged" | "spell" | "curse" | "heal" | "shield";
  hitCount?: number;
  tickRateMultiplier?: number;
  nodeId?: string;
  rank?: number;
  guaranteedCrit?: boolean;
  cooldownResetOnKill?: boolean;
  movementKind?: string;
  movementDistance?: number;
  bonusCritChance?: number;
  delay?: number;
  conditions?: ReadonlyArray<{ type: string; relation?: string }>;
  healthPercent?: number;
  shieldBreakHealRatio?: number;
}

export interface ActiveEffect {
  effectId: string;
  abilityId: string;
  sourceId: string;
  sourceKind: "player" | "enemy";
  type: EffectType;
  stacks: number;
  magnitude: number;
  remainingTicks: number;
  tickIntervalTicks: number;
  nextTickAt: number;
  stackPolicy: StackPolicy;
  maxStacks: number;
  refreshPolicy: RefreshPolicy;
  tags: string[];
  statChannel: string;
  resourceRole: string;
  instanceId?: string;
  snapshotStats?: { [id: string]: number };
  totalRemaining?: number;
  ticksRemaining?: number;
  baseTickCount?: number;
  currentIntervalSec?: number;
  tickRateModifiers?: number;
  remainingAbsorb?: number;
  maxAbsorb?: number;
  terminalEventSent?: boolean;
  nodeId?: string;
  rank?: number;
  expiryTick?: number;
  shieldBreakHealRatio?: number;
}

export function resolveMagnitude(formula: MagnitudeFormula, stats: EvaluatedStats | null, fallbackAttack: number): number {
  const scale = finiteOr(formula.scale, 1);
  const bonus = finiteOr(formula.value, 0);
  const kind = String(formula.kind);
  if (kind === "constant") {
    return bonus;
  }
  if (kind === "stat_role") {
    const role = formula.role !== undefined && formula.role !== null ? String(formula.role) : "attack";
    let base = fallbackAttack;
    if (stats !== null) {
      if (role === "attack") {
        base = stats.attack > 0 ? stats.attack : fallbackAttack;
      } else if (role === "max_health") {
        base = stats.maxHealth > 0 ? stats.maxHealth : fallbackAttack;
      } else if (role === "max_mana") {
        base = stats.maxMana;
      }
    }
    return Math.max(0, Math.floor(base * scale + bonus));
  }
  if (kind === "percent_max_health") {
    const maxHealth = stats !== null ? stats.maxHealth : 0;
    const pct = scale !== 0 ? scale : bonus;
    return Math.max(0, Math.floor(maxHealth * pct));
  }
  if (kind === "stat_id" && formula.statId !== undefined && formula.statId !== null && stats !== null) {
    const value = stats.values[String(formula.statId)];
    const base = value !== undefined ? value : 0;
    return Math.max(0, Math.floor(base * scale + bonus));
  }
  return Math.max(0, Math.floor(fallbackAttack * scale + bonus));
}

export function shieldAbsorbFromSpirit(baseAbsorb: number, spirit: number): number {
  return formulaHeal(baseAbsorb, spirit);
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !isFinite(value)) {
    return fallback;
  }
  return value;
}

export function cloneActiveEffects(effects: ActiveEffect[] | null | undefined): ActiveEffect[] {
  const list: ActiveEffect[] = [];
  if (effects == null || !Array.isArray(effects)) {
    return list;
  }
  for (let i = 0; i < effects.length; i++) {
    list.push(cloneActiveEffect(effects[i]));
  }
  return list;
}

export function cloneActiveEffect(effect: ActiveEffect): ActiveEffect {
  const tags: string[] = [];
  for (let i = 0; i < effect.tags.length; i++) {
    tags.push(effect.tags[i]);
  }
  const cloned: ActiveEffect = {
    effectId: effect.effectId,
    abilityId: effect.abilityId,
    sourceId: effect.sourceId,
    sourceKind: effect.sourceKind,
    type: effect.type,
    stacks: effect.stacks,
    magnitude: effect.magnitude,
    remainingTicks: effect.remainingTicks,
    tickIntervalTicks: effect.tickIntervalTicks,
    nextTickAt: effect.nextTickAt,
    stackPolicy: effect.stackPolicy,
    maxStacks: effect.maxStacks,
    refreshPolicy: effect.refreshPolicy,
    tags: tags,
    statChannel: effect.statChannel,
    resourceRole: effect.resourceRole,
  };
  if (effect.instanceId !== undefined) {
    cloned.instanceId = effect.instanceId;
  }
  if (effect.snapshotStats !== undefined) {
    cloned.snapshotStats = copyNumberMap(effect.snapshotStats);
  }
  if (effect.totalRemaining !== undefined) {
    cloned.totalRemaining = effect.totalRemaining;
  }
  if (effect.ticksRemaining !== undefined) {
    cloned.ticksRemaining = effect.ticksRemaining;
  }
  if (effect.baseTickCount !== undefined) {
    cloned.baseTickCount = effect.baseTickCount;
  }
  if (effect.currentIntervalSec !== undefined) {
    cloned.currentIntervalSec = effect.currentIntervalSec;
  }
  if (effect.tickRateModifiers !== undefined) {
    cloned.tickRateModifiers = effect.tickRateModifiers;
  }
  if (effect.remainingAbsorb !== undefined) {
    cloned.remainingAbsorb = effect.remainingAbsorb;
  }
  if (effect.maxAbsorb !== undefined) {
    cloned.maxAbsorb = effect.maxAbsorb;
  }
  if (effect.terminalEventSent === true) {
    cloned.terminalEventSent = true;
  }
  if (effect.nodeId !== undefined) {
    cloned.nodeId = effect.nodeId;
  }
  if (effect.rank !== undefined) {
    cloned.rank = effect.rank;
  }
  if (effect.expiryTick !== undefined) {
    cloned.expiryTick = effect.expiryTick;
  }
  if (effect.shieldBreakHealRatio !== undefined) {
    cloned.shieldBreakHealRatio = effect.shieldBreakHealRatio;
  }
  return cloned;
}

function copyNumberMap(source: { [id: string]: number }): { [id: string]: number } {
  const next: { [id: string]: number } = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    next[keys[i]] = source[keys[i]];
  }
  return next;
}

export function hasControlTag(effects: ActiveEffect[] | undefined, tag: "stun" | "root"): boolean {
  if (effects == null || !Array.isArray(effects)) {
    return false;
  }
  for (let i = 0; i < effects.length; i++) {
    if (effects[i].type === tag && effects[i].remainingTicks > 0) {
      return true;
    }
  }
  return false;
}

export function ownedCrowdControlCount(
  enemies: ReadonlyArray<{
    health: number;
    effects?: ReadonlyArray<{ sourceId: string; remainingTicks: number; type: string; tags: ReadonlyArray<string> }>;
  }>,
  sourceId: string,
): number {
  let count = 0;
  const wanted = String(sourceId);
  for (let i = 0; i < enemies.length; i++) {
    if (!(enemies[i].health > 0)) {
      continue;
    }
    if (hasOwnedCrowdControl(enemies[i].effects, wanted)) {
      count += 1;
    }
  }
  return count;
}

function hasOwnedCrowdControl(
  effects: ReadonlyArray<{ sourceId: string; remainingTicks: number; type: string; tags: ReadonlyArray<string> }> | undefined,
  sourceId: string,
): boolean {
  if (effects === undefined) {
    return false;
  }
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (effect.remainingTicks <= 0 || String(effect.sourceId) !== sourceId) {
      continue;
    }
    if (effect.type === "slow" || effect.type === "root") {
      return true;
    }
    for (let t = 0; t < effect.tags.length; t++) {
      const tag = effect.tags[t];
      if (tag === "slow" || tag === "freeze" || tag === "root") {
        return true;
      }
    }
  }
  return false;
}

export function slowMagnitudeFrom(effects: ActiveEffect[] | undefined): number {
  if (effects == null || !Array.isArray(effects)) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (effect.remainingTicks <= 0) {
      continue;
    }
    if (effect.type === "slow" || (effect.type === "timed_stat_modifier" && effect.statChannel === "movement_speed")) {
      total += effect.magnitude * effect.stacks;
    }
  }
  return total;
}

export function effectModifiersFrom(effects: ActiveEffect[] | undefined): { [channel: string]: number } {
  const modifiers: { [channel: string]: number } = {};
  if (effects === undefined) {
    return modifiers;
  }
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (effect.remainingTicks <= 0) {
      continue;
    }
    if (effect.type === "slow") {
      const current = modifiers["movement_speed"] !== undefined ? modifiers["movement_speed"] : 0;
      modifiers["movement_speed"] = current + effect.magnitude * effect.stacks;
      continue;
    }
    if ((effect.type !== "timed_stat_modifier" && effect.type !== "passive_stacker") || effect.statChannel.length === 0) {
      continue;
    }
    const current = modifiers[effect.statChannel] !== undefined ? modifiers[effect.statChannel] : 0;
    modifiers[effect.statChannel] = current + effect.magnitude * effect.stacks;
  }
  return modifiers;
}

export interface EffectSource {
  id: string;
  kind: "player" | "enemy";
}

export function applyEffectDefinition(
  state: StarterZoneState,
  definition: EffectDefinition,
  abilityId: string,
  source: MatchPlayer | EffectSource,
  target: EffectTarget,
  stats: EvaluatedStats | null,
  fallbackAttack: number,
  tick: number,
  events: CombatEvent[],
): void {
  const actor = toEffectSource(source);
  const rank = isMatchPlayer(source) ? rankScale(source, abilityId) : 1;
  let working: EffectDefinition = definition;
  if (String(definition.type) === "shield") {
    working = { ...definition, type: "shield_absorb" };
  }
  let magnitude = (
    stats !== null && stats.canonical !== undefined && working.powerCategory !== undefined && working.healthPercent === undefined
      ? canonicalBaseMagnitude(working.magnitude, fallbackAttack)
      : resolveMagnitude(working.magnitude, stats, fallbackAttack)
  ) * rank;
  if (working.healthPercent !== undefined && working.healthPercent > 0) {
    magnitude = target.maxHealth * working.healthPercent;
    if (working.type === "direct_heal" && stats !== null && stats.canonical !== undefined && stats.canonical.healDoneProduct > 0) {
      magnitude *= stats.canonical.healDoneProduct;
    }
  } else if (
    (working.type === "periodic_damage" || working.type === "periodic_heal") &&
    stats !== null &&
    stats.canonical !== undefined &&
    working.powerCategory !== undefined
  ) {
    magnitude = scalePower(magnitude, working.powerCategory, stats.values);
  }
  if (isMatchPlayer(source) && source.progression !== undefined && state.progressionCatalog !== undefined) {
    if (working.type === "periodic_damage") {
      const festering = passiveTalentModifierValue(state.progressionCatalog, source.progression, "dot_tick_rate_percent");
      if (festering !== 0) {
        const extra = 1 + festering;
        working = {
          ...working,
          tickRateMultiplier: (working.tickRateMultiplier !== undefined && working.tickRateMultiplier > 0 ? working.tickRateMultiplier : 1) * extra,
        };
      }
    }
  }
  const haste = stats !== null && stats.hasteMult !== undefined ? stats.hasteMult : 1;
  const type = String(working.type);
  if (type === "guaranteed_crit") {
    return;
  }
  if (type === "direct_damage") {
    dealDamage(
      state,
      actor,
      target,
      magnitude,
      abilityId,
      tick,
      events,
      false,
      canonicalFormula(state, stats, working, source, target),
    );
    return;
  }
  if (type === "direct_heal") {
    healTarget(
      state,
      actor,
      target,
      magnitude,
      abilityId,
      tick,
      events,
      working.healthPercent !== undefined && working.healthPercent > 0
        ? undefined
        : canonicalFormula(state, stats, working, source, target),
    );
    return;
  }
  if (type === "propagate_effect") {
    return;
  }
  if (type === "resource_change") {
    changeResource(state, target, working, magnitude, actor, tick, events);
    return;
  }
  if (type === "interrupt") {
    interruptLiveCast(state, target, actor, tick, events);
    return;
  }
  if (type === "taunt" && target.kind === "enemy") {
    const enemy = findEnemyById(state, target.id);
    if (enemy !== undefined) {
      applyTaunt(enemy, actor.id, tick, working.duration, SNAPSHOT_RATE_HZ, magnitude);
      events.push({
        type: "threat",
        sourceId: actor.id,
        sourceKind: actor.kind,
        targetId: target.id,
        targetKind: "enemy",
        abilityId: abilityId,
        remainingHealth: target.health,
        x: target.x,
        y: target.y,
        message: "enemy_taunted",
      });
    }
    applyStatus(target, working, abilityId, actor, magnitude, tick, events, haste, stats);
    return;
  }
  const alreadyBleedRate = working.statChannel === "bleed_tick_rate" && hasBleedTickRate(target.effects);
  applyStatus(target, working, abilityId, actor, magnitude, tick, events, haste, stats);
  if (type === "stun") {
    interruptLiveCast(state, target, actor, tick, events);
  }
  if (working.statChannel === "bleed_tick_rate" && !alreadyBleedRate) {
    retimeTaggedPeriodicsFromSource(state, actor.id, 2, "bleed");
  }
  if (type === "shield_absorb" && isMatchPlayer(source) && source.progression !== undefined && state.progressionCatalog !== undefined) {
    applyMendingWard(state, source, target, working, abilityId, tick, events, stats, fallbackAttack);
  }
}

export function toEffectSource(source: MatchPlayer | EffectSource): EffectSource {
  if (isMatchPlayer(source)) {
    return { id: source.userId, kind: "player" };
  }
  return source;
}

function isMatchPlayer(source: MatchPlayer | EffectSource): source is MatchPlayer {
  return typeof (source as MatchPlayer).userId === "string" && typeof (source as MatchPlayer).sessionId === "string";
}

export interface EffectTarget {
  id: string;
  kind: "player" | "enemy";
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  effects: ActiveEffect[];
  resources?: { [id: string]: number };
}

export function playerAsTarget(player: MatchPlayer): EffectTarget {
  return {
    id: player.userId,
    kind: "player",
    x: player.x,
    y: player.y,
    health: player.health,
    maxHealth: player.maxHealth,
    effects: player.effects !== undefined ? player.effects : [],
    resources: player.resources,
  };
}

export function enemyAsTarget(enemy: MatchEnemy): EffectTarget {
  return {
    id: enemy.id,
    kind: "enemy",
    x: enemy.x,
    y: enemy.y,
    health: enemy.health,
    maxHealth: enemy.maxHealth,
    effects: enemy.effects !== undefined ? enemy.effects : [],
  };
}

export function writeTarget(state: StarterZoneState, target: EffectTarget): void {
  if (target.kind === "player") {
    const player = state.players[target.id];
    if (player === undefined) {
      return;
    }
    player.health = target.health;
    player.maxHealth = target.maxHealth;
    player.effects = target.effects;
    if (target.resources !== undefined) {
      player.resources = target.resources;
    }
    return;
  }
  const wanted = String(target.id);
  for (let i = 0; i < state.enemies.length; i++) {
    if (String(state.enemies[i].id) === wanted || String(state.enemies[i].enemyId) === wanted) {
      state.enemies[i].health = target.health;
      state.enemies[i].effects = target.effects;
      return;
    }
  }
}

export function tickEffects(state: StarterZoneState, tick: number, events: CombatEvent[]): void {
  const playerIds = Object.keys(state.players);
  for (let i = 0; i < playerIds.length; i++) {
    const player = state.players[playerIds[i]];
    const target = playerAsTarget(player);
    tickTargetEffects(state, target, player.userId, "player", tick, events);
    writeTarget(state, target);
  }
  for (let e = 0; e < state.enemies.length; e++) {
    const enemy = state.enemies[e];
    if (enemy.health <= 0) {
      continue;
    }
    const target = enemyAsTarget(enemy);
    tickTargetEffects(state, target, enemy.id, "enemy", tick, events);
    writeTarget(state, target);
  }
}

function tickTargetEffects(
  state: StarterZoneState,
  target: EffectTarget,
  _id: string,
  _kind: "player" | "enemy",
  tick: number,
  events: CombatEvent[],
): void {
  const kept: ActiveEffect[] = [];
  for (let i = 0; i < target.effects.length; i++) {
    const effect = target.effects[i];
    if (effect.nextTickAt > 0 && tick >= effect.nextTickAt && effect.remainingTicks > 0) {
      applyPeriodicTick(state, target, effect, tick, events);
      if (effect.tickIntervalTicks > 0) {
        effect.nextTickAt = tick + effect.tickIntervalTicks;
      }
    }
    if (isShieldEffect(effect) && effect.remainingTicks === 1 && effect.terminalEventSent !== true) {
      finishShield(state, target, effect, "expired", tick, events);
    }
    effect.remainingTicks -= 1;
    if (effect.remainingTicks > 0) {
      kept.push(effect);
    } else if (effect.statChannel === "bleed_tick_rate") {
      retimeTaggedPeriodicsFromSource(state, effect.sourceId, 0.5, "bleed");
    }
  }
  target.effects = kept;
}

function applyPeriodicTick(
  state: StarterZoneState,
  target: EffectTarget,
  effect: ActiveEffect,
  tick: number,
  events: CombatEvent[],
): void {
  const amount = effect.magnitude * effect.stacks;
  if (effect.type === "periodic_damage") {
    const source = effect.sourceKind === "player" ? state.players[effect.sourceId] : undefined;
    if (source === undefined && effect.sourceKind === "player") {
      return;
    }
    const actor: EffectSource =
      source !== undefined ? { id: source.userId, kind: "player" } : { id: effect.sourceId, kind: effect.sourceKind };
    dealDamage(state, actor, target, amount, effect.abilityId, tick, events, true, undefined, "periodic");
    if (effect.totalRemaining !== undefined) {
      effect.totalRemaining = Math.max(0, effect.totalRemaining - amount);
    }
    if (effect.ticksRemaining !== undefined) {
      effect.ticksRemaining = Math.max(0, effect.ticksRemaining - 1);
    }
    events.push({
      type: "effect_tick",
      sourceId: effect.sourceId,
      sourceKind: effect.sourceKind,
      targetId: target.id,
      targetKind: target.kind,
      damage: amount,
      remainingHealth: target.health,
      effectId: effect.effectId,
      abilityId: effect.abilityId,
      x: target.x,
      y: target.y,
    });
    applyDotLifesteal(state, effect, amount, tick, events);
    return;
  }
  if (effect.type === "periodic_heal") {
    healTarget(state, { id: effect.sourceId, kind: effect.sourceKind }, target, amount, effect.abilityId, tick, events, undefined, "periodic");
  }
}

function applyStatus(
  target: EffectTarget,
  definition: EffectDefinition,
  abilityId: string,
  source: EffectSource,
  magnitude: number,
  tick: number,
  events: CombatEvent[],
  hasteMult: number,
  stats: EvaluatedStats | null,
): void {
  const durationTicks = cooldownTicks(definition.duration, SNAPSHOT_RATE_HZ);
  if (durationTicks <= 0 && definition.type !== "timed_stat_modifier" && definition.type !== "stun" && definition.type !== "root" && definition.type !== "slow" && definition.type !== "periodic_damage" && definition.type !== "periodic_heal" && definition.type !== "shield_absorb" && definition.type !== "taunt" && definition.type !== "reflect") {
    return;
  }
  const extraTickRate = definition.tickRateMultiplier !== undefined && definition.tickRateMultiplier > 0 ? definition.tickRateMultiplier : 1;
  const baseInterval = definition.tickInterval;
  const scaledInterval = formulaDotTickInterval(baseInterval, hasteMult * extraTickRate);
  const intervalTicks = cooldownTicks(scaledInterval, SNAPSHOT_RATE_HZ);
  let appliedMagnitude = magnitude;
  let statChannel =
    definition.statChannel !== undefined
      ? definition.statChannel
      : definition.type === "shield_absorb"
        ? "absorb"
        : definition.type === "slow"
          ? "movement_speed"
          : "";
  if (statChannel === "move_speed") {
    statChannel = "movement_speed";
    appliedMagnitude = magnitude * 100;
  }
  if (statChannel === "damage_dealt") {
    statChannel = "outgoing_damage";
  }
  if (statChannel === "damage_taken") {
    statChannel = "taken_damage";
  }
  if (definition.type === "slow" && Math.abs(appliedMagnitude) <= 1) {
    appliedMagnitude = -Math.abs(appliedMagnitude) * 100;
  }
  if (definition.type === "periodic_damage" || definition.type === "periodic_heal") {
    const intendedTickCount = baseInterval > 0 && definition.duration > 0 ? definition.duration / baseInterval : 1;
    const intendedTotal = magnitude * intendedTickCount;
    const ticks = intervalTicks > 0 ? Math.max(1, Math.round(durationTicks / intervalTicks)) : 1;
    appliedMagnitude = ticks > 0 ? intendedTotal / ticks : magnitude;
  }
  if (definition.type === "shield_absorb" && stats !== null && definition.healthPercent === undefined) {
    const spirit = stats.values["stat.spirit"] !== undefined ? stats.values["stat.spirit"] : 0;
    appliedMagnitude = Math.floor(shieldAbsorbFromSpirit(magnitude, spirit));
  }
  if (definition.type === "shield_absorb" && definition.healthPercent !== undefined && definition.healthPercent > 0) {
    appliedMagnitude = Math.floor(magnitude);
  }
  const incoming: ActiveEffect = {
    effectId: definition.id,
    abilityId: abilityId,
    sourceId: source.id,
    sourceKind: source.kind,
    type: definition.type,
    stacks: 1,
    magnitude: appliedMagnitude,
    remainingTicks: durationTicks > 0 ? durationTicks : 1,
    tickIntervalTicks: intervalTicks,
    nextTickAt: intervalTicks > 0 ? tick + intervalTicks : 0,
    stackPolicy: definition.stackPolicy,
    maxStacks: definition.maxStacks,
    refreshPolicy: definition.refreshPolicy,
    tags: copyTags(definition.tags),
    statChannel: statChannel,
    resourceRole: definition.resourceRole !== undefined ? definition.resourceRole : "",
    instanceId: source.id + ":" + definition.id,
    tickRateModifiers: extraTickRate,
    currentIntervalSec: scaledInterval,
    nodeId: definition.nodeId,
    rank: definition.rank,
    expiryTick: tick + (durationTicks > 0 ? durationTicks : 1),
  };
  if ((incoming.nodeId === undefined || incoming.nodeId.length === 0) && incoming.tags.indexOf("wither") >= 0) {
    incoming.nodeId = "wither";
  }
  if (definition.type === "periodic_damage" || definition.type === "periodic_heal") {
    const ticks = intervalTicks > 0 ? Math.max(1, Math.round(durationTicks / intervalTicks)) : 1;
    incoming.baseTickCount = ticks;
    incoming.ticksRemaining = ticks;
    incoming.totalRemaining = appliedMagnitude * ticks;
    if (stats !== null) {
      incoming.snapshotStats = copyNumberMap(stats.values);
    }
  }
  if (definition.type === "shield_absorb") {
    incoming.remainingAbsorb = appliedMagnitude;
    incoming.maxAbsorb = appliedMagnitude;
    incoming.terminalEventSent = false;
    if (definition.shieldBreakHealRatio !== undefined && definition.shieldBreakHealRatio > 0) {
      incoming.shieldBreakHealRatio = definition.shieldBreakHealRatio;
    }
    if (definition.tags.indexOf("shield") < 0) {
      incoming.tags.push("shield");
    }
  }
  const existingIndex = findReplaceableEffect(target.effects, incoming);
  if (existingIndex === -1) {
    target.effects.push(incoming);
    events.push({
      type: "effect_applied",
      sourceId: source.id,
      sourceKind: source.kind,
      targetId: target.id,
      targetKind: target.kind,
      effectId: incoming.effectId,
      abilityId: abilityId,
      remainingHealth: target.health,
      x: target.x,
      y: target.y,
    });
    return;
  }
  const existing = target.effects[existingIndex];
  if (definition.stackPolicy === "ignore") {
    return;
  }
  if (definition.stackPolicy === "replace") {
    suppressShieldTerminal(existing);
    target.effects[existingIndex] = incoming;
    return;
  }
  if (definition.stackPolicy === "refresh") {
    applyRefresh(existing, incoming);
    return;
  }
  if (definition.stackPolicy === "stack") {
    existing.stacks += 1;
    if (existing.stacks > existing.maxStacks) {
      existing.stacks = existing.maxStacks;
    }
    applyRefresh(existing, incoming);
  }
}

function applyRefresh(existing: ActiveEffect, incoming: ActiveEffect): void {
  if (existing.refreshPolicy === "ignore") {
    return;
  }
  if (existing.refreshPolicy === "extend") {
    existing.remainingTicks += incoming.remainingTicks;
    return;
  }
  existing.remainingTicks = incoming.remainingTicks;
  existing.magnitude = incoming.magnitude;
  existing.nextTickAt = incoming.nextTickAt;
  existing.tickIntervalTicks = incoming.tickIntervalTicks;
  existing.currentIntervalSec = incoming.currentIntervalSec;
  existing.totalRemaining = incoming.totalRemaining;
  existing.ticksRemaining = incoming.ticksRemaining;
  existing.baseTickCount = incoming.baseTickCount;
  existing.remainingAbsorb = incoming.remainingAbsorb;
  existing.maxAbsorb = incoming.maxAbsorb;
  existing.terminalEventSent = false;
  existing.rank = incoming.rank;
  existing.expiryTick = incoming.expiryTick;
  existing.shieldBreakHealRatio = incoming.shieldBreakHealRatio;
}

function findReplaceableEffect(effects: ActiveEffect[], incoming: ActiveEffect): number {
  for (let i = 0; i < effects.length; i++) {
    const existing = effects[i];
    if (existing.effectId === incoming.effectId && existing.sourceId === incoming.sourceId) {
      return i;
    }
    if (
      incoming.nodeId !== undefined &&
      incoming.nodeId.length > 0 &&
      existing.nodeId === incoming.nodeId &&
      existing.sourceId === incoming.sourceId
    ) {
      const existingRank = existing.rank !== undefined ? existing.rank : 0;
      const incomingRank = incoming.rank !== undefined ? incoming.rank : 0;
      if (incomingRank >= existingRank) {
        return i;
      }
    }
  }
  return -1;
}

export function retimePeriodic(effect: ActiveEffect, extraMultiplier: number, requiredTag?: string): boolean {
  if (effect.type !== "periodic_damage" && effect.type !== "periodic_heal") {
    return false;
  }
  if (requiredTag !== undefined && requiredTag.length > 0 && effect.tags.indexOf(requiredTag) < 0) {
    return false;
  }
  const factor = extraMultiplier > 0 ? extraMultiplier : 1;
  const currentInterval = effect.currentIntervalSec !== undefined ? effect.currentIntervalSec : 0;
  if (!(currentInterval > 0)) {
    return false;
  }
  const ticksLeft = effect.ticksRemaining !== undefined ? effect.ticksRemaining : 0;
  const durationLeft = ticksLeft * currentInterval;
  const newInterval = currentInterval / factor;
  const newTicks = Math.max(1, Math.round(durationLeft / newInterval));
  const total = effect.totalRemaining !== undefined ? effect.totalRemaining : effect.magnitude * ticksLeft;
  effect.currentIntervalSec = newInterval;
  effect.tickIntervalTicks = cooldownTicks(newInterval, SNAPSHOT_RATE_HZ);
  effect.ticksRemaining = newTicks;
  effect.magnitude = newTicks > 0 ? total / newTicks : effect.magnitude;
  effect.tickRateModifiers = (effect.tickRateModifiers !== undefined ? effect.tickRateModifiers : 1) * factor;
  return true;
}

export function isShieldEffect(effect: ActiveEffect): boolean {
  if (effect.type === "shield_absorb") {
    return true;
  }
  if (effect.statChannel === "absorb") {
    return true;
  }
  return effect.tags.indexOf("shield") >= 0;
}

export function consumeShieldAbsorb(
  effects: ActiveEffect[] | undefined,
  damage: number,
  target: { id: string; kind: "player" | "enemy"; x: number; y: number; health: number },
  events: CombatEvent[],
): number {
  if (effects === undefined || !(damage > 0)) {
    return 0;
  }
  let remaining = damage;
  let absorbed = 0;
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (!isShieldEffect(effect)) {
      continue;
    }
    const pool = effect.remainingAbsorb !== undefined ? effect.remainingAbsorb : effect.magnitude * effect.stacks;
    if (!(pool > 0) || remaining <= 0) {
      continue;
    }
    const take = pool < remaining ? pool : remaining;
    const nextPool = pool - take;
    effect.remainingAbsorb = nextPool;
    effect.magnitude = nextPool;
    remaining -= take;
    absorbed += take;
    if (nextPool <= 0 && effect.terminalEventSent !== true) {
      emitShieldTerminal(events, target, effect, "broken");
      effect.remainingTicks = 0;
    }
  }
  return absorbed;
}

export function suppressShieldTerminal(effect: ActiveEffect): void {
  if (isShieldEffect(effect)) {
    effect.terminalEventSent = true;
  }
}

function emitShieldTerminal(
  events: CombatEvent[],
  target: { id: string; kind: "player" | "enemy"; x: number; y: number; health: number },
  effect: ActiveEffect,
  reason: "broken" | "expired",
): void {
  if (effect.terminalEventSent === true) {
    return;
  }
  effect.terminalEventSent = true;
  events.push({
    type: "message",
    sourceId: effect.sourceId,
    sourceKind: effect.sourceKind,
    targetId: target.id,
    targetKind: target.kind,
    effectId: effect.effectId,
    abilityId: effect.abilityId,
    remainingHealth: target.health,
    message: reason === "broken" ? "shield_broken" : "shield_expired",
    x: target.x,
    y: target.y,
  });
}

function interruptLiveCast(
  state: StarterZoneState,
  target: EffectTarget,
  source: EffectSource,
  tick: number,
  events: CombatEvent[],
): void {
  if (target.kind !== "player") {
    const enemy = findEnemyById(state, target.id);
    if (enemy === undefined || enemy.activeCast === undefined || enemy.activeCast.interruptReason !== "") {
      return;
    }
    enemy.activeCast.interruptReason = "interrupt";
    enemy.activeCast.completionTick = tick;
    enemy.activeCast.channelUntilTick = 0;
    events.push({
      type: "interrupt",
      sourceId: source.id,
      sourceKind: source.kind,
      targetId: target.id,
      targetKind: "enemy",
      interruptReason: "interrupt",
      abilityId: enemy.activeCast.abilityId,
      remainingHealth: target.health,
      x: target.x,
      y: target.y,
    });
    enemy.activeCast = undefined;
    return;
  }
  const player = state.players[target.id];
  if (player === undefined || player.activeCast === undefined || player.activeCast.interruptReason !== "") {
    return;
  }
  player.activeCast.interruptReason = "interrupt";
  player.activeCast.completionTick = tick;
  player.activeCast.channelUntilTick = 0;
  events.push({
    type: "interrupt",
    sourceId: source.id,
    sourceKind: source.kind,
    targetId: player.userId,
    targetKind: "player",
    interruptReason: "interrupt",
    abilityId: player.activeCast.abilityId,
    remainingHealth: player.health,
    x: player.x,
    y: player.y,
  });
  player.activeCast = undefined;
}

function findEnemyById(state: StarterZoneState, id: string): MatchEnemy | undefined {
  const wanted = String(id);
  for (let i = 0; i < state.enemies.length; i++) {
    if (String(state.enemies[i].id) === wanted || String(state.enemies[i].enemyId) === wanted) {
      return state.enemies[i];
    }
  }
  return undefined;
}

function dealDamage(
  state: StarterZoneState,
  source: EffectSource,
  target: EffectTarget,
  amount: number,
  abilityId: string,
  tick: number,
  events: CombatEvent[],
  isDot: boolean,
  canonical?: {
    powerCategory: "melee" | "ranged" | "spell" | "curse" | "heal" | "shield";
    canonicalStats: { [id: string]: number };
    canonicalCritChance: number;
    canonicalCritMult: number;
    canonicalOutgoingProduct: number;
    random: import("./combat_rng").CombatRandom | undefined;
    guaranteedCrit?: boolean;
    bonusCritChance?: number;
  },
  originTag?: string,
): void {
  if (amount <= 0 || target.health <= 0) {
    return;
  }
  const result = applyCombat(
    state,
    {
      action: "damage",
      sourceId: source.id,
      sourceKind: source.kind,
      targetId: target.id,
      targetKind: target.kind,
      formula:
        canonical !== undefined
          ? {
              base: amount,
              isDot: isDot,
              powerCategory: canonical.powerCategory,
              canonicalStats: canonical.canonicalStats,
              canonicalCritChance: canonical.canonicalCritChance,
              canonicalCritMult: canonical.canonicalCritMult,
              canonicalOutgoingProduct: canonical.canonicalOutgoingProduct,
              canonicalDamageReduction: 0,
              canonicalTakenProduct: 1,
              canonicalCritDamageProduct: 1,
              random: canonical.random,
              critForced: canonical.guaranteedCrit === true,
              bonusCritChance: canonical.bonusCritChance,
            }
          : { base: amount, isDot: isDot },
      tick: tick,
      abilityId: abilityId,
      respawnDelaySec: state.playerRespawnDelaySec,
      tickRate: SNAPSHOT_RATE_HZ,
      originTag: originTag !== undefined ? originTag : isDot ? "periodic" : undefined,
    },
    events,
  );
  if (!result.ok) {
    return;
  }
  target.health = result.remainingHealth;
}

function canonicalBaseMagnitude(formula: MagnitudeFormula, fallbackAttack: number): number {
  if (typeof formula.value === "number" && isFinite(formula.value)) {
    return Math.max(0, formula.value);
  }
  return Math.max(0, fallbackAttack);
}

function canonicalFormula(
  state: StarterZoneState,
  stats: EvaluatedStats | null,
  definition: EffectDefinition,
  source: MatchPlayer | EffectSource,
  target?: EffectTarget,
):
  | {
      powerCategory: "melee" | "ranged" | "spell" | "curse" | "heal" | "shield";
      canonicalStats: { [id: string]: number };
      canonicalCritChance: number;
      canonicalCritMult: number;
      canonicalOutgoingProduct: number;
      canonicalHealDoneProduct?: number;
      random: import("./combat_rng").CombatRandom | undefined;
      guaranteedCrit?: boolean;
      bonusCritChance?: number;
    }
  | undefined {
  if (stats === null || stats.canonical === undefined || definition.powerCategory === undefined) {
    return undefined;
  }
  let critMult = stats.critMult !== undefined ? stats.critMult : 1.5;
  if (isMatchPlayer(source) && source.progression !== undefined && state.progressionCatalog !== undefined) {
    critMult += conditionalTalentModifierValue(
      state.progressionCatalog,
      source.progression,
      "crit_damage_flat",
      {
        sourceTags: effectTags(source.effects),
        target:
          target !== undefined
            ? { health: target.health, maxHealth: target.maxHealth, tags: effectTags(target.effects) }
            : undefined,
        nearestEnemyDistance: 0,
        standingStillSeconds: 0,
        moving: false,
      },
    );
  }
  const formula: {
    powerCategory: "melee" | "ranged" | "spell" | "curse" | "heal" | "shield";
    canonicalStats: { [id: string]: number };
    canonicalCritChance: number;
    canonicalCritMult: number;
    canonicalOutgoingProduct: number;
    canonicalHealDoneProduct?: number;
    random: import("./combat_rng").CombatRandom | undefined;
    guaranteedCrit?: boolean;
    bonusCritChance?: number;
  } = {
    powerCategory: definition.powerCategory,
    canonicalStats: stats.values,
    canonicalCritChance: stats.critChance !== undefined ? stats.critChance : 0,
    canonicalCritMult: critMult,
    canonicalOutgoingProduct: stats.canonical.outgoingProduct,
    canonicalHealDoneProduct: stats.canonical.healDoneProduct,
    random: state.combatRandom,
  };
  if (definition.guaranteedCrit === true) {
    formula.guaranteedCrit = true;
  }
  if (definition.bonusCritChance !== undefined && definition.bonusCritChance !== 0) {
    formula.bonusCritChance = definition.bonusCritChance;
  }
  return formula;
}

export function retimeTaggedPeriodicsFromSource(
  state: StarterZoneState,
  sourceId: string,
  extraMultiplier: number,
  requiredTag: string,
): void {
  const playerIds = Object.keys(state.players);
  for (let i = 0; i < playerIds.length; i++) {
    const player = state.players[playerIds[i]];
    const effects = player.effects !== undefined ? player.effects : [];
    for (let e = 0; e < effects.length; e++) {
      if (effects[e].sourceId === sourceId) {
        retimePeriodic(effects[e], extraMultiplier, requiredTag);
      }
    }
  }
  for (let n = 0; n < state.enemies.length; n++) {
    const enemyEffects = state.enemies[n].effects;
    const list = enemyEffects !== undefined ? enemyEffects : [];
    for (let e = 0; e < list.length; e++) {
      if (list[e].sourceId === sourceId) {
        retimePeriodic(list[e], extraMultiplier, requiredTag);
      }
    }
  }
}

function effectTags(effects: ActiveEffect[] | undefined): string[] {
  const tags: string[] = [];
  const source = effects !== undefined ? effects : [];
  for (let i = 0; i < source.length; i++) {
    if (source[i].remainingTicks <= 0) {
      continue;
    }
    for (let t = 0; t < source[i].tags.length; t++) {
      if (tags.indexOf(source[i].tags[t]) < 0) {
        tags.push(source[i].tags[t]);
      }
    }
  }
  return tags;
}

function hasBleedTickRate(effects: ActiveEffect[] | undefined): boolean {
  if (effects === undefined) {
    return false;
  }
  for (let i = 0; i < effects.length; i++) {
    if (effects[i].statChannel === "bleed_tick_rate" && effects[i].remainingTicks > 0) {
      return true;
    }
  }
  return false;
}

function healTarget(
  state: StarterZoneState,
  source: EffectSource,
  target: EffectTarget,
  amount: number,
  abilityId: string,
  tick: number,
  events: CombatEvent[],
  canonical?: ReturnType<typeof canonicalFormula>,
  originTag?: string,
): void {
  if (amount <= 0 || target.health <= 0) {
    return;
  }
  const result = applyCombat(
    state,
    {
      action: "heal",
      sourceId: source.id,
      sourceKind: source.kind,
      targetId: target.id,
      targetKind: target.kind,
      formula:
        canonical !== undefined
          ? {
              base: amount,
              powerCategory: canonical.powerCategory,
              canonicalStats: canonical.canonicalStats,
              canonicalCritChance: canonical.canonicalCritChance,
              canonicalCritMult: canonical.canonicalCritMult,
              canonicalOutgoingProduct: canonical.canonicalOutgoingProduct,
              canonicalHealDoneProduct: canonical.canonicalHealDoneProduct,
              random: canonical.random,
            }
          : { base: amount },
      tick: tick,
      abilityId: abilityId,
      tickRate: SNAPSHOT_RATE_HZ,
      originTag: originTag,
    },
    events,
  );
  if (!result.ok) {
    return;
  }
  target.health = result.remainingHealth;
}

function changeResource(
  state: StarterZoneState,
  target: EffectTarget,
  definition: EffectDefinition,
  magnitude: number,
  source: EffectSource,
  tick: number,
  events: CombatEvent[],
): void {
  if (target.kind !== "player") {
    return;
  }
  const player = state.players[target.id];
  if (player === undefined) {
    return;
  }
  const catalog = state.progressionCatalog;
  const role = definition.resourceRole !== undefined ? definition.resourceRole : "mana";
  if (role === "health") {
    healTarget(state, source, target, magnitude, "", tick, events);
    return;
  }
  const resourceId = catalog !== undefined ? resourceIdForRole(catalog, role) : "";
  if (resourceId.length === 0) {
    return;
  }
  const resources = dict(player.resources);
  const current = resources[resourceId] !== undefined ? resources[resourceId] : 0;
  let next = current + magnitude;
  if (next < 0) {
    next = 0;
  }
  resources[resourceId] = next;
  player.resources = resources;
  target.resources = resources;
  events.push({
    type: "resource",
    sourceId: source.id,
    sourceKind: source.kind,
    targetId: target.id,
    targetKind: "player",
    resourceId: resourceId,
    resourceDelta: magnitude,
    remainingHealth: player.health,
    x: player.x,
    y: player.y,
  });
}

function rankScale(source: MatchPlayer, abilityId: string): number {
  if (source.progression === undefined) {
    return 1;
  }
  const rank = source.progression.abilityRanks !== undefined ? source.progression.abilityRanks[abilityId] : undefined;
  if (rank === undefined || rank < 1) {
    return 1;
  }
  return rank;
}

function copyTags(tags: ReadonlyArray<string>): string[] {
  const list: string[] = [];
  for (let i = 0; i < tags.length; i++) {
    list.push(tags[i]);
  }
  return list;
}

export function finishShield(
  state: StarterZoneState,
  target: EffectTarget,
  effect: ActiveEffect,
  reason: "broken" | "expired",
  tick: number,
  events: CombatEvent[],
): void {
  if (!isShieldEffect(effect) || effect.terminalEventSent === true) {
    return;
  }
  emitShieldTerminal(events, target, effect, reason);
  const ratio = effect.shieldBreakHealRatio !== undefined ? effect.shieldBreakHealRatio : 0;
  const absorb = effect.maxAbsorb !== undefined ? effect.maxAbsorb : 0;
  if (ratio > 0 && absorb > 0 && target.health > 0) {
    healTarget(
      state,
      { id: effect.sourceId, kind: effect.sourceKind },
      target,
      absorb * ratio,
      effect.abilityId,
      tick,
      events,
    );
  }
  clearOwnedMendingWard(target, effect.sourceId);
}

function applyMendingWard(
  state: StarterZoneState,
  source: MatchPlayer,
  target: EffectTarget,
  shield: EffectDefinition,
  abilityId: string,
  tick: number,
  events: CombatEvent[],
  stats: EvaluatedStats | null,
  fallbackAttack: number,
): void {
  if (source.progression === undefined || state.progressionCatalog === undefined) {
    return;
  }
  const pct = passiveTalentModifierValue(state.progressionCatalog, source.progression, "shield_max_hp_heal_per_second");
  if (!(pct > 0) || !(shield.duration > 0) || !(target.maxHealth > 0)) {
    return;
  }
  const ward: EffectDefinition = {
    id: "mending-ward",
    type: "periodic_heal",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: target.maxHealth * pct },
    duration: shield.duration,
    tickInterval: 1,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["mending_ward"],
  };
  applyEffectDefinition(state, ward, abilityId, source, target, stats, fallbackAttack, tick, events);
}

function applyDotLifesteal(
  state: StarterZoneState,
  effect: ActiveEffect,
  amount: number,
  tick: number,
  events: CombatEvent[],
): void {
  if (effect.sourceKind !== "player" || !(amount > 0)) {
    return;
  }
  const player = state.players[effect.sourceId];
  if (player === undefined || player.progression === undefined || state.progressionCatalog === undefined || player.health <= 0) {
    return;
  }
  const fraction = passiveTalentModifierValue(state.progressionCatalog, player.progression, "dot_lifesteal_percent");
  if (!(fraction > 0)) {
    return;
  }
  const self = playerAsTarget(player);
  healTarget(
    state,
    { id: player.userId, kind: "player" },
    self,
    amount * fraction,
    effect.abilityId,
    tick,
    events,
    undefined,
    "lifesteal",
  );
  writeTarget(state, self);
}

export function propagateOwnedWitherOnDeath(
  state: StarterZoneState,
  dying: MatchEnemy,
  tick: number,
  events: CombatEvent[],
): void {
  const effects = dying.effects !== undefined ? dying.effects : [];
  const seen: { [id: string]: boolean } = {};
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (effect.sourceKind !== "player" || effect.remainingTicks <= 0 || effect.tags.indexOf("wither") < 0) {
      continue;
    }
    if (seen[effect.sourceId] === true) {
      continue;
    }
    const player = state.players[effect.sourceId];
    if (player === undefined || player.progression === undefined || state.progressionCatalog === undefined) {
      continue;
    }
    if (!(passiveTalentModifierValue(state.progressionCatalog, player.progression, "propagate_on_death") > 0)) {
      continue;
    }
    const nearby = nearestLivingEnemy(state, dying, NEARBY_EFFECT_RADIUS);
    if (nearby === undefined) {
      continue;
    }
    seen[effect.sourceId] = true;
    const ability = state.abilitiesById !== undefined ? state.abilitiesById[effect.abilityId] : undefined;
    if (ability === undefined) {
      continue;
    }
    const talentMods = resolveAbilityTalentModifiers(state.progressionCatalog, player.progression, effect.abilityId, {
      sourceTags: [],
    });
    const stats =
      player.classId !== undefined
        ? evaluateStats(
            state.progressionCatalog,
            playerStatContext(
              player.classId,
              player.progression,
              player.equipment,
              player.inventory,
              state.itemsById,
              effectModifiersFrom(player.effects),
            ),
          )
        : null;
    const fallbackAttack =
      player.derivedAttack !== undefined && player.derivedAttack > 0 ? player.derivedAttack : state.playerAttack;
    const hopTarget = enemyAsTarget(nearby);
    for (let e = 0; e < ability.effects.length; e++) {
      const template = ability.effects[e];
      if (template.type !== "periodic_damage" || template.tags.indexOf("wither") < 0) {
        continue;
      }
      const resolved: EffectDefinition = {
        ...template,
        magnitude: { ...template.magnitude },
        tags: copyTags(template.tags),
      };
      if (resolved.magnitude.value !== undefined && talentMods.damageMultiplier !== 1) {
        resolved.magnitude.value *= talentMods.damageMultiplier;
      }
      applyEffectDefinition(state, resolved, effect.abilityId, player, hopTarget, stats, fallbackAttack, tick, events);
      if (talentMods.onDotTargetOutgoingPercent !== undefined) {
        const reduction: EffectDefinition = {
          id: "wither-r3-outgoing",
          type: "timed_stat_modifier",
          source: "caster",
          target: "primary",
          magnitude: { kind: "constant", value: talentMods.onDotTargetOutgoingPercent },
          duration: resolved.duration,
          tickInterval: 0,
          stackPolicy: "replace",
          maxStacks: 1,
          refreshPolicy: "refresh",
          removalReason: "expired",
          tags: ["wither_r3"],
          statChannel: "outgoing_damage",
        };
        applyEffectDefinition(state, reduction, effect.abilityId, player, hopTarget, stats, fallbackAttack, tick, events);
      }
    }
    writeTarget(state, hopTarget);
  }
}

function nearestLivingEnemy(state: StarterZoneState, origin: MatchEnemy, radius: number): MatchEnemy | undefined {
  let best: MatchEnemy | undefined;
  let bestDist = radius;
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    if (enemy.id === origin.id || enemy.health <= 0 || enemy.aiState === "dead") {
      continue;
    }
    const dist = distance(origin.x, origin.y, enemy.x, enemy.y);
    if (dist <= bestDist) {
      best = enemy;
      bestDist = dist;
    }
  }
  return best;
}

function clearOwnedMendingWard(target: EffectTarget, sourceId: string): void {
  for (let i = 0; i < target.effects.length; i++) {
    const effect = target.effects[i];
    if (effect.sourceId === sourceId && effect.tags.indexOf("mending_ward") >= 0) {
      effect.remainingTicks = 0;
    }
  }
}
