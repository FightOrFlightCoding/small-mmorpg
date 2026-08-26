import {
  applyAutoAssignUnspent as spendCanonicalUnspent,
  applyCanonicalXpGrant,
  allocateFreeStat,
  allocateFreeStatBatch,
  pendingBranchSelection,
  selectCanonicalBranch,
  usesCanonicalLeveling,
  type ProgressionEvent,
} from "./canonical_leveling";
import {
  CANONICAL_AUTO_ASSIGN_DEFAULT,
  CANONICAL_PROGRESSION_SCHEMA_VERSION,
  CANONICAL_RESPEC_GOLD_PER_LEVEL,
  canonicalHotbarFromLive,
  canonicalStatTotals,
  clampCanonicalLevel,
  respecGoldCost,
  unspentBranchPoints,
  unspentClassPoints,
  unspentFreeStatPoints,
  usesCanonicalCreateState,
} from "./canonical_progression";
import { applyCanonicalRespec, type RespecSnapshot } from "./canonical_respec";
import { applyCanonicalTalentPurchase, type TalentPurchaseInput } from "./canonical_talents";
import { classUsesCanonicalStats } from "./canonical_stats";
import { cloneTickMap, dict } from "./maps";
import { cloneExtras, envelopeFromRecord } from "./save_schema";
import {
  baseAttributesFor,
  classProgressionFor,
  evaluateStats,
  identifiedModifiersFromEffectMap,
  isMaxLevel,
  levelCurveFor,
  xpRequiredForLevel,
  type ProgressionCatalog,
} from "./stats";

export type { ProgressionEvent } from "./canonical_leveling";
export { CANONICAL_RESPEC_GOLD_PER_LEVEL, respecGoldCost };
export const PROGRESSION_SCHEMA_VERSION = CANONICAL_PROGRESSION_SCHEMA_VERSION;
export const MAX_ALLOCATE_PER_REQUEST = 100;
export const MAX_ALLOCATE_BATCH_ENTRIES = 16;
export const RESPEC_GOLD_PER_LEVEL = CANONICAL_RESPEC_GOLD_PER_LEVEL;

export interface CharacterProgression {
  level: number;
  currentXp: number;
  lifetimeXp: number;
  allocatedAttributes: { [attributeId: string]: number };
  unspentAttributePoints: number;
  unspentSkillPoints: number;
  unlockedAbilityIds: string[];
  hotbar?: string[];
  abilityRanks?: { [abilityId: string]: number };
  assignHotbarByRequestId?: { [requestId: string]: AbilityActionRecord };
  unlockAbilityByRequestId?: { [requestId: string]: AbilityActionRecord };
  hotbarRequestTicks?: { [requestId: string]: number };
  unlockRequestTicks?: { [requestId: string]: number };
  progressionSchemaVersion: number;
  xpByEventId: { [eventId: string]: XpGrantRecord };
  allocateByRequestId: { [requestId: string]: AllocateRecord };
  xpEventTicks?: { [eventId: string]: number };
  allocateRequestTicks?: { [requestId: string]: number };
  selectBranchByRequestId?: { [requestId: string]: AbilityActionRecord };
  autoAssignByRequestId?: { [requestId: string]: AbilityActionRecord };
  respecByRequestId?: { [requestId: string]: AbilityActionRecord };
  purchaseTalentByRequestId?: { [requestId: string]: AbilityActionRecord };
  classId: string;
  branchId: string;
  xpIntoLevel: number;
  freeStatAllocations: { [statId: string]: number };
  purchasedClassNodeIds: string[];
  purchasedBranchNodeRanks: { [nodeId: string]: number };
  autoAssignEnabled: boolean;
  hotbarAssignments: string[];
  schemaVersion?: number;
  createdAt?: number;
  updatedAt?: number;
  extras?: { [key: string]: unknown };
}

export interface XpGrantRecord {
  amount: number;
  reasonType: string;
  reasonId: string;
  createdAt?: number;
}

export interface AllocateRecord {
  ok: boolean;
  code: string;
  attributeId: string;
  amount: number;
}

export interface AbilityActionRecord {
  ok: boolean;
  code: string;
}

export interface XpGrant {
  characterId: string;
  amount: number;
  reasonType: string;
  reasonId: string;
  eventId: string;
  createdAt?: number;
}

export interface XpGrantResult {
  progression: CharacterProgression;
  replay: boolean;
  changed: boolean;
  levelsGained: number;
  code: string;
  events: ProgressionEvent[];
}

export interface AllocateInput {
  requestId: string;
  attributeId: string;
  amount: number;
  classId: string;
  tick?: number;
}

export interface AllocateBatchInput {
  requestId: string;
  allocations: ReadonlyArray<{ statId: string; amount: number }>;
  classId: string;
  tick?: number;
}

export interface TrainerRespecInput {
  requestId: string;
  trainerId: string;
  characterId: string;
  classId: string;
  timestamp: number;
}

export interface AllocateResult {
  progression: CharacterProgression;
  replay: boolean;
  changed: boolean;
  ok: boolean;
  code: string;
}

export interface TrainerRespecResult extends AllocateResult {
  goldCost: number;
  snapshot: RespecSnapshot;
}

export function emptyProgression(): CharacterProgression {
  return {
    level: 1,
    currentXp: 0,
    lifetimeXp: 0,
    allocatedAttributes: {},
    unspentAttributePoints: 0,
    unspentSkillPoints: 0,
    unlockedAbilityIds: [],
    progressionSchemaVersion: PROGRESSION_SCHEMA_VERSION,
    xpByEventId: {},
    allocateByRequestId: {},
    classId: "",
    branchId: "",
    xpIntoLevel: 0,
    freeStatAllocations: {},
    purchasedClassNodeIds: [],
    purchasedBranchNodeRanks: {},
    autoAssignEnabled: CANONICAL_AUTO_ASSIGN_DEFAULT,
    hotbarAssignments: [],
  };
}

export function cloneProgression(progression: CharacterProgression | undefined): CharacterProgression {
  if (progression == null) {
    return emptyProgression();
  }
  const envelope = envelopeFromRecord(progression);
  return {
    level: progression.level,
    currentXp: progression.currentXp,
    lifetimeXp: progression.lifetimeXp,
    allocatedAttributes: copyNumberMap(progression.allocatedAttributes),
    unspentAttributePoints: progression.unspentAttributePoints,
    unspentSkillPoints: progression.unspentSkillPoints,
    unlockedAbilityIds: copyStringList(progression.unlockedAbilityIds),
    hotbar: copyHotbar(progression.hotbar),
    abilityRanks: copyNumberMap(progression.abilityRanks),
    assignHotbarByRequestId: copyAbilityActionMap(progression.assignHotbarByRequestId),
    unlockAbilityByRequestId: copyAbilityActionMap(progression.unlockAbilityByRequestId),
    hotbarRequestTicks: cloneTickMap(progression.hotbarRequestTicks),
    unlockRequestTicks: cloneTickMap(progression.unlockRequestTicks),
    progressionSchemaVersion:
      progression.progressionSchemaVersion !== undefined
        ? progression.progressionSchemaVersion
        : PROGRESSION_SCHEMA_VERSION,
    xpByEventId: copyXpMap(progression.xpByEventId),
    allocateByRequestId: copyAllocateMap(progression.allocateByRequestId),
    xpEventTicks: cloneTickMap(progression.xpEventTicks),
    allocateRequestTicks: cloneTickMap(progression.allocateRequestTicks),
    selectBranchByRequestId: copyAbilityActionMap(progression.selectBranchByRequestId),
    autoAssignByRequestId: copyAbilityActionMap(progression.autoAssignByRequestId),
    respecByRequestId: copyAbilityActionMap(progression.respecByRequestId),
    purchaseTalentByRequestId: copyAbilityActionMap(progression.purchaseTalentByRequestId),
    classId: progression.classId !== undefined ? progression.classId : "",
    branchId: progression.branchId !== undefined ? progression.branchId : "",
    xpIntoLevel: progression.xpIntoLevel !== undefined ? progression.xpIntoLevel : progression.currentXp,
    freeStatAllocations: copyNumberMap(progression.freeStatAllocations),
    purchasedClassNodeIds: copyStringList(progression.purchasedClassNodeIds),
    purchasedBranchNodeRanks: copyNumberMap(progression.purchasedBranchNodeRanks),
    autoAssignEnabled: progression.autoAssignEnabled === true,
    hotbarAssignments: copyStringList(progression.hotbarAssignments),
    schemaVersion: envelope.schemaVersion,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    extras: cloneExtras(progression.extras),
  };
}

export function applyQuestRewardProgression(
  progression: CharacterProgression,
  rewards: {
    attributePoints?: number;
    skillPoints?: number;
    abilityUnlockIds?: ReadonlyArray<string>;
  },
): CharacterProgression {
  const next = cloneProgression(progression);
  if (rewards.attributePoints !== undefined && rewards.attributePoints > 0) {
    next.unspentAttributePoints += rewards.attributePoints;
  }
  if (rewards.skillPoints !== undefined && rewards.skillPoints > 0) {
    next.unspentSkillPoints += rewards.skillPoints;
  }
  const unlocks = rewards.abilityUnlockIds !== undefined ? rewards.abilityUnlockIds : [];
  for (let i = 0; i < unlocks.length; i++) {
    if (next.unlockedAbilityIds.indexOf(unlocks[i]) === -1) {
      next.unlockedAbilityIds.push(unlocks[i]);
    }
  }
  return next;
}

export function initializeProgression(catalog: ProgressionCatalog, classId: string): CharacterProgression {
  const classDef = catalog.classes[classId];
  const progressionDef = classProgressionFor(catalog, classId);
  const next = emptyProgression();
  next.classId = classId;
  next.progressionSchemaVersion = PROGRESSION_SCHEMA_VERSION;
  next.unspentAttributePoints =
    progressionDef !== null ? progressionDef.attributePointRules.pointsAtCreate : 0;
  next.unspentSkillPoints = progressionDef !== null ? progressionDef.skillPointRules.pointsAtCreate : 0;
  next.autoAssignEnabled = CANONICAL_AUTO_ASSIGN_DEFAULT;
  next.xpIntoLevel = 0;
  next.hotbarAssignments = [];
  next.freeStatAllocations = {};
  next.purchasedClassNodeIds = [];
  next.purchasedBranchNodeRanks = {};
  next.branchId = "";
  if (classDef !== undefined && !usesCanonicalCreateState(classDef.autoAttackId)) {
    const startingAbilities: string[] = [];
    if (classDef.startingAbilities !== undefined) {
      for (let i = 0; i < classDef.startingAbilities.length; i++) {
        startingAbilities.push(classDef.startingAbilities[i]);
      }
    }
    next.unlockedAbilityIds = startingAbilities;
  }
  return next;
}

export function migrateToCanonicalProgression(
  existing: CharacterProgression | null,
  classId: string,
  nowMs: number,
  catalog?: ProgressionCatalog,
): { progression: CharacterProgression; changed: boolean } {
  if (existing === null) {
    const created = catalog !== undefined ? initializeProgression(catalog, classId) : emptyProgression();
    created.classId = classId;
    created.createdAt = nowMs;
    created.updatedAt = nowMs;
    created.progressionSchemaVersion = PROGRESSION_SCHEMA_VERSION;
    return { progression: created, changed: true };
  }
  const next = cloneProgression(existing);
  let changed = false;
  if (next.classId !== classId && classId.length > 0) {
    next.classId = classId;
    changed = true;
  }
  if (next.progressionSchemaVersion < PROGRESSION_SCHEMA_VERSION) {
    next.progressionSchemaVersion = PROGRESSION_SCHEMA_VERSION;
    next.level = clampCanonicalLevel(next.level);
    next.xpIntoLevel = next.currentXp;
    next.freeStatAllocations = {};
    next.purchasedClassNodeIds = [];
    next.purchasedBranchNodeRanks = {};
    next.branchId = "";
    next.autoAssignEnabled = CANONICAL_AUTO_ASSIGN_DEFAULT;
    next.hotbarAssignments = canonicalHotbarFromLive(next.hotbar);
    next.updatedAt = nowMs;
    if (next.createdAt === undefined || next.createdAt === 0) {
      next.createdAt = nowMs;
    }
    changed = true;
  } else if (next.xpIntoLevel !== next.currentXp) {
    next.xpIntoLevel = next.currentXp;
    changed = true;
  }
  return { progression: next, changed: changed };
}

export function grantXp(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
  grant: XpGrant,
  tick?: number,
): XpGrantResult {
  const current = cloneProgression(progression);
  const previous = current.xpByEventId[grant.eventId];
  if (previous !== undefined) {
    return emptyGrantResult(current, true, false, 0, "ok");
  }
  if (!isNonNegativeInteger(grant.amount)) {
    return emptyGrantResult(current, false, false, 0, "invalid_amount");
  }
  const createdAt = grant.createdAt !== undefined ? grant.createdAt : tick;
  current.xpByEventId[grant.eventId] = {
    amount: grant.amount,
    reasonType: grant.reasonType,
    reasonId: grant.reasonId,
    createdAt: createdAt,
  };
  stampXpTick(current, grant.eventId, tick);
  if (usesCanonicalLeveling(catalog, classId)) {
    return applyCanonicalXpGrant(current, catalog, classId, grant);
  }
  if (grant.amount === 0) {
    current.xpIntoLevel = current.currentXp;
    return emptyGrantResult(current, false, true, 0, "ok");
  }
  const curve = levelCurveFor(catalog, classId);
  current.lifetimeXp += grant.amount;
  if (curve === null || isMaxLevel(curve, current.level)) {
    current.currentXp = 0;
    current.xpIntoLevel = 0;
    return emptyGrantResult(current, false, true, 0, "ok");
  }
  current.currentXp += grant.amount;
  let levelsGained = 0;
  while (!isMaxLevel(curve, current.level)) {
    const required = xpRequiredForLevel(curve, current.level);
    if (required <= 0 || current.currentXp < required) {
      break;
    }
    current.currentXp -= required;
    current.level += 1;
    levelsGained += 1;
    const rewardIndex = current.level - 2;
    if (rewardIndex >= 0 && rewardIndex < curve.attributePointsPerLevel.length) {
      current.unspentAttributePoints += curve.attributePointsPerLevel[rewardIndex];
    }
    if (rewardIndex >= 0 && rewardIndex < curve.skillPointsPerLevel.length) {
      current.unspentSkillPoints += curve.skillPointsPerLevel[rewardIndex];
    }
    applyAutomaticUnlocks(current, curve, current.level);
    if (isMaxLevel(curve, current.level)) {
      current.currentXp = 0;
      break;
    }
  }
  current.xpIntoLevel = current.currentXp;
  return emptyGrantResult(current, false, true, levelsGained, "ok");
}

export function allocateAttributes(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  input: AllocateInput,
): AllocateResult {
  const current = cloneProgression(progression);
  const previous = current.allocateByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      progression: current,
      replay: true,
      changed: false,
      ok: previous.ok,
      code: previous.code,
    };
  }
  if (classUsesCanonicalStats(catalog.classes[input.classId])) {
    if (!isPositiveInteger(input.amount)) {
      return failAllocate(current, input, "invalid_amount");
    }
    const spent = allocateFreeStat(current, input.attributeId, input.amount);
    if (!spent.ok) {
      return failAllocate(current, input, spent.code);
    }
    current.allocateByRequestId[input.requestId] = {
      ok: true,
      code: "ok",
      attributeId: input.attributeId,
      amount: input.amount,
    };
    stampAllocateTick(current, input.requestId, input.tick);
    return {
      progression: current,
      replay: false,
      changed: true,
      ok: true,
      code: "ok",
    };
  }
  if (!isPositiveInteger(input.amount) || input.amount > MAX_ALLOCATE_PER_REQUEST) {
    return failAllocate(current, input, "invalid_amount");
  }
  if (catalog.attributes[input.attributeId] === undefined) {
    return failAllocate(current, input, "unknown_attribute");
  }
  const progressionDef = classProgressionFor(catalog, input.classId);
  if (progressionDef === null) {
    return failAllocate(current, input, "unknown_attribute");
  }
  if (progressionDef.allowedAttributeIds.length > 0 && progressionDef.allowedAttributeIds.indexOf(input.attributeId) === -1) {
    return failAllocate(current, input, "class_restricted");
  }
  if (input.amount > current.unspentAttributePoints) {
    return failAllocate(current, input, "insufficient_points");
  }
  const already = numberOrZero(current.allocatedAttributes[input.attributeId]);
  const nextAllocated = already + input.amount;
  if (nextAllocated < 0) {
    return failAllocate(current, input, "invalid_amount");
  }
  current.allocatedAttributes[input.attributeId] = nextAllocated;
  current.unspentAttributePoints -= input.amount;
  current.allocateByRequestId[input.requestId] = {
    ok: true,
    code: "ok",
    attributeId: input.attributeId,
    amount: input.amount,
  };
  stampAllocateTick(current, input.requestId, input.tick);
  return {
    progression: current,
    replay: false,
    changed: true,
    ok: true,
    code: "ok",
  };
}

export function allocateAttributesBatch(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  input: AllocateBatchInput,
): AllocateResult {
  const current = cloneProgression(progression);
  const previous = current.allocateByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      progression: current,
      replay: true,
      changed: false,
      ok: previous.ok,
      code: previous.code,
    };
  }
  const stub: AllocateInput = {
    requestId: input.requestId,
    attributeId: "batch",
    amount: 0,
    classId: input.classId,
    tick: input.tick,
  };
  if (!classUsesCanonicalStats(catalog.classes[input.classId])) {
    return failAllocate(current, stub, "unsupported_class");
  }
  if (input.allocations.length === 0 || input.allocations.length > MAX_ALLOCATE_BATCH_ENTRIES) {
    return failAllocate(current, stub, "invalid_amount");
  }
  const spent = allocateFreeStatBatch(current, input.allocations);
  if (!spent.ok) {
    return failAllocate(current, stub, spent.code);
  }
  let total = 0;
  for (let i = 0; i < input.allocations.length; i++) {
    total += input.allocations[i].amount;
  }
  current.allocateByRequestId[input.requestId] = {
    ok: true,
    code: "ok",
    attributeId: "batch",
    amount: total,
  };
  stampAllocateTick(current, input.requestId, input.tick);
  return {
    progression: current,
    replay: false,
    changed: true,
    ok: true,
    code: "ok",
  };
}

export function applyTrainerRespec(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  input: TrainerRespecInput,
): TrainerRespecResult {
  const current = cloneProgression(progression);
  const maps = ensureRequestMaps(current);
  const previous = maps.respecByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      progression: current,
      replay: true,
      changed: false,
      ok: previous.ok,
      code: previous.code,
      goldCost: previous.ok ? respecGoldCost(current.level) : 0,
      snapshot: {
        characterId: input.characterId,
        level: current.level,
        goldCost: respecGoldCost(current.level),
        previousBranch: current.branchId,
        previousAllocations: {},
        previousClassNodes: [],
        previousBranchRanks: {},
        requestId: input.requestId,
        trainerId: input.trainerId,
        timestamp: input.timestamp,
      },
    };
  }
  if (!classUsesCanonicalStats(catalog.classes[input.classId])) {
    maps.respecByRequestId[input.requestId] = { ok: false, code: "unsupported_class" };
    current.respecByRequestId = maps.respecByRequestId;
    return {
      progression: current,
      replay: false,
      changed: true,
      ok: false,
      code: "unsupported_class",
      goldCost: 0,
      snapshot: {
        characterId: input.characterId,
        level: current.level,
        goldCost: 0,
        previousBranch: current.branchId,
        previousAllocations: {},
        previousClassNodes: [],
        previousBranchRanks: {},
        requestId: input.requestId,
        trainerId: input.trainerId,
        timestamp: input.timestamp,
      },
    };
  }
  const applied = applyCanonicalRespec(
    current,
    catalog,
    input.classId,
    input.characterId,
    input.requestId,
    input.trainerId,
    input.timestamp,
  );
  maps.respecByRequestId[input.requestId] = { ok: true, code: "ok" };
  current.respecByRequestId = maps.respecByRequestId;
  return {
    progression: current,
    replay: false,
    changed: true,
    ok: true,
    code: "ok",
    goldCost: applied.goldCost,
    snapshot: applied.snapshot,
  };
}

export function publicProgression(
  catalog: ProgressionCatalog,
  classId: string,
  progression: CharacterProgression,
  derivedValues: { [statId: string]: number },
  events?: ReadonlyArray<ProgressionEvent>,
): { [key: string]: unknown } {
  const classDef = catalog.classes[classId];
  const curve = levelCurveFor(catalog, classId);
  const atMax = curve !== null ? isMaxLevel(curve, progression.level) : false;
  const xpToNext = curve !== null && !atMax ? xpRequiredForLevel(curve, progression.level) : 0;
  const canonical = classUsesCanonicalStats(classDef);
  const baseAttributes = canonical
    ? canonicalStatTotals(classDef !== undefined ? classDef.baseStats : undefined, classDef !== undefined ? classDef.automaticGrowth : undefined, {}, progression.level)
    : baseAttributesFor(catalog, classId, progression.level);
  const allocatedAttributes = canonical
    ? copyNumberMap(progression.freeStatAllocations)
    : copyNumberMap(progression.allocatedAttributes);
  const unspentAttributePoints = canonical
    ? unspentFreeStatPoints(progression.freeStatAllocations, progression.level)
    : progression.unspentAttributePoints;
  const payload: { [key: string]: unknown } = {
    classId: classId,
    classDisplayName: classDef !== undefined && classDef.displayName !== undefined ? classDef.displayName : classId,
    level: progression.level,
    currentXp: progression.currentXp,
    lifetimeXp: progression.lifetimeXp,
    xpToNext: xpToNext,
    atMaxLevel: atMax,
    baseAttributes: baseAttributes,
    allocatedAttributes: allocatedAttributes,
    derived: copyNumberMap(derivedValues),
    unspentAttributePoints: unspentAttributePoints,
    unspentSkillPoints: progression.unspentSkillPoints,
    unlockedAbilityIds: copyStringList(progression.unlockedAbilityIds),
    progressionSchemaVersion: progression.progressionSchemaVersion,
    branchId: progression.branchId,
    xpIntoLevel: progression.xpIntoLevel,
    freeStatAllocations: copyNumberMap(progression.freeStatAllocations),
    purchasedClassNodeIds: copyStringList(progression.purchasedClassNodeIds),
    purchasedBranchNodeRanks: copyNumberMap(progression.purchasedBranchNodeRanks),
    autoAssignEnabled: progression.autoAssignEnabled === true,
    hotbarAssignments: copyStringList(progression.hotbarAssignments),
    unspentClassPoints: unspentClassPoints(progression.purchasedClassNodeIds, progression.level),
    unspentBranchPoints: unspentBranchPoints(progression.purchasedBranchNodeRanks, progression.level),
    unspentFreeStatPoints: unspentFreeStatPoints(progression.freeStatAllocations, progression.level),
    pendingBranchSelection: pendingBranchSelection(progression.level, progression.branchId),
    canonicalDerived: copyNumberMap(derivedValues),
  };
  if (events !== undefined && events.length > 0) {
    payload.events = copyEvents(events);
  }
  return payload;
}

export interface BranchSelectInput {
  requestId: string;
  branchId: string;
}

export interface AutoAssignFlagInput {
  requestId: string;
  enabled: boolean;
}

export interface AutoAssignUnspentInput {
  requestId: string;
}

export interface ProgressionActionResult {
  progression: CharacterProgression;
  replay: boolean;
  changed: boolean;
  ok: boolean;
  code: string;
  events: ProgressionEvent[];
}

export function selectBranch(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
  input: BranchSelectInput,
): ProgressionActionResult {
  const current = cloneProgression(progression);
  const maps = ensureRequestMaps(current);
  const previous = maps.selectBranchByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      progression: current,
      replay: true,
      changed: false,
      ok: previous.ok,
      code: previous.code,
      events: [],
    };
  }
  const selected = selectCanonicalBranch(current, catalog, classId, input.branchId);
  maps.selectBranchByRequestId[input.requestId] = { ok: selected.ok, code: selected.code };
  current.selectBranchByRequestId = maps.selectBranchByRequestId;
  return {
    progression: current,
    replay: false,
    changed: true,
    ok: selected.ok,
    code: selected.code,
    events: selected.events,
  };
}

export interface TalentPurchaseActionInput extends TalentPurchaseInput {}

export function purchaseTalent(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
  input: TalentPurchaseActionInput,
): ProgressionActionResult {
  const current = cloneProgression(progression);
  const maps = ensureRequestMaps(current);
  const previous = maps.purchaseTalentByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      progression: current,
      replay: true,
      changed: false,
      ok: previous.ok,
      code: previous.code,
      events: [],
    };
  }
  const purchased = applyCanonicalTalentPurchase(current, catalog, classId, input);
  maps.purchaseTalentByRequestId[input.requestId] = { ok: purchased.ok, code: purchased.code };
  current.purchaseTalentByRequestId = maps.purchaseTalentByRequestId;
  const events: ProgressionEvent[] = [];
  for (let i = 0; i < purchased.events.length; i++) {
    const row = purchased.events[i];
    const event: ProgressionEvent = { type: row.type as ProgressionEvent["type"] };
    if (row.abilityId !== undefined) {
      event.abilityId = row.abilityId;
    }
    events.push(event);
  }
  return {
    progression: current,
    replay: false,
    changed: true,
    ok: purchased.ok,
    code: purchased.code,
    events: events,
  };
}

export function setAutoAssign(
  progression: CharacterProgression,
  input: AutoAssignFlagInput,
): ProgressionActionResult {
  const current = cloneProgression(progression);
  const maps = ensureRequestMaps(current);
  const previous = maps.autoAssignByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      progression: current,
      replay: true,
      changed: false,
      ok: previous.ok,
      code: previous.code,
      events: [],
    };
  }
  current.autoAssignEnabled = input.enabled === true;
  maps.autoAssignByRequestId[input.requestId] = { ok: true, code: "ok" };
  current.autoAssignByRequestId = maps.autoAssignByRequestId;
  return {
    progression: current,
    replay: false,
    changed: true,
    ok: true,
    code: "ok",
    events: [],
  };
}

export function autoAssignUnspentPoints(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
  input: AutoAssignUnspentInput,
): ProgressionActionResult {
  const current = cloneProgression(progression);
  const maps = ensureRequestMaps(current);
  const previous = maps.autoAssignByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      progression: current,
      replay: true,
      changed: false,
      ok: previous.ok,
      code: previous.code,
      events: [],
    };
  }
  const spent = spendCanonicalUnspent(current, catalog, classId);
  maps.autoAssignByRequestId[input.requestId] = { ok: true, code: "ok" };
  current.autoAssignByRequestId = maps.autoAssignByRequestId;
  current.freeStatAllocations = spent.progression.freeStatAllocations;
  return {
    progression: current,
    replay: false,
    changed: true,
    ok: true,
    code: "ok",
    events: [],
  };
}

export function evaluateProgressionStats(
  catalog: ProgressionCatalog,
  classId: string,
  progression: CharacterProgression,
  equipmentModifiers: { [channel: string]: number },
  effectModifiers: { [channel: string]: number },
  percentModifiers: { [channel: string]: number },
  multiplyModifiers: { [channel: string]: number },
) {
  return evaluateStats(catalog, {
    classId: classId,
    level: progression.level,
    allocatedAttributes: progression.allocatedAttributes,
    freeStatAllocations: progression.freeStatAllocations,
    equipmentModifiers: equipmentModifiers,
    effectModifiers: effectModifiers,
    percentModifiers: percentModifiers,
    multiplyModifiers: multiplyModifiers,
    identifiedModifiers: identifiedModifiersFromEffectMap(effectModifiers).concat(
      identifiedModifiersFromEffectMap(equipmentModifiers, "equipment"),
    ),
  });
}

function applyAutomaticUnlocks(
  progression: CharacterProgression,
  curve: { automaticUnlocks?: ReadonlyArray<{ level: number; abilityIds: ReadonlyArray<string> }> },
  level: number,
): void {
  if (curve.automaticUnlocks === undefined) {
    return;
  }
  for (let i = 0; i < curve.automaticUnlocks.length; i++) {
    const row = curve.automaticUnlocks[i];
    if (row.level !== level) {
      continue;
    }
    for (let a = 0; a < row.abilityIds.length; a++) {
      if (progression.unlockedAbilityIds.indexOf(row.abilityIds[a]) === -1) {
        progression.unlockedAbilityIds.push(row.abilityIds[a]);
      }
    }
  }
}

function failAllocate(current: CharacterProgression, input: AllocateInput, code: string): AllocateResult {
  current.allocateByRequestId[input.requestId] = {
    ok: false,
    code: code,
    attributeId: input.attributeId,
    amount: input.amount,
  };
  stampAllocateTick(current, input.requestId, input.tick);
  return {
    progression: current,
    replay: false,
    changed: true,
    ok: false,
    code: code,
  };
}

function stampXpTick(progression: CharacterProgression, eventId: string, tick: number | undefined): void {
  if (tick === undefined) {
    return;
  }
  const ticks: { [eventId: string]: number } = {};
  const source = dict(progression.xpEventTicks);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    ticks[keys[i]] = source[keys[i]];
  }
  ticks[eventId] = tick;
  progression.xpEventTicks = ticks;
}

function stampAllocateTick(progression: CharacterProgression, requestId: string, tick: number | undefined): void {
  if (tick === undefined) {
    return;
  }
  const ticks: { [requestId: string]: number } = {};
  const source = dict(progression.allocateRequestTicks);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    ticks[keys[i]] = source[keys[i]];
  }
  ticks[requestId] = tick;
  progression.allocateRequestTicks = ticks;
}

function copyNumberMap(map: { [id: string]: number } | undefined): { [id: string]: number } {
  const out: { [id: string]: number } = {};
  const source = dict(map);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const value = source[keys[i]];
    if (typeof value === "number" && isFinite(value) && value >= 0) {
      out[keys[i]] = value;
    }
  }
  return out;
}

function copyStringList(values: string[] | undefined): string[] {
  const list: string[] = [];
  if (values === undefined) {
    return list;
  }
  for (let i = 0; i < values.length; i++) {
    list.push(values[i]);
  }
  return list;
}

function copyXpMap(map: { [eventId: string]: XpGrantRecord } | undefined): { [eventId: string]: XpGrantRecord } {
  const out: { [eventId: string]: XpGrantRecord } = {};
  const source = dict(map);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const record = source[keys[i]];
    if (record == null) {
      continue;
    }
    out[keys[i]] = {
      amount: record.amount,
      reasonType: record.reasonType,
      reasonId: record.reasonId,
      createdAt: record.createdAt,
    };
  }
  return out;
}

function copyAllocateMap(map: { [requestId: string]: AllocateRecord } | undefined): {
  [requestId: string]: AllocateRecord;
} {
  const out: { [requestId: string]: AllocateRecord } = {};
  const source = dict(map);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const record = source[keys[i]];
    if (record == null) {
      continue;
    }
    out[keys[i]] = {
      ok: record.ok,
      code: record.code,
      attributeId: record.attributeId,
      amount: record.amount,
    };
  }
  return out;
}

function copyAbilityActionMap(map: { [requestId: string]: AbilityActionRecord } | undefined): {
  [requestId: string]: AbilityActionRecord;
} {
  const out: { [requestId: string]: AbilityActionRecord } = {};
  const source = dict(map);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const record = source[keys[i]];
    if (record == null) {
      continue;
    }
    out[keys[i]] = { ok: record.ok === true, code: record.code };
  }
  return out;
}

function copyHotbar(values: string[] | undefined): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }
  const list: string[] = [];
  for (let i = 0; i < values.length; i++) {
    list.push(values[i]);
  }
  return list;
}

function isNonNegativeInteger(value: number): boolean {
  return typeof value === "number" && isFinite(value) && value >= 0 && Math.floor(value) === value;
}

function isPositiveInteger(value: number): boolean {
  return typeof value === "number" && isFinite(value) && value >= 1 && Math.floor(value) === value;
}

function numberOrZero(value: number | undefined): number {
  if (value === undefined || !isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function emptyGrantResult(
  progression: CharacterProgression,
  replay: boolean,
  changed: boolean,
  levelsGained: number,
  code: string,
): XpGrantResult {
  return {
    progression: progression,
    replay: replay,
    changed: changed,
    levelsGained: levelsGained,
    code: code,
    events: [],
  };
}

function ensureRequestMaps(progression: CharacterProgression): {
  selectBranchByRequestId: { [requestId: string]: AbilityActionRecord };
  autoAssignByRequestId: { [requestId: string]: AbilityActionRecord };
  respecByRequestId: { [requestId: string]: AbilityActionRecord };
  purchaseTalentByRequestId: { [requestId: string]: AbilityActionRecord };
} {
  return {
    selectBranchByRequestId: copyAbilityActionMap(progression.selectBranchByRequestId),
    autoAssignByRequestId: copyAbilityActionMap(progression.autoAssignByRequestId),
    respecByRequestId: copyAbilityActionMap(progression.respecByRequestId),
    purchaseTalentByRequestId: copyAbilityActionMap(progression.purchaseTalentByRequestId),
  };
}

function copyEvents(events: ReadonlyArray<ProgressionEvent>): ProgressionEvent[] {
  const list: ProgressionEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const copy: ProgressionEvent = { type: event.type };
    if (event.level !== undefined) {
      copy.level = event.level;
    }
    if (event.amount !== undefined) {
      copy.amount = event.amount;
    }
    if (event.abilityId !== undefined) {
      copy.abilityId = event.abilityId;
    }
    if (event.statId !== undefined) {
      copy.statId = event.statId;
    }
    list.push(copy);
  }
  return list;
}
