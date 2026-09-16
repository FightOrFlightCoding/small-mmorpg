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
}

export interface ResolvedAbilityModifiers {
  damageMultiplier: number;
  durationOverride: number | undefined;
  stunDurationOverride: number | undefined;
  tauntTakenReduction: number | undefined;
  frenzyMaxStacks: number | undefined;
  frenzyPerStack: number | undefined;
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
  const modifiers: CanonicalModifier[] = [];
  const nodes = purchasedNodes(catalog, progression);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    appendPassiveModifiers(modifiers, node.id, node.rank, node.modifiers);
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
  };
  const nodes = purchasedNodes(catalog, progression);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
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

function appendPassiveModifiers(
  output: CanonicalModifier[],
  nodeId: string,
  rank: number,
  modifiers: ReadonlyArray<TalentModifierContent>,
): void {
  for (let i = 0; i < modifiers.length; i++) {
    const modifier = modifiers[i];
    const value = finiteValue(modifier.value) * rank;
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
    }
    if (channel.length === 0 || !isFinite(value)) {
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
    }
  }
}

function conditionsHold(
  conditions: ReadonlyArray<{ type: string; comparison?: string; value?: number; tag?: string }>,
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
    }
  }
  return true;
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
