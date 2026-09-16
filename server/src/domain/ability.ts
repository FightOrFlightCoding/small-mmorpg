import { cooldownTicks, findEnemy, isCooldownReady, NEVER_ATTACKED_TICK, rememberAttack, type CombatEvent } from "./combat";
import { applyCombat, applyPlayerAttack } from "./combat_pipeline";
import {
  applyEffectDefinition,
  effectModifiersFrom,
  enemyAsTarget,
  hasControlTag,
  playerAsTarget,
  writeTarget,
  ownedCrowdControlCount,
  type EffectTarget,
  type EffectDefinition,
  type MagnitudeFormula,
} from "./effects";
import { dict } from "./maps";
import { distance, lineBlocked, resolveVault, SNAPSHOT_RATE_HZ } from "./movement";
import { entitiesInCone, entitiesOnLine, facingVector, livingEntities, nearestHostileDistance } from "./targeting";
import type { MatchPlayer, StarterZoneState } from "./match_state";
import { cloneProgression, type CharacterProgression } from "./progression";
import { usesCanonicalCreateState } from "./canonical_progression";
import {
  ABILITY_CATEGORY_PASSIVE,
  assignCanonicalHotbar,
  publicCanonicalHotbar,
  syncDerivedAbilityOwnership,
  usesCanonicalTalentRuntime,
} from "./canonical_talents";
import { CANONICAL_SOURCE_TALENT_NODE, formulaCastTime, scalePower, type CanonicalModifier } from "./canonical_stats";
import { attackSpeedProduct, autoAttackBase, cooldownRecoveryRate, hasteScaledAttackInterval, resetAbilityCooldown, scaledManaCost, scheduleDelayedGround } from "./canonical_combat";
import { conditionalTalentModifierValue, passiveTalentModifierValue, resolveAbilityTalentModifiers, talentModifiersForContext, talentModifiersForProgression, type TalentModifierContext } from "./talent_modifiers";
import {
  evaluateStats,
  identifiedModifiersFromEffectMap,
  playerStatContext,
  resourceIdForRole,
  type EvaluatedStats,
  type ProgressionCatalog,
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
  areaShape: "none" | "circle" | "line" | "cone" | "ground";
  areaRadius: number;
  lineWidth?: number;
  lineLength?: number;
  coneAngleDegrees?: number;
  delay?: number;
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

export interface AutoAttackDefinition {
  id: string;
  ownerClassId: string;
  baseDamage: number;
  interval: number;
  range: number;
  school: "melee" | "ranged" | "spell";
  tags: string[];
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
  resolveAtEnd?: boolean;
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
    lineWidth?: number;
    lineLength?: number;
    coneAngleDegrees?: number;
    delay?: number;
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
      conditions?: ReadonlyArray<{ type: string; relation?: string }>;
      healthPercent?: number;
      shieldBreakHealRatio?: number;
    }>;
    animationAssetId: string;
    iconAssetId: string;
    soundAssetId: string;
    skillPointCost?: number;
    maxRank?: number;
    runtimeEnabled?: boolean;
  };
}): { [id: string]: AbilityDefinition } {
  const map: { [id: string]: AbilityDefinition } = {};
  const ids = Object.keys(abilities);
  for (let i = 0; i < ids.length; i++) {
    if (abilities[ids[i]].runtimeEnabled === false) {
      continue;
    }
    map[ids[i]] = copyAbility(abilities[ids[i]]);
  }
  return map;
}

export function autoAttackDefinitionsFromContent(autoAttacks: {
  [id: string]: {
    id: string;
    ownerClassId: string;
    baseDamage: number;
    interval: number;
    range: number;
    school: string;
    effects?: ReadonlyArray<{ tags?: ReadonlyArray<string> }>;
    runtimeEnabled?: boolean;
  };
}): { [id: string]: AutoAttackDefinition } {
  const map: { [id: string]: AutoAttackDefinition } = {};
  const ids = Object.keys(autoAttacks);
  for (let i = 0; i < ids.length; i++) {
    const raw = autoAttacks[ids[i]];
    if (raw.runtimeEnabled === false) {
      continue;
    }
    if (raw.school !== "melee" && raw.school !== "ranged" && raw.school !== "spell") {
      continue;
    }
    map[raw.id] = {
      id: raw.id,
      ownerClassId: raw.ownerClassId,
      baseDamage: raw.baseDamage,
      interval: raw.interval,
      range: raw.range,
      school: raw.school,
      tags: autoAttackTags(raw.effects),
    };
  }
  return map;
}

function autoAttackTags(effects: ReadonlyArray<{ tags?: ReadonlyArray<string> }> | undefined): string[] {
  const tags: string[] = [];
  if (effects === undefined) {
    return tags;
  }
  for (let i = 0; i < effects.length; i++) {
    const source = effects[i].tags !== undefined ? effects[i].tags as ReadonlyArray<string> : [];
    for (let t = 0; t < source.length; t++) {
      if (tags.indexOf(source[t]) < 0) {
        tags.push(source[t]);
      }
    }
  }
  return tags;
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
    resolveAtEnd: cast.resolveAtEnd === true,
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
  catalog?: ProgressionCatalog,
  classId?: string,
): { progression: CharacterProgression; ok: boolean; code: string; replay: boolean; changed: boolean } {
  const current = cloneProgression(progression);
  if (current.assignHotbarByRequestId === undefined) {
    current.assignHotbarByRequestId = {};
  }
  const previous = current.assignHotbarByRequestId[requestId];
  if (previous !== undefined) {
    return { progression: current, ok: previous.ok, code: previous.code, replay: true, changed: false };
  }
  const resolvedClassId = classId !== undefined ? classId : current.classId;
  if (catalog !== undefined && usesCanonicalTalentRuntime(catalog, resolvedClassId)) {
    const assigned = assignCanonicalHotbar(current, catalog, resolvedClassId, slotIndex, abilityId);
    return rememberHotbar(current, requestId, tick, assigned.ok, assigned.code);
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
  if (classId.indexOf("class.") === 0) {
    return rememberUnlock(current, requestId, tick, false, "unsupported_class");
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
  if (
    state.progressionCatalog !== undefined &&
    state.progressionCatalog.abilities[definition.id] !== undefined &&
    state.progressionCatalog.abilities[definition.id].category === ABILITY_CATEGORY_PASSIVE
  ) {
    return remember("ability_passive", false);
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
  if (!resourcesAvailable(player, definition, manaCostModifiers(state, player, tick, definition.id))) {
    return remember("insufficient_resource", false);
  }
  const cooldownCode = cooldownBlock(player, definition, tick, ignoresGlobalCooldown(state, player));
  if (cooldownCode !== "") {
    return remember(cooldownCode, false);
  }

  spendResources(player, definition, manaCostModifiers(state, player, tick, definition.id));
  startCooldowns(player, definition, tick, ignoresGlobalCooldown(state, player));

  const stats = casterStats(state, player, tick);
  const haste = stats !== null && stats.hasteMult !== undefined ? stats.hasteMult : 1;
  const talentMods =
    state.progressionCatalog !== undefined && player.progression !== undefined
      ? resolveAbilityTalentModifiers(
          state.progressionCatalog,
          player.progression,
          definition.id,
          actorTalentContext(state, player, tick, targeting.primaryId),
        )
      : undefined;
  const channelBase =
    definition.channelTime *
    (talentMods !== undefined ? talentMods.channelTimeMultiplier : 1);
  const baseCast =
    talentMods !== undefined && talentMods.castTimeOverride !== undefined
      ? talentMods.castTimeOverride
      : definition.castTime;
  const castTicks = cooldownTicks(formulaCastTime(baseCast, haste), SNAPSHOT_RATE_HZ);
  const channelTicks = cooldownTicks(formulaCastTime(channelBase, haste), SNAPSHOT_RATE_HZ);
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
    player.lastAttackTick = tick;
    return remember("ok", true);
  }
  if (channelTicks > 0) {
    player.activeCast = {
      abilityId: definition.id,
      casterId: player.userId,
      targetId: targeting.primaryId,
      targetX: targeting.pointX,
      targetY: targeting.pointY,
      startTick: tick,
      completionTick: tick + channelTicks,
      channelUntilTick: tick + channelTicks,
      phase: "channeling",
      interruptReason: "",
      requestId: input.requestId,
      resolveAtEnd: true,
    };
    return remember("ok", true);
  }
  applyResolvedAbility(state, player, definition, targeting, tick, events);
  player.lastAttackTick = tick;
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
    if (hasControlTag(player.effects, "stun")) {
      interruptCast(player, "stun", tick, events);
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
        player.lastAttackTick = tick;
      }
      if (cast.channelUntilTick > tick) {
        cast.phase = "channeling";
      } else {
        player.activeCast = undefined;
      }
      continue;
    }
    if (cast.phase === "channeling" && (cast.channelUntilTick <= 0 || tick >= cast.channelUntilTick)) {
      if (cast.resolveAtEnd === true) {
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
          player.lastAttackTick = tick;
        }
      }
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
    const classDef =
      state.progressionCatalog !== undefined ? state.progressionCatalog.classes[classId] : undefined;
    if (usesCanonicalCreateState(classDef !== undefined ? classDef.autoAttackId : undefined)) {
      if (player.progression.hotbar === undefined || player.progression.hotbar.length !== HOTBAR_SIZE) {
        player.progression.hotbar = emptyHotbar();
        changed = true;
      }
      if (player.progression.abilityRanks === undefined) {
        player.progression.abilityRanks = {};
        changed = true;
      }
      if (state.progressionCatalog !== undefined) {
        if (syncDerivedAbilityOwnership(player.progression, state.progressionCatalog, classId)) {
          changed = true;
        }
      }
    } else {
      const basicId = state.basicAbilityId !== undefined ? state.basicAbilityId : "";
      changed = ensureAbilityOwnership(player.progression, startingAbilitiesForClass(state, classId), basicId);
    }
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
  if (stats !== null && stats.maxMana > 0) {
    resources[manaId] = stats.maxMana;
  } else {
    delete resources[manaId];
  }
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
  const canonical = useCanonicalAutoAttack(state, userId, targetId, requestId, tick, events);
  if (canonical !== null) {
    return canonical;
  }
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

function useCanonicalAutoAttack(
  state: StarterZoneState,
  userId: string,
  targetId: string,
  requestId: string,
  tick: number,
  events: CombatEvent[],
): AbilityDecision | null {
  const player = state.players[userId];
  if (player === undefined || player.classId === undefined || player.progression === undefined || state.progressionCatalog === undefined) {
    return null;
  }
  const classDef = state.progressionCatalog.classes[player.classId];
  const autoAttackId = classDef !== undefined && classDef.autoAttackId !== undefined ? classDef.autoAttackId : "";
  const definition = state.autoAttacksById !== undefined ? state.autoAttacksById[autoAttackId] : undefined;
  if (definition === undefined) {
    return null;
  }
  if (player.lastAttackRequestId === requestId && player.lastAttackRequestId !== "") {
    return {
      ok: player.lastAttackResultOk === true,
      code: player.lastAttackResultCode !== undefined && player.lastAttackResultCode.length > 0 ? player.lastAttackResultCode : "ok",
      replay: true,
    };
  }
  if (player.health <= 0) {
    rememberAttack(player, requestId, "player_dead", false);
    return { ok: false, code: "player_dead", replay: false };
  }
  if (player.activeCast !== undefined && player.activeCast.interruptReason === "") {
    rememberAttack(player, requestId, "already_casting", false);
    return { ok: false, code: "already_casting", replay: false };
  }
  const target = findEnemy(state.enemies, targetId);
  if (target === null) {
    rememberAttack(player, requestId, "invalid_target", false);
    return { ok: false, code: "invalid_target", replay: false };
  }
  if (target.health <= 0 || target.aiState === "dead") {
    rememberAttack(player, requestId, "target_dead", false);
    return { ok: false, code: "target_dead", replay: false };
  }
  if (distance(player.x, player.y, target.x, target.y) > definition.range) {
    rememberAttack(player, requestId, "out_of_range", false);
    return { ok: false, code: "out_of_range", replay: false };
  }
  const stats = casterStats(state, player, tick);
  const haste = stats !== null && stats.hasteMult !== undefined ? stats.hasteMult : 1;
  const attackSpeed = stats !== null && stats.canonical !== undefined
    ? attackSpeedProduct(stats.canonical.modifiers)
    : 1;
  const interval = hasteScaledAttackInterval(definition.interval, haste, attackSpeed);
  if (!isCooldownReady(player.lastAttackTick !== undefined ? player.lastAttackTick : NEVER_ATTACKED_TICK, tick, cooldownTicks(interval, SNAPSHOT_RATE_HZ))) {
    rememberAttack(player, requestId, "on_cooldown", false);
    return { ok: false, code: "on_cooldown", replay: false };
  }
  const base = stats !== null && stats.canonical !== undefined
    ? autoAttackBase(definition.baseDamage, stats.canonical.modifiers)
    : definition.baseDamage;
  const result = applyCombat(
    state,
    {
      action: "damage",
      sourceId: player.userId,
      sourceKind: "player",
      targetId: target.id,
      targetKind: "enemy",
      formula:
        stats !== null && stats.canonical !== undefined
          ? {
              base: base,
              powerCategory: definition.school,
              canonicalStats: stats.values,
              canonicalCritChance: stats.critChance,
              canonicalCritMult:
                (stats.critMult !== undefined ? stats.critMult : 1.5) +
                conditionalTalentModifierValue(
                  state.progressionCatalog,
                  player.progression,
                  "crit_damage_flat",
                  {
                    sourceTags: activeTags(player.effects),
                    target: { health: target.health, maxHealth: target.maxHealth, tags: activeTags(target.effects) },
                    nearestEnemyDistance: 0,
                    standingStillSeconds: 0,
                    moving: false,
                  },
                ),
              canonicalOutgoingProduct: stats.canonical.outgoingProduct,
              canonicalDamageReduction: 0,
              canonicalTakenProduct: 1,
              canonicalCritDamageProduct: 1,
              random: state.combatRandom,
            }
          : { base: base },
      tick: tick,
      eventId: "atk:" + requestId,
      abilityId: definition.id,
      tickRate: SNAPSHOT_RATE_HZ,
    },
    events,
  );
  if (!result.ok) {
    rememberAttack(player, requestId, result.code, false);
    return { ok: false, code: result.code, replay: false };
  }
  player.lastAttackTick = tick;
  rememberAttack(player, requestId, "ok", true);
  return { ok: true, code: "ok", replay: false };
}

export function publicAbilityState(
  player: MatchPlayer,
  tick: number,
  catalog?: ProgressionCatalog,
): { [key: string]: unknown } {
  const progression = player.progression;
  const classId = player.classId !== undefined ? player.classId : "";
  const useCanonical =
    catalog !== undefined && progression !== undefined && usesCanonicalTalentRuntime(catalog, classId);
  const hotbar = useCanonical
    ? publicCanonicalHotbar(progression as CharacterProgression)
    : progression !== undefined && progression.hotbar !== undefined
      ? progression.hotbar
      : emptyHotbar();
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
    hotbarAssignments: useCanonical
      ? hotbar.slice()
      : progression !== undefined
        ? progression.hotbarAssignments
        : [],
    abilityRanks: progression !== undefined && progression.abilityRanks !== undefined ? progression.abilityRanks : {},
    resources: cloneResourceMap(player.resources),
    cooldowns: cooldowns,
    globalCooldownRemaining:
      ignoresGlobalCooldownPlayer(catalog, classId) ||
      player.globalCooldownUntilTick === undefined ||
      player.globalCooldownUntilTick <= tick
        ? 0
        : player.globalCooldownUntilTick - tick,
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
  const stats = casterStats(state, player, tick);
  const fallbackAttack =
    player.derivedAttack !== undefined && player.derivedAttack > 0 ? player.derivedAttack : state.playerAttack;
  const talentMods =
    state.progressionCatalog !== undefined && player.progression !== undefined
      ? resolveAbilityTalentModifiers(
          state.progressionCatalog,
          player.progression,
          definition.id,
          actorTalentContext(state, player, tick, targeting.primaryId),
        )
      : undefined;
  const launchX = player.x;
  const launchY = player.y;
  const eventStart = events.length;
  const working = scaledAbilityDefinition(definition, talentMods);
  if (abilityDelaySeconds(working) > 0) {
    scheduleDelayedAbility(state, player, working, targeting, tick, stats, talentMods);
    maybeResetCooldownOnKill(player, working, events, eventStart, tick);
    return;
  }
  const targets = collectEffectTargets(state, player, working, targeting);
  for (let e = 0; e < working.effects.length; e++) {
    const effect = working.effects[e];
    if (String(effect.type) === "guaranteed_crit" || String(effect.type) === "propagate_effect") {
      continue;
    }
    if (effect.type === "forced_movement" || effect.type === "movement") {
      const distancePx =
        effect.movementDistance !== undefined && effect.movementDistance > 0 ? effect.movementDistance : 80;
      applyVaultToPlayer(state, player, distancePx, tick);
      continue;
    }
    if (effect.type === "cooldown_reset_on_kill") {
      continue;
    }
    const selected = targetsForEffect(player, effect.target, targeting.primaryId, targets);
    const hits =
      talentMods !== undefined && talentMods.hitCountOverride !== undefined
        ? Math.max(1, Math.floor(talentMods.hitCountOverride))
        : effect.hitCount !== undefined && effect.hitCount > 1
          ? Math.floor(effect.hitCount)
          : 1;
    for (let t = 0; t < selected.length; t++) {
      if (!effectConditionsHold(state, player, selected[t], effect.conditions)) {
        continue;
      }
      for (let h = 0; h < hits; h++) {
        const resolved = resolveTalentEffect(state, player, working, effect, selected[t], tick);
        const before = events.length;
        const armed =
          talentMods !== undefined && talentMods.afterMendNextHarmPercent > 0 && resolved.type === "direct_damage"
            ? consumeBattleBlessing(player)
            : 1;
        const applied =
          armed !== 1 && resolved.magnitude.value !== undefined
            ? { ...resolved, magnitude: { ...resolved.magnitude, value: resolved.magnitude.value * armed } }
            : resolved;
        applyEffectDefinition(state, applied, working.id, player, selected[t], stats, fallbackAttack, tick, events);
        writeTarget(state, selected[t]);
        if (talentMods !== undefined && talentMods.onHitBleedPercent > 0 && effect.type === "direct_damage") {
          applyOnHitBleed(state, player, selected[t], working.id, talentMods.onHitBleedPercent, events, before, tick, stats, fallbackAttack, h);
        }
        if (talentMods !== undefined && talentMods.onCritDotPercent > 0 && effect.type === "direct_damage") {
          applyOnCritDot(state, player, selected[t], working.id, talentMods.onCritDotPercent, events, before, tick, stats, fallbackAttack, h);
        }
        if (talentMods !== undefined && talentMods.onHitPeriodicBase > 0 && talentMods.onHitPeriodicDuration > 0 && effect.type === "direct_damage") {
          applyOnHitPeriodic(state, player, selected[t], working.id, talentMods.onHitPeriodicBase, talentMods.onHitPeriodicDuration, tick, events, stats, fallbackAttack, h);
        }
        if (
          talentMods !== undefined &&
          talentMods.slowPercent !== undefined &&
          talentMods.slowDuration !== undefined &&
          effect.type === "direct_damage"
        ) {
          applySlowEffect(state, player, selected[t], working.id, talentMods.slowPercent, talentMods.slowDuration, tick, events, stats, fallbackAttack);
        }
        if (resolved.type === "slow" && talentMods !== undefined && talentMods.slowTargetOutgoingPercent !== undefined) {
          applySlowOutgoingReduction(state, player, selected[t], working.id, talentMods.slowTargetOutgoingPercent, resolved.duration, tick, events, stats, fallbackAttack);
        }
        if (talentMods !== undefined && talentMods.onHitDotPercent > 0 && effect.type === "direct_damage") {
          applyOnHitDot(state, player, selected[t], working.id, talentMods.onHitDotPercent, events, before, tick, stats, fallbackAttack, h);
        }
        if (talentMods !== undefined && talentMods.onHealHotPercent > 0 && effect.type === "direct_heal") {
          applyOnHealHot(state, player, selected[t], working.id, talentMods.onHealHotPercent, events, before, tick, stats, fallbackAttack, h);
        }
        if (talentMods !== undefined && talentMods.onHarmLifestealPercent > 0 && effect.type === "direct_damage") {
          applyOnHarmLifesteal(state, player, talentMods.onHarmLifestealPercent, events, before, tick);
        }
        if (talentMods !== undefined && talentMods.afterMendNextHarmPercent > 0 && effect.type === "direct_heal") {
          armBattleBlessing(state, player, talentMods.afterMendNextHarmPercent, tick, events, stats, fallbackAttack);
        }
        if (resolved.type === "periodic_damage" && talentMods !== undefined && talentMods.onDotTargetOutgoingPercent !== undefined) {
          applyDotOutgoingReduction(state, player, selected[t], working.id, talentMods.onDotTargetOutgoingPercent, resolved.duration, tick, events, stats, fallbackAttack);
        }
        if (
          (resolved.type === "timed_stat_modifier" || String(effect.type) === "timed_stat_modifier") &&
          talentMods !== undefined &&
          talentMods.allyDamageReduction > 0
        ) {
          applyAllyDamageReduction(state, player, selected[t], working.id, talentMods.allyDamageReduction, resolved.duration, tick, events, stats, fallbackAttack);
        }
      }
    }
  }
  if (talentMods !== undefined && talentMods.slowPercent !== undefined && talentMods.slowDuration !== undefined) {
    maybeScheduleCaltrops(state, player, working, launchX, launchY, talentMods.slowPercent, talentMods.slowDuration, tick);
  }
  refundManaOnCrits(state, player, events, eventStart);
  maybeResetCooldownOnKill(player, working, events, eventStart, tick);
}

function applyVaultToPlayer(state: StarterZoneState, player: MatchPlayer, distancePx: number, tick: number): void {
  let dirX = -(player.facingX !== undefined ? player.facingX : 0);
  let dirY = -(player.facingY !== undefined ? player.facingY : 1);
  if (dirX === 0 && dirY === 0) {
    dirY = -1;
  }
  const next = resolveVault(
    player.x,
    player.y,
    dirX,
    dirY,
    distancePx,
    state.playerHalfExtent,
    state.collisions,
    state.walkableBounds,
  );
  if (next.x !== player.x || next.y !== player.y) {
    player.lastMovedTick = tick;
    player.stillSinceTick = tick;
  }
  player.x = next.x;
  player.y = next.y;
}

function collectShapedTargets(
  state: StarterZoneState,
  player: MatchPlayer,
  definition: AbilityDefinition,
  shape: string,
  targeting: { primaryId: string; pointX: number; pointY: number },
) {
  const list = [];
  let dirX = targeting.pointX - player.x;
  let dirY = targeting.pointY - player.y;
  if (dirX === 0 && dirY === 0) {
    const facing = facingVector(
      player.facingX !== undefined ? player.facingX : 0,
      player.facingY !== undefined ? player.facingY : 0,
      0,
      1,
    );
    dirX = facing.x;
    dirY = facing.y;
  }
  const range =
    shape === "cone"
      ? Math.max(definition.range, definition.areaRadius)
      : definition.areaRadius > 0
        ? definition.areaRadius
        : definition.lineLength !== undefined && definition.lineLength > 0
          ? definition.lineLength
          : definition.range;
  const width = definition.lineWidth !== undefined && definition.lineWidth > 0 ? definition.lineWidth : 12;
  const living = livingEntities(state);
  const coneHalf =
    definition.coneAngleDegrees !== undefined && definition.coneAngleDegrees > 0
      ? (definition.coneAngleDegrees * Math.PI) / 360
      : Math.PI / 4;
  const hits =
    shape === "line"
      ? entitiesOnLine(living, player.x, player.y, dirX, dirY, range, width)
      : entitiesInCone(living, player.x, player.y, dirX, dirY, range, coneHalf);
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const relation = classifyTarget(state, player, hit.id);
    if (!relationAllowed(definition.relationFilter, relation, hit.id === player.userId) || relation === "hostile_player") {
      continue;
    }
    if (hit.kind === "player") {
      const other = state.players[hit.id];
      if (other !== undefined) {
        list.push(playerAsTarget(other));
      }
    } else {
      const enemy = findEnemy(state.enemies, hit.id);
      if (enemy !== null) {
        list.push(enemyAsTarget(enemy));
      }
    }
  }
  return list;
}

function collectEffectTargets(
  state: StarterZoneState,
  player: MatchPlayer,
  definition: AbilityDefinition,
  targeting: { primaryId: string; pointX: number; pointY: number },
) {
  const list: EffectTarget[] = [];
  const shape = String(definition.areaShape);
  if (shape === "line" || shape === "cone") {
    return collectShapedTargets(state, player, definition, shape, targeting);
  }
  if (shape === "circle" || shape === "ground") {
    if (!(definition.areaRadius > 0)) {
      return list;
    }
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

function resourcesAvailable(player: MatchPlayer, definition: AbilityDefinition, modifiers: ReadonlyArray<CanonicalModifier>): boolean {
  const resources = dict(player.resources);
  for (let i = 0; i < definition.resourceCosts.length; i++) {
    const cost = definition.resourceCosts[i];
    const current = resources[cost.resourceId] !== undefined ? resources[cost.resourceId] : 0;
    if (current < scaledManaCost(cost.amount, modifiers)) {
      return false;
    }
  }
  return true;
}

function spendResources(player: MatchPlayer, definition: AbilityDefinition, modifiers: ReadonlyArray<CanonicalModifier>): void {
  const resources = dict(player.resources);
  for (let i = 0; i < definition.resourceCosts.length; i++) {
    const cost = definition.resourceCosts[i];
    const current = resources[cost.resourceId] !== undefined ? resources[cost.resourceId] : 0;
    resources[cost.resourceId] = current - scaledManaCost(cost.amount, modifiers);
  }
  player.resources = resources;
}

function manaCostModifiers(state: StarterZoneState, player: MatchPlayer, tick: number, abilityId?: string): CanonicalModifier[] {
  const identified = identifiedFromChannelMap(effectModifiersFrom(player.effects));
  if (state.progressionCatalog === undefined || player.progression === undefined) {
    return identified;
  }
  const context = actorTalentContext(state, player, tick);
  const combined = identified.concat(talentModifiersForContext(state.progressionCatalog, player.progression, context));
  if (abilityId !== undefined && abilityId.length > 0) {
    const abilityMods = resolveAbilityTalentModifiers(state.progressionCatalog, player.progression, abilityId, context);
    if (abilityMods.manaCostMultiplier !== 1) {
      combined.push({
        sourceId: abilityId,
        sourceKind: CANONICAL_SOURCE_TALENT_NODE,
        channel: "mana_cost",
        op: "pct",
        value: abilityMods.manaCostMultiplier - 1,
      });
    }
  }
  return combined;
}

function identifiedFromChannelMap(modifiers: { [channel: string]: number }) {
  return identifiedModifiersFromEffectMap(modifiers);
}

function cooldownBlock(player: MatchPlayer, definition: AbilityDefinition, tick: number, ignoreGcd: boolean): string {
  if (!ignoreGcd) {
    const gcdUntil = player.globalCooldownUntilTick !== undefined ? player.globalCooldownUntilTick : NEVER_ATTACKED_TICK;
    if (gcdUntil > tick) {
      return "on_global_cooldown";
    }
  }
  const ready = dict(player.abilityCooldowns)[definition.id];
  if (ready !== undefined && ready > tick) {
    return "on_cooldown";
  }
  return "";
}

function startCooldowns(player: MatchPlayer, definition: AbilityDefinition, tick: number, ignoreGcd: boolean): void {
  if (!ignoreGcd) {
    const gcdTicks = cooldownTicks(definition.globalCooldown, SNAPSHOT_RATE_HZ);
    if (gcdTicks > 0) {
      player.globalCooldownUntilTick = tick + gcdTicks;
    }
  }
  const icdTicks = cooldownTicks(definition.individualCooldown, SNAPSHOT_RATE_HZ);
  if (icdTicks > 0) {
    const map = dict(player.abilityCooldowns);
    map[definition.id] = tick + icdTicks;
    player.abilityCooldowns = map;
  }
}

export function tickAbilityCooldownRecovery(player: MatchPlayer, tick: number, catalog?: ProgressionCatalog, context?: TalentModifierContext): void {
  const modifiers = effectModifiersFrom(player.effects);
  const identified = identifiedFromChannelMap(modifiers).concat(
    catalog !== undefined && player.progression !== undefined
      ? context !== undefined
        ? talentModifiersForContext(catalog, player.progression, context)
        : talentModifiersForProgression(catalog, player.progression)
      : [],
  );
  const rate = cooldownRecoveryRate(identified);
  const map = dict(player.abilityCooldowns);
  const ids = Object.keys(map);
  for (let i = 0; i < ids.length; i++) {
    const ready = map[ids[i]];
    const remaining = ready - tick;
    if (remaining <= 0) {
      continue;
    }
    const extra = rate - 1;
    if (extra === 0) {
      continue;
    }
    map[ids[i]] = tick + remaining - extra;
  }
  player.abilityCooldowns = map;
}

function ignoresGlobalCooldown(state: StarterZoneState, player: MatchPlayer): boolean {
  const classId = player.classId !== undefined ? player.classId : "";
  return ignoresGlobalCooldownPlayer(state.progressionCatalog, classId);
}

function ignoresGlobalCooldownPlayer(catalog: ProgressionCatalog | undefined, classId: string): boolean {
  if (catalog === undefined || classId.length === 0) {
    return false;
  }
  return usesCanonicalTalentRuntime(catalog, classId);
}

function casterStats(state: StarterZoneState, player: MatchPlayer, tick?: number): EvaluatedStats | null {
  if (state.progressionCatalog === undefined || player.classId === undefined || player.progression === undefined) {
    return null;
  }
  return evaluateStats(state.progressionCatalog, playerStatContext(
    player.classId,
    player.progression,
    player.equipment,
    player.inventory,
    state.itemsById,
    effectModifiersFrom(player.effects),
    tick !== undefined ? actorTalentContext(state, player, tick) : undefined,
  ));
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
    const rawSchool = effect as unknown as { school?: unknown };
    if (
      rawSchool.school === "melee" ||
      rawSchool.school === "ranged" ||
      rawSchool.school === "spell" ||
      rawSchool.school === "heal"
    ) {
      copied.powerCategory = rawSchool.school;
    }
    if (effect.statChannel !== undefined) {
      copied.statChannel = effect.statChannel;
    }
    if (effect.resourceRole !== undefined) {
      copied.resourceRole = effect.resourceRole;
    }
    const extra = effect as unknown as {
      hitCount?: number;
      tickRateMultiplier?: number;
      guaranteedCrit?: boolean;
      cooldownResetOnKill?: boolean;
      movementKind?: string;
      movementDistance?: number;
      delay?: number;
      conditions?: ReadonlyArray<{ type: string; relation?: string }>;
      healthPercent?: number;
      shieldBreakHealRatio?: number;
    };
    if (typeof extra.hitCount === "number") {
      copied.hitCount = extra.hitCount;
    }
    if (typeof extra.tickRateMultiplier === "number") {
      copied.tickRateMultiplier = extra.tickRateMultiplier;
    }
    if (extra.guaranteedCrit === true) {
      copied.guaranteedCrit = true;
    }
    if (typeof extra.delay === "number" && extra.delay > 0) {
      copied.delay = extra.delay;
    }
    if (extra.cooldownResetOnKill === true) {
      copied.cooldownResetOnKill = true;
    }
    if (typeof extra.movementKind === "string") {
      copied.movementKind = extra.movementKind;
    }
    if (typeof extra.movementDistance === "number") {
      copied.movementDistance = extra.movementDistance;
    }
    if (extra.conditions !== undefined) {
      copied.conditions = extra.conditions;
    }
    if (typeof extra.healthPercent === "number") {
      copied.healthPercent = extra.healthPercent;
    }
    if (typeof extra.shieldBreakHealRatio === "number") {
      copied.shieldBreakHealRatio = extra.shieldBreakHealRatio;
    }
    effects.push(copied);
  }
  const copiedAbility: AbilityDefinition = {
    id: raw.id,
    displayName: raw.displayName,
    displayNameKey: raw.displayNameKey,
    descriptionKey: raw.descriptionKey,
    targetMode: raw.targetMode as TargetMode,
    relationFilter: raw.relationFilter as RelationFilter,
    range: raw.range,
    minimumRange: raw.minimumRange,
    areaShape: raw.areaShape as AbilityDefinition["areaShape"],
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
  const extraAbility = raw as unknown as { lineWidth?: number; lineLength?: number; hitCount?: number; delay?: number; coneAngleDegrees?: number };
  if (typeof extraAbility.lineWidth === "number") {
    copiedAbility.lineWidth = extraAbility.lineWidth;
  }
  if (typeof extraAbility.lineLength === "number") {
    copiedAbility.lineLength = extraAbility.lineLength;
  }
  if (typeof extraAbility.delay === "number" && extraAbility.delay > 0) {
    copiedAbility.delay = extraAbility.delay;
  }
  if (typeof extraAbility.coneAngleDegrees === "number" && extraAbility.coneAngleDegrees > 0) {
    copiedAbility.coneAngleDegrees = extraAbility.coneAngleDegrees;
  }
  if (typeof extraAbility.hitCount === "number" && extraAbility.hitCount > 1) {
    for (let e = 0; e < copiedAbility.effects.length; e++) {
      if (copiedAbility.effects[e].hitCount === undefined) {
        copiedAbility.effects[e].hitCount = extraAbility.hitCount;
      }
    }
  }
  return copiedAbility;
}

export function resolveTalentEffect(
  state: StarterZoneState,
  player: MatchPlayer,
  ability: AbilityDefinition,
  effect: EffectDefinition,
  target: EffectTarget,
  tick?: number,
): EffectDefinition {
  if (state.progressionCatalog === undefined || player.progression === undefined) {
    return effect;
  }
  const sourceTags = activeTags(player.effects);
  const modifiers = resolveAbilityTalentModifiers(state.progressionCatalog, player.progression, ability.id, {
    sourceTags: sourceTags,
    target: { health: target.health, maxHealth: target.maxHealth, tags: activeTags(target.effects) },
    standingStillSeconds: tick !== undefined ? standingStillSeconds(player, tick) : 0,
    moving: player.lastMoving === true || (player.lastMovedTick !== undefined && player.lastMovedTick === tick),
    nearestEnemyDistance: nearestHostileDistance(state, player.x, player.y),
  });
  const resolved: EffectDefinition = {
    ...effect,
    magnitude: { ...effect.magnitude },
    tags: effect.tags.slice(),
  };
  if ((effect.type === "direct_damage" || effect.type === "periodic_damage") && resolved.magnitude.value !== undefined) {
    resolved.magnitude.value *= modifiers.damageMultiplier;
  }
  if ((effect.type === "direct_heal" || effect.type === "periodic_heal") && resolved.magnitude.value !== undefined) {
    resolved.magnitude.value *= modifiers.healMultiplier;
  }
  if ((effect.type === "shield_absorb" || String(effect.type) === "shield") && resolved.magnitude.value !== undefined) {
    resolved.magnitude.value *= modifiers.absorbMultiplier;
  }
  if ((effect.type === "shield_absorb" || String(effect.type) === "shield") && modifiers.shieldBreakHealPercent > 0) {
    resolved.shieldBreakHealRatio = modifiers.shieldBreakHealPercent;
  }
  if (modifiers.durationOverride !== undefined) {
    resolved.duration = modifiers.durationOverride;
  }
  if (effect.type === "stun" && modifiers.stunDurationOverride !== undefined) {
    resolved.duration = modifiers.stunDurationOverride;
  }
  if (effect.type === "root" && modifiers.rootDurationOverride !== undefined) {
    resolved.duration = modifiers.rootDurationOverride;
  }
  if (effect.type === "slow" && modifiers.slowDurationBonus !== 0) {
    resolved.duration += modifiers.slowDurationBonus;
  }
  if (effect.type === "taunt" && modifiers.tauntTakenReduction !== undefined) {
    resolved.magnitude = { kind: "constant", value: modifiers.tauntTakenReduction };
  }
  if (effect.type === "passive_stacker") {
    if (modifiers.frenzyMaxStacks !== undefined) {
      resolved.maxStacks = modifiers.frenzyMaxStacks;
    }
    if (modifiers.frenzyPerStack !== undefined) {
      resolved.magnitude = { kind: "constant", value: modifiers.frenzyPerStack };
    }
  }
  if (modifiers.bonusCritChance !== 0) {
    resolved.bonusCritChance = (resolved.bonusCritChance !== undefined ? resolved.bonusCritChance : 0) + modifiers.bonusCritChance;
  }
  return resolved;
}

function activeTags(effects: ReadonlyArray<{ tags: ReadonlyArray<string>; remainingTicks: number }> | undefined): string[] {
  const tags: string[] = [];
  if (effects === undefined) {
    return tags;
  }
  for (let i = 0; i < effects.length; i++) {
    if (effects[i].remainingTicks <= 0) {
      continue;
    }
    for (let t = 0; t < effects[i].tags.length; t++) {
      if (tags.indexOf(effects[i].tags[t]) < 0) {
        tags.push(effects[i].tags[t]);
      }
    }
  }
  return tags;
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

function actorTalentContext(
  state: StarterZoneState,
  player: MatchPlayer,
  tick: number,
  targetId?: string,
): TalentModifierContext {
  const context: TalentModifierContext = {
    sourceTags: activeTags(player.effects),
    standingStillSeconds: standingStillSeconds(player, tick),
    moving: player.lastMoving === true || player.lastMovedTick === tick,
    nearestEnemyDistance: nearestHostileDistance(state, player.x, player.y),
    ownedCrowdControlCount: ownedCrowdControlCount(state.enemies, player.userId),
  };
  if (targetId !== undefined && targetId.length > 0) {
    const enemy = findEnemy(state.enemies, targetId);
    if (enemy !== null) {
      context.target = {
        health: enemy.health,
        maxHealth: enemy.maxHealth,
        tags: activeTags(enemy.effects),
      };
    } else if (targetId === player.userId) {
      context.target = {
        health: player.health,
        maxHealth: player.maxHealth,
        tags: activeTags(player.effects),
      };
    }
  }
  return context;
}

export function standingStillSeconds(player: MatchPlayer, tick: number): number {
  if (player.stillSinceTick === undefined) {
    return 0;
  }
  const elapsed = (tick - player.stillSinceTick) / SNAPSHOT_RATE_HZ;
  return elapsed > 0 ? elapsed : 0;
}

function scaledAbilityDefinition(
  definition: AbilityDefinition,
  talentMods: ReturnType<typeof resolveAbilityTalentModifiers> | undefined,
): AbilityDefinition {
  if (talentMods === undefined || talentMods.radiusMultiplier === 1) {
    return definition;
  }
  return {
    ...definition,
    areaRadius: definition.areaRadius * talentMods.radiusMultiplier,
    range: definition.targetMode === "self" ? definition.range * talentMods.radiusMultiplier : definition.range,
  };
}

function abilityDelaySeconds(definition: AbilityDefinition): number {
  if (typeof definition.delay === "number" && definition.delay > 0) {
    return definition.delay;
  }
  for (let i = 0; i < definition.effects.length; i++) {
    const delay = definition.effects[i].delay;
    if (typeof delay === "number" && delay > 0) {
      return delay;
    }
  }
  return 0;
}

function scheduleDelayedAbility(
  state: StarterZoneState,
  player: MatchPlayer,
  definition: AbilityDefinition,
  targeting: { primaryId: string; pointX: number; pointY: number },
  tick: number,
  stats: EvaluatedStats | null,
  talentMods: ReturnType<typeof resolveAbilityTalentModifiers> | undefined,
): void {
  let damageBase = 0;
  let guaranteedCrit = false;
  let powerCategory: "melee" | "ranged" | "spell" | "curse" | "heal" | "shield" | undefined;
  for (let i = 0; i < definition.effects.length; i++) {
    const effect = definition.effects[i];
    if (effect.type !== "direct_damage") {
      continue;
    }
    if (typeof effect.magnitude.value === "number" && isFinite(effect.magnitude.value)) {
      damageBase += effect.magnitude.value;
    }
    if (effect.guaranteedCrit === true) {
      guaranteedCrit = true;
    }
    if (effect.powerCategory !== undefined) {
      powerCategory = effect.powerCategory;
    }
  }
  if (talentMods !== undefined) {
    damageBase *= talentMods.damageMultiplier;
  }
  const pending = state.pendingGroundEffects !== undefined ? state.pendingGroundEffects : [];
  const delayTicks = cooldownTicks(abilityDelaySeconds(definition), SNAPSHOT_RATE_HZ);
  const scheduled = scheduleDelayedGround(pending, {
    id: definition.id + ":" + player.userId + ":" + tick,
    sourceId: player.userId,
    sourceKind: "player",
    abilityId: definition.id,
    x: targeting.pointX,
    y: targeting.pointY,
    radius: definition.areaRadius,
    resolveTick: tick + delayTicks,
    effectId: definition.id,
    directDamageBase: damageBase,
    guaranteedCrit: guaranteedCrit,
    powerCategory: powerCategory,
    canonicalStats: stats !== null ? { ...stats.values } : undefined,
    canonicalCritChance: stats !== null && stats.critChance !== undefined ? stats.critChance : undefined,
    canonicalCritMult: stats !== null && stats.critMult !== undefined ? stats.critMult : undefined,
    canonicalOutgoingProduct: stats !== null && stats.canonical !== undefined ? stats.canonical.outgoingProduct : undefined,
  });
  state.pendingGroundEffects = scheduled;
}

function applyOnCritDot(
  state: StarterZoneState,
  player: MatchPlayer,
  target: EffectTarget,
  abilityId: string,
  percent: number,
  events: CombatEvent[],
  eventStart: number,
  tick: number,
  stats: EvaluatedStats | null,
  fallbackAttack: number,
  hitIndex: number,
): void {
  let dealt = 0;
  let crit = false;
  for (let i = eventStart; i < events.length; i++) {
    if (events[i].type === "hit" && events[i].targetId === target.id && events[i].damage !== undefined) {
      dealt += events[i].damage as number;
      if (events[i].crit === true) {
        crit = true;
      }
    }
  }
  if (!crit || !(dealt > 0) || !(percent > 0)) {
    return;
  }
  const perTick = (dealt * percent) / 4;
  const burn: EffectDefinition = {
    id: "afterburn-" + tick + "-" + hitIndex + "-" + target.id,
    type: "periodic_damage",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: perTick },
    duration: 4,
    tickInterval: 1,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["afterburn", "burn"],
    powerCategory: "spell",
  };
  applyEffectDefinition(state, burn, abilityId, player, target, stats, fallbackAttack, tick, events);
  writeTarget(state, target);
}

function applyOnHitPeriodic(
  state: StarterZoneState,
  player: MatchPlayer,
  target: EffectTarget,
  abilityId: string,
  base: number,
  durationSec: number,
  tick: number,
  events: CombatEvent[],
  stats: EvaluatedStats | null,
  fallbackAttack: number,
  hitIndex: number,
): void {
  if (!(base > 0) || !(durationSec > 0)) {
    return;
  }
  const total = stats !== null && stats.canonical !== undefined ? scalePower(base, "spell", stats.values) : base;
  const perTick = total / durationSec;
  const burn: EffectDefinition = {
    id: "on-hit-periodic-" + tick + "-" + hitIndex + "-" + target.id,
    type: "periodic_damage",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: perTick },
    duration: durationSec,
    tickInterval: 1,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["burn", "fire"],
    powerCategory: "spell",
  };
  applyEffectDefinition(state, burn, abilityId, player, target, stats, fallbackAttack, tick, events);
  writeTarget(state, target);
}

function applySlowOutgoingReduction(
  state: StarterZoneState,
  player: MatchPlayer,
  target: EffectTarget,
  abilityId: string,
  percent: number,
  durationSec: number,
  tick: number,
  events: CombatEvent[],
  stats: EvaluatedStats | null,
  fallbackAttack: number,
): void {
  if (!(durationSec > 0)) {
    return;
  }
  const reduction: EffectDefinition = {
    id: "numbing-" + abilityId,
    type: "timed_stat_modifier",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: percent },
    duration: durationSec,
    tickInterval: 0,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["numbing"],
    statChannel: "outgoing_damage",
  };
  applyEffectDefinition(state, reduction, abilityId, player, target, stats, fallbackAttack, tick, events);
  writeTarget(state, target);
}

function refundManaOnCrits(
  state: StarterZoneState,
  player: MatchPlayer,
  events: CombatEvent[],
  eventStart: number,
): void {
  if (state.progressionCatalog === undefined || player.progression === undefined) {
    return;
  }
  const fraction = passiveTalentModifierValue(state.progressionCatalog, player.progression, "mana_refund_percent_of_max");
  if (!(fraction > 0)) {
    return;
  }
  let crits = 0;
  for (let i = eventStart; i < events.length; i++) {
    if (events[i].type === "hit" && events[i].sourceId === player.userId && events[i].crit === true) {
      crits += 1;
    }
  }
  if (crits <= 0) {
    return;
  }
  const stats = casterStats(state, player);
  if (stats === null || !(stats.maxMana > 0)) {
    return;
  }
  const manaId = resourceIdForRole(state.progressionCatalog, "mana");
  if (manaId.length === 0) {
    return;
  }
  const resources = dict(player.resources);
  const current = resources[manaId] !== undefined ? resources[manaId] : 0;
  const refund = stats.maxMana * fraction * crits;
  const next = current + refund;
  resources[manaId] = next > stats.maxMana ? stats.maxMana : next;
  player.resources = resources;
}

function applyOnHitBleed(
  state: StarterZoneState,
  player: MatchPlayer,
  target: EffectTarget,
  abilityId: string,
  percent: number,
  events: CombatEvent[],
  eventStart: number,
  tick: number,
  stats: EvaluatedStats | null,
  fallbackAttack: number,
  hitIndex: number,
): void {
  let dealt = 0;
  for (let i = eventStart; i < events.length; i++) {
    if (events[i].type === "hit" && events[i].targetId === target.id && events[i].damage !== undefined) {
      dealt += events[i].damage as number;
    }
  }
  if (!(dealt > 0) || !(percent > 0)) {
    return;
  }
  const perTick = (dealt * percent) / 4;
  const bleedRate = effectModifiersFrom(player.effects)["bleed_tick_rate"];
  const bleed: EffectDefinition = {
    id: "bleed-" + tick + "-" + hitIndex + "-" + target.id,
    type: "periodic_damage",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: perTick },
    duration: 4,
    tickInterval: 1,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["bleed"],
    powerCategory: "ranged",
    tickRateMultiplier: bleedRate !== undefined && bleedRate > 0 ? 2 : 1,
  };
  applyEffectDefinition(state, bleed, abilityId, player, target, stats, fallbackAttack, tick, events);
  writeTarget(state, target);
}

function applySlowEffect(
  state: StarterZoneState,
  player: MatchPlayer,
  target: EffectTarget,
  abilityId: string,
  slowPercent: number,
  durationSec: number,
  tick: number,
  events: CombatEvent[],
  stats: EvaluatedStats | null,
  fallbackAttack: number,
): void {
  const slow: EffectDefinition = {
    id: "slow-" + abilityId,
    type: "slow",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: -slowPercent * 100 },
    duration: durationSec,
    tickInterval: 0,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["slow"],
    statChannel: "movement_speed",
  };
  applyEffectDefinition(state, slow, abilityId, player, target, stats, fallbackAttack, tick, events);
  writeTarget(state, target);
}

function effectConditionsHold(
  state: StarterZoneState,
  player: MatchPlayer,
  target: EffectTarget,
  conditions: ReadonlyArray<{ type: string; relation?: string }> | undefined,
): boolean {
  if (conditions === undefined || conditions.length === 0) {
    return true;
  }
  const relation = classifyTarget(state, player, target.id);
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    if (condition.type !== "target_relation") {
      return false;
    }
    const wanted = condition.relation !== undefined ? condition.relation : "";
    if (wanted === "hostile") {
      if (relation !== "hostile") {
        return false;
      }
      continue;
    }
    if (wanted === "self") {
      if (relation !== "self") {
        return false;
      }
      continue;
    }
    if (wanted === "friendly") {
      if (relation !== "self" && relation !== "friendly") {
        return false;
      }
      continue;
    }
    if (wanted === "any") {
      continue;
    }
    return false;
  }
  return true;
}

function applyOnHitDot(
  state: StarterZoneState,
  player: MatchPlayer,
  target: EffectTarget,
  abilityId: string,
  percent: number,
  events: CombatEvent[],
  eventStart: number,
  tick: number,
  stats: EvaluatedStats | null,
  fallbackAttack: number,
  hitIndex: number,
): void {
  let dealt = 0;
  for (let i = eventStart; i < events.length; i++) {
    if (events[i].type === "hit" && events[i].targetId === target.id && events[i].damage !== undefined) {
      dealt += events[i].damage as number;
    }
  }
  if (!(dealt > 0) || !(percent > 0)) {
    return;
  }
  const ache: EffectDefinition = {
    id: "malice",
    type: "periodic_damage",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: (dealt * percent) / 4 },
    duration: 4,
    tickInterval: 1,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["malice", "dot"],
  };
  applyEffectDefinition(state, ache, abilityId, player, target, stats, fallbackAttack, tick, events);
  writeTarget(state, target);
  void hitIndex;
}

function applyOnHealHot(
  state: StarterZoneState,
  player: MatchPlayer,
  target: EffectTarget,
  abilityId: string,
  percent: number,
  events: CombatEvent[],
  eventStart: number,
  tick: number,
  stats: EvaluatedStats | null,
  fallbackAttack: number,
  hitIndex: number,
): void {
  let healed = 0;
  for (let i = eventStart; i < events.length; i++) {
    if (events[i].type === "heal" && events[i].targetId === target.id && events[i].healing !== undefined) {
      healed += events[i].healing as number;
    }
  }
  if (!(healed > 0) || !(percent > 0)) {
    return;
  }
  const regen: EffectDefinition = {
    id: "compassion",
    type: "periodic_heal",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: (healed * percent) / 4 },
    duration: 4,
    tickInterval: 1,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["compassion", "hot"],
  };
  applyEffectDefinition(state, regen, abilityId, player, target, stats, fallbackAttack, tick, events);
  writeTarget(state, target);
  void hitIndex;
}

function applyOnHarmLifesteal(
  state: StarterZoneState,
  player: MatchPlayer,
  percent: number,
  events: CombatEvent[],
  eventStart: number,
  tick: number,
): void {
  let dealt = 0;
  for (let i = eventStart; i < events.length; i++) {
    if (events[i].type === "hit" && events[i].sourceId === player.userId && events[i].damage !== undefined) {
      dealt += events[i].damage as number;
    }
  }
  if (!(dealt > 0) || !(percent > 0) || player.health <= 0) {
    return;
  }
  const self = playerAsTarget(player);
  applyCombat(
    state,
    {
      action: "heal",
      sourceId: player.userId,
      sourceKind: "player",
      targetId: player.userId,
      targetKind: "player",
      formula: { base: dealt * percent },
      tick: tick,
      abilityId: "talent_siphon",
      tickRate: SNAPSHOT_RATE_HZ,
      originTag: "lifesteal",
    },
    events,
  );
  const next = state.players[player.userId];
  if (next !== undefined) {
    self.health = next.health;
    writeTarget(state, self);
  }
}

function consumeBattleBlessing(player: MatchPlayer): number {
  const effects = player.effects !== undefined ? player.effects : [];
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (effect.remainingTicks <= 0 || effect.tags.indexOf("battle_blessing") < 0) {
      continue;
    }
    const bonus = effect.magnitude;
    effect.remainingTicks = 0;
    return 1 + bonus;
  }
  return 1;
}

function armBattleBlessing(
  state: StarterZoneState,
  player: MatchPlayer,
  percent: number,
  tick: number,
  events: CombatEvent[],
  stats: EvaluatedStats | null,
  fallbackAttack: number,
): void {
  if (!(percent > 0)) {
    return;
  }
  const armed: EffectDefinition = {
    id: "battle-blessing",
    type: "timed_stat_modifier",
    source: "caster",
    target: "self",
    magnitude: { kind: "constant", value: percent },
    duration: 30,
    tickInterval: 0,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["battle_blessing"],
  };
  const self = playerAsTarget(player);
  applyEffectDefinition(state, armed, "talent.battle_blessing", player, self, stats, fallbackAttack, tick, events);
  writeTarget(state, self);
}

function applyDotOutgoingReduction(
  state: StarterZoneState,
  player: MatchPlayer,
  target: EffectTarget,
  abilityId: string,
  percent: number,
  durationSec: number,
  tick: number,
  events: CombatEvent[],
  stats: EvaluatedStats | null,
  fallbackAttack: number,
): void {
  if (!(durationSec > 0)) {
    return;
  }
  const reduction: EffectDefinition = {
    id: "wither-r3-outgoing",
    type: "timed_stat_modifier",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: percent },
    duration: durationSec,
    tickInterval: 0,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["wither_r3"],
    statChannel: "outgoing_damage",
  };
  applyEffectDefinition(state, reduction, abilityId, player, target, stats, fallbackAttack, tick, events);
  writeTarget(state, target);
}

function applyAllyDamageReduction(
  state: StarterZoneState,
  player: MatchPlayer,
  target: EffectTarget,
  abilityId: string,
  percent: number,
  durationSec: number,
  tick: number,
  events: CombatEvent[],
  stats: EvaluatedStats | null,
  fallbackAttack: number,
): void {
  if (!(percent > 0) || !(durationSec > 0)) {
    return;
  }
  const reduction: EffectDefinition = {
    id: "blessing-dr",
    type: "timed_stat_modifier",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: percent },
    duration: durationSec,
    tickInterval: 0,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["blessing_dr"],
    statChannel: "flat_damage_reduction",
  };
  applyEffectDefinition(state, reduction, abilityId, player, target, stats, fallbackAttack, tick, events);
  writeTarget(state, target);
}

function maybeScheduleCaltrops(
  state: StarterZoneState,
  player: MatchPlayer,
  definition: AbilityDefinition,
  launchX: number,
  launchY: number,
  slowPercent: number,
  slowDuration: number,
  tick: number,
): void {
  let isVault = false;
  for (let i = 0; i < definition.effects.length; i++) {
    if (definition.effects[i].type === "forced_movement" || definition.effects[i].type === "movement") {
      isVault = true;
      break;
    }
  }
  if (!isVault) {
    return;
  }
  const pending = state.pendingGroundEffects !== undefined ? state.pendingGroundEffects : [];
  state.pendingGroundEffects = scheduleDelayedGround(pending, {
    id: "caltrop:" + player.userId + ":" + tick,
    sourceId: player.userId,
    sourceKind: "player",
    abilityId: definition.id,
    x: launchX,
    y: launchY,
    radius: 40,
    resolveTick: tick,
    effectId: "caltrop",
    expireTick: tick + cooldownTicks(slowDuration, SNAPSHOT_RATE_HZ),
    slowPercent: slowPercent,
    slowDurationSec: slowDuration,
  });
}

function maybeResetCooldownOnKill(
  player: MatchPlayer,
  definition: AbilityDefinition,
  events: CombatEvent[],
  eventStart: number,
  tick: number,
): void {
  let resetOnKill = false;
  for (let i = 0; i < definition.effects.length; i++) {
    if (definition.effects[i].type === "cooldown_reset_on_kill" || definition.effects[i].cooldownResetOnKill === true) {
      resetOnKill = true;
      break;
    }
  }
  if (!resetOnKill) {
    return;
  }
  for (let i = eventStart; i < events.length; i++) {
    const event = events[i];
    if (event.type !== "hit" || event.abilityId !== definition.id) {
      continue;
    }
    if (event.remainingHealth === 0) {
      const map = dict(player.abilityCooldowns);
      resetAbilityCooldown(map, definition.id, tick);
      player.abilityCooldowns = map;
      return;
    }
  }
}
