import { channelFromStatId, type PlayerEquipment } from "./equipment";
import { findItem, type ItemDefinition, type PlayerInventory } from "./inventory";

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
}

export interface ProgressionCatalog {
  classes: { [id: string]: ClassContent };
  attributes: { [id: string]: AttributeContent };
  resources: { [id: string]: ResourceContent };
  derivedStats: { [id: string]: DerivedStatContent };
  levelCurves: { [id: string]: LevelCurveContent };
  classProgressions: { [id: string]: ClassProgressionContent };
}

export interface StatContext {
  classId: string;
  level: number;
  allocatedAttributes: { [id: string]: number };
  equipmentModifiers: { [channel: string]: number };
  effectModifiers: { [channel: string]: number };
  percentModifiers: { [channel: string]: number };
  multiplyModifiers: { [channel: string]: number };
}

export interface EvaluatedStats {
  values: { [statId: string]: number };
  attack: number;
  maxHealth: number;
  maxMana: number;
}

export interface CombatStatTarget {
  health: number;
  maxHealth: number;
  derivedAttack?: number;
  classId?: string;
  allocatedAttributes?: { [id: string]: number };
  level?: number;
  progression?: { level: number; allocatedAttributes: { [id: string]: number } };
  equipment?: PlayerEquipment;
  inventory?: PlayerInventory;
}

export function catalogFromContent(content: {
  classes: { [id: string]: ClassContent };
  attributes: { [id: string]: AttributeContent };
  resources: { [id: string]: ResourceContent };
  derivedStats: { [id: string]: DerivedStatContent };
  levelCurves: { [id: string]: LevelCurveContent };
  classProgressions: { [id: string]: ClassProgressionContent };
}): ProgressionCatalog {
  return {
    classes: copyClassMap(content.classes),
    attributes: copyAttributeMap(content.attributes),
    resources: copyResourceMap(content.resources),
    derivedStats: copyDerivedMap(content.derivedStats),
    levelCurves: copyCurveMap(content.levelCurves),
    classProgressions: copyProgressionMap(content.classProgressions),
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
  return {
    values: values,
    attack: attackId.length > 0 ? values[attackId] : 0,
    maxHealth: healthId.length > 0 ? values[healthId] : 1,
    maxMana: manaId.length > 0 ? values[manaId] : 0,
  };
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

export function emptyModifierMap(): { [channel: string]: number } {
  return {};
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
    equipmentModifiers: equipmentModifiersFromGear(target.equipment, target.inventory, itemsById),
    effectModifiers: effectModifiers !== undefined ? effectModifiers : emptyModifierMap(),
    percentModifiers: percentModifiers !== undefined ? percentModifiers : emptyModifierMap(),
    multiplyModifiers: multiplyModifiers !== undefined ? multiplyModifiers : emptyModifierMap(),
  });
  const previousMax = target.maxHealth;
  target.maxHealth = evaluated.maxHealth;
  target.derivedAttack = evaluated.attack;
  if (target.health > 0) {
    const delta = target.maxHealth - previousMax;
    if (delta > 0) {
      target.health += delta;
    }
  }
  if (target.health > target.maxHealth) {
    target.health = target.maxHealth;
  }
  if (target.health < 0) {
    target.health = 0;
  }
  return evaluated;
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
