import {
  CANONICAL_SOURCE_TALENT_NODE,
  CHANNEL_MAX_HEALTH,
  CHANNEL_OUTGOING,
  CHANNEL_TAKEN,
  type CanonicalModifier,
} from "./canonical_stats";
import type { CharacterProgression } from "./progression";
import type { ProgressionCatalog, TalentModifierContent, TalentUnlockEffectContent } from "./stats";

export const CHANNEL_MAX_HEALTH_PERCENT = "max_health_percent";
export const CHANNEL_CRIT_MULT_FLAT = "crit_mult_flat";

export interface TalentConditionTarget {
  health: number;
  maxHealth: number;
  tags: ReadonlyArray<string>;
}

export interface TalentModifierContext {
  sourceTags: ReadonlyArray<string>;
  target?: TalentConditionTarget;
  standingStillSeconds?: number;
  moving?: boolean;
  nearestEnemyDistance?: number;
  ownedCrowdControlCount?: number;
}

export interface TalentCondition {
  type: string;
  comparison?: string;
  value?: number;
  tag?: string;
  range?: number;
  duration?: number;
}

export interface ResolvedAbilityModifiers {
  damageMultiplier: number;
  durationOverride: number | undefined;
  stunDurationOverride: number | undefined;
  tauntTakenReduction: number | undefined;
  frenzyMaxStacks: number | undefined;
  frenzyPerStack: number | undefined;
  channelTimeMultiplier: number;
  hitCountOverride: number | undefined;
  bonusCritChance: number;
  slowPercent: number | undefined;
  slowDuration: number | undefined;
  slowDurationBonus: number;
  onHitBleedPercent: number;
  onCritDotPercent: number;
  onHitPeriodicBase: number;
  onHitPeriodicDuration: number;
  castTimeOverride: number | undefined;
  rootDurationOverride: number | undefined;
  radiusMultiplier: number;
  slowTargetOutgoingPercent: number | undefined;
  healMultiplier: number;
  absorbMultiplier: number;
  manaCostMultiplier: number;
  onHealHotPercent: number;
  onHitDotPercent: number;
  afterMendNextHarmPercent: number;
  allyDamageReduction: number;
  onDotTargetOutgoingPercent: number | undefined;
  onHarmLifestealPercent: number;
  shieldBreakHealPercent: number;
}

export function passiveTalentModifierValue(
  catalog: ProgressionCatalog,
  progression: Pick<CharacterProgression, "purchasedClassNodeIds" | "purchasedBranchNodeRanks"> | { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
  type: string,
): number {
  let total = 0;
  const nodes = purchasedNodes(catalog, progression);
  for (let i = 0; i < nodes.length; i++) {
    for (let m = 0; m < nodes[i].modifiers.length; m++) {
      if (nodes[i].modifiers[m].type === type) {
        total += finiteValue(nodes[i].modifiers[m].value) * nodes[i].rank;
      }
    }
  }
  return total;
}

export function conditionalTalentModifierValue(
  catalog: ProgressionCatalog,
  progression: Pick<CharacterProgression, "purchasedClassNodeIds" | "purchasedBranchNodeRanks"> | { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
  type: string,
  context: TalentModifierContext,
): number {
  let total = 0;
  const nodes = purchasedNodes(catalog, progression);
  for (let i = 0; i < nodes.length; i++) {
    for (let c = 0; c < nodes[i].conditionalModifiers.length; c++) {
      const conditional = nodes[i].conditionalModifiers[c];
      if (!conditionsHold(conditional.conditions, context)) {
        continue;
      }
      for (let m = 0; m < conditional.modifiers.length; m++) {
        if (conditional.modifiers[m].type === type) {
          total += finiteValue(conditional.modifiers[m].value) * nodes[i].rank;
        }
      }
    }
  }
  return total;
}

export function talentUnlockEffects(
  catalog: ProgressionCatalog,
  progression: Pick<CharacterProgression, "purchasedClassNodeIds" | "purchasedBranchNodeRanks"> | { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
): TalentUnlockEffectContent[] {
  const effects: TalentUnlockEffectContent[] = [];
  const nodes = purchasedNodes(catalog, progression);
  for (let i = 0; i < nodes.length; i++) {
    const source = catalog.talentNodes[nodes[i].id].unlockEffects;
    for (let e = 0; e < source.length; e++) {
      effects.push(source[e]);
    }
  }
  return effects;
}

export function talentUnlockEffectsForContext(
  catalog: ProgressionCatalog,
  progression: Pick<CharacterProgression, "purchasedClassNodeIds" | "purchasedBranchNodeRanks"> | { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
  context: TalentModifierContext,
): TalentUnlockEffectContent[] {
  const effects = talentUnlockEffects(catalog, progression);
  return effects.filter(function (effect): boolean {
    return conditionsHold(effect.conditions, context);
  });
}

export function talentModifiersForProgression(
  catalog: ProgressionCatalog,
  progression: Pick<CharacterProgression, "purchasedClassNodeIds" | "purchasedBranchNodeRanks"> | { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
): CanonicalModifier[] {
  return talentModifiersForContext(catalog, progression, { sourceTags: [] });
}

export function talentModifiersForContext(
  catalog: ProgressionCatalog,
  progression: Pick<CharacterProgression, "purchasedClassNodeIds" | "purchasedBranchNodeRanks"> | { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
  context: TalentModifierContext,
): CanonicalModifier[] {
  const modifiers: CanonicalModifier[] = [];
  const nodes = purchasedNodes(catalog, progression);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    appendMappedModifiers(modifiers, node.id, node.rank, node.modifiers, context);
    for (let c = 0; c < node.conditionalModifiers.length; c++) {
      if (!conditionsHold(node.conditionalModifiers[c].conditions, context)) {
        continue;
      }
      appendMappedModifiers(modifiers, node.id, node.rank, node.conditionalModifiers[c].modifiers, context);
    }
  }
  return modifiers;
}

export function resolveAbilityTalentModifiers(
  catalog: ProgressionCatalog,
  progression: Pick<CharacterProgression, "purchasedClassNodeIds" | "purchasedBranchNodeRanks"> | { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
  abilityId: string,
  context: TalentModifierContext,
): ResolvedAbilityModifiers {
  const result: ResolvedAbilityModifiers = {
    damageMultiplier: 1,
    durationOverride: undefined,
    stunDurationOverride: undefined,
    tauntTakenReduction: undefined,
    frenzyMaxStacks: undefined,
    frenzyPerStack: undefined,
    channelTimeMultiplier: 1,
    hitCountOverride: undefined,
    bonusCritChance: 0,
    slowPercent: undefined,
    slowDuration: undefined,
    slowDurationBonus: 0,
    onHitBleedPercent: 0,
    onCritDotPercent: 0,
    onHitPeriodicBase: 0,
    onHitPeriodicDuration: 0,
    castTimeOverride: undefined,
    rootDurationOverride: undefined,
    radiusMultiplier: 1,
    slowTargetOutgoingPercent: undefined,
    healMultiplier: 1,
    absorbMultiplier: 1,
    manaCostMultiplier: 1,
    onHealHotPercent: 0,
    onHitDotPercent: 0,
    afterMendNextHarmPercent: 0,
    allyDamageReduction: 0,
    onDotTargetOutgoingPercent: undefined,
    onHarmLifestealPercent: 0,
    shieldBreakHealPercent: 0,
  };
  const nodes = purchasedNodes(catalog, progression);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    applyAbilityModifiers(result, node.modifiers, node.rank);
    const modifications = node.abilityModifications;
    for (let a = 0; a < modifications.length; a++) {
      if (modifications[a].abilityId !== abilityId) {
        continue;
      }
      applyAbilityModifiers(result, modifications[a].modifiers, node.rank);
    }
    const conditional = node.conditionalModifiers;
    for (let c = 0; c < conditional.length; c++) {
      if (!conditionsHold(conditional[c].conditions, context)) {
        continue;
      }
      const filtered: TalentModifierContent[] = [];
      for (let m = 0; m < conditional[c].modifiers.length; m++) {
        const modifier = conditional[c].modifiers[m];
        if (modifier.abilityId === undefined || modifier.abilityId === abilityId) {
          filtered.push(modifier);
        }
      }
      applyAbilityModifiers(result, filtered, node.rank);
    }
  }
  return result;
}

export function conditionsHold(
  conditions: ReadonlyArray<TalentCondition>,
  context: TalentModifierContext,
): boolean {
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    if (condition.type === "effect_active" || condition.type === "source_has_tag") {
      if (context.sourceTags.indexOf(String(condition.tag)) < 0) {
        return false;
      }
      continue;
    }
    if (condition.type === "target_has_tag") {
      if (context.target === undefined || context.target.tags.indexOf(String(condition.tag)) < 0) {
        return false;
      }
      continue;
    }
    if (condition.type === "target_health_percent") {
      if (context.target === undefined) {
        return false;
      }
      const max = context.target.maxHealth > 0 ? context.target.maxHealth : 1;
      const actual = (context.target.health / max) * 100;
      const wanted = finiteValue(condition.value);
      if (!compare(actual, wanted, condition.comparison)) {
        return false;
      }
      continue;
    }
    if (condition.type === "standing_still") {
      const needed = finiteValue(condition.duration);
      const actual = context.standingStillSeconds !== undefined ? context.standingStillSeconds : 0;
      if (!(actual >= needed)) {
        return false;
      }
      continue;
    }
    if (condition.type === "moving") {
      if (context.moving !== true) {
        return false;
      }
      continue;
    }
    if (condition.type === "no_enemy_in_range") {
      if (context.nearestEnemyDistance === undefined || !isFinite(context.nearestEnemyDistance)) {
        return false;
      }
      if (!(context.nearestEnemyDistance > finiteValue(condition.range))) {
        return false;
      }
      continue;
    }
    if (condition.type === "owned_crowd_control") {
      const actual = context.ownedCrowdControlCount !== undefined ? context.ownedCrowdControlCount : 0;
      const needed = condition.value !== undefined ? finiteValue(condition.value) : 1;
      if (!(actual >= needed)) {
        return false;
      }
      continue;
    }
    return false;
  }
  return true;
}

function appendMappedModifiers(
  output: CanonicalModifier[],
  nodeId: string,
  rank: number,
  modifiers: ReadonlyArray<TalentModifierContent>,
  context: TalentModifierContext,
): void {
  for (let i = 0; i < modifiers.length; i++) {
    const modifier = modifiers[i];
    if (
      modifier.type === "slow_reduces_target_damage_percent" ||
      modifier.type === "dot_reduces_target_damage_percent" ||
      modifier.type === "on_heal_hot_percent" ||
      modifier.type === "on_hit_dot_percent" ||
      modifier.type === "after_mend_next_harm_percent" ||
      modifier.type === "overflow_heal_percent" ||
      modifier.type === "dot_lifesteal_percent" ||
      modifier.type === "on_harm_lifesteal_percent" ||
      modifier.type === "propagate_on_death" ||
      modifier.type === "shield_max_hp_heal_per_second"
    ) {
      continue;
    }
    let value = finiteValue(modifier.value) * rank;
    let channel = "";
    let op: "add" | "pct" = "add";
    if (modifier.type === "max_hp_flat") {
      channel = CHANNEL_MAX_HEALTH;
    } else if (modifier.type === "max_hp_percent") {
      channel = CHANNEL_MAX_HEALTH_PERCENT;
      op = "pct";
    } else if (modifier.type === "auto_attack_damage_percent") {
      channel = "auto_attack";
      op = "pct";
    } else if (modifier.type === "damage_dealt_percent") {
      channel = CHANNEL_OUTGOING;
      op = "pct";
    } else if (modifier.type === "damage_taken_percent") {
      channel = CHANNEL_TAKEN;
      op = "pct";
    } else if (modifier.type === "cooldown_recovery_percent") {
      channel = "cooldown_recovery";
    } else if (modifier.type === "crit_damage_flat") {
      channel = CHANNEL_CRIT_MULT_FLAT;
    } else if (modifier.type === "move_speed_percent") {
      channel = "movement_speed";
      op = "pct";
    } else if (modifier.type === "mana_cost_percent") {
      channel = "mana_cost";
      op = "pct";
    } else if (modifier.type === "damage_reduction_percent") {
      channel = "flat_damage_reduction";
    } else if (modifier.type === "mana_regen_flat") {
      channel = "mana_regen";
    } else if (modifier.type === "mana_regen_per_controlled_enemy") {
      channel = "mana_regen";
      const count = context.ownedCrowdControlCount !== undefined ? context.ownedCrowdControlCount : 0;
      value *= count;
    } else if (modifier.type === "heal_done_percent") {
      channel = "heal_done";
      op = "pct";
    }
    if (channel.length === 0 || !isFinite(value) || value === 0) {
      continue;
    }
    output.push({
      sourceId: nodeId,
      sourceKind: CANONICAL_SOURCE_TALENT_NODE,
      nodeId: nodeId,
      rank: rank,
      channel: channel,
      op: op,
      value: value,
    });
  }
}

function applyAbilityModifiers(
  output: ResolvedAbilityModifiers,
  modifiers: ReadonlyArray<TalentModifierContent>,
  rank: number,
): void {
  for (let i = 0; i < modifiers.length; i++) {
    const modifier = modifiers[i];
    const value = finiteValue(modifier.value);
    if (modifier.type === "ability_damage_percent") {
      output.damageMultiplier *= 1 + value * rank;
    } else if (modifier.type === "ability_duration") {
      output.durationOverride = value;
    } else if (modifier.type === "ability_stun_duration") {
      output.stunDurationOverride = value;
    } else if (modifier.type === "taunt_damage_taken_percent") {
      output.tauntTakenReduction = value * rank;
    } else if (modifier.type === "frenzy_max_stacks") {
      output.frenzyMaxStacks = value;
    } else if (modifier.type === "frenzy_per_stack_percent") {
      output.frenzyPerStack = value;
    } else if (modifier.type === "ability_channel_time") {
      output.channelTimeMultiplier *= 1 + value * rank;
    } else if (modifier.type === "ability_hit_count") {
      output.hitCountOverride = value;
    } else if (modifier.type === "ability_crit_chance_flat") {
      output.bonusCritChance += value * rank;
    } else if (modifier.type === "ability_slow_percent") {
      output.slowPercent = value * rank;
    } else if (modifier.type === "ability_slow_duration") {
      output.slowDuration = value;
      output.slowDurationBonus += value * rank;
    } else if (modifier.type === "on_hit_bleed_percent") {
      output.onHitBleedPercent += value * rank;
    } else if (modifier.type === "on_crit_dot_percent") {
      output.onCritDotPercent += value * rank;
    } else if (modifier.type === "on_hit_periodic_base") {
      output.onHitPeriodicBase += value * rank;
    } else if (modifier.type === "on_hit_periodic_duration") {
      output.onHitPeriodicDuration = value;
    } else if (modifier.type === "ability_cast_time") {
      output.castTimeOverride = value;
    } else if (modifier.type === "ability_root_duration") {
      output.rootDurationOverride = value;
    } else if (modifier.type === "ability_radius_percent") {
      output.radiusMultiplier *= 1 + value * rank;
    } else if (modifier.type === "slow_reduces_target_damage_percent") {
      output.slowTargetOutgoingPercent = value * rank;
    } else if (modifier.type === "ability_heal_percent") {
      output.healMultiplier *= 1 + value * rank;
    } else if (modifier.type === "ability_absorb_percent") {
      output.absorbMultiplier *= 1 + value * rank;
    } else if (modifier.type === "ability_mana_cost_percent") {
      output.manaCostMultiplier *= 1 + value * rank;
    } else if (modifier.type === "on_heal_hot_percent") {
      output.onHealHotPercent += value * rank;
    } else if (modifier.type === "on_hit_dot_percent") {
      output.onHitDotPercent += value * rank;
    } else if (modifier.type === "after_mend_next_harm_percent") {
      output.afterMendNextHarmPercent += value * rank;
    } else if (modifier.type === "damage_reduction_percent") {
      output.allyDamageReduction += value * rank;
    } else if (modifier.type === "dot_reduces_target_damage_percent") {
      output.onDotTargetOutgoingPercent = value * rank;
    } else if (modifier.type === "on_harm_lifesteal_percent") {
      output.onHarmLifestealPercent += value * rank;
    } else if (modifier.type === "on_shield_break_heal_percent") {
      output.shieldBreakHealPercent += value * rank;
    }
  }
}

function compare(actual: number, expected: number, comparison: string | undefined): boolean {
  if (comparison === "above") {
    return actual > expected;
  }
  if (comparison === "at_or_below") {
    return actual <= expected;
  }
  if (comparison === "at_or_above") {
    return actual >= expected;
  }
  return actual < expected;
}

function purchasedNodes(
  catalog: ProgressionCatalog,
  progression: Pick<CharacterProgression, "purchasedClassNodeIds" | "purchasedBranchNodeRanks"> | { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
): Array<{ id: string; rank: number; modifiers: ReadonlyArray<TalentModifierContent>; abilityModifications: ProgressionCatalog["talentNodes"][string]["abilityModifications"]; conditionalModifiers: ProgressionCatalog["talentNodes"][string]["conditionalModifiers"] }> {
  const nodes: Array<{ id: string; rank: number; modifiers: ReadonlyArray<TalentModifierContent>; abilityModifications: ProgressionCatalog["talentNodes"][string]["abilityModifications"]; conditionalModifiers: ProgressionCatalog["talentNodes"][string]["conditionalModifiers"] }> = [];
  const add = (id: string, rank: number): void => {
    const node = catalog.talentNodes[id];
    if (node === undefined || !(rank > 0)) {
      return;
    }
    nodes.push({
      id: node.id,
      rank: rank,
      modifiers: node.passiveModifiers,
      abilityModifications: node.abilityModifications,
      conditionalModifiers: node.conditionalModifiers,
    });
  };
  for (let i = 0; i < progression.purchasedClassNodeIds.length; i++) {
    add(progression.purchasedClassNodeIds[i], 1);
  }
  const branchIds = Object.keys(progression.purchasedBranchNodeRanks);
  for (let i = 0; i < branchIds.length; i++) {
    add(branchIds[i], progression.purchasedBranchNodeRanks[branchIds[i]]);
  }
  return nodes;
}

function finiteValue(value: number | undefined): number {
  return typeof value === "number" && isFinite(value) ? value : 0;
}
