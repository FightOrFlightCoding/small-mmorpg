import {
  PROGRESSION_SAVE_KEYS,
  attachEnvelope,
  envelopeFromRecord,
  optionalExtras,
} from "./save_schema";
import {
  cloneProgression,
  emptyProgression,
  type AllocateRecord,
  type CharacterProgression,
  type XpGrantRecord,
  type AbilityActionRecord,
} from "./progression";

export const PROGRESSION_COLLECTION = "player";
export const PROGRESSION_KEY = "progression";
export const PROGRESSION_PERMISSION_READ: 1 = 1;
export const PROGRESSION_PERMISSION_WRITE: 0 = 0;

export function storedProgressionWriteValue(progression: CharacterProgression): { [key: string]: unknown } {
  const xpByEventId: { [eventId: string]: { [key: string]: unknown } } = {};
  const xpKeys = Object.keys(progression.xpByEventId);
  for (let i = 0; i < xpKeys.length; i++) {
    const record = progression.xpByEventId[xpKeys[i]];
    xpByEventId[xpKeys[i]] = {
      amount: record.amount,
      reasonType: record.reasonType,
      reasonId: record.reasonId,
    };
  }
  const allocateByRequestId: { [requestId: string]: { [key: string]: unknown } } = {};
  const allocateKeys = Object.keys(progression.allocateByRequestId);
  for (let j = 0; j < allocateKeys.length; j++) {
    const record = progression.allocateByRequestId[allocateKeys[j]];
    allocateByRequestId[allocateKeys[j]] = {
      ok: record.ok,
      code: record.code,
      attributeId: record.attributeId,
      amount: record.amount,
    };
  }
  const gameplay: { [key: string]: unknown } = {
    level: progression.level,
    currentXp: progression.currentXp,
    lifetimeXp: progression.lifetimeXp,
    allocatedAttributes: progression.allocatedAttributes,
    unspentAttributePoints: progression.unspentAttributePoints,
    unspentSkillPoints: progression.unspentSkillPoints,
    unlockedAbilityIds: progression.unlockedAbilityIds,
    progressionSchemaVersion: progression.progressionSchemaVersion,
    xpByEventId: xpByEventId,
    allocateByRequestId: allocateByRequestId,
  };
  if (progression.hotbar !== undefined) {
    gameplay.hotbar = progression.hotbar;
  }
  if (progression.abilityRanks !== undefined) {
    gameplay.abilityRanks = progression.abilityRanks;
  }
  if (progression.assignHotbarByRequestId !== undefined) {
    gameplay.assignHotbarByRequestId = copyStoredAbilityActions(progression.assignHotbarByRequestId);
  }
  if (progression.unlockAbilityByRequestId !== undefined) {
    gameplay.unlockAbilityByRequestId = copyStoredAbilityActions(progression.unlockAbilityByRequestId);
  }
  if (progression.xpEventTicks !== undefined) {
    gameplay.xpEventTicks = progression.xpEventTicks;
  }
  if (progression.allocateRequestTicks !== undefined) {
    gameplay.allocateRequestTicks = progression.allocateRequestTicks;
  }
  if (progression.hotbarRequestTicks !== undefined) {
    gameplay.hotbarRequestTicks = progression.hotbarRequestTicks;
  }
  if (progression.unlockRequestTicks !== undefined) {
    gameplay.unlockRequestTicks = progression.unlockRequestTicks;
  }
  return attachEnvelope(gameplay, envelopeFromRecord(progression), progression.extras);
}

export function storedProgressionFromValue(value: unknown): CharacterProgression | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (typeof data.level !== "number" || typeof data.currentXp !== "number" || typeof data.lifetimeXp !== "number") {
    return null;
  }
  if (data.level < 1 || data.currentXp < 0 || data.lifetimeXp < 0) {
    return null;
  }
  const progression = emptyProgression();
  progression.level = data.level;
  progression.currentXp = data.currentXp;
  progression.lifetimeXp = data.lifetimeXp;
  progression.allocatedAttributes = parseNumberMap(data.allocatedAttributes);
  progression.unspentAttributePoints = nonNegativeNumber(data.unspentAttributePoints);
  progression.unspentSkillPoints = nonNegativeNumber(data.unspentSkillPoints);
  progression.unlockedAbilityIds = parseStringList(data.unlockedAbilityIds);
  progression.hotbar = parseStringList(data.hotbar);
  progression.abilityRanks = parseNumberMap(data.abilityRanks);
  progression.assignHotbarByRequestId = parseAbilityActionMap(data.assignHotbarByRequestId);
  progression.unlockAbilityByRequestId = parseAbilityActionMap(data.unlockAbilityByRequestId);
  progression.progressionSchemaVersion =
    typeof data.progressionSchemaVersion === "number" ? data.progressionSchemaVersion : 1;
  progression.xpByEventId = parseXpMap(data.xpByEventId);
  progression.allocateByRequestId = parseAllocateMap(data.allocateByRequestId);
  if (typeof data.schemaVersion === "number") {
    progression.schemaVersion = data.schemaVersion;
  }
  if (typeof data.createdAt === "number") {
    progression.createdAt = data.createdAt;
  }
  if (typeof data.updatedAt === "number") {
    progression.updatedAt = data.updatedAt;
  }
  progression.extras = optionalExtras(data, PROGRESSION_SAVE_KEYS);
  if (data.xpEventTicks !== null && typeof data.xpEventTicks === "object" && !Array.isArray(data.xpEventTicks)) {
    progression.xpEventTicks = parseTickMap(data.xpEventTicks as { [key: string]: unknown });
  }
  if (
    data.allocateRequestTicks !== null &&
    typeof data.allocateRequestTicks === "object" &&
    !Array.isArray(data.allocateRequestTicks)
  ) {
    progression.allocateRequestTicks = parseTickMap(data.allocateRequestTicks as { [key: string]: unknown });
  }
  if (
    data.unlockRequestTicks !== null &&
    typeof data.unlockRequestTicks === "object" &&
    !Array.isArray(data.unlockRequestTicks)
  ) {
    progression.unlockRequestTicks = parseTickMap(data.unlockRequestTicks as { [key: string]: unknown });
  }
  if (
    data.hotbarRequestTicks !== null &&
    typeof data.hotbarRequestTicks === "object" &&
    !Array.isArray(data.hotbarRequestTicks)
  ) {
    progression.hotbarRequestTicks = parseTickMap(data.hotbarRequestTicks as { [key: string]: unknown });
  }
  return cloneProgression(progression);
}

function parseNumberMap(value: unknown): { [id: string]: number } {
  const out: { [id: string]: number } = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return out;
  }
  const map = value as { [key: string]: unknown };
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const amount = map[keys[i]];
    if (typeof amount === "number" && isFinite(amount) && amount >= 0) {
      out[keys[i]] = amount;
    }
  }
  return out;
}

function parseStringList(value: unknown): string[] {
  const list: string[] = [];
  if (!Array.isArray(value)) {
    return list;
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] === "string") {
      list.push(value[i]);
    }
  }
  return list;
}

function parseXpMap(value: unknown): { [eventId: string]: XpGrantRecord } {
  const out: { [eventId: string]: XpGrantRecord } = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return out;
  }
  const map = value as { [key: string]: unknown };
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const row = map[keys[i]];
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const data = row as { [key: string]: unknown };
    if (typeof data.amount !== "number" || typeof data.reasonType !== "string" || typeof data.reasonId !== "string") {
      continue;
    }
    out[keys[i]] = {
      amount: data.amount,
      reasonType: data.reasonType,
      reasonId: data.reasonId,
    };
  }
  return out;
}

function parseAllocateMap(value: unknown): { [requestId: string]: AllocateRecord } {
  const out: { [requestId: string]: AllocateRecord } = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return out;
  }
  const map = value as { [key: string]: unknown };
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const row = map[keys[i]];
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const data = row as { [key: string]: unknown };
    if (typeof data.code !== "string" || typeof data.attributeId !== "string" || typeof data.amount !== "number") {
      continue;
    }
    out[keys[i]] = {
      ok: data.ok === true,
      code: data.code,
      attributeId: data.attributeId,
      amount: data.amount,
    };
  }
  return out;
}

function parseAbilityActionMap(value: unknown): { [requestId: string]: AbilityActionRecord } {
  const out: { [requestId: string]: AbilityActionRecord } = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return out;
  }
  const map = value as { [key: string]: unknown };
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const row = map[keys[i]];
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const data = row as { [key: string]: unknown };
    if (typeof data.code !== "string") {
      continue;
    }
    out[keys[i]] = { ok: data.ok === true, code: data.code };
  }
  return out;
}

function copyStoredAbilityActions(map: { [requestId: string]: AbilityActionRecord }): {
  [requestId: string]: { [key: string]: unknown };
} {
  const out: { [requestId: string]: { [key: string]: unknown } } = {};
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = { ok: map[keys[i]].ok, code: map[keys[i]].code };
  }
  return out;
}

function parseTickMap(map: { [key: string]: unknown }): { [id: string]: number } {
  const ticks: { [id: string]: number } = {};
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const value = map[keys[i]];
    if (typeof value === "number" && isFinite(value)) {
      ticks[keys[i]] = value;
    }
  }
  return ticks;
}

function nonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}
