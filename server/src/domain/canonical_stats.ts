import { CANONICAL_STAT_IDS, classUsesMana } from "./canonical_progression";
import type { ClassContent } from "./stats";

export const CANONICAL_SOURCE_CLASS_BASE = "class_base";
export const CANONICAL_SOURCE_AUTOMATIC_GROWTH = "automatic_growth";
export const CANONICAL_SOURCE_FREE_ALLOCATION = "free_allocation";
export const CANONICAL_SOURCE_EQUIPMENT = "equipment";
export const CANONICAL_SOURCE_TEMPORARY_EFFECT = "temporary_effect";
export const CANONICAL_SOURCE_TALENT_NODE = "talent_node";

export const CHANNEL_OUTGOING = "outgoing_damage";
export const CHANNEL_TAKEN = "taken_damage";
export const CHANNEL_CRIT_DAMAGE = "crit_damage";
export const CHANNEL_MAX_HEALTH = "max_health";
export const CHANNEL_MAX_MANA = "max_mana";
export const CHANNEL_WEAPON_BASE = "weapon_base";

export type CanonicalSourceKind =
  | typeof CANONICAL_SOURCE_CLASS_BASE
  | typeof CANONICAL_SOURCE_AUTOMATIC_GROWTH
  | typeof CANONICAL_SOURCE_FREE_ALLOCATION
  | typeof CANONICAL_SOURCE_EQUIPMENT
  | typeof CANONICAL_SOURCE_TEMPORARY_EFFECT
  | typeof CANONICAL_SOURCE_TALENT_NODE;

export type PowerCategory = "melee" | "ranged" | "spell" | "curse" | "heal" | "shield";

export interface CanonicalModifier {
  sourceId: string;
  sourceKind: CanonicalSourceKind;
  nodeId?: string;
  rank?: number;
  channel: string;
  op: "add" | "pct";
  value: number;
}

export interface CanonicalStatInput {
  classId: string;
  level: number;
  baseStats: { [id: string]: number };
  automaticGrowth: { [id: string]: number };
  freeStatAllocations: { [id: string]: number };
  usesMana: boolean;
  modifiers: ReadonlyArray<CanonicalModifier>;
}

export interface CanonicalSnapshot {
  classId: string;
  level: number;
  stats: { [id: string]: number };
  hpMax: number;
  manaMax: number;
  manaRegen: number;
  critChance: number;
  critMult: number;
  hasteMult: number;
  damageReduction: number;
  effectiveHp: number;
  outgoingProduct: number;
  takenProduct: number;
  critDamageProduct: number;
  modifiers: CanonicalModifier[];
  derived: { [id: string]: number };
}

export interface CanonicalHitInput {
  base: number;
  category: PowerCategory;
  stats: { [id: string]: number };
  critChance: number;
  critMult: number;
  outgoingProduct: number;
  damageReduction: number;
  takenProduct: number;
  critDamageProduct: number;
  guaranteedCrit?: boolean;
  bonusCritChance?: number;
  isDot?: boolean;
  isShield?: boolean;
  shieldCanCrit?: boolean;
  random?: () => number;
}

export interface CanonicalHitResult {
  rawScaled: number;
  afterCrit: number;
  afterOutgoing: number;
  afterDamageReduction: number;
  final: number;
  crit: boolean;
}

export const L10_REFERENCE = {
  warrior: {
    stats: {
      "stat.strength": 35,
      "stat.agility": 4,
      "stat.intelligence": 2,
      "stat.spirit": 3,
      "stat.vitality": 26,
      "stat.precision": 3,
      "stat.haste": 3,
      "stat.endurance": 12,
    },
    hp: 290,
    effectiveHp: 308.5,
    critChance: 0.015,
    critMult: 1.85,
    hasteMult: 1.03,
    damageReduction: 0.06,
  },
  mage: {
    stats: {
      "stat.strength": 2,
      "stat.agility": 4,
      "stat.intelligence": 36,
      "stat.spirit": 14,
      "stat.vitality": 14,
      "stat.precision": 3,
      "stat.haste": 12,
      "stat.endurance": 3,
    },
    hp: 170,
    effectiveHp: 172.6,
    mana: 164,
    regen: 3.8,
    critChance: 0.015,
    critMult: 1.52,
    hasteMult: 1.12,
    damageReduction: 0.015,
  },
  marksman: {
    stats: {
      "stat.strength": 4,
      "stat.agility": 36,
      "stat.intelligence": 3,
      "stat.spirit": 3,
      "stat.vitality": 15,
      "stat.precision": 12,
      "stat.haste": 12,
      "stat.endurance": 3,
    },
    hp: 180,
    effectiveHp: 182.7,
    critChance: 0.06,
    critMult: 1.54,
    hasteMult: 1.12,
    damageReduction: 0.015,
  },
  mystic: {
    stats: {
      "stat.strength": 2,
      "stat.agility": 4,
      "stat.intelligence": 24,
      "stat.spirit": 26,
      "stat.vitality": 14,
      "stat.precision": 3,
      "stat.haste": 3,
      "stat.endurance": 12,
    },
    hp: 170,
    effectiveHp: 180.9,
    mana: 116,
    regen: 6.2,
    critChance: 0.015,
    critMult: 1.52,
    hasteMult: 1.03,
    damageReduction: 0.06,
  },
} as const;

export function classUsesCanonicalStats(classDef: ClassContent | undefined): boolean {
  if (classDef === undefined || classDef.baseStats === undefined) {
    return false;
  }
  return numberOr(classDef.baseStats["stat.vitality"], 0) > 0 || Object.keys(classDef.baseStats).length > 0;
}

export function formulaHpMax(vitality: number): number {
  return 30 + 10 * vitality;
}

export function formulaManaMax(intelligence: number, usesMana: boolean): number {
  if (!usesMana) {
    return 0;
  }
  return 20 + 4 * intelligence;
}

export function formulaManaRegen(spirit: number, usesMana: boolean): number {
  if (!usesMana) {
    return 0;
  }
  return 1 + 0.2 * spirit;
}

export function formulaCritChance(precision: number): number {
  return 0.005 * precision;
}

export function formulaCritMult(strength: number): number {
  return 1.5 + 0.01 * strength;
}

export function formulaHasteMult(haste: number): number {
  return 1 + 0.01 * haste;
}

export function formulaDamageReduction(endurance: number): number {
  return 0.005 * endurance;
}

export function formulaEffectiveHp(hpMax: number, damageReduction: number): number {
  return hpMax / (1 - damageReduction);
}

export function formulaAttackInterval(weaponBaseInterval: number, hasteMult: number): number {
  return weaponBaseInterval / hasteDivisor(hasteMult);
}

export function formulaCastTime(baseCastTime: number, hasteMult: number): number {
  return baseCastTime / hasteDivisor(hasteMult);
}

export function formulaDotTickInterval(baseTickInterval: number, hasteMult: number): number {
  return baseTickInterval / hasteDivisor(hasteMult);
}

export function formulaMeleeHit(baseDamage: number, strength: number): number {
  return baseDamage * (1 + strength / 100);
}

export function formulaRangedHit(baseDamage: number, agility: number): number {
  return baseDamage * (1 + agility / 100);
}

export function formulaSpellHit(baseDamage: number, intelligence: number): number {
  return baseDamage * (1 + intelligence / 100);
}

export function formulaHeal(baseHeal: number, spirit: number): number {
  return baseHeal * (1 + spirit / 100);
}

export function scalePower(base: number, category: PowerCategory, stats: { [id: string]: number }): number {
  if (category === "melee") {
    return formulaMeleeHit(base, numberOr(stats["stat.strength"], 0));
  }
  if (category === "ranged") {
    return formulaRangedHit(base, numberOr(stats["stat.agility"], 0));
  }
  if (category === "spell" || category === "curse") {
    return formulaSpellHit(base, numberOr(stats["stat.intelligence"], 0));
  }
  return formulaHeal(base, numberOr(stats["stat.spirit"], 0));
}

export function collapseRankReplacements(modifiers: ReadonlyArray<CanonicalModifier>): CanonicalModifier[] {
  const kept: CanonicalModifier[] = [];
  const bestByNode: { [key: string]: CanonicalModifier } = {};
  for (let i = 0; i < modifiers.length; i++) {
    const modifier = modifiers[i];
    if (!isFinite(modifier.value)) {
      continue;
    }
    const nodeId = modifier.nodeId !== undefined ? modifier.nodeId : "";
    if (modifier.sourceKind === CANONICAL_SOURCE_TALENT_NODE && nodeId.length > 0) {
      const key = nodeId + ":" + normalizeChannel(modifier.channel);
      const previous = bestByNode[key];
      const rank = numberOr(modifier.rank, 0);
      if (previous === undefined || rank >= numberOr(previous.rank, 0)) {
        bestByNode[key] = modifier;
      }
      continue;
    }
    kept.push(modifier);
  }
  const keys = Object.keys(bestByNode);
  for (let i = 0; i < keys.length; i++) {
    kept.push(bestByNode[keys[i]]);
  }
  return kept;
}

export function productOfPctModifiers(modifiers: ReadonlyArray<CanonicalModifier>, channel: string): number {
  const wanted = normalizeChannel(channel);
  let product = 1;
  for (let i = 0; i < modifiers.length; i++) {
    const modifier = modifiers[i];
    if (modifier.op !== "pct") {
      continue;
    }
    if (normalizeChannel(modifier.channel) !== wanted) {
      continue;
    }
    product *= 1 + modifier.value;
  }
  return product;
}

export function sumOfAddModifiers(modifiers: ReadonlyArray<CanonicalModifier>, channel: string): number {
  const wanted = normalizeChannel(channel);
  let total = 0;
  for (let i = 0; i < modifiers.length; i++) {
    const modifier = modifiers[i];
    if (modifier.op !== "add") {
      continue;
    }
    if (normalizeChannel(modifier.channel) !== wanted) {
      continue;
    }
    total += modifier.value;
  }
  return total;
}

export function evaluateCanonicalSnapshot(input: CanonicalStatInput): CanonicalSnapshot {
  const collapsed = collapseRankReplacements(input.modifiers);
  const growthLevels = input.level > 1 ? input.level - 1 : 0;
  const stats: { [id: string]: number } = {};
  const modifiersWithIdentity: CanonicalModifier[] = [];
  for (let i = 0; i < CANONICAL_STAT_IDS.length; i++) {
    const id = CANONICAL_STAT_IDS[i];
    const base = requireFinite(input.baseStats[id], id + ".base");
    const growth = requireFinite(input.automaticGrowth[id], id + ".growth");
    const free = requireFinite(input.freeStatAllocations[id], id + ".free");
    modifiersWithIdentity.push({
      sourceId: input.classId,
      sourceKind: CANONICAL_SOURCE_CLASS_BASE,
      channel: id,
      op: "add",
      value: base,
    });
    if (growthLevels > 0 && growth !== 0) {
      modifiersWithIdentity.push({
        sourceId: input.classId,
        sourceKind: CANONICAL_SOURCE_AUTOMATIC_GROWTH,
        channel: id,
        op: "add",
        value: growth * growthLevels,
      });
    }
    if (free !== 0) {
      modifiersWithIdentity.push({
        sourceId: "free_stat_allocations",
        sourceKind: CANONICAL_SOURCE_FREE_ALLOCATION,
        channel: id,
        op: "add",
        value: free,
      });
    }
    stats[id] = base + growth * growthLevels + free + sumOfAddModifiers(collapsed, id);
  }
  for (let i = 0; i < collapsed.length; i++) {
    modifiersWithIdentity.push(collapsed[i]);
  }
  const usesMana = input.usesMana;
  const hpMax = formulaHpMax(stats["stat.vitality"]) + sumOfAddModifiers(collapsed, CHANNEL_MAX_HEALTH);
  const manaMax = usesMana
    ? formulaManaMax(stats["stat.intelligence"], true) + sumOfAddModifiers(collapsed, CHANNEL_MAX_MANA)
    : 0;
  const manaRegen = formulaManaRegen(stats["stat.spirit"], usesMana);
  const critChance = formulaCritChance(stats["stat.precision"]);
  const critMult = formulaCritMult(stats["stat.strength"]);
  const hasteMult = formulaHasteMult(stats["stat.haste"]);
  const damageReduction = formulaDamageReduction(stats["stat.endurance"]);
  const effectiveHp = formulaEffectiveHp(hpMax, damageReduction);
  const outgoingProduct = productOfPctModifiers(collapsed, CHANNEL_OUTGOING);
  const takenProduct = productOfPctModifiers(collapsed, CHANNEL_TAKEN);
  const critDamageProduct = productOfPctModifiers(collapsed, CHANNEL_CRIT_DAMAGE);
  const derived: { [id: string]: number } = {
    "stat.strength": stats["stat.strength"],
    "stat.agility": stats["stat.agility"],
    "stat.intelligence": stats["stat.intelligence"],
    "stat.spirit": stats["stat.spirit"],
    "stat.vitality": stats["stat.vitality"],
    "stat.precision": stats["stat.precision"],
    "stat.haste": stats["stat.haste"],
    "stat.endurance": stats["stat.endurance"],
    "formula.hp_max": hpMax,
    "formula.crit_chance": critChance,
    "formula.crit_mult": critMult,
    "formula.haste_mult": hasteMult,
    "formula.damage_reduction": damageReduction,
    "formula.effective_hp": effectiveHp,
  };
  if (usesMana) {
    derived["formula.mana_max"] = manaMax;
    derived["formula.mana_regen"] = manaRegen;
  }
  const snapshot: CanonicalSnapshot = {
    classId: input.classId,
    level: input.level,
    stats: stats,
    hpMax: hpMax,
    manaMax: manaMax,
    manaRegen: manaRegen,
    critChance: critChance,
    critMult: critMult,
    hasteMult: hasteMult,
    damageReduction: damageReduction,
    effectiveHp: effectiveHp,
    outgoingProduct: outgoingProduct,
    takenProduct: takenProduct,
    critDamageProduct: critDamageProduct,
    modifiers: modifiersWithIdentity,
    derived: derived,
  };
  assertFiniteSnapshot(snapshot);
  return snapshot;
}

export function evaluateCanonicalHit(input: CanonicalHitInput): CanonicalHitResult {
  const rawScaled = scalePower(input.base, input.category, input.stats);
  const allowCrit = input.isDot !== true && (input.isShield !== true || input.shieldCanCrit === true);
  const rolled = allowCrit
    ? rollDirectCrit(
        input.critChance,
        input.bonusCritChance !== undefined ? input.bonusCritChance : 0,
        input.guaranteedCrit === true,
        input.random !== undefined ? input.random : defaultRandom,
      )
    : false;
  const critMult = rolled ? input.critMult * input.critDamageProduct : 1;
  const afterCrit = rawScaled * critMult;
  const afterOutgoing = afterCrit * input.outgoingProduct;
  const afterDamageReduction = afterOutgoing * (1 - input.damageReduction);
  const finalAmount = afterDamageReduction * input.takenProduct;
  return {
    rawScaled: rawScaled,
    afterCrit: afterCrit,
    afterOutgoing: afterOutgoing,
    afterDamageReduction: afterDamageReduction,
    final: finalAmount,
    crit: rolled,
  };
}

export function rollDirectCrit(
  critChance: number,
  bonusCritChance: number,
  guaranteed: boolean,
  random: () => number,
): boolean {
  if (guaranteed) {
    return true;
  }
  const chance = critChance + bonusCritChance;
  return random() < chance;
}

export function regenerateMana(current: number, max: number, regenPerSec: number, deltaSec: number): number {
  if (!(max > 0) || !isFinite(max)) {
    return 0;
  }
  const start = numberOr(current, 0);
  const clamped = start > max ? max : start;
  const next = clamped + numberOr(regenPerSec, 0) * numberOr(deltaSec, 0);
  if (next > max) {
    return max;
  }
  if (next < 0) {
    return 0;
  }
  return next;
}

export function preserveHealthOnMaxChange(currentHealth: number, previousMax: number, nextMax: number): number {
  if (!(currentHealth > 0)) {
    return currentHealth < 0 ? 0 : currentHealth;
  }
  let health = currentHealth;
  const delta = nextMax - previousMax;
  if (delta > 0) {
    health += delta;
  }
  if (health > nextMax) {
    health = nextMax;
  }
  if (health < 0) {
    health = 0;
  }
  return health;
}

export function roundToTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

export function validateNumericTree(value: unknown, path: string, issues: string[]): void {
  if (typeof value === "number") {
    if (!isFinite(value)) {
      issues.push("nonfinite:" + path);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      validateNumericTree(value[i], path + "[" + String(i) + "]", issues);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    const record = value as { [key: string]: unknown };
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i++) {
      validateNumericTree(record[keys[i]], path.length > 0 ? path + "." + keys[i] : keys[i], issues);
    }
  }
}

export function canonicalInputFromClass(
  classDef: ClassContent,
  level: number,
  freeStatAllocations: { [id: string]: number },
  modifiers: ReadonlyArray<CanonicalModifier>,
): CanonicalStatInput {
  return {
    classId: classDef.id,
    level: level,
    baseStats: classDef.baseStats !== undefined ? classDef.baseStats : {},
    automaticGrowth: classDef.automaticGrowth !== undefined ? classDef.automaticGrowth : {},
    freeStatAllocations: freeStatAllocations,
    usesMana: classUsesMana(classDef.resourceType),
    modifiers: modifiers,
  };
}

export function normalizeChannel(channel: string): string {
  if (channel === "outgoing" || channel === "outgoing_damage") {
    return CHANNEL_OUTGOING;
  }
  if (channel === "taken" || channel === "taken_damage") {
    return CHANNEL_TAKEN;
  }
  if (channel === "crit_damage" || channel === "critical_damage") {
    return CHANNEL_CRIT_DAMAGE;
  }
  if (channel === "max_health" || channel === "health") {
    return CHANNEL_MAX_HEALTH;
  }
  if (channel === "max_mana" || channel === "mana") {
    return CHANNEL_MAX_MANA;
  }
  if (channel === "attack" || channel === "weapon_base") {
    return CHANNEL_WEAPON_BASE;
  }
  if (channel.indexOf("stat.") === 0) {
    return channel;
  }
  const mapped = "stat." + channel;
  for (let i = 0; i < CANONICAL_STAT_IDS.length; i++) {
    if (CANONICAL_STAT_IDS[i] === mapped) {
      return mapped;
    }
  }
  return channel;
}

function hasteDivisor(hasteMult: number): number {
  if (!(hasteMult > 0) || !isFinite(hasteMult)) {
    return 1;
  }
  return hasteMult;
}

function defaultRandom(): number {
  return 1;
}

function assertFiniteSnapshot(snapshot: CanonicalSnapshot): void {
  const values: { [id: string]: number } = snapshot.derived;
  const keys = Object.keys(values);
  for (let i = 0; i < keys.length; i++) {
    if (!isFinite(values[keys[i]])) {
      throw new Error("nonfinite_stat:" + keys[i]);
    }
  }
}

function requireFinite(value: number | undefined, label: string): number {
  if (value === undefined) {
    return 0;
  }
  if (!isFinite(value)) {
    throw new Error("nonfinite_stat:" + label);
  }
  return value;
}

function numberOr(value: number | undefined, fallback: number): number {
  if (value === undefined || !isFinite(value)) {
    return fallback;
  }
  return value;
}
