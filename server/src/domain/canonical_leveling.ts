import {
  CANONICAL_FREE_POINTS_PER_LEVEL,
  CANONICAL_LEVEL_CAP,
  CANONICAL_STAT_IDS,
  classPointsEarned,
  branchPointsEarned,
  unspentFreeStatPoints,
} from "./canonical_progression";
import type { CharacterProgression, XpGrant, XpGrantResult } from "./progression";
import { classUsesCanonicalStats } from "./canonical_stats";
import { syncDerivedAbilityOwnership } from "./canonical_talents";
import {
  isMaxLevel,
  levelCurveFor,
  xpRequiredForLevel,
  type ClassContent,
  type ProgressionCatalog,
} from "./stats";

export const CAP_OVERFLOW_POLICY = "lifetime_only";

export type ProgressionEventType =
  | "xp_gained"
  | "level_gained"
  | "free_points_gained"
  | "class_point_gained"
  | "branch_selection_available"
  | "branch_point_gained"
  | "basic_unlocked"
  | "signature_unlocked"
  | "capstone_unlocked"
  | "talent_active_unlocked"
  | "level_cap_reached";

export interface ProgressionEvent {
  type: ProgressionEventType;
  level?: number;
  amount?: number;
  abilityId?: string;
  statId?: string;
}

export interface CanonicalXpGrantResult extends XpGrantResult {
  events: ProgressionEvent[];
}

export function pendingBranchSelection(level: number, branchId: string): boolean {
  return level >= 5 && (branchId === undefined || branchId.length === 0);
}

export function spendAutoAssignPoints(
  freeStatAllocations: { [statId: string]: number },
  template: { [statId: string]: number },
  points: number,
): { allocations: { [statId: string]: number }; spent: number } {
  const allocations = copyAmounts(freeStatAllocations);
  let remaining = points > 0 && isFinite(points) ? Math.floor(points) : 0;
  let spent = 0;
  if (remaining <= 0) {
    return { allocations: allocations, spent: 0 };
  }
  while (remaining > 0) {
    let progressed = false;
    for (let i = 0; i < CANONICAL_STAT_IDS.length; i++) {
      const id = CANONICAL_STAT_IDS[i];
      const slice = numberOr(template[id], 0);
      if (slice <= 0) {
        continue;
      }
      const add = slice < remaining ? slice : remaining;
      allocations[id] = numberOr(allocations[id], 0) + add;
      remaining -= add;
      spent += add;
      progressed = true;
      if (remaining <= 0) {
        break;
      }
    }
    if (!progressed) {
      break;
    }
  }
  return { allocations: allocations, spent: spent };
}

export function applyCanonicalXpGrant(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
  grant: XpGrant,
): CanonicalXpGrantResult {
  const events: ProgressionEvent[] = [];
  const curve = levelCurveFor(catalog, classId);
  const classDef = catalog.classes[classId];
  if (grant.amount > 0) {
    events.push({ type: "xp_gained", amount: grant.amount });
  }
  progression.lifetimeXp += grant.amount;
  if (curve === null || isMaxLevel(curve, progression.level)) {
    progression.currentXp = 0;
    progression.xpIntoLevel = 0;
    return finish(progression, 0, events);
  }
  progression.currentXp += grant.amount;
  let levelsGained = 0;
  while (!isMaxLevel(curve, progression.level)) {
    const required = xpRequiredForLevel(curve, progression.level);
    if (required <= 0 || progression.currentXp < required) {
      break;
    }
    progression.currentXp -= required;
    progression.level += 1;
    levelsGained += 1;
    emitLevelGain(progression, catalog, classDef, events);
    if (isMaxLevel(curve, progression.level)) {
      progression.currentXp = 0;
      break;
    }
  }
  progression.xpIntoLevel = progression.currentXp;
  syncDerivedAbilityOwnership(progression, catalog, classId);
  return finish(progression, levelsGained, events);
}

export function applyAutoAssignUnspent(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
): { progression: CharacterProgression; spent: number } {
  const classDef = catalog.classes[classId];
  const unspent = unspentFreeStatPoints(progression.freeStatAllocations, progression.level);
  const result = spendAutoAssignPoints(
    progression.freeStatAllocations,
    autoAssignTemplate(classDef),
    unspent,
  );
  progression.freeStatAllocations = result.allocations;
  return { progression: progression, spent: result.spent };
}

export function selectCanonicalBranch(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
  branchId: string,
): { ok: boolean; code: string; events: ProgressionEvent[] } {
  const events: ProgressionEvent[] = [];
  if (progression.level < 5) {
    return { ok: false, code: "branch_locked", events: events };
  }
  if (progression.branchId.length > 0) {
    return { ok: false, code: "branch_already_selected", events: events };
  }
  const classDef = catalog.classes[classId];
  if (!classOwnsBranch(classDef, branchId)) {
    return { ok: false, code: "invalid_branch", events: events };
  }
  const branch = catalog.branches[branchId];
  if (branch === undefined || branch.classId !== classId) {
    return { ok: false, code: "invalid_branch", events: events };
  }
  progression.branchId = branchId;
  grantMilestoneAbilities(progression, catalog, classDef, events);
  syncDerivedAbilityOwnership(progression, catalog, classId);
  return { ok: true, code: "ok", events: events };
}

export function allocateFreeStat(
  progression: CharacterProgression,
  attributeId: string,
  amount: number,
): { ok: boolean; code: string } {
  if (!isCanonicalStatId(attributeId)) {
    return { ok: false, code: "unknown_attribute" };
  }
  if (!(amount > 0) || amount !== Math.floor(amount) || !isFinite(amount)) {
    return { ok: false, code: "invalid_amount" };
  }
  const unspent = unspentFreeStatPoints(progression.freeStatAllocations, progression.level);
  if (amount > unspent) {
    return { ok: false, code: "insufficient_points" };
  }
  progression.freeStatAllocations[attributeId] = numberOr(progression.freeStatAllocations[attributeId], 0) + amount;
  return { ok: true, code: "ok" };
}

export function allocateFreeStatBatch(
  progression: CharacterProgression,
  entries: ReadonlyArray<{ statId: string; amount: number }>,
): { ok: boolean; code: string } {
  if (entries.length === 0) {
    return { ok: false, code: "invalid_amount" };
  }
  const merged: { [statId: string]: number } = {};
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const statId = entries[i].statId;
    const amount = entries[i].amount;
    if (!isCanonicalStatId(statId)) {
      return { ok: false, code: "unknown_attribute" };
    }
    if (!(amount > 0) || amount !== Math.floor(amount) || !isFinite(amount)) {
      return { ok: false, code: "invalid_amount" };
    }
    merged[statId] = numberOr(merged[statId], 0) + amount;
    total += amount;
  }
  const unspent = unspentFreeStatPoints(progression.freeStatAllocations, progression.level);
  if (total > unspent) {
    return { ok: false, code: "insufficient_points" };
  }
  const ids = Object.keys(merged);
  for (let i = 0; i < ids.length; i++) {
    const statId = ids[i];
    progression.freeStatAllocations[statId] = numberOr(progression.freeStatAllocations[statId], 0) + merged[statId];
  }
  return { ok: true, code: "ok" };
}

function emitLevelGain(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classDef: ClassContent | undefined,
  events: ProgressionEvent[],
): void {
  const level = progression.level;
  events.push({ type: "level_gained", level: level });
  events.push({ type: "free_points_gained", level: level, amount: CANONICAL_FREE_POINTS_PER_LEVEL });
  if (progression.autoAssignEnabled) {
    const spent = spendAutoAssignPoints(
      progression.freeStatAllocations,
      autoAssignTemplate(classDef),
      CANONICAL_FREE_POINTS_PER_LEVEL,
    );
    progression.freeStatAllocations = spent.allocations;
  }
  if (level === 2) {
    grantMilestoneAbilities(progression, catalog, classDef, events);
  }
  if (classPointsEarned(level) > classPointsEarned(level - 1)) {
    events.push({ type: "class_point_gained", level: level, amount: 1 });
  }
  if (level === 5 && pendingBranchSelection(level, progression.branchId)) {
    events.push({ type: "branch_selection_available", level: level });
  }
  if (branchPointsEarned(level) > branchPointsEarned(level - 1)) {
    events.push({ type: "branch_point_gained", level: level, amount: 1 });
  }
  if (level >= 5) {
    grantMilestoneAbilities(progression, catalog, classDef, events);
  }
  if (level === CANONICAL_LEVEL_CAP) {
    events.push({ type: "level_cap_reached", level: level });
  }
}

function grantMilestoneAbilities(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classDef: ClassContent | undefined,
  events: ProgressionEvent[],
): void {
  if (classDef === undefined) {
    return;
  }
  if (progression.level >= 2 && classDef.basicAbilityId !== undefined && classDef.basicAbilityId.length > 0) {
    if (unlockAbility(progression, classDef.basicAbilityId)) {
      events.push({ type: "basic_unlocked", abilityId: classDef.basicAbilityId, level: 2 });
    }
  }
  if (progression.branchId.length === 0 || progression.level < 5) {
    return;
  }
  const branch = catalog.branches[progression.branchId];
  if (branch === undefined) {
    return;
  }
  if (progression.level >= 5 && branch.signatureAbilityId.length > 0) {
    if (unlockAbility(progression, branch.signatureAbilityId)) {
      events.push({ type: "signature_unlocked", abilityId: branch.signatureAbilityId, level: 5 });
    }
  }
  if (progression.level >= CANONICAL_LEVEL_CAP && branch.capstoneAbilityId.length > 0) {
    if (unlockAbility(progression, branch.capstoneAbilityId)) {
      events.push({ type: "capstone_unlocked", abilityId: branch.capstoneAbilityId, level: CANONICAL_LEVEL_CAP });
    }
  }
}

function unlockAbility(progression: CharacterProgression, abilityId: string): boolean {
  if (abilityId.length === 0) {
    return false;
  }
  if (progression.unlockedAbilityIds.indexOf(abilityId) !== -1) {
    return false;
  }
  progression.unlockedAbilityIds.push(abilityId);
  return true;
}

function autoAssignTemplate(classDef: ClassContent | undefined): { [statId: string]: number } {
  if (classDef === undefined || classDef.autoAssignTemplate === undefined) {
    return {};
  }
  return copyAmounts(classDef.autoAssignTemplate.amounts);
}

function classOwnsBranch(classDef: ClassContent | undefined, branchId: string): boolean {
  if (classDef === undefined || classDef.branchIds === undefined) {
    return false;
  }
  return classDef.branchIds.indexOf(branchId) >= 0;
}

function finish(progression: CharacterProgression, levelsGained: number, events: ProgressionEvent[]): CanonicalXpGrantResult {
  return {
    progression: progression,
    replay: false,
    changed: true,
    levelsGained: levelsGained,
    code: "ok",
    events: events,
  };
}

function copyAmounts(source: { [id: string]: number } | undefined): { [id: string]: number } {
  const out: { [id: string]: number } = {};
  if (source === undefined) {
    return out;
  }
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const value = source[keys[i]];
    if (typeof value === "number" && isFinite(value) && value > 0) {
      out[keys[i]] = value;
    }
  }
  return out;
}

function numberOr(value: number | undefined, fallback: number): number {
  if (value === undefined || !isFinite(value)) {
    return fallback;
  }
  return value;
}

export function usesCanonicalLeveling(catalog: ProgressionCatalog, classId: string): boolean {
  return classUsesCanonicalStats(catalog.classes[classId]);
}

function isCanonicalStatId(id: string): boolean {
  for (let i = 0; i < CANONICAL_STAT_IDS.length; i++) {
    if (CANONICAL_STAT_IDS[i] === id) {
      return true;
    }
  }
  return false;
}
