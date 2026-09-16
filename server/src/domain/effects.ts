import { cooldownTicks, type CombatEvent } from "./combat";
import { applyCombat } from "./combat_pipeline";
import { SNAPSHOT_RATE_HZ } from "./movement";
import type { MatchEnemy, MatchPlayer, StarterZoneState } from "./match_state";
import { dict } from "./maps";
import { resourceIdForRole, type EvaluatedStats } from "./stats";
import { formulaDotTickInterval, formulaHeal } from "./canonical_stats";
import { applyTaunt } from "./threat";

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
  | "forced_movement";

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
    if (effect.type !== "timed_stat_modifier" || effect.statChannel.length === 0) {
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
  const magnitude = resolveMagnitude(definition.magnitude, stats, fallbackAttack) * rank;
  const haste = stats !== null && stats.hasteMult !== undefined ? stats.hasteMult : 1;
  const type = String(definition.type);
  if (type === "direct_damage") {
    dealDamage(state, actor, target, magnitude, abilityId, tick, events, false);
    return;
  }
  if (type === "direct_heal") {
    healTarget(state, actor, target, magnitude, abilityId, tick, events);
    return;
  }
  if (type === "resource_change") {
    changeResource(state, target, definition, magnitude, actor, tick, events);
    return;
  }
  if (type === "interrupt") {
    interruptLiveCast(state, target, actor, tick, events);
    return;
  }
  if (type === "taunt" && target.kind === "enemy") {
    const enemy = findEnemyById(state, target.id);
    if (enemy !== undefined) {
      applyTaunt(enemy, actor.id, tick, definition.duration, SNAPSHOT_RATE_HZ, magnitude);
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
    applyStatus(target, definition, abilityId, actor, magnitude, tick, events, haste, stats);
    return;
  }
  applyStatus(target, definition, abilityId, actor, magnitude, tick, events, haste, stats);
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
      emitShieldTerminal(events, target, effect, "expired");
    }
    effect.remainingTicks -= 1;
    if (effect.remainingTicks > 0) {
      kept.push(effect);
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
    dealDamage(state, actor, target, amount, effect.abilityId, tick, events, true);
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
    return;
  }
  if (effect.type === "periodic_heal") {
    healTarget(state, { id: effect.sourceId, kind: effect.sourceKind }, target, amount, effect.abilityId, tick, events);
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
  if (
    (definition.type === "periodic_damage" || definition.type === "periodic_heal") &&
    baseInterval > 0 &&
    scaledInterval > 0 &&
    scaledInterval !== baseInterval
  ) {
    appliedMagnitude = magnitude * (scaledInterval / baseInterval);
  }
  if (definition.type === "shield_absorb" && stats !== null) {
    const spirit = stats.values["stat.spirit"] !== undefined ? stats.values["stat.spirit"] : 0;
    appliedMagnitude = Math.floor(shieldAbsorbFromSpirit(magnitude, spirit));
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
    statChannel: definition.statChannel !== undefined ? definition.statChannel : definition.type === "shield_absorb" ? "absorb" : definition.type === "slow" ? "movement_speed" : "",
    resourceRole: definition.resourceRole !== undefined ? definition.resourceRole : "",
    instanceId: source.id + ":" + definition.id,
    tickRateModifiers: extraTickRate,
    currentIntervalSec: scaledInterval,
    nodeId: definition.nodeId,
    rank: definition.rank,
    expiryTick: tick + (durationTicks > 0 ? durationTicks : 1),
  };
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
      formula: { base: amount, isDot: isDot },
      tick: tick,
      abilityId: abilityId,
      respawnDelaySec: state.playerRespawnDelaySec,
      tickRate: SNAPSHOT_RATE_HZ,
    },
    events,
  );
  if (!result.ok) {
    return;
  }
  target.health = result.remainingHealth;
}

function healTarget(
  state: StarterZoneState,
  source: EffectSource,
  target: EffectTarget,
  amount: number,
  abilityId: string,
  tick: number,
  events: CombatEvent[],
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
      formula: { base: amount },
      tick: tick,
      abilityId: abilityId,
      tickRate: SNAPSHOT_RATE_HZ,
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
