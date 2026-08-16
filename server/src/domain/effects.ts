import { applyDamageAmount, applyHealAmount, cooldownTicks, findEnemy, killEnemy, killPlayer, type CombatEvent } from "./combat";
import { SNAPSHOT_RATE_HZ } from "./movement";
import type { MatchEnemy, MatchPlayer, StarterZoneState } from "./match_state";
import { dict } from "./maps";
import { emptyQuestLog } from "./quest";
import { resourceIdForRole, type EvaluatedStats } from "./stats";

export type EffectType =
  | "direct_damage"
  | "direct_heal"
  | "resource_change"
  | "timed_stat_modifier"
  | "periodic_damage"
  | "periodic_heal"
  | "stun"
  | "root";

export type StackPolicy = "replace" | "refresh" | "stack" | "ignore";
export type RefreshPolicy = "refresh" | "extend" | "ignore";

export interface MagnitudeFormula {
  kind: "constant" | "stat_role" | "stat_id";
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
}

export function resolveMagnitude(formula: MagnitudeFormula, stats: EvaluatedStats | null, fallbackAttack: number): number {
  const scale = finiteOr(formula.scale, 1);
  const bonus = finiteOr(formula.value, 0);
  const kind = String(formula.kind);
  if (kind === "constant") {
    return Math.max(0, bonus);
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
  if (kind === "stat_id" && formula.statId !== undefined && formula.statId !== null && stats !== null) {
    const value = stats.values[String(formula.statId)];
    const base = value !== undefined ? value : 0;
    return Math.max(0, Math.floor(base * scale + bonus));
  }
  return Math.max(0, Math.floor(fallbackAttack * scale + bonus));
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
  return {
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
}

export function hasControlTag(effects: ActiveEffect[] | undefined, tag: "stun" | "root"): boolean {
  if (effects === undefined) {
    return false;
  }
  for (let i = 0; i < effects.length; i++) {
    if (effects[i].type === tag && effects[i].remainingTicks > 0) {
      return true;
    }
  }
  return false;
}

export function effectModifiersFrom(effects: ActiveEffect[] | undefined): { [channel: string]: number } {
  const modifiers: { [channel: string]: number } = {};
  if (effects === undefined) {
    return modifiers;
  }
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (effect.type !== "timed_stat_modifier" || effect.statChannel.length === 0) {
      continue;
    }
    const current = modifiers[effect.statChannel] !== undefined ? modifiers[effect.statChannel] : 0;
    modifiers[effect.statChannel] = current + effect.magnitude * effect.stacks;
  }
  return modifiers;
}

export function applyEffectDefinition(
  state: StarterZoneState,
  definition: EffectDefinition,
  abilityId: string,
  source: MatchPlayer,
  target: EffectTarget,
  stats: EvaluatedStats | null,
  fallbackAttack: number,
  tick: number,
  events: CombatEvent[],
): void {
  const magnitude = resolveMagnitude(definition.magnitude, stats, fallbackAttack) * rankScale(source, abilityId);
  const type = String(definition.type);
  if (type === "direct_damage") {
    dealDamage(state, source, target, magnitude, abilityId, tick, events);
    return;
  }
  if (type === "direct_heal") {
    healTarget(target, magnitude, source, abilityId, events);
    return;
  }
  if (type === "resource_change") {
    changeResource(state, target, definition, magnitude, source, events);
    return;
  }
  applyStatus(target, definition, abilityId, source, magnitude, tick, events);
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
    const caster = source !== undefined ? source : placeholderCaster(effect.sourceId);
    dealDamage(state, caster, target, amount, effect.abilityId, tick, events);
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
    healTarget(target, amount, placeholderCaster(effect.sourceId), effect.abilityId, events);
  }
}

function applyStatus(
  target: EffectTarget,
  definition: EffectDefinition,
  abilityId: string,
  source: MatchPlayer,
  magnitude: number,
  tick: number,
  events: CombatEvent[],
): void {
  const durationTicks = cooldownTicks(definition.duration, SNAPSHOT_RATE_HZ);
  if (durationTicks <= 0 && definition.type !== "timed_stat_modifier" && definition.type !== "stun" && definition.type !== "root" && definition.type !== "periodic_damage" && definition.type !== "periodic_heal") {
    return;
  }
  const intervalTicks = cooldownTicks(definition.tickInterval, SNAPSHOT_RATE_HZ);
  const incoming: ActiveEffect = {
    effectId: definition.id,
    abilityId: abilityId,
    sourceId: source.userId,
    sourceKind: "player",
    type: definition.type,
    stacks: 1,
    magnitude: magnitude,
    remainingTicks: durationTicks > 0 ? durationTicks : 1,
    tickIntervalTicks: intervalTicks,
    nextTickAt: intervalTicks > 0 ? tick + intervalTicks : 0,
    stackPolicy: definition.stackPolicy,
    maxStacks: definition.maxStacks,
    refreshPolicy: definition.refreshPolicy,
    tags: copyTags(definition.tags),
    statChannel: definition.statChannel !== undefined ? definition.statChannel : "",
    resourceRole: definition.resourceRole !== undefined ? definition.resourceRole : "",
  };
  const existingIndex = findEffectIndex(target.effects, incoming.effectId, incoming.sourceId);
  if (existingIndex === -1) {
    target.effects.push(incoming);
    events.push({
      type: "effect_applied",
      sourceId: source.userId,
      sourceKind: "player",
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
}

function findEffectIndex(effects: ActiveEffect[], effectId: string, sourceId: string): number {
  for (let i = 0; i < effects.length; i++) {
    if (effects[i].effectId === effectId && effects[i].sourceId === sourceId) {
      return i;
    }
  }
  return -1;
}

function dealDamage(
  state: StarterZoneState,
  source: MatchPlayer,
  target: EffectTarget,
  amount: number,
  abilityId: string,
  tick: number,
  events: CombatEvent[],
): void {
  if (amount <= 0 || target.health <= 0) {
    return;
  }
  if (target.kind === "player" && target.id !== source.userId) {
    return;
  }
  const remaining = applyDamageAmount(target.health, amount);
  target.health = remaining;
  events.push({
    type: "hit",
    sourceId: source.userId,
    sourceKind: "player",
    targetId: target.id,
    targetKind: target.kind,
    damage: amount,
    remainingHealth: remaining,
    abilityId: abilityId,
    x: target.x,
    y: target.y,
  });
  writeTarget(state, target);
  if (remaining > 0) {
    return;
  }
  if (target.kind === "enemy") {
    const enemy = findEnemyById(state, target.id);
    if (enemy !== null) {
      killEnemy(enemy, tick, source.userId, SNAPSHOT_RATE_HZ, events);
    }
    return;
  }
  const player = state.players[target.id];
  if (player !== undefined) {
    killPlayer(player, tick, source.userId, state.playerRespawnDelaySec, SNAPSHOT_RATE_HZ, events);
  }
}

function healTarget(
  target: EffectTarget,
  amount: number,
  source: MatchPlayer,
  abilityId: string,
  events: CombatEvent[],
): void {
  if (amount <= 0 || target.health <= 0) {
    return;
  }
  const remaining = applyHealAmount(target.health, target.maxHealth, amount);
  target.health = remaining;
  events.push({
    type: "heal",
    sourceId: source.userId,
    sourceKind: "player",
    targetId: target.id,
    targetKind: target.kind,
    healing: amount,
    remainingHealth: remaining,
    abilityId: abilityId,
    x: target.x,
    y: target.y,
  });
}

function changeResource(
  state: StarterZoneState,
  target: EffectTarget,
  definition: EffectDefinition,
  magnitude: number,
  source: MatchPlayer,
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
    healTarget(target, magnitude, source, "", events);
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
    sourceId: source.userId,
    sourceKind: "player",
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

function findEnemyById(state: StarterZoneState, id: string): MatchEnemy | null {
  return findEnemy(state.enemies, id);
}

function placeholderCaster(sourceId: string): MatchPlayer {
  return {
    userId: sourceId,
    sessionId: "",
    username: "",
    characterId: "",
    name: "",
    x: 0,
    y: 0,
    maxHealth: 1,
    health: 1,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
  };
}

function copyTags(tags: ReadonlyArray<string>): string[] {
  const list: string[] = [];
  for (let i = 0; i < tags.length; i++) {
    list.push(tags[i]);
  }
  return list;
}
