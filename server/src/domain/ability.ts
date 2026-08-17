import { cooldownTicks, findEnemy, NEVER_ATTACKED_TICK, type CombatEvent } from "./combat";
import { applyPlayerAttack } from "./combat_pipeline";
import {
  applyEffectDefinition,
  effectModifiersFrom,
  enemyAsTarget,
  hasControlTag,
  playerAsTarget,
  writeTarget,
  type EffectDefinition,
  type MagnitudeFormula,
} from "./effects";
import { dict } from "./maps";
import { distance, lineBlocked, SNAPSHOT_RATE_HZ } from "./movement";
import type { MatchPlayer, StarterZoneState } from "./match_state";
import { cloneProgression, type CharacterProgression } from "./progression";
import {
  emptyModifierMap,
  equipmentModifiersFromGear,
  evaluateStats,
  resourceIdForRole,
  type EvaluatedStats,
} from "./stats";

export const HOTBAR_SIZE = 8;

export type TargetMode = "self" | "entity" | "ground_point";
export type RelationFilter = "self" | "friendly" | "hostile" | "any";

export interface ResourceCost {
  resourceId: string;
  amount: number;
}

export interface AbilityDefinition {
  id: string;
  displayName: string;
  displayNameKey: string;
  descriptionKey: string;
  targetMode: TargetMode;
  relationFilter: RelationFilter;
  range: number;
  minimumRange: number;
  areaShape: "none" | "circle";
  areaRadius: number;
  castTime: number;
  channelTime: number;
  globalCooldown: number;
  individualCooldown: number;
  resourceCosts: ResourceCost[];
  movementInterruptsCast: boolean;
  damageInterruptsCast: boolean;
  requiredLevel: number;
  requiredClassTags: ReadonlyArray<string>;
  prerequisites: ReadonlyArray<string>;
  effects: EffectDefinition[];
  animationAssetId: string;
  iconAssetId: string;
  soundAssetId: string;
  skillPointCost: number;
  maxRank: number;
}

export interface ActiveCast {
  abilityId: string;
  casterId: string;
  targetId: string;
  targetX: number;
  targetY: number;
  startTick: number;
  completionTick: number;
  channelUntilTick: number;
  phase: "casting" | "channeling";
  interruptReason: string;
  requestId: string;
}

export interface AbilityDecision {
  ok: boolean;
  code: string;
  replay: boolean;
}

export interface AbilityUseInput {
  abilityId: string;
  targetId?: string;
  targetX?: number;
  targetY?: number;
  requestId: string;
}

export function abilityDefinitionsFromContent(abilities: {
  [id: string]: {
    id: string;
    displayName: string;
    displayNameKey: string;
    descriptionKey: string;
    targetMode: string;
    relationFilter: string;
    range: number;
    minimumRange: number;
    areaShape: string;
    areaRadius: number;
    castTime: number;
    channelTime: number;
    globalCooldown: number;
    individualCooldown: number;
    resourceCosts: ReadonlyArray<{ resourceId: string; amount: number }>;
    movementInterruptsCast: boolean;
    damageInterruptsCast: boolean;
    requiredLevel: number;
    requiredClassTags: ReadonlyArray<string>;
    prerequisites: ReadonlyArray<string>;
    effects: ReadonlyArray<{
      id: string;
      type: string;
      source: string;
      target: string;
      magnitude: MagnitudeFormula;
      duration: number;
      tickInterval: number;
      stackPolicy: string;
      maxStacks: number;
      refreshPolicy: string;
      removalReason: string;
      tags: ReadonlyArray<string>;
      statChannel?: string;
      resourceRole?: string;
    }>;
    animationAssetId: string;
    iconAssetId: string;
    soundAssetId: string;
    skillPointCost?: number;
    maxRank?: number;
  };
}): { [id: string]: AbilityDefinition } {
  const map: { [id: string]: AbilityDefinition } = {};
  const ids = Object.keys(abilities);
  for (let i = 0; i < ids.length; i++) {
    map[ids[i]] = copyAbility(abilities[ids[i]]);
  }
  return map;
}

export function emptyHotbar(): string[] {
  const slots: string[] = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    slots.push("");
  }
  return slots;
}

export function cloneActiveCast(cast: ActiveCast | undefined): ActiveCast | undefined {
  if (cast == null) {
    return undefined;
  }
  return {
    abilityId: cast.abilityId,
    casterId: cast.casterId,
    targetId: cast.targetId,
    targetX: cast.targetX,
    targetY: cast.targetY,
    startTick: cast.startTick,
    completionTick: cast.completionTick,
    channelUntilTick: cast.channelUntilTick,
    phase: cast.phase,
    interruptReason: cast.interruptReason,
    requestId: cast.requestId,
  };
}

export function cloneResourceMap(map: { [id: string]: number } | undefined): { [id: string]: number } {
  const out: { [id: string]: number } = {};
  const source = dict(map);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = source[keys[i]];
  }
  return out;
}

export function cloneCooldownMap(map: { [id: string]: number } | undefined): { [id: string]: number } {
  return cloneResourceMap(map);
}

export function isAbilityUnlocked(progression: CharacterProgression | undefined, abilityId: string): boolean {
  if (progression === undefined) {
    return false;
  }
  return progression.unlockedAbilityIds.indexOf(abilityId) !== -1;
}

export function ensureAbilityOwnership(
  progression: CharacterProgression,
  startingAbilities: ReadonlyArray<string>,
  basicAbilityId: string,
): boolean {
  let changed = false;
  if (progression.hotbar === undefined || progression.hotbar.length !== HOTBAR_SIZE) {
    progression.hotbar = emptyHotbar();
    changed = true;
  }
  if (progression.abilityRanks === undefined) {
    progression.abilityRanks = {};
    changed = true;
  }
  for (let i = 0; i < startingAbilities.length; i++) {
    const id = startingAbilities[i];
    if (progression.unlockedAbilityIds.indexOf(id) === -1) {
      progression.unlockedAbilityIds.push(id);
      changed = true;
    }
    if (progression.abilityRanks[id] === undefined) {
      progression.abilityRanks[id] = 1;
      changed = true;
    }
  }
  if (basicAbilityId.length > 0 && progression.unlockedAbilityIds.indexOf(basicAbilityId) === -1) {
    progression.unlockedAbilityIds.push(basicAbilityId);
    changed = true;
  }
  if (progression.hotbar[0] === "" && progression.unlockedAbilityIds.length > 0) {
    const first = startingAbilities.length > 0 ? startingAbilities[0] : progression.unlockedAbilityIds[0];
    progression.hotbar[0] = first;
    changed = true;
  }
  return changed;
}

export function assignHotbar(
  progression: CharacterProgression,
  slotIndex: number,
  abilityId: string,
  requestId: string,
  tick: number,
): { progression: CharacterProgression; ok: boolean; code: string; replay: boolean; changed: boolean } {
  const current = cloneProgression(progression);
  if (current.assignHotbarByRequestId === undefined) {
    current.assignHotbarByRequestId = {};
  }
  const previous = current.assignHotbarByRequestId[requestId];
  if (previous !== undefined) {
    return { progression: current, ok: previous.ok, code: previous.code, replay: true, changed: false };
  }
  if (slotIndex < 0 || slotIndex >= HOTBAR_SIZE || slotIndex !== Math.floor(slotIndex)) {
    return rememberHotbar(current, requestId, tick, false, "invalid_slot");
  }
  if (abilityId.length > 0 && current.unlockedAbilityIds.indexOf(abilityId) === -1) {
    return rememberHotbar(current, requestId, tick, false, "ability_locked");
  }
  if (current.hotbar === undefined || current.hotbar.length !== HOTBAR_SIZE) {
    current.hotbar = emptyHotbar();
  }
  current.hotbar[slotIndex] = abilityId;
  return rememberHotbar(current, requestId, tick, true, "ok");
}

export function unlockAbility(
  progression: CharacterProgression,
  definition: AbilityDefinition | undefined,
  classTags: ReadonlyArray<string>,
  classId: string,
  requestId: string,
  tick: number,
): { progression: CharacterProgression; ok: boolean; code: string; replay: boolean; changed: boolean } {
  const current = cloneProgression(progression);
  if (current.unlockAbilityByRequestId === undefined) {
    current.unlockAbilityByRequestId = {};
  }
  const previous = current.unlockAbilityByRequestId[requestId];
  if (previous !== undefined) {
    return { progression: current, ok: previous.ok, code: previous.code, replay: true, changed: false };
  }
  if (definition === undefined) {
    return rememberUnlock(current, requestId, tick, false, "invalid_id");
  }
  const already = current.unlockedAbilityIds.indexOf(definition.id) !== -1;
  const rank = current.abilityRanks !== undefined && current.abilityRanks[definition.id] !== undefined
    ? current.abilityRanks[definition.id]
    : 0;
  if (already && rank >= definition.maxRank) {
    return rememberUnlock(current, requestId, tick, false, "already_unlocked");
  }
  if (current.level < definition.requiredLevel) {
    return rememberUnlock(current, requestId, tick, false, "level_restricted");
  }
  if (!classTagsAllowed(definition.requiredClassTags, classTags, classId)) {
    return rememberUnlock(current, requestId, tick, false, "class_restricted");
  }
  for (let i = 0; i < definition.prerequisites.length; i++) {
    if (current.unlockedAbilityIds.indexOf(definition.prerequisites[i]) === -1) {
      return rememberUnlock(current, requestId, tick, false, "prerequisite_missing");
    }
  }
  if (current.unspentSkillPoints < definition.skillPointCost) {
    return rememberUnlock(current, requestId, tick, false, "insufficient_points");
  }
  current.unspentSkillPoints -= definition.skillPointCost;
  if (!already) {
    current.unlockedAbilityIds.push(definition.id);
  }
  if (current.abilityRanks === undefined) {
    current.abilityRanks = {};
  }
  current.abilityRanks[definition.id] = already ? rank + 1 : 1;
  return rememberUnlock(current, requestId, tick, true, "ok");
}

export function useAbility(
  state: StarterZoneState,
  userId: string,
  input: AbilityUseInput,
  tick: number,
  events: CombatEvent[],
): AbilityDecision {
  const player = state.players[userId];
  if (player === undefined) {
    return { ok: false, code: "player_missing", replay: false };
  }
  const remembered = replayAbility(player, input.requestId);
  if (remembered !== null) {
    return remembered;
  }
  const remember = (code: string, ok: boolean): AbilityDecision => {
    return rememberUse(player, input.requestId, code, ok, tick);
  };
  if (player.health <= 0) {
    return remember("player_dead", false);
  }
  if (hasControlTag(player.effects, "stun")) {
    return remember("control_restricted", false);
  }
  const definition = state.abilitiesById !== undefined ? state.abilitiesById[input.abilityId] : undefined;
  if (definition === undefined) {
    return remember("invalid_id", false);
  }
  if (!isAbilityUnlocked(player.progression, definition.id)) {
    return remember("ability_locked", false);
  }
  if (player.progression !== undefined && player.progression.level < definition.requiredLevel) {
    return remember("level_restricted", false);
  }
  const classTags = classTagsFor(state, player.classId !== undefined ? player.classId : "");
  if (!classTagsAllowed(definition.requiredClassTags, classTags, player.classId !== undefined ? player.classId : "")) {
    return remember("class_restricted", false);
  }
  if (player.activeCast !== undefined && player.activeCast.interruptReason === "") {
    return remember("already_casting", false);
  }
  const targeting = resolveTargets(state, player, definition, input);
  if (!targeting.ok) {
    return remember(targeting.code, false);
  }
  if (!resourcesAvailable(player, definition)) {
    return remember("insufficient_resource", false);
  }
  const cooldownCode = cooldownBlock(player, definition, tick);
  if (cooldownCode !== "") {
    return remember(cooldownCode, false);
  }

  spendResources(player, definition);
  startCooldowns(player, definition, tick);
  player.lastAttackTick = tick;

  const castTicks = cooldownTicks(definition.castTime, SNAPSHOT_RATE_HZ);
  const channelTicks = cooldownTicks(definition.channelTime, SNAPSHOT_RATE_HZ);
  if (castTicks > 0) {
    player.activeCast = {
      abilityId: definition.id,
      casterId: player.userId,
      targetId: targeting.primaryId,
      targetX: targeting.pointX,
      targetY: targeting.pointY,
      startTick: tick,
      completionTick: tick + castTicks,
      channelUntilTick: channelTicks > 0 ? tick + castTicks + channelTicks : 0,
      phase: "casting",
      interruptReason: "",
      requestId: input.requestId,
    };
    return remember("ok", true);
  }
  applyResolvedAbility(state, player, definition, targeting, tick, events);
  if (channelTicks > 0) {
    player.activeCast = {
      abilityId: definition.id,
      casterId: player.userId,
      targetId: targeting.primaryId,
      targetX: targeting.pointX,
      targetY: targeting.pointY,
      startTick: tick,
      completionTick: tick,
      channelUntilTick: tick + channelTicks,
      phase: "channeling",
      interruptReason: "",
      requestId: input.requestId,
    };
  }
  return remember("ok", true);
}

export function cancelCast(player: MatchPlayer | undefined, requestId: string, tick: number, events: CombatEvent[]): AbilityDecision {
  if (player === undefined) {
    return { ok: false, code: "player_missing", replay: false };
  }
  const remembered = replayAbility(player, requestId);
  if (remembered !== null) {
    return remembered;
  }
  if (player.activeCast === undefined || player.activeCast.interruptReason !== "") {
    return rememberUse(player, requestId, "not_casting", false, tick);
  }
  interruptCast(player, "cancelled", tick, events);
  return rememberUse(player, requestId, "ok", true, tick);
}

export function interruptCast(player: MatchPlayer, reason: string, tick: number, events: CombatEvent[]): void {
  if (player.activeCast === undefined || player.activeCast.interruptReason !== "") {
    return;
  }
  player.activeCast.interruptReason = reason;
  player.activeCast.completionTick = tick;
  player.activeCast.channelUntilTick = 0;
  events.push({
    type: "interrupt",
    sourceId: player.userId,
    sourceKind: "player",
    targetId: player.userId,
    targetKind: "player",
    interruptReason: reason,
    abilityId: player.activeCast.abilityId,
    remainingHealth: player.health,
    x: player.x,
    y: player.y,
  });
  player.activeCast = undefined;
}

export function tickCasts(state: StarterZoneState, tick: number, events: CombatEvent[]): void {
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    const cast = player.activeCast;
    if (cast === undefined || cast.interruptReason !== "") {
      continue;
    }
    if (cast.phase === "casting" && tick >= cast.completionTick) {
      const definition = state.abilitiesById !== undefined ? state.abilitiesById[cast.abilityId] : undefined;
      if (definition !== undefined) {
        const targeting = {
          ok: true,
          code: "ok",
          primaryId: cast.targetId,
          pointX: cast.targetX,
          pointY: cast.targetY,
        };
        applyResolvedAbility(state, player, definition, targeting, tick, events);
      }
      if (cast.channelUntilTick > tick) {
        cast.phase = "channeling";
      } else {
        player.activeCast = undefined;
      }
      continue;
    }
    if (cast.phase === "channeling" && (cast.channelUntilTick <= 0 || tick >= cast.channelUntilTick)) {
      player.activeCast = undefined;
    }
  }
}

export function interruptMovingCasters(state: StarterZoneState, previous: { [userId: string]: { x: number; y: number } }, tick: number, events: CombatEvent[]): void {
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    const before = previous[player.userId];
    if (before === undefined || player.activeCast === undefined) {
      continue;
    }
    const definition = state.abilitiesById !== undefined ? state.abilitiesById[player.activeCast.abilityId] : undefined;
    if (definition === undefined || !definition.movementInterruptsCast) {
      continue;
    }
    if (player.x !== before.x || player.y !== before.y) {
      interruptCast(player, "movement", tick, events);
    }
  }
}

export function interruptOnDamage(player: MatchPlayer, state: StarterZoneState, tick: number, events: CombatEvent[]): void {
  if (player.activeCast === undefined) {
    return;
  }
  const definition = state.abilitiesById !== undefined ? state.abilitiesById[player.activeCast.abilityId] : undefined;
  if (definition === undefined || !definition.damageInterruptsCast) {
    return;
  }
  interruptCast(player, "damage", tick, events);
}

export function clearTransientCast(player: MatchPlayer): void {
  player.activeCast = undefined;
}

export function startingAbilitiesForClass(state: StarterZoneState, classId: string): string[] {
  if (state.progressionCatalog === undefined || classId.length === 0) {
    return [];
  }
  const definition = state.progressionCatalog.classes[classId];
  if (definition === undefined || definition.startingAbilities === undefined) {
    return [];
  }
  const list: string[] = [];
  for (let i = 0; i < definition.startingAbilities.length; i++) {
    list.push(definition.startingAbilities[i]);
  }
  return list;
}

export function prepareJoinedPlayerAbilities(
  state: StarterZoneState,
  player: MatchPlayer,
  fillResources: boolean,
): boolean {
  clearTransientCast(player);
  let changed = false;
  if (player.progression !== undefined) {
    const classId = player.classId !== undefined ? player.classId : "";
    const basicId = state.basicAbilityId !== undefined ? state.basicAbilityId : "";
    changed = ensureAbilityOwnership(player.progression, startingAbilitiesForClass(state, classId), basicId);
  }
  if (fillResources) {
    fillMaxResources(state, player);
  }
  return changed;
}

function fillMaxResources(state: StarterZoneState, player: MatchPlayer): void {
  if (state.progressionCatalog === undefined) {
    return;
  }
  const manaId = resourceIdForRole(state.progressionCatalog, "mana");
  if (manaId.length === 0) {
    return;
  }
  const stats = casterStats(state, player);
  const resources = cloneResourceMap(player.resources);
  resources[manaId] = stats !== null ? stats.maxMana : 0;
  player.resources = resources;
}

export function useLegacyAttackOrAbility(
  state: StarterZoneState,
  userId: string,
  targetId: string,
  requestId: string,
  tick: number,
  events: CombatEvent[],
  attack: number,
  attackRange: number,
  attackCooldownSec: number,
): AbilityDecision {
  const basicId = state.basicAbilityId !== undefined ? state.basicAbilityId : "";
  const hasAbility = basicId.length > 0 && state.abilitiesById !== undefined && state.abilitiesById[basicId] !== undefined;
  const player = state.players[userId];
  if (hasAbility && player !== undefined && isAbilityUnlocked(player.progression, basicId)) {
    return useAbility(state, userId, { abilityId: basicId, targetId: targetId, requestId: requestId }, tick, events);
  }
  const decision = applyPlayerAttack(
    {
      player: player,
      targetId: targetId,
      requestId: requestId,
      tick: tick,
      enemies: state.enemies,
      attack: attack,
      attackRange: attackRange,
      attackCooldownSec: attackCooldownSec,
      tickRate: SNAPSHOT_RATE_HZ,
      match: state,
    },
    events,
  );
  return { ok: decision.ok, code: decision.code, replay: decision.replay };
}

export function publicAbilityState(
  player: MatchPlayer,
  tick: number,
): { [key: string]: unknown } {
  const progression = player.progression;
  const hotbar = progression !== undefined && progression.hotbar !== undefined ? progression.hotbar : emptyHotbar();
  const cooldowns: { [id: string]: number } = {};
  const source = dict(player.abilityCooldowns);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const ready = source[keys[i]];
    const remaining = ready - tick;
    cooldowns[keys[i]] = remaining > 0 ? remaining : 0;
  }
  return {
    unlockedAbilityIds: progression !== undefined ? progression.unlockedAbilityIds : [],
    hotbar: hotbar.slice(),
    abilityRanks: progression !== undefined && progression.abilityRanks !== undefined ? progression.abilityRanks : {},
    resources: cloneResourceMap(player.resources),
    cooldowns: cooldowns,
    globalCooldownRemaining: player.globalCooldownUntilTick !== undefined && player.globalCooldownUntilTick > tick
      ? player.globalCooldownUntilTick - tick
      : 0,
    activeCast: player.activeCast !== undefined ? cloneActiveCast(player.activeCast) : null,
    effects: publicEffects(player.effects),
  };
}

function publicEffects(effects: MatchPlayer["effects"]): { [key: string]: unknown }[] {
  const list: { [key: string]: unknown }[] = [];
  const source = effects !== undefined ? effects : [];
  for (let i = 0; i < source.length; i++) {
    list.push({
      effectId: source[i].effectId,
      abilityId: source[i].abilityId,
      type: source[i].type,
      stacks: source[i].stacks,
      remainingTicks: source[i].remainingTicks,
      tags: source[i].tags,
    });
  }
  return list;
}

interface TargetingResult {
  ok: boolean;
  code: string;
  primaryId: string;
  pointX: number;
  pointY: number;
}

function resolveTargets(
  state: StarterZoneState,
  player: MatchPlayer,
  definition: AbilityDefinition,
  input: AbilityUseInput,
): TargetingResult {
  if (definition.targetMode === "self") {
    return { ok: true, code: "ok", primaryId: player.userId, pointX: player.x, pointY: player.y };
  }
  if (definition.targetMode === "ground_point") {
    if (input.targetX === undefined || input.targetY === undefined || !isFinite(input.targetX) || !isFinite(input.targetY)) {
      return { ok: false, code: "invalid_target", primaryId: "", pointX: 0, pointY: 0 };
    }
    const dist = distance(player.x, player.y, input.targetX, input.targetY);
    if (dist > definition.range) {
      return { ok: false, code: "out_of_range", primaryId: "", pointX: 0, pointY: 0 };
    }
    if (dist < definition.minimumRange) {
      return { ok: false, code: "too_close", primaryId: "", pointX: 0, pointY: 0 };
    }
    if (lineBlocked(player.x, player.y, input.targetX, input.targetY, state.collisions)) {
      return { ok: false, code: "line_of_sight", primaryId: "", pointX: 0, pointY: 0 };
    }
    return { ok: true, code: "ok", primaryId: "", pointX: input.targetX, pointY: input.targetY };
  }
  let targetId = input.targetId !== undefined ? input.targetId : "";
  if (targetId.length === 0) {
    if (definition.relationFilter === "hostile") {
      targetId = player.hostileTargetId !== undefined ? player.hostileTargetId : "";
    } else if (definition.relationFilter === "friendly") {
      targetId = player.friendlyTargetId !== undefined ? player.friendlyTargetId : "";
    }
  }
  if (targetId.length === 0) {
    return { ok: false, code: "invalid_target", primaryId: "", pointX: 0, pointY: 0 };
  }
  const relation = classifyTarget(state, player, targetId);
  if (relation === "missing") {
    return { ok: false, code: "invalid_target", primaryId: "", pointX: 0, pointY: 0 };
  }
  if (relation === "dead") {
    return { ok: false, code: "target_dead", primaryId: "", pointX: 0, pointY: 0 };
  }
  if (relation === "friendly" && definition.relationFilter === "hostile") {
    return { ok: false, code: "pvp_disabled", primaryId: "", pointX: 0, pointY: 0 };
  }
  if (!relationAllowed(definition.relationFilter, relation, player.userId === targetId)) {
    return { ok: false, code: "invalid_relation", primaryId: "", pointX: 0, pointY: 0 };
  }
  const pose = targetPose(state, targetId);
  if (pose === null) {
    return { ok: false, code: "invalid_target", primaryId: "", pointX: 0, pointY: 0 };
  }
  const dist = distance(player.x, player.y, pose.x, pose.y);
  if (dist > definition.range) {
    return { ok: false, code: "out_of_range", primaryId: "", pointX: 0, pointY: 0 };
  }
  if (dist < definition.minimumRange) {
    return { ok: false, code: "too_close", primaryId: "", pointX: 0, pointY: 0 };
  }
  if (lineBlocked(player.x, player.y, pose.x, pose.y, state.collisions)) {
    return { ok: false, code: "line_of_sight", primaryId: "", pointX: 0, pointY: 0 };
  }
  return { ok: true, code: "ok", primaryId: targetId, pointX: pose.x, pointY: pose.y };
}

function applyResolvedAbility(
  state: StarterZoneState,
  player: MatchPlayer,
  definition: AbilityDefinition,
  targeting: { primaryId: string; pointX: number; pointY: number },
  tick: number,
  events: CombatEvent[],
): void {
  const stats = casterStats(state, player);
  const fallbackAttack =
    player.derivedAttack !== undefined && player.derivedAttack > 0 ? player.derivedAttack : state.playerAttack;
  const targets = collectEffectTargets(state, player, definition, targeting);
  for (let e = 0; e < definition.effects.length; e++) {
    const effect = definition.effects[e];
    const selected = targetsForEffect(player, effect.target, targeting.primaryId, targets);
    for (let t = 0; t < selected.length; t++) {
      applyEffectDefinition(state, effect, definition.id, player, selected[t], stats, fallbackAttack, tick, events);
      writeTarget(state, selected[t]);
    }
  }
}

function collectEffectTargets(
  state: StarterZoneState,
  player: MatchPlayer,
  definition: AbilityDefinition,
  targeting: { primaryId: string; pointX: number; pointY: number },
) {
  const list = [];
  if (String(definition.areaShape) === "circle" && definition.areaRadius > 0) {
    const originX = targeting.pointX;
    const originY = targeting.pointY;
    const playerIds = Object.keys(state.players);
    for (let i = 0; i < playerIds.length; i++) {
      const other = state.players[playerIds[i]];
      if (distance(originX, originY, other.x, other.y) <= definition.areaRadius) {
        const relation = classifyTarget(state, player, other.userId);
        if (relationAllowed(definition.relationFilter, relation, other.userId === player.userId) && relation !== "hostile_player") {
          list.push(playerAsTarget(other));
        }
      }
    }
    for (let e = 0; e < state.enemies.length; e++) {
      const enemy = state.enemies[e];
      if (enemy.health <= 0) {
        continue;
      }
      if (distance(originX, originY, enemy.x, enemy.y) <= definition.areaRadius) {
        const relation = classifyTarget(state, player, enemy.id);
        if (relationAllowed(definition.relationFilter, relation, false)) {
          list.push(enemyAsTarget(enemy));
        }
      }
    }
    return list;
  }
  if (String(targeting.primaryId) === String(player.userId)) {
    list.push(playerAsTarget(player));
    return list;
  }
  const other = state.players[targeting.primaryId];
  if (other !== undefined) {
    list.push(playerAsTarget(other));
    return list;
  }
  const enemy = findEnemy(state.enemies, targeting.primaryId);
  if (enemy !== null) {
    list.push(enemyAsTarget(enemy));
  }
  return list;
}

function targetsForEffect(
  player: MatchPlayer,
  mode: string,
  primaryId: string,
  collected: ReturnType<typeof collectEffectTargets>,
) {
  const wanted = String(mode);
  if (wanted === "self") {
    return [playerAsTarget(player)];
  }
  if (wanted === "area") {
    return collected;
  }
  const primary = String(primaryId);
  for (let i = 0; i < collected.length; i++) {
    if (String(collected[i].id) === primary || (primary === "" && collected.length === 1)) {
      return [collected[i]];
    }
  }
  return collected.length > 0 ? [collected[0]] : [];
}

function classifyTarget(state: StarterZoneState, player: MatchPlayer, targetId: string): string {
  if (targetId === player.userId) {
    return player.health > 0 ? "self" : "dead";
  }
  const other = state.players[targetId];
  if (other !== undefined) {
    if (other.health <= 0) {
      return "dead";
    }
    return "friendly";
  }
  const enemy = findEnemy(state.enemies, targetId);
  if (enemy === null) {
    return "missing";
  }
  if (enemy.health <= 0 || enemy.aiState === "dead") {
    return "dead";
  }
  return "hostile";
}

function relationAllowed(filter: RelationFilter, relation: string, isSelf: boolean): boolean {
  if (filter === "self") {
    return isSelf || relation === "self";
  }
  if (filter === "hostile") {
    return relation === "hostile";
  }
  if (filter === "friendly") {
    return relation === "self" || relation === "friendly";
  }
  return relation !== "missing" && relation !== "dead";
}

function targetPose(state: StarterZoneState, targetId: string): { x: number; y: number } | null {
  const player = state.players[targetId];
  if (player !== undefined) {
    return { x: player.x, y: player.y };
  }
  const enemy = findEnemy(state.enemies, targetId);
  if (enemy === null) {
    return null;
  }
  return { x: enemy.x, y: enemy.y };
}

function resourcesAvailable(player: MatchPlayer, definition: AbilityDefinition): boolean {
  const resources = dict(player.resources);
  for (let i = 0; i < definition.resourceCosts.length; i++) {
    const cost = definition.resourceCosts[i];
    const current = resources[cost.resourceId] !== undefined ? resources[cost.resourceId] : 0;
    if (current < cost.amount) {
      return false;
    }
  }
  return true;
}

function spendResources(player: MatchPlayer, definition: AbilityDefinition): void {
  const resources = dict(player.resources);
  for (let i = 0; i < definition.resourceCosts.length; i++) {
    const cost = definition.resourceCosts[i];
    const current = resources[cost.resourceId] !== undefined ? resources[cost.resourceId] : 0;
    resources[cost.resourceId] = current - cost.amount;
  }
  player.resources = resources;
}

function cooldownBlock(player: MatchPlayer, definition: AbilityDefinition, tick: number): string {
  const gcdUntil = player.globalCooldownUntilTick !== undefined ? player.globalCooldownUntilTick : NEVER_ATTACKED_TICK;
  if (gcdUntil > tick) {
    return "on_global_cooldown";
  }
  const ready = dict(player.abilityCooldowns)[definition.id];
  if (ready !== undefined && ready > tick) {
    return "on_cooldown";
  }
  return "";
}

function startCooldowns(player: MatchPlayer, definition: AbilityDefinition, tick: number): void {
  const gcdTicks = cooldownTicks(definition.globalCooldown, SNAPSHOT_RATE_HZ);
  if (gcdTicks > 0) {
    player.globalCooldownUntilTick = tick + gcdTicks;
  }
  const icdTicks = cooldownTicks(definition.individualCooldown, SNAPSHOT_RATE_HZ);
  if (icdTicks > 0) {
    const map = dict(player.abilityCooldowns);
    map[definition.id] = tick + icdTicks;
    player.abilityCooldowns = map;
  }
}

function casterStats(state: StarterZoneState, player: MatchPlayer): EvaluatedStats | null {
  if (state.progressionCatalog === undefined || player.classId === undefined || player.progression === undefined) {
    return null;
  }
  return evaluateStats(state.progressionCatalog, {
    classId: player.classId,
    level: player.progression.level,
    allocatedAttributes: player.progression.allocatedAttributes,
    equipmentModifiers: equipmentModifiersFromGear(player.equipment, player.inventory, state.itemsById),
    effectModifiers: effectModifiersFrom(player.effects),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
}

function classTagsFor(state: StarterZoneState, classId: string): string[] {
  if (state.classTags === undefined || classId.length === 0) {
    return [];
  }
  const tags = state.classTags[classId];
  return tags !== undefined ? tags.slice() : [];
}

function classTagsAllowed(required: ReadonlyArray<string>, tags: ReadonlyArray<string>, classId: string): boolean {
  if (required.length === 0) {
    return true;
  }
  for (let i = 0; i < required.length; i++) {
    if (required[i] === classId || tags.indexOf(required[i]) !== -1) {
      return true;
    }
  }
  return false;
}

function replayAbility(player: MatchPlayer, requestId: string): AbilityDecision | null {
  const map = dict(player.abilityUseByRequestId);
  const previous = map[requestId];
  if (previous === undefined) {
    return null;
  }
  return { ok: previous.ok, code: previous.code, replay: true };
}

function rememberUse(player: MatchPlayer, requestId: string, code: string, ok: boolean, tick: number): AbilityDecision {
  const map = dict(player.abilityUseByRequestId);
  map[requestId] = { ok: ok, code: code };
  player.abilityUseByRequestId = map;
  player.abilityUseTicks = stampTick(player.abilityUseTicks, requestId, tick);
  player.lastAttackRequestId = requestId;
  player.lastAttackResultCode = code;
  player.lastAttackResultOk = ok;
  return { ok: ok, code: code, replay: false };
}

function rememberUnlock(
  current: CharacterProgression,
  requestId: string,
  tick: number,
  ok: boolean,
  code: string,
): { progression: CharacterProgression; ok: boolean; code: string; replay: boolean; changed: boolean } {
  current.unlockAbilityByRequestId = dict(current.unlockAbilityByRequestId);
  current.unlockAbilityByRequestId[requestId] = { ok: ok, code: code };
  current.unlockRequestTicks = stampTick(current.unlockRequestTicks, requestId, tick);
  return { progression: current, ok: ok, code: code, replay: false, changed: true };
}

function rememberHotbar(
  current: CharacterProgression,
  requestId: string,
  tick: number,
  ok: boolean,
  code: string,
): { progression: CharacterProgression; ok: boolean; code: string; replay: boolean; changed: boolean } {
  current.assignHotbarByRequestId = dict(current.assignHotbarByRequestId);
  current.assignHotbarByRequestId[requestId] = { ok: ok, code: code };
  current.hotbarRequestTicks = stampTick(current.hotbarRequestTicks, requestId, tick);
  return { progression: current, ok: ok, code: code, replay: false, changed: true };
}

function stampTick(ticks: { [id: string]: number } | undefined, key: string, tick: number): { [id: string]: number } {
  const next: { [id: string]: number } = {};
  const source = dict(ticks);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    next[keys[i]] = source[keys[i]];
  }
  next[key] = tick;
  return next;
}

function copyAbility(raw: Parameters<typeof abilityDefinitionsFromContent>[0][string]): AbilityDefinition {
  const costs: ResourceCost[] = [];
  for (let i = 0; i < raw.resourceCosts.length; i++) {
    costs.push({ resourceId: raw.resourceCosts[i].resourceId, amount: raw.resourceCosts[i].amount });
  }
  const tags: string[] = [];
  for (let t = 0; t < raw.requiredClassTags.length; t++) {
    tags.push(raw.requiredClassTags[t]);
  }
  const prereq: string[] = [];
  for (let p = 0; p < raw.prerequisites.length; p++) {
    prereq.push(raw.prerequisites[p]);
  }
  const effects: EffectDefinition[] = [];
  for (let e = 0; e < raw.effects.length; e++) {
    const effect = raw.effects[e];
    const effectTags: string[] = [];
    for (let g = 0; g < effect.tags.length; g++) {
      effectTags.push(effect.tags[g]);
    }
    const copied: EffectDefinition = {
      id: effect.id,
      type: effect.type as EffectDefinition["type"],
      source: "caster",
      target: effect.target as EffectDefinition["target"],
      magnitude: copyMagnitude(effect.magnitude),
      duration: effect.duration,
      tickInterval: effect.tickInterval,
      stackPolicy: effect.stackPolicy as EffectDefinition["stackPolicy"],
      maxStacks: effect.maxStacks,
      refreshPolicy: effect.refreshPolicy as EffectDefinition["refreshPolicy"],
      removalReason: effect.removalReason,
      tags: effectTags,
    };
    if (effect.statChannel !== undefined) {
      copied.statChannel = effect.statChannel;
    }
    if (effect.resourceRole !== undefined) {
      copied.resourceRole = effect.resourceRole;
    }
    effects.push(copied);
  }
  return {
    id: raw.id,
    displayName: raw.displayName,
    displayNameKey: raw.displayNameKey,
    descriptionKey: raw.descriptionKey,
    targetMode: raw.targetMode as TargetMode,
    relationFilter: raw.relationFilter as RelationFilter,
    range: raw.range,
    minimumRange: raw.minimumRange,
    areaShape: raw.areaShape as "none" | "circle",
    areaRadius: raw.areaRadius,
    castTime: raw.castTime,
    channelTime: raw.channelTime,
    globalCooldown: raw.globalCooldown,
    individualCooldown: raw.individualCooldown,
    resourceCosts: costs,
    movementInterruptsCast: raw.movementInterruptsCast,
    damageInterruptsCast: raw.damageInterruptsCast,
    requiredLevel: raw.requiredLevel,
    requiredClassTags: tags,
    prerequisites: prereq,
    effects: effects,
    animationAssetId: raw.animationAssetId,
    iconAssetId: raw.iconAssetId,
    soundAssetId: raw.soundAssetId,
    skillPointCost: raw.skillPointCost !== undefined ? raw.skillPointCost : 0,
    maxRank: raw.maxRank !== undefined ? raw.maxRank : 1,
  };
}

function copyMagnitude(raw: MagnitudeFormula): MagnitudeFormula {
  const copied: MagnitudeFormula = {
    kind: raw.kind,
  };
  if (typeof raw.value === "number" && isFinite(raw.value)) {
    copied.value = raw.value;
  }
  if (typeof raw.scale === "number" && isFinite(raw.scale)) {
    copied.scale = raw.scale;
  }
  if (typeof raw.role === "string" && raw.role.length > 0) {
    copied.role = raw.role;
  }
  if (typeof raw.statId === "string" && raw.statId.length > 0) {
    copied.statId = raw.statId;
  }
  return copied;
}
