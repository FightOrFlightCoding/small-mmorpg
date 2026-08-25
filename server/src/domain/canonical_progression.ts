export const CANONICAL_PROGRESSION_SCHEMA_VERSION = 2;
export const CANONICAL_LEVEL_CAP = 10;
export const CANONICAL_HOTBAR_SIZE = 4;
export const CANONICAL_AUTO_ASSIGN_DEFAULT = false;
export const RESOURCE_NONE = "resource.none";
export const FRENZY_ABILITY_ID = "ability.warrior.frenzy";

export const CANONICAL_STAT_IDS = [
  "stat.strength",
  "stat.agility",
  "stat.intelligence",
  "stat.spirit",
  "stat.vitality",
  "stat.precision",
  "stat.haste",
  "stat.endurance",
] as const;

export function classUsesMana(resourceType: string | undefined): boolean {
  if (resourceType === undefined || resourceType.length === 0) {
    return true;
  }
  return resourceType !== RESOURCE_NONE;
}

export function usesCanonicalCreateState(autoAttackId: string | undefined): boolean {
  return autoAttackId !== undefined && autoAttackId.length > 0;
}

export function classPointsEarned(level: number): number {
  if (level < 3) {
    return 0;
  }
  if (level === 3) {
    return 1;
  }
  return 2;
}

export function branchPointsEarned(level: number): number {
  if (level < 5) {
    return 0;
  }
  const earned = level - 4;
  return earned > 6 ? 6 : earned;
}

export function unspentClassPoints(purchasedClassNodeIds: ReadonlyArray<string>, level: number): number {
  const earned = classPointsEarned(level);
  const spent = purchasedClassNodeIds.length;
  return earned > spent ? earned - spent : 0;
}

export function unspentBranchPoints(purchasedBranchNodeRanks: { [nodeId: string]: number }, level: number): number {
  let spent = 0;
  const keys = Object.keys(purchasedBranchNodeRanks);
  for (let i = 0; i < keys.length; i++) {
    const rank = purchasedBranchNodeRanks[keys[i]];
    if (typeof rank === "number" && isFinite(rank) && rank > 0) {
      spent += rank;
    }
  }
  const earned = branchPointsEarned(level);
  return earned > spent ? earned - spent : 0;
}

export function unspentFreeStatPoints(
  freeStatAllocations: { [statId: string]: number },
  level: number,
): number {
  const earned = level > 1 ? (level - 1) * 3 : 0;
  let spent = 0;
  const keys = Object.keys(freeStatAllocations);
  for (let i = 0; i < keys.length; i++) {
    const amount = freeStatAllocations[keys[i]];
    if (typeof amount === "number" && isFinite(amount) && amount > 0) {
      spent += amount;
    }
  }
  return earned > spent ? earned - spent : 0;
}

export function canonicalStatTotals(
  baseStats: { [id: string]: number } | undefined,
  automaticGrowth: { [id: string]: number } | undefined,
  freeStatAllocations: { [id: string]: number },
  level: number,
): { [id: string]: number } {
  const growthLevels = level > 1 ? level - 1 : 0;
  const out: { [id: string]: number } = {};
  for (let i = 0; i < CANONICAL_STAT_IDS.length; i++) {
    const id = CANONICAL_STAT_IDS[i];
    const base = numberOr(baseStats !== undefined ? baseStats[id] : undefined, 0);
    const growth = numberOr(automaticGrowth !== undefined ? automaticGrowth[id] : undefined, 0);
    const free = numberOr(freeStatAllocations[id], 0);
    out[id] = base + growth * growthLevels + free;
  }
  return out;
}

export function canonicalMaxHealth(vitality: number): number {
  return 30 + 10 * vitality;
}

export function canonicalMaxMana(intelligence: number, usesMana: boolean): number {
  if (!usesMana) {
    return 0;
  }
  return 20 + 4 * intelligence;
}

export function canonicalHotbarFromLive(hotbar: string[] | undefined): string[] {
  const assignments: string[] = [];
  if (hotbar === undefined) {
    return assignments;
  }
  for (let i = 0; i < hotbar.length; i++) {
    const id = hotbar[i];
    if (id.length === 0) {
      continue;
    }
    if (id === FRENZY_ABILITY_ID) {
      continue;
    }
    if (id.indexOf("test.ability.") === 0) {
      continue;
    }
    assignments.push(id);
    if (assignments.length >= CANONICAL_HOTBAR_SIZE) {
      break;
    }
  }
  return assignments;
}

export function clampCanonicalLevel(level: number): number {
  if (level < 1) {
    return 1;
  }
  if (level > CANONICAL_LEVEL_CAP) {
    return CANONICAL_LEVEL_CAP;
  }
  return Math.floor(level);
}

function numberOr(value: number | undefined, fallback: number): number {
  if (value === undefined || !isFinite(value)) {
    return fallback;
  }
  return value;
}
