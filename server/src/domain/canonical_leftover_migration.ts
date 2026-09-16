import {
  CANONICAL_HOTBAR_SIZE,
  CANONICAL_LEVEL_CAP,
  CANONICAL_PROGRESSION_SCHEMA_VERSION,
  canonicalHotbarFromLive,
  unspentBranchPoints,
  unspentClassPoints,
  unspentFreeStatPoints,
  usesCanonicalCreateState,
} from "./canonical_progression";
import { syncDerivedAbilityOwnership, usesCanonicalTalentRuntime } from "./canonical_talents";
import type { CharacterProgression } from "./progression";
import type { ProgressionCatalog } from "./stats";

export const LEFTOVER_NOTICE_FOUNDATION_RESET = "leftover_foundation_reset";
export const REASON_UNSUPPORTED_PROGRESSION_VERSION = "unsupported_future_version";
export const REASON_OK = "ok";

export type ProgressionCharacterKind = "test" | "production";

export interface CanonicalMigrationResult {
  progression: CharacterProgression;
  changed: boolean;
  ok: boolean;
  reason: string;
}

export interface ProgressionExportSnapshot {
  classId: string;
  branchId: string;
  level: number;
  xpIntoLevel: number;
  currentXp: number;
  lifetimeXp: number;
  freeStatAllocations: { [statId: string]: number };
  purchasedClassNodeIds: string[];
  purchasedBranchNodeRanks: { [nodeId: string]: number };
  autoAssignEnabled: boolean;
  hotbarAssignments: string[];
  leftoverMigrationNotice: string;
  progressionSchemaVersion: number;
}

export interface ProgressionValidationResult {
  ok: boolean;
  code: string;
  issues: string[];
}

export function classifyProgressionCharacter(classId: string): ProgressionCharacterKind {
  if (classId.indexOf("test.") === 0) {
    return "test";
  }
  return "production";
}

export function isProductionProgressionClass(catalog: ProgressionCatalog | undefined, classId: string): boolean {
  if (classifyProgressionCharacter(classId) === "test") {
    return false;
  }
  if (catalog === undefined) {
    return classId.indexOf("class.") === 0;
  }
  const classDef = catalog.classes[classId];
  return usesCanonicalCreateState(classDef !== undefined ? classDef.autoAttackId : undefined);
}

export function hasLeftoverFoundationAuthorities(
  progression: CharacterProgression,
  catalog: ProgressionCatalog | undefined,
  classId: string,
): boolean {
  if (!isProductionProgressionClass(catalog, classId)) {
    return false;
  }
  if (Object.keys(progression.allocatedAttributes).length > 0) {
    return true;
  }
  if (progression.unspentAttributePoints > 0 || progression.unspentSkillPoints > 0) {
    return true;
  }
  if (progression.hotbar !== undefined) {
    return true;
  }
  for (let i = 0; i < progression.unlockedAbilityIds.length; i++) {
    if (progression.unlockedAbilityIds[i].indexOf("test.ability.") === 0) {
      return true;
    }
  }
  if (progression.hotbarAssignments.length > CANONICAL_HOTBAR_SIZE) {
    return true;
  }
  return false;
}

export function applyLeftoverFoundationMigration(
  progression: CharacterProgression,
  classId: string,
  nowMs: number,
  catalog?: ProgressionCatalog,
): boolean {
  let changed = false;
  const production = isProductionProgressionClass(catalog, classId);
  const leftover = hasLeftoverFoundationAuthorities(progression, catalog, classId);
  const belowCurrent = progression.progressionSchemaVersion < CANONICAL_PROGRESSION_SCHEMA_VERSION;
  if (production && (leftover || belowCurrent)) {
    if (
      progression.hotbarAssignments.length === 0 &&
      progression.hotbar !== undefined &&
      progression.hotbar.length > 0
    ) {
      progression.hotbarAssignments = canonicalHotbarFromLive(progression.hotbar);
      changed = true;
    }
    if (Object.keys(progression.allocatedAttributes).length > 0) {
      progression.allocatedAttributes = {};
      changed = true;
    }
    if (progression.unspentAttributePoints !== 0) {
      progression.unspentAttributePoints = 0;
      changed = true;
    }
    if (progression.unspentSkillPoints !== 0) {
      progression.unspentSkillPoints = 0;
      changed = true;
    }
    if (progression.hotbar !== undefined) {
      progression.hotbar = undefined;
      changed = true;
    }
    if (catalog !== undefined && usesCanonicalTalentRuntime(catalog, classId)) {
      if (syncDerivedAbilityOwnership(progression, catalog, classId)) {
        changed = true;
      }
    }
    if (leftover && progression.leftoverMigrationNotice !== LEFTOVER_NOTICE_FOUNDATION_RESET) {
      progression.leftoverMigrationNotice = LEFTOVER_NOTICE_FOUNDATION_RESET;
      changed = true;
    }
  }
  if (belowCurrent) {
    progression.progressionSchemaVersion = CANONICAL_PROGRESSION_SCHEMA_VERSION;
    changed = true;
  }
  if (changed) {
    progression.updatedAt = nowMs;
    if (progression.createdAt === undefined || progression.createdAt === 0) {
      progression.createdAt = nowMs;
    }
  }
  return changed;
}

export function exportProgressionSnapshot(progression: CharacterProgression): ProgressionExportSnapshot {
  return {
    classId: progression.classId,
    branchId: progression.branchId,
    level: progression.level,
    xpIntoLevel: progression.xpIntoLevel,
    currentXp: progression.currentXp,
    lifetimeXp: progression.lifetimeXp,
    freeStatAllocations: copyAmounts(progression.freeStatAllocations),
    purchasedClassNodeIds: copyIds(progression.purchasedClassNodeIds),
    purchasedBranchNodeRanks: copyAmounts(progression.purchasedBranchNodeRanks),
    autoAssignEnabled: progression.autoAssignEnabled === true,
    hotbarAssignments: copyIds(progression.hotbarAssignments),
    leftoverMigrationNotice:
      progression.leftoverMigrationNotice !== undefined ? progression.leftoverMigrationNotice : "",
    progressionSchemaVersion: progression.progressionSchemaVersion,
  };
}

export function validateProgressionRecord(
  progression: CharacterProgression,
  classId: string,
  catalog?: ProgressionCatalog,
): ProgressionValidationResult {
  const issues: string[] = [];
  if (progression.progressionSchemaVersion > CANONICAL_PROGRESSION_SCHEMA_VERSION) {
    issues.push(REASON_UNSUPPORTED_PROGRESSION_VERSION);
  }
  if (progression.level < 1 || progression.level > CANONICAL_LEVEL_CAP) {
    issues.push("invalid_level");
  }
  if (progression.currentXp < 0 || progression.lifetimeXp < 0 || progression.xpIntoLevel < 0) {
    issues.push("invalid_xp");
  }
  if (progression.xpIntoLevel !== progression.currentXp) {
    issues.push("xp_into_level_drift");
  }
  if (unspentFreeStatPoints(progression.freeStatAllocations, progression.level) < 0) {
    issues.push("negative_free_points");
  }
  if (unspentClassPoints(progression.purchasedClassNodeIds, progression.level) < 0) {
    issues.push("negative_class_points");
  }
  if (unspentBranchPoints(progression.purchasedBranchNodeRanks, progression.level) < 0) {
    issues.push("negative_branch_points");
  }
  if (isProductionProgressionClass(catalog, classId)) {
    if (Object.keys(progression.allocatedAttributes).length > 0) {
      issues.push("leftover_allocated_attributes");
    }
    if (progression.hotbar !== undefined) {
      issues.push("leftover_live_hotbar");
    }
    if (progression.hotbarAssignments.length > CANONICAL_HOTBAR_SIZE) {
      issues.push("hotbar_overflow");
    }
    for (let i = 0; i < progression.unlockedAbilityIds.length; i++) {
      if (progression.unlockedAbilityIds[i].indexOf("test.ability.") === 0) {
        issues.push("leftover_test_unlock");
        break;
      }
    }
  }
  if (catalog !== undefined) {
    const classDef = catalog.classes[classId];
    if (classDef === undefined) {
      issues.push("unknown_class");
    } else if (progression.branchId.length > 0) {
      const owned = classDef.branchIds !== undefined ? classDef.branchIds : [];
      if (owned.indexOf(progression.branchId) < 0) {
        issues.push("invalid_branch");
      }
    }
    for (let n = 0; n < progression.purchasedClassNodeIds.length; n++) {
      if (catalog.talentNodes[progression.purchasedClassNodeIds[n]] === undefined) {
        issues.push("unknown_class_node");
        break;
      }
    }
    const branchIds = Object.keys(progression.purchasedBranchNodeRanks);
    for (let b = 0; b < branchIds.length; b++) {
      if (catalog.talentNodes[branchIds[b]] === undefined) {
        issues.push("unknown_branch_node");
        break;
      }
    }
  }
  return {
    ok: issues.length === 0,
    code: issues.length === 0 ? REASON_OK : issues[0],
    issues: issues,
  };
}

function copyAmounts(map: { [id: string]: number } | undefined): { [id: string]: number } {
  const out: { [id: string]: number } = {};
  const source = map !== undefined ? map : {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = source[keys[i]];
  }
  return out;
}

function copyIds(values: ReadonlyArray<string> | undefined): string[] {
  const list: string[] = [];
  if (values === undefined) {
    return list;
  }
  for (let i = 0; i < values.length; i++) {
    list.push(values[i]);
  }
  return list;
}
