import { channelFromStatId, type PlayerEquipment } from "./equipment";
import { findItem, type ItemDefinition, type PlayerInventory } from "./inventory";
import { classUsesMana } from "./canonical_progression";
import {
  CANONICAL_SOURCE_EQUIPMENT,
  classUsesCanonicalStats,
  canonicalInputFromClass,
  evaluateCanonicalSnapshot,
  preserveHealthOnMaxChange,
  type CanonicalModifier,
  type CanonicalSnapshot,
} from "./canonical_stats";

export const STAT_LAYER_ORDER = [
  "class_base",
  "level_growth",
  "allocated_attributes",
  "equipment",
  "effects",
  "percent",
  "multiply",
  "clamp",
] as const;

export type StatLayer = (typeof STAT_LAYER_ORDER)[number];

export interface StatComponent {
  layer: string;
  source?: string;
  id?: string;
  channel?: string;
  weight?: number;
  value?: number;
  min?: number;
  max?: number;
}

export interface AttributeContent {
  id: string;
  displayName: string;
}

export interface ResourceContent {
  id: string;
  displayName: string;
  role: string;
}

export interface DerivedStatContent {
  id: string;
  displayName: string;
  role: string;
  components: ReadonlyArray<StatComponent>;
}

export interface LevelUnlockContent {
  level: number;
  abilityIds: ReadonlyArray<string>;
}

export interface LevelCurveContent {
  id: string;
  maxLevel: number;
  xpRequired: ReadonlyArray<number>;
  attributePointsPerLevel: ReadonlyArray<number>;
  skillPointsPerLevel: ReadonlyArray<number>;
  automaticUnlocks?: ReadonlyArray<LevelUnlockContent>;
}

export interface ClassProgressionContent {
  id: string;
  classId: string;
  levelCurveId: string;
  startingAttributes: { [id: string]: number };
  attributeGrowth: { [id: string]: number };
  startingResources: { [id: string]: number };
  resourceGrowth?: { [id: string]: number };
  startingDerived: { [id: string]: number };
  allowedAttributeIds: ReadonlyArray<string>;
  attributePointRules: { pointsAtCreate: number };
  skillPointRules: { pointsAtCreate: number };
}

export interface ClassContent {
  id: string;
  displayName?: string;
  progressionId: string;
  startingAbilities?: ReadonlyArray<string>;
  resourceType?: string;
  autoAttackId?: string;
  basicAbilityId?: string;
  canonicalLevelCurveId?: string;
  branchIds?: ReadonlyArray<string>;
  autoAssignTemplate?: { amounts: { [id: string]: number } };
  baseStats?: { [id: string]: number };
  automaticGrowth?: { [id: string]: number };
}

export interface BranchContent {
  id: string;
  classId: string;
  signatureAbilityId: string;
  capstoneAbilityId: string;
}

export interface TalentGrantContent {
  grantsActiveAbilityId?: string;
  rankReplacementAbilityId?: string;
}

export interface ProgressionCatalog {
  classes: { [id: string]: ClassContent };
  attributes: { [id: string]: AttributeContent };
  resources: { [id: string]: ResourceContent };
  derivedStats: { [id: string]: DerivedStatContent };
  levelCurves: { [id: string]: LevelCurveContent };
  classProgressions: { [id: string]: ClassProgressionContent };
  branches: { [id: string]: BranchContent };
  talentGrants: { [nodeId: string]: TalentGrantContent };
}

export interface StatContext {
  classId: string;
  level: number;
  allocatedAttributes: { [id: string]: number };
  freeStatAllocations?: { [id: string]: number };
  equipmentModifiers: { [channel: string]: number };
  effectModifiers: { [channel: string]: number };
  percentModifiers: { [channel: string]: number };
  multiplyModifiers: { [channel: string]: number };
  identifiedModifiers?: CanonicalModifier[];
}

export interface EvaluatedStats {
  values: { [statId: string]: number };
  attack: number;
  maxHealth: number;
  maxMana: number;
  manaRegen?: number;
  critChance?: number;
  critMult?: number;
  hasteMult?: number;
  damageReduction?: number;
  effectiveHp?: number;
  canonical?: CanonicalSnapshot;
}

export interface CombatStatTarget {
  health: number;
  maxHealth: number;
  derivedAttack?: number;
  classId?: string;
  allocatedAttributes?: { [id: string]: number };
  level?: number;
  progression?: {
    level: number;
    allocatedAttributes: { [id: string]: number };
    freeStatAllocations?: { [id: string]: number };
  };
  equipment?: PlayerEquipment;
  inventory?: PlayerInventory;
  resources?: { [resourceId: string]: number };
}

export function catalogFromContent(content: {
  classes: { [id: string]: ClassContent };
  attributes: { [id: string]: AttributeContent };
  resources: { [id: string]: ResourceContent };
  derivedStats: { [id: string]: DerivedStatContent };
  levelCurves: { [id: string]: LevelCurveContent };
  classProgressions: { [id: string]: ClassProgressionContent };
  branches?: { [id: string]: BranchContent };
  talentNodes?: { [id: string]: unknown };
}): ProgressionCatalog {
  return {
    classes: copyClassMap(content.classes),
    attributes: copyAttributeMap(content.attributes),
    resources: copyResourceMap(content.resources),
    derivedStats: copyDerivedMap(content.derivedStats),
    levelCurves: copyCurveMap(content.levelCurves),
    classProgressions: copyProgressionMap(content.classProgressions),
    branches: copyBranchMap(content.branches),
    talentGrants: copyTalentGrants(content.talentNodes),
  };
}

export function classProgressionFor(catalog: ProgressionCatalog, classId: string): ClassProgressionContent | null {
  const classDef = catalog.classes[classId];
  if (classDef === undefined) {
    return null;
  }
  const progression = catalog.classProgressions[classDef.progressionId];
  return progression !== undefined ? progression : null;
}

export function levelCurveFor(catalog: ProgressionCatalog, classId: string): LevelCurveContent | null {
  const classDef = catalog.classes[classId];
  if (classDef !== undefined && classDef.canonicalLevelCurveId !== undefined && classDef.canonicalLevelCurveId.length > 0) {
    const canonical = catalog.levelCurves[classDef.canonicalLevelCurveId];
    if (canonical !== undefined) {
      return canonical;
    }
  }
  const progression = classProgressionFor(catalog, classId);
  if (progression === null) {
    return null;
  }
  const curve = catalog.levelCurves[progression.levelCurveId];
  return curve !== undefined ? curve : null;
}

export function derivedStatIdForRole(catalog: ProgressionCatalog, role: string): string {
  const ids = Object.keys(catalog.derivedStats);
  for (let i = 0; i < ids.length; i++) {
    if (catalog.derivedStats[ids[i]].role === role) {
      return ids[i];
    }
  }
  return "";
}

export function resourceIdForRole(catalog: ProgressionCatalog, role: string): string {
  const ids = Object.keys(catalog.resources);
  for (let i = 0; i < ids.length; i++) {
    if (catalog.resources[ids[i]].role === role) {
      return ids[i];
    }
  }
  return "";
}

export function baseAttributesFor(
  catalog: ProgressionCatalog,
  classId: string,
  level: number,
): { [id: string]: number } {
  const progression = classProgressionFor(catalog, classId);
  const out: { [id: string]: number } = {};
  if (progression === null) {
    return out;
  }
  const growthLevels = level > 1 ? level - 1 : 0;
  const ids = Object.keys(catalog.attributes);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const starting = numberOr(progression.startingAttributes[id], 0);
    const growth = numberOr(progression.attributeGrowth[id], 0);
    out[id] = starting + growth * growthLevels;
  }
  return out;
}

export function xpRequiredForLevel(curve: LevelCurveContent, currentLevel: number): number {
  if (currentLevel >= curve.maxLevel) {
    return 0;
  }
  const index = currentLevel - 1;
  if (index < 0 || index >= curve.xpRequired.length) {
    return 0;
  }
  return curve.xpRequired[index];
}

export function isMaxLevel(curve: LevelCurveContent, level: number): boolean {
  return level >= curve.maxLevel;
}

export function evaluateStats(catalog: ProgressionCatalog, ctx: StatContext): EvaluatedStats {
  const values: { [statId: string]: number } = {};
  const progression = classProgressionFor(catalog, ctx.classId);
  const ids = Object.keys(catalog.derivedStats);
  for (let i = 0; i < ids.length; i++) {
    const stat = catalog.derivedStats[ids[i]];
    values[stat.id] = evaluateDerivedStat(stat, catalog, ctx, progression);
  }
  const attackId = derivedStatIdForRole(catalog, "attack");
  const healthId = derivedStatIdForRole(catalog, "max_health");
  const manaId = derivedStatIdForRole(catalog, "max_mana");
  const classDef = catalog.classes[ctx.classId];
  const foundationMana = manaId.length > 0 ? values[manaId] : 0;
  const usesMana = classUsesMana(classDef !== undefined ? classDef.resourceType : undefined);
  const evaluated: EvaluatedStats = {
    values: values,
    attack: attackId.length > 0 ? values[attackId] : 0,
    maxHealth: healthId.length > 0 ? values[healthId] : 1,
    maxMana: usesMana ? foundationMana : 0,
    manaRegen: 0,
    critChance: 0,
    critMult: 1.5,
    hasteMult: 1,
    damageReduction: 0,
  };
  evaluated.effectiveHp = evaluated.maxHealth;
  if (!usesMana && manaId.length > 0) {
    delete evaluated.values[manaId];
  }
  if (classDef !== undefined && classUsesCanonicalStats(classDef)) {
    overlayCanonicalStats(evaluated, classDef, ctx, healthId, manaId, usesMana);
  }
  return evaluated;
}

export function equipmentModifiersFromGear(
  equipment: PlayerEquipment | undefined,
  inventory: PlayerInventory | undefined,
  itemsById: { [id: string]: ItemDefinition },
): { [channel: string]: number } {
  const modifiers: { [channel: string]: number } = {};
  if (equipment === undefined) {
    return modifiers;
  }
  const tags = Object.keys(equipment.slots);
  for (let t = 0; t < tags.length; t++) {
    const instanceId = equipment.slots[tags[t]];
    if (instanceId.length === 0) {
      continue;
    }
    const item = findItem(inventory, instanceId);
    if (item === null) {
      continue;
    }
    const definition = itemsById[item.itemId];
    if (definition === undefined) {
      continue;
    }
    let attackFromModifiers = 0;
    const statModifiers = definition.statModifiers !== undefined ? definition.statModifiers : [];
    for (let i = 0; i < statModifiers.length; i++) {
      const channel = channelFromStatId(statModifiers[i].statId);
      const current = modifiers[channel] !== undefined ? modifiers[channel] : 0;
      modifiers[channel] = current + statModifiers[i].amount;
      if (channel === "attack") {
        attackFromModifiers += statModifiers[i].amount;
      }
    }
    if (attackFromModifiers === 0) {
      const bonus = definition.attackBonus !== undefined ? definition.attackBonus : 0;
      if (bonus !== 0) {
        modifiers.attack = (modifiers.attack !== undefined ? modifiers.attack : 0) + bonus;
      }
    }
  }
  return modifiers;
}

export function identifiedModifiersFromGear(
  equipment: PlayerEquipment | undefined,
  inventory: PlayerInventory | undefined,
  itemsById: { [id: string]: ItemDefinition },
): CanonicalModifier[] {
  const identified: CanonicalModifier[] = [];
  if (equipment === undefined) {
    return identified;
  }
  const tags = Object.keys(equipment.slots);
  for (let t = 0; t < tags.length; t++) {
    const instanceId = equipment.slots[tags[t]];
    if (instanceId.length === 0) {
      continue;
    }
    const item = findItem(inventory, instanceId);
    if (item === null) {
      continue;
    }
    const definition = itemsById[item.itemId];
    if (definition === undefined) {
      continue;
    }
    const sourceId = item.instanceId.length > 0 ? item.instanceId : item.itemId;
    const statModifiers = definition.statModifiers !== undefined ? definition.statModifiers : [];
    for (let i = 0; i < statModifiers.length; i++) {
      identified.push({
        sourceId: sourceId,
        sourceKind: CANONICAL_SOURCE_EQUIPMENT,
        channel: statModifiers[i].statId,
        op: "add",
        value: statModifiers[i].amount,
      });
    }
    if (statModifiers.length === 0) {
      const bonus = definition.attackBonus !== undefined ? definition.attackBonus : 0;
      if (bonus !== 0) {
        identified.push({
          sourceId: sourceId,
          sourceKind: CANONICAL_SOURCE_EQUIPMENT,
          channel: "weapon_base",
          op: "add",
          value: bonus,
        });
      }
    }
  }
  return identified;
}

export function identifiedModifiersFromEffectMap(
  effectModifiers: { [channel: string]: number },
  sourceKind: CanonicalModifier["sourceKind"] = "temporary_effect",
): CanonicalModifier[] {
  const identified: CanonicalModifier[] = [];
  const channels = Object.keys(effectModifiers);
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    identified.push({
      sourceId: "effect:" + channel,
      sourceKind: sourceKind,
      channel: channel,
      op: "add",
      value: effectModifiers[channel],
    });
  }
  return identified;
}

export function emptyModifierMap(): { [channel: string]: number } {
  return {};
}

export function playerStatContext(
  classId: string,
  progression: {
    level: number;
    allocatedAttributes: { [id: string]: number };
    freeStatAllocations?: { [id: string]: number };
  },
  equipment: PlayerEquipment | undefined,
  inventory: PlayerInventory | undefined,
  itemsById: { [id: string]: ItemDefinition },
  effectModifiers?: { [channel: string]: number },
): StatContext {
  const effects = effectModifiers !== undefined ? effectModifiers : emptyModifierMap();
  return {
    classId: classId,
    level: progression.level,
    allocatedAttributes: progression.allocatedAttributes,
    freeStatAllocations: progression.freeStatAllocations !== undefined ? progression.freeStatAllocations : {},
    equipmentModifiers: equipmentModifiersFromGear(equipment, inventory, itemsById),
    effectModifiers: effects,
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
    identifiedModifiers: identifiedModifiersFromGear(equipment, inventory, itemsById).concat(
      identifiedModifiersFromEffectMap(effects),
    ),
  };
}

export function syncCombatStatsFromPipeline(
  target: CombatStatTarget,
  catalog: ProgressionCatalog,
  itemsById: { [id: string]: ItemDefinition },
  effectModifiers?: { [channel: string]: number },
  percentModifiers?: { [channel: string]: number },
  multiplyModifiers?: { [channel: string]: number },
): EvaluatedStats | null {
  if (target.classId === undefined || target.classId.length === 0) {
    return null;
  }
  const allocated =
    target.progression !== undefined
      ? target.progression.allocatedAttributes
      : target.allocatedAttributes !== undefined
        ? target.allocatedAttributes
        : {};
  const level =
    target.progression !== undefined
      ? target.progression.level
      : target.level !== undefined
        ? target.level
        : 1;
  const evaluated = evaluateStats(catalog, {
    classId: target.classId,
    level: level,
    allocatedAttributes: allocated,
    freeStatAllocations:
      target.progression !== undefined && target.progression.freeStatAllocations !== undefined
        ? target.progression.freeStatAllocations
        : {},
    equipmentModifiers: equipmentModifiersFromGear(target.equipment, target.inventory, itemsById),
    effectModifiers: effectModifiers !== undefined ? effectModifiers : emptyModifierMap(),
    percentModifiers: percentModifiers !== undefined ? percentModifiers : emptyModifierMap(),
    multiplyModifiers: multiplyModifiers !== undefined ? multiplyModifiers : emptyModifierMap(),
    identifiedModifiers: identifiedModifiersFromGear(target.equipment, target.inventory, itemsById).concat(
      identifiedModifiersFromEffectMap(effectModifiers !== undefined ? effectModifiers : emptyModifierMap()),
    ),
  });
  const previousMax = target.maxHealth;
  target.maxHealth = evaluated.maxHealth;
  target.derivedAttack = evaluated.attack;
  if (target.health > 0) {
    target.health = preserveHealthOnMaxChange(target.health, previousMax, target.maxHealth);
  }
  if (target.health > target.maxHealth) {
    target.health = target.maxHealth;
  }
  if (target.health < 0) {
    target.health = 0;
  }
  if (target.resources !== undefined) {
    const manaId = resourceIdForRole(catalog, "mana");
    if (manaId.length > 0) {
      if (evaluated.maxMana <= 0) {
        delete target.resources[manaId];
      } else if (target.resources[manaId] !== undefined && target.resources[manaId] > evaluated.maxMana) {
        target.resources[manaId] = evaluated.maxMana;
      }
    }
  }
  return evaluated;
}

function overlayCanonicalStats(
  evaluated: EvaluatedStats,
  classDef: ClassContent,
  ctx: StatContext,
  healthId: string,
  manaId: string,
  usesMana: boolean,
): void {
  const free =
    ctx.freeStatAllocations !== undefined ? ctx.freeStatAllocations : {};
  const snapshot = evaluateCanonicalSnapshot(
    canonicalInputFromClass(classDef, ctx.level, free, ctx.identifiedModifiers !== undefined ? ctx.identifiedModifiers : []),
  );
  evaluated.canonical = snapshot;
  evaluated.maxHealth = snapshot.hpMax;
  evaluated.maxMana = usesMana ? snapshot.manaMax : 0;
  evaluated.manaRegen = snapshot.manaRegen;
  evaluated.critChance = snapshot.critChance;
  evaluated.critMult = snapshot.critMult;
  evaluated.hasteMult = snapshot.hasteMult;
  evaluated.damageReduction = snapshot.damageReduction;
  evaluated.effectiveHp = snapshot.effectiveHp;
  const derivedIds = Object.keys(snapshot.derived);
  for (let i = 0; i < derivedIds.length; i++) {
    evaluated.values[derivedIds[i]] = snapshot.derived[derivedIds[i]];
  }
  if (healthId.length > 0) {
    evaluated.values[healthId] = snapshot.hpMax;
  }
  if (manaId.length > 0) {
    if (usesMana) {
      evaluated.values[manaId] = snapshot.manaMax;
    } else {
      delete evaluated.values[manaId];
    }
  }
}

function evaluateDerivedStat(
  stat: DerivedStatContent,
  _catalog: ProgressionCatalog,
  ctx: StatContext,
  progression: ClassProgressionContent | null,
): number {
  let additive = 0;
  let percent = 0;
  let multiply = 1;
  let clampMin: number | undefined;
  let clampMax: number | undefined;
  for (let layerIndex = 0; layerIndex < STAT_LAYER_ORDER.length; layerIndex++) {
    const layer = STAT_LAYER_ORDER[layerIndex];
    const components = componentsForLayer(stat.components, layer);
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      if (layer === "class_base") {
        additive += classBaseValue(component, stat.id, progression);
        continue;
      }
      if (layer === "level_growth") {
        additive += levelGrowthValue(component, ctx.level, progression);
        continue;
      }
      if (layer === "allocated_attributes") {
        const allocated = component.id !== undefined ? numberOr(ctx.allocatedAttributes[component.id], 0) : 0;
        additive += allocated * numberOr(component.weight, 1);
        continue;
      }
      if (layer === "equipment") {
        additive += channelValue(ctx.equipmentModifiers, component.channel);
        continue;
      }
      if (layer === "effects") {
        additive += channelValue(ctx.effectModifiers, component.channel);
        continue;
      }
      if (layer === "percent") {
        percent += channelValue(ctx.percentModifiers, component.channel);
        continue;
      }
      if (layer === "multiply") {
        const factor = component.channel !== undefined ? ctx.multiplyModifiers[component.channel] : undefined;
        if (factor !== undefined) {
          multiply *= factor;
        }
        continue;
      }
      if (layer === "clamp") {
        if (component.min !== undefined) {
          clampMin = component.min;
        }
        if (component.max !== undefined) {
          clampMax = component.max;
        }
      }
    }
  }
  let value = additive * (1 + percent) * multiply;
  if (clampMin !== undefined && value < clampMin) {
    value = clampMin;
  }
  if (clampMax !== undefined && value > clampMax) {
    value = clampMax;
  }
  return value;
}

function componentsForLayer(components: ReadonlyArray<StatComponent>, layer: string): StatComponent[] {
  const found: StatComponent[] = [];
  for (let i = 0; i < components.length; i++) {
    if (components[i].layer === layer) {
      found.push(components[i]);
    }
  }
  return found;
}

function classBaseValue(component: StatComponent, statId: string, progression: ClassProgressionContent | null): number {
  if (progression === null) {
    return numberOr(component.value, 0);
  }
  if (component.source === "starting_derived") {
    const key = component.id !== undefined ? component.id : statId;
    return numberOr(progression.startingDerived[key], 0);
  }
  if (component.source === "starting_resource") {
    const key = component.id !== undefined ? component.id : "";
    return key.length > 0 ? numberOr(progression.startingResources[key], 0) : 0;
  }
  if (component.source === "constant") {
    return numberOr(component.value, 0);
  }
  return numberOr(component.value, 0);
}

function levelGrowthValue(component: StatComponent, level: number, progression: ClassProgressionContent | null): number {
  const growthLevels = level > 1 ? level - 1 : 0;
  if (growthLevels === 0 || progression === null) {
    return 0;
  }
  const weight = numberOr(component.weight, 1);
  if (component.source === "attribute_growth") {
    const key = component.id !== undefined ? component.id : "";
    return key.length > 0 ? numberOr(progression.attributeGrowth[key], 0) * growthLevels * weight : 0;
  }
  if (component.source === "resource_growth") {
    const key = component.id !== undefined ? component.id : "";
    const growth = progression.resourceGrowth !== undefined ? progression.resourceGrowth : {};
    return key.length > 0 ? numberOr(growth[key], 0) * growthLevels * weight : 0;
  }
  if (component.source === "constant") {
    return numberOr(component.value, 0) * growthLevels;
  }
  return 0;
}

function channelValue(modifiers: { [channel: string]: number }, channel: string | undefined): number {
  if (channel === undefined || channel.length === 0) {
    return 0;
  }
  return numberOr(modifiers[channel], 0);
}

function numberOr(value: number | undefined, fallback: number): number {
  if (value === undefined || !isFinite(value)) {
    return fallback;
  }
  return value;
}

function copyClassMap(input: { [id: string]: ClassContent }): { [id: string]: ClassContent } {
  const out: { [id: string]: ClassContent } = {};
  const ids = Object.keys(input);
  for (let i = 0; i < ids.length; i++) {
    const def = input[ids[i]];
    const abilities: string[] = [];
    if (def.startingAbilities !== undefined) {
      for (let a = 0; a < def.startingAbilities.length; a++) {
        abilities.push(def.startingAbilities[a]);
      }
    }
    out[ids[i]] = {
      id: def.id,
      displayName: def.displayName,
      progressionId: def.progressionId,
      startingAbilities: abilities,
      resourceType: def.resourceType,
      autoAttackId: def.autoAttackId,
      basicAbilityId: def.basicAbilityId,
      canonicalLevelCurveId: def.canonicalLevelCurveId,
      branchIds: def.branchIds !== undefined ? copyIds(def.branchIds) : undefined,
      autoAssignTemplate:
        def.autoAssignTemplate !== undefined
          ? { amounts: copyNumberRecord(def.autoAssignTemplate.amounts) }
          : undefined,
      baseStats: def.baseStats !== undefined ? copyNumberRecord(def.baseStats) : undefined,
      automaticGrowth: def.automaticGrowth !== undefined ? copyNumberRecord(def.automaticGrowth) : undefined,
    };
  }
  return out;
}

function copyAttributeMap(input: { [id: string]: AttributeContent }): { [id: string]: AttributeContent } {
  const out: { [id: string]: AttributeContent } = {};
  const ids = Object.keys(input);
  for (let i = 0; i < ids.length; i++) {
    out[ids[i]] = { id: input[ids[i]].id, displayName: input[ids[i]].displayName };
  }
  return out;
}

function copyResourceMap(input: { [id: string]: ResourceContent }): { [id: string]: ResourceContent } {
  const out: { [id: string]: ResourceContent } = {};
  const ids = Object.keys(input);
  for (let i = 0; i < ids.length; i++) {
    out[ids[i]] = { id: input[ids[i]].id, displayName: input[ids[i]].displayName, role: input[ids[i]].role };
  }
  return out;
}

function copyDerivedMap(input: { [id: string]: DerivedStatContent }): { [id: string]: DerivedStatContent } {
  const out: { [id: string]: DerivedStatContent } = {};
  const ids = Object.keys(input);
  for (let i = 0; i < ids.length; i++) {
    const def = input[ids[i]];
    const components: StatComponent[] = [];
    for (let c = 0; c < def.components.length; c++) {
      const component = def.components[c];
      const copy: StatComponent = { layer: component.layer };
      if (component.source !== undefined) {
        copy.source = component.source;
      }
      if (component.id !== undefined) {
        copy.id = component.id;
      }
      if (component.channel !== undefined) {
        copy.channel = component.channel;
      }
      if (component.weight !== undefined) {
        copy.weight = component.weight;
      }
      if (component.value !== undefined) {
        copy.value = component.value;
      }
      if (component.min !== undefined) {
        copy.min = component.min;
      }
      if (component.max !== undefined) {
        copy.max = component.max;
      }
      components.push(copy);
    }
    out[ids[i]] = {
      id: def.id,
      displayName: def.displayName,
      role: def.role,
      components: components,
    };
  }
  return out;
}

function copyCurveMap(input: { [id: string]: LevelCurveContent }): { [id: string]: LevelCurveContent } {
  const out: { [id: string]: LevelCurveContent } = {};
  const ids = Object.keys(input);
  for (let i = 0; i < ids.length; i++) {
    const def = input[ids[i]];
    const unlocks: LevelUnlockContent[] = [];
    if (def.automaticUnlocks !== undefined) {
      for (let u = 0; u < def.automaticUnlocks.length; u++) {
        const row = def.automaticUnlocks[u];
        const abilityIds: string[] = [];
        for (let a = 0; a < row.abilityIds.length; a++) {
          abilityIds.push(row.abilityIds[a]);
        }
        unlocks.push({ level: row.level, abilityIds: abilityIds });
      }
    }
    out[ids[i]] = {
      id: def.id,
      maxLevel: def.maxLevel,
      xpRequired: copyNumberList(def.xpRequired),
      attributePointsPerLevel: copyNumberList(def.attributePointsPerLevel),
      skillPointsPerLevel: copyNumberList(def.skillPointsPerLevel),
      automaticUnlocks: unlocks,
    };
  }
  return out;
}

function copyProgressionMap(input: { [id: string]: ClassProgressionContent }): { [id: string]: ClassProgressionContent } {
  const out: { [id: string]: ClassProgressionContent } = {};
  const ids = Object.keys(input);
  for (let i = 0; i < ids.length; i++) {
    const def = input[ids[i]];
    const allowed: string[] = [];
    for (let a = 0; a < def.allowedAttributeIds.length; a++) {
      allowed.push(def.allowedAttributeIds[a]);
    }
    out[ids[i]] = {
      id: def.id,
      classId: def.classId,
      levelCurveId: def.levelCurveId,
      startingAttributes: copyNumberRecord(def.startingAttributes),
      attributeGrowth: copyNumberRecord(def.attributeGrowth),
      startingResources: copyNumberRecord(def.startingResources),
      resourceGrowth: def.resourceGrowth !== undefined ? copyNumberRecord(def.resourceGrowth) : undefined,
      startingDerived: copyNumberRecord(def.startingDerived),
      allowedAttributeIds: allowed,
      attributePointRules: { pointsAtCreate: def.attributePointRules.pointsAtCreate },
      skillPointRules: { pointsAtCreate: def.skillPointRules.pointsAtCreate },
    };
  }
  return out;
}

function copyNumberList(values: ReadonlyArray<number>): number[] {
  const list: number[] = [];
  for (let i = 0; i < values.length; i++) {
    list.push(values[i]);
  }
  return list;
}

function copyNumberRecord(map: { [id: string]: number }): { [id: string]: number } {
  const out: { [id: string]: number } = {};
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = map[keys[i]];
  }
  return out;
}

function copyIds(values: ReadonlyArray<string>): string[] {
  const list: string[] = [];
  for (let i = 0; i < values.length; i++) {
    list.push(values[i]);
  }
  return list;
}

function copyBranchMap(input: { [id: string]: BranchContent } | undefined): { [id: string]: BranchContent } {
  const out: { [id: string]: BranchContent } = {};
  if (input === undefined) {
    return out;
  }
  const ids = Object.keys(input);
  for (let i = 0; i < ids.length; i++) {
    const def = input[ids[i]];
    out[ids[i]] = {
      id: def.id,
      classId: def.classId,
      signatureAbilityId: def.signatureAbilityId !== undefined ? def.signatureAbilityId : "",
      capstoneAbilityId: def.capstoneAbilityId !== undefined ? def.capstoneAbilityId : "",
    };
  }
  return out;
}

function copyTalentGrants(input: { [id: string]: unknown } | undefined): { [nodeId: string]: TalentGrantContent } {
  const out: { [nodeId: string]: TalentGrantContent } = {};
  if (input === undefined) {
    return out;
  }
  const ids = Object.keys(input);
  for (let i = 0; i < ids.length; i++) {
    const raw = input[ids[i]];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const def = raw as { grantsActiveAbilityId?: unknown; rankReplacement?: { abilityId?: unknown } };
    const grant: TalentGrantContent = {};
    if (typeof def.grantsActiveAbilityId === "string" && def.grantsActiveAbilityId.length > 0) {
      grant.grantsActiveAbilityId = def.grantsActiveAbilityId;
    }
    if (
      def.rankReplacement !== undefined &&
      typeof def.rankReplacement.abilityId === "string" &&
      def.rankReplacement.abilityId.length > 0
    ) {
      grant.rankReplacementAbilityId = def.rankReplacement.abilityId;
    }
    if (grant.grantsActiveAbilityId !== undefined || grant.rankReplacementAbilityId !== undefined) {
      out[ids[i]] = grant;
    }
  }
  return out;
}
