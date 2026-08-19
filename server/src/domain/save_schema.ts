export const SAVE_SCHEMA_VERSION = 1;
export const SAVE_SCHEMA_LEGACY = 0;

export const REASON_OK = "ok";
export const REASON_ALREADY_CURRENT = "already_current";
export const REASON_MIGRATED = "migrated";
export const REASON_MISSING = "missing";
export const REASON_MISSING_VERSION = "missing_version";
export const REASON_UNSUPPORTED_FUTURE_VERSION = "unsupported_future_version";
export const REASON_CORRUPTED_RECORD = "corrupted_record";
export const REASON_CORRUPTED_REQUIRED_FIELDS = "corrupted_required_fields";
export const REASON_CORRUPTED_SCHEMA_VERSION = "corrupted_schema_version";

export type RecordKind = "character" | "inventory" | "equipment" | "quests" | "wallet_ref" | "progression";

export interface SaveEnvelope {
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

export const ENVELOPE_KEYS = ["schemaVersion", "createdAt", "updatedAt"];

export const CHARACTER_SAVE_KEYS = [
  "schemaVersion",
  "createdAt",
  "updatedAt",
  "characterId",
  "accountUserId",
  "name",
  "canonicalName",
  "classId",
  "contentId",
  "zoneId",
  "position",
  "lastPlayedAt",
  "deletedAt",
  "bindX",
  "bindY",
  "bindZoneId",
  "innByRequestId",
];
export const INVENTORY_SAVE_KEYS = [
  "schemaVersion",
  "createdAt",
  "updatedAt",
  "capacity",
  "items",
  "pickupByRequestId",
  "pickupRequestTicks",
  "mutationByRequestId",
  "mutationRequestTicks",
];
export const EQUIPMENT_SAVE_KEYS = [
  "schemaVersion",
  "createdAt",
  "updatedAt",
  "slots",
  "equipByRequestId",
  "equipRequestTicks",
];
export const QUEST_SAVE_KEYS = [
  "schemaVersion",
  "createdAt",
  "updatedAt",
  "quests",
  "acceptByRequestId",
  "turnInByRequestId",
  "acceptRequestTicks",
  "turnInRequestTicks",
];
export const WALLET_REF_SAVE_KEYS = ["schemaVersion", "createdAt", "updatedAt", "currencies"];
export const PROGRESSION_SAVE_KEYS = [
  "schemaVersion",
  "createdAt",
  "updatedAt",
  "level",
  "currentXp",
  "lifetimeXp",
  "allocatedAttributes",
  "unspentAttributePoints",
  "unspentSkillPoints",
  "unlockedAbilityIds",
  "hotbar",
  "abilityRanks",
  "assignHotbarByRequestId",
  "unlockAbilityByRequestId",
  "hotbarRequestTicks",
  "unlockRequestTicks",
  "progressionSchemaVersion",
  "xpByEventId",
  "allocateByRequestId",
  "xpEventTicks",
  "allocateRequestTicks",
];

export interface VersionDetection {
  ok: boolean;
  version: number;
  reason: string;
}

export function isSaveVersionNumber(value: unknown): value is number {
  return typeof value === "number" && isFinite(value) && value >= 0 && Math.floor(value) === value;
}

export function detectSaveVersion(value: unknown): VersionDetection {
  if (value === null || value === undefined) {
    return { ok: true, version: SAVE_SCHEMA_LEGACY, reason: REASON_MISSING };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, version: -1, reason: REASON_CORRUPTED_RECORD };
  }
  const data = value as { [key: string]: unknown };
  if (!Object.prototype.hasOwnProperty.call(data, "schemaVersion") || data.schemaVersion === null || data.schemaVersion === undefined) {
    return { ok: true, version: SAVE_SCHEMA_LEGACY, reason: REASON_MISSING_VERSION };
  }
  const raw = data.schemaVersion;
  if (!isSaveVersionNumber(raw)) {
    return { ok: false, version: -1, reason: REASON_CORRUPTED_SCHEMA_VERSION };
  }
  return { ok: true, version: raw, reason: REASON_OK };
}

export function readEnvelope(value: { [key: string]: unknown }): SaveEnvelope {
  const version = typeof value.schemaVersion === "number" ? value.schemaVersion : SAVE_SCHEMA_LEGACY;
  const createdAt = typeof value.createdAt === "number" && isFinite(value.createdAt) ? value.createdAt : 0;
  const updatedAt = typeof value.updatedAt === "number" && isFinite(value.updatedAt) ? value.updatedAt : createdAt;
  return {
    schemaVersion: version,
    createdAt: createdAt,
    updatedAt: updatedAt,
  };
}

export function currentEnvelope(nowMs: number, previous?: SaveEnvelope): SaveEnvelope {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: previous !== undefined ? previous.createdAt : nowMs,
    updatedAt: nowMs,
  };
}

export function migratedEnvelope(): SaveEnvelope {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function envelopeFromRecord(record: {
  schemaVersion?: number | null;
  createdAt?: number | null;
  updatedAt?: number | null;
}): SaveEnvelope {
  return {
    schemaVersion: isSaveVersionNumber(record.schemaVersion) ? record.schemaVersion : SAVE_SCHEMA_VERSION,
    createdAt: typeof record.createdAt === "number" && isFinite(record.createdAt) ? record.createdAt : 0,
    updatedAt: typeof record.updatedAt === "number" && isFinite(record.updatedAt) ? record.updatedAt : 0,
  };
}

export function optionalExtras(
  value: { [key: string]: unknown },
  knownKeys: string[],
): { [key: string]: unknown } | undefined {
  const extras = pickExtras(value, knownKeys);
  return Object.keys(extras).length > 0 ? extras : undefined;
}

export function cloneExtras(extras: { [key: string]: unknown } | null | undefined): { [key: string]: unknown } | undefined {
  if (extras === undefined || extras === null || typeof extras !== "object" || Array.isArray(extras)) {
    return undefined;
  }
  const copy: { [key: string]: unknown } = {};
  const keys = Object.keys(extras);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = extras[keys[i]];
  }
  return copy;
}

export function pickExtras(value: { [key: string]: unknown }, knownKeys: string[]): { [key: string]: unknown } {
  const extras: { [key: string]: unknown } = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (knownKeys.indexOf(key) !== -1) {
      continue;
    }
    extras[key] = value[key];
  }
  return extras;
}

export function mergeExtras(
  gameplay: { [key: string]: unknown },
  extras: { [key: string]: unknown } | null | undefined,
): { [key: string]: unknown } {
  const out: { [key: string]: unknown } = {};
  if (extras !== undefined && extras !== null && typeof extras === "object" && !Array.isArray(extras)) {
    const extraKeys = Object.keys(extras);
    for (let i = 0; i < extraKeys.length; i++) {
      const key = extraKeys[i];
      if (ENVELOPE_KEYS.indexOf(key) !== -1) {
        continue;
      }
      out[key] = extras[key];
    }
  }
  const keys = Object.keys(gameplay);
  for (let j = 0; j < keys.length; j++) {
    out[keys[j]] = gameplay[keys[j]];
  }
  return out;
}

export function attachEnvelope(
  gameplay: { [key: string]: unknown },
  envelope: SaveEnvelope,
  extras?: { [key: string]: unknown },
): { [key: string]: unknown } {
  const merged = mergeExtras(gameplay, extras);
  merged.schemaVersion = envelope.schemaVersion;
  merged.createdAt = envelope.createdAt;
  merged.updatedAt = envelope.updatedAt;
  return merged;
}

export function stripEnvelope(value: { [key: string]: unknown }): { [key: string]: unknown } {
  const out: { [key: string]: unknown } = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (ENVELOPE_KEYS.indexOf(key) !== -1) {
      continue;
    }
    out[key] = value[key];
  }
  return out;
}

export function envelopesEqual(left: SaveEnvelope, right: SaveEnvelope): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

export function deepStableEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalizeUnknown(left)) === JSON.stringify(canonicalizeUnknown(right));
}

export function publicSaveRejectCode(reason: string): string {
  if (
    reason === REASON_UNSUPPORTED_FUTURE_VERSION ||
    reason === REASON_CORRUPTED_RECORD ||
    reason === REASON_CORRUPTED_REQUIRED_FIELDS ||
    reason === REASON_CORRUPTED_SCHEMA_VERSION
  ) {
    return "unsupported_save_version";
  }
  return reason;
}

function canonicalizeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      copy.push(canonicalizeUnknown(value[i]));
    }
    return copy;
  }
  if (value !== null && typeof value === "object") {
    const input = value as { [key: string]: unknown };
    const output: { [key: string]: unknown } = {};
    const keys = Object.keys(input).sort();
    for (let i = 0; i < keys.length; i++) {
      output[keys[i]] = canonicalizeUnknown(input[keys[i]]);
    }
    return output;
  }
  return value;
}
