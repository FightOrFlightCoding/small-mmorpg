import { cloneTickMap, dict } from "./maps";
import { cloneExtras, envelopeFromRecord } from "./save_schema";
import {
  baseAttributesFor,
  classProgressionFor,
  evaluateStats,
  isMaxLevel,
  levelCurveFor,
  xpRequiredForLevel,
  type ProgressionCatalog,
} from "./stats";

export const PROGRESSION_SCHEMA_VERSION = 1;
export const MAX_ALLOCATE_PER_REQUEST = 100;

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
  schemaVersion?: number;
  createdAt?: number;
  updatedAt?: number;
  extras?: { [key: string]: unknown };
}

export interface XpGrantRecord {
  amount: number;
  reasonType: string;
  reasonId: string;
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
}

export interface XpGrantResult {
  progression: CharacterProgression;
  replay: boolean;
  changed: boolean;
  levelsGained: number;
  code: string;
}

export interface AllocateInput {
  requestId: string;
  attributeId: string;
  amount: number;
  classId: string;
  tick?: number;
}

export interface AllocateResult {
  progression: CharacterProgression;
  replay: boolean;
  changed: boolean;
  ok: boolean;
  code: string;
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
    schemaVersion: envelope.schemaVersion,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    extras: cloneExtras(progression.extras),
  };
}

export function initializeProgression(catalog: ProgressionCatalog, classId: string): CharacterProgression {
  const classDef = catalog.classes[classId];
  const progressionDef = classProgressionFor(catalog, classId);
  const startingAbilities: string[] = [];
  if (classDef !== undefined && classDef.startingAbilities !== undefined) {
    for (let i = 0; i < classDef.startingAbilities.length; i++) {
      startingAbilities.push(classDef.startingAbilities[i]);
    }
  }
  const next = emptyProgression();
  next.unspentAttributePoints =
    progressionDef !== null ? progressionDef.attributePointRules.pointsAtCreate : 0;
  next.unspentSkillPoints = progressionDef !== null ? progressionDef.skillPointRules.pointsAtCreate : 0;
  next.unlockedAbilityIds = startingAbilities;
  return next;
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
    return {
      progression: current,
      replay: true,
      changed: false,
      levelsGained: 0,
      code: "ok",
    };
  }
  if (!isNonNegativeInteger(grant.amount)) {
    return {
      progression: current,
      replay: false,
      changed: false,
      levelsGained: 0,
      code: "invalid_amount",
    };
  }
  current.xpByEventId[grant.eventId] = {
    amount: grant.amount,
    reasonType: grant.reasonType,
    reasonId: grant.reasonId,
  };
  stampXpTick(current, grant.eventId, tick);
  if (grant.amount === 0) {
    return {
      progression: current,
      replay: false,
      changed: true,
      levelsGained: 0,
      code: "ok",
    };
  }
  const curve = levelCurveFor(catalog, classId);
  current.lifetimeXp += grant.amount;
  if (curve === null || isMaxLevel(curve, current.level)) {
    current.currentXp = 0;
    return {
      progression: current,
      replay: false,
      changed: true,
      levelsGained: 0,
      code: "ok",
    };
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
  return {
    progression: current,
    replay: false,
    changed: true,
    levelsGained: levelsGained,
    code: "ok",
  };
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

export function publicProgression(
  catalog: ProgressionCatalog,
  classId: string,
  progression: CharacterProgression,
  derivedValues: { [statId: string]: number },
): { [key: string]: unknown } {
  const classDef = catalog.classes[classId];
  const curve = levelCurveFor(catalog, classId);
  const atMax = curve !== null ? isMaxLevel(curve, progression.level) : false;
  const xpToNext = curve !== null && !atMax ? xpRequiredForLevel(curve, progression.level) : 0;
  return {
    classId: classId,
    classDisplayName: classDef !== undefined && classDef.displayName !== undefined ? classDef.displayName : classId,
    level: progression.level,
    currentXp: progression.currentXp,
    lifetimeXp: progression.lifetimeXp,
    xpToNext: xpToNext,
    atMaxLevel: atMax,
    baseAttributes: baseAttributesFor(catalog, classId, progression.level),
    allocatedAttributes: copyNumberMap(progression.allocatedAttributes),
    derived: copyNumberMap(derivedValues),
    unspentAttributePoints: progression.unspentAttributePoints,
    unspentSkillPoints: progression.unspentSkillPoints,
    unlockedAbilityIds: copyStringList(progression.unlockedAbilityIds),
    progressionSchemaVersion: progression.progressionSchemaVersion,
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
    equipmentModifiers: equipmentModifiers,
    effectModifiers: effectModifiers,
    percentModifiers: percentModifiers,
    multiplyModifiers: multiplyModifiers,
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
