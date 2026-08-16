import { storedCharacterFromValue, storedCharacterWriteValue } from "./character";
import { storedEquipmentFromValue, storedEquipmentWriteValue } from "./equipment_store";
import { storedInventoryFromValue, storedInventoryWriteValue } from "./inventory_store";
import { storedQuestFromValue, storedQuestWriteValue } from "./quest_store";
import {
  REASON_ALREADY_CURRENT,
  REASON_CORRUPTED_RECORD,
  REASON_CORRUPTED_REQUIRED_FIELDS,
  REASON_MIGRATED,
  REASON_MISSING,
  REASON_UNSUPPORTED_FUTURE_VERSION,
  SAVE_SCHEMA_LEGACY,
  SAVE_SCHEMA_VERSION,
  deepStableEqual,
  detectSaveVersion,
  migratedEnvelope,
  readEnvelope,
  type RecordKind,
  type SaveEnvelope,
} from "./save_schema";
import { defaultWalletRef, storedWalletRefFromValue, storedWalletRefWriteValue } from "./wallet_ref";

export interface Migration {
  id: string;
  kind: RecordKind;
  fromVersion: number;
  toVersion: number;
}

export interface MigrationStepResult {
  ok: boolean;
  reason: string;
  changed: boolean;
  fromVersion: number;
  toVersion: number;
  migrationId: string;
  value: { [key: string]: unknown } | null;
}

export interface RecordMigrationResult {
  ok: boolean;
  reason: string;
  changed: boolean;
  missing: boolean;
  kind: RecordKind;
  fromVersion: number;
  toVersion: number;
  migrationIds: string[];
  value: { [key: string]: unknown } | null;
}

export interface AccountSaveSnapshot {
  userId: string;
  character?: unknown;
  inventory?: unknown;
  equipment?: unknown;
  quests?: unknown;
  walletRef?: unknown;
  gold?: number;
  characterPresent?: boolean;
  inventoryPresent?: boolean;
  equipmentPresent?: boolean;
  questsPresent?: boolean;
  walletRefPresent?: boolean;
}

export interface AccountRecordResult {
  kind: RecordKind;
  result: RecordMigrationResult;
}

export interface AccountMigrationResult {
  ok: boolean;
  reason: string;
  userId: string;
  characterId: string;
  changed: boolean;
  gold: number;
  records: AccountRecordResult[];
}
export const MIGRATION_CHARACTER_V0_V1: Migration = {
  id: "mig.character.v0_to_v1",
  kind: "character",
  fromVersion: 0,
  toVersion: 1,
};
export const MIGRATION_INVENTORY_V0_V1: Migration = {
  id: "mig.inventory.v0_to_v1",
  kind: "inventory",
  fromVersion: 0,
  toVersion: 1,
};
export const MIGRATION_EQUIPMENT_V0_V1: Migration = {
  id: "mig.equipment.v0_to_v1",
  kind: "equipment",
  fromVersion: 0,
  toVersion: 1,
};
export const MIGRATION_QUESTS_V0_V1: Migration = {
  id: "mig.quests.v0_to_v1",
  kind: "quests",
  fromVersion: 0,
  toVersion: 1,
};
export const MIGRATION_WALLET_REF_V0_V1: Migration = {
  id: "mig.wallet_ref.v0_to_v1",
  kind: "wallet_ref",
  fromVersion: 0,
  toVersion: 1,
};

export const MIGRATION_REGISTRY: Migration[] = [
  MIGRATION_CHARACTER_V0_V1,
  MIGRATION_INVENTORY_V0_V1,
  MIGRATION_EQUIPMENT_V0_V1,
  MIGRATION_QUESTS_V0_V1,
  MIGRATION_WALLET_REF_V0_V1,
];

export function migrationsFor(kind: RecordKind): Migration[] {
  const found: Migration[] = [];
  for (let i = 0; i < MIGRATION_REGISTRY.length; i++) {
    if (MIGRATION_REGISTRY[i].kind === kind) {
      found.push(MIGRATION_REGISTRY[i]);
    }
  }
  return found;
}

export function migrateRecord(
  kind: RecordKind,
  raw: unknown,
  present: boolean,
): RecordMigrationResult {
  if (!present || raw === undefined) {
    return missingResult(kind);
  }
  const detected = detectSaveVersion(raw);
  if (!detected.ok) {
    return errorResult(kind, detected.reason, detected.version);
  }
  if (detected.version > SAVE_SCHEMA_VERSION) {
    return errorResult(kind, REASON_UNSUPPORTED_FUTURE_VERSION, detected.version);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return errorResult(kind, REASON_CORRUPTED_RECORD, detected.version);
  }
  let current = raw as { [key: string]: unknown };
  let fromVersion = detected.version;
  const migrationIds: string[] = [];
  const chain = migrationsFor(kind);
  for (let i = 0; i < chain.length; i++) {
    const migration = chain[i];
    if (fromVersion !== migration.fromVersion) {
      continue;
    }
    const step = applyMigration(migration, current);
    if (!step.ok || step.value === null) {
      return {
        ok: false,
        reason: step.reason,
        changed: false,
        missing: false,
        kind: kind,
        fromVersion: detected.version,
        toVersion: fromVersion,
        migrationIds: migrationIds,
        value: null,
      };
    }
    current = step.value;
    fromVersion = migration.toVersion;
    migrationIds.push(migration.id);
  }
  if (fromVersion !== SAVE_SCHEMA_VERSION) {
    return errorResult(kind, REASON_UNSUPPORTED_FUTURE_VERSION, fromVersion);
  }
  const normalized = normalizeCurrent(kind, current);
  if (!normalized.ok || normalized.value === null) {
    return errorResult(kind, normalized.reason, detected.version);
  }
  const changed = migrationIds.length > 0 || !deepStableEqual(raw, normalized.value);
  return {
    ok: true,
    reason: changed ? REASON_MIGRATED : REASON_ALREADY_CURRENT,
    changed: changed,
    missing: false,
    kind: kind,
    fromVersion: detected.version,
    toVersion: SAVE_SCHEMA_VERSION,
    migrationIds: migrationIds,
    value: normalized.value,
  };
}

export function migrateAccount(snapshot: AccountSaveSnapshot): AccountMigrationResult {
  const records: AccountRecordResult[] = [
    {
      kind: "character",
      result: migrateRecord("character", snapshot.character, snapshot.characterPresent !== false && snapshot.character !== undefined),
    },
    {
      kind: "inventory",
      result: migrateRecord("inventory", snapshot.inventory, snapshot.inventoryPresent === true || snapshot.inventory !== undefined),
    },
    {
      kind: "equipment",
      result: migrateRecord("equipment", snapshot.equipment, snapshot.equipmentPresent === true || snapshot.equipment !== undefined),
    },
    {
      kind: "quests",
      result: migrateRecord("quests", snapshot.quests, snapshot.questsPresent === true || snapshot.quests !== undefined),
    },
    {
      kind: "wallet_ref",
      result: migrateWalletRef(snapshot),
    },
  ];
  let ok = true;
  let changed = false;
  let reason = REASON_ALREADY_CURRENT;
  let characterId = "";
  for (let i = 0; i < records.length; i++) {
    const result = records[i].result;
    if (!result.ok) {
      ok = false;
      reason = result.reason;
      break;
    }
    if (result.changed) {
      changed = true;
      reason = REASON_MIGRATED;
    }
  }
  const characterValue = records[0].result.value;
  if (characterValue !== null && typeof characterValue.characterId === "string") {
    characterId = characterValue.characterId;
  }
  if (ok && records[0].result.missing) {
    ok = false;
    reason = REASON_MISSING;
  }
  return {
    ok: ok,
    reason: reason,
    userId: snapshot.userId,
    characterId: characterId,
    changed: changed,
    gold: typeof snapshot.gold === "number" && isFinite(snapshot.gold) ? snapshot.gold : 0,
    records: records,
  };
}

export function migrateWalletRef(snapshot: AccountSaveSnapshot): RecordMigrationResult {
  const present = snapshot.walletRefPresent === true || snapshot.walletRef !== undefined;
  if (!present) {
    const created = defaultWalletRef();
    const envelope = migratedEnvelope();
    created.schemaVersion = envelope.schemaVersion;
    created.createdAt = envelope.createdAt;
    created.updatedAt = envelope.updatedAt;
    return {
      ok: true,
      reason: REASON_MIGRATED,
      changed: true,
      missing: false,
      kind: "wallet_ref",
      fromVersion: SAVE_SCHEMA_LEGACY,
      toVersion: SAVE_SCHEMA_VERSION,
      migrationIds: [MIGRATION_WALLET_REF_V0_V1.id],
      value: storedWalletRefWriteValue(created),
    };
  }
  return migrateRecord("wallet_ref", snapshot.walletRef, true);
}

function missingResult(kind: RecordKind): RecordMigrationResult {
  return {
    ok: true,
    reason: REASON_MISSING,
    changed: false,
    missing: true,
    kind: kind,
    fromVersion: SAVE_SCHEMA_LEGACY,
    toVersion: SAVE_SCHEMA_LEGACY,
    migrationIds: [],
    value: null,
  };
}

function errorResult(kind: RecordKind, reason: string, fromVersion: number): RecordMigrationResult {
  return {
    ok: false,
    reason: reason,
    changed: false,
    missing: false,
    kind: kind,
    fromVersion: fromVersion,
    toVersion: fromVersion,
    migrationIds: [],
    value: null,
  };
}

function applyMigration(migration: Migration, input: { [key: string]: unknown }): MigrationStepResult {
  const envelope = migratedEnvelope();
  if (migration.kind === "character") {
    const parsed = storedCharacterFromValue(input, "");
    if (parsed === null) {
      return failStep(migration, REASON_CORRUPTED_REQUIRED_FIELDS);
    }
    return okStep(migration, storedCharacterWriteValue(stampEnvelope(parsed, envelope)));
  }
  if (migration.kind === "inventory") {
    const parsed = storedInventoryFromValue(input);
    if (parsed === null) {
      return failStep(migration, REASON_CORRUPTED_REQUIRED_FIELDS);
    }
    return okStep(migration, storedInventoryWriteValue(stampEnvelope(parsed, envelope)));
  }
  if (migration.kind === "equipment") {
    const parsed = storedEquipmentFromValue(input);
    if (parsed === null) {
      return failStep(migration, REASON_CORRUPTED_REQUIRED_FIELDS);
    }
    return okStep(migration, storedEquipmentWriteValue(stampEnvelope(parsed, envelope)));
  }
  if (migration.kind === "quests") {
    if (!isObject(input) || (Object.prototype.hasOwnProperty.call(input, "quests") && !Array.isArray(input.quests))) {
      return failStep(migration, REASON_CORRUPTED_REQUIRED_FIELDS);
    }
    const parsed = storedQuestFromValue(input);
    return okStep(migration, storedQuestWriteValue(stampEnvelope(parsed, envelope)));
  }
  const parsed = storedWalletRefFromValue(input);
  if (parsed === null) {
    return failStep(migration, REASON_CORRUPTED_REQUIRED_FIELDS);
  }
  return okStep(migration, storedWalletRefWriteValue(stampEnvelope(parsed, envelope)));
}

function normalizeCurrent(kind: RecordKind, value: { [key: string]: unknown }): {
  ok: boolean;
  reason: string;
  value: { [key: string]: unknown } | null;
} {
  const envelope = completeEnvelope(readEnvelope(value));
  if (kind === "character") {
    const parsed = storedCharacterFromValue(value, "");
    if (parsed === null) {
      return { ok: false, reason: REASON_CORRUPTED_REQUIRED_FIELDS, value: null };
    }
    return { ok: true, reason: REASON_ALREADY_CURRENT, value: storedCharacterWriteValue(stampEnvelope(parsed, envelope)) };
  }
  if (kind === "inventory") {
    const parsed = storedInventoryFromValue(value);
    if (parsed === null) {
      return { ok: false, reason: REASON_CORRUPTED_REQUIRED_FIELDS, value: null };
    }
    return { ok: true, reason: REASON_ALREADY_CURRENT, value: storedInventoryWriteValue(stampEnvelope(parsed, envelope)) };
  }
  if (kind === "equipment") {
    const parsed = storedEquipmentFromValue(value);
    if (parsed === null) {
      return { ok: false, reason: REASON_CORRUPTED_REQUIRED_FIELDS, value: null };
    }
    return { ok: true, reason: REASON_ALREADY_CURRENT, value: storedEquipmentWriteValue(stampEnvelope(parsed, envelope)) };
  }
  if (kind === "quests") {
    if (!isObject(value) || (Object.prototype.hasOwnProperty.call(value, "quests") && !Array.isArray(value.quests))) {
      return { ok: false, reason: REASON_CORRUPTED_REQUIRED_FIELDS, value: null };
    }
    const parsed = storedQuestFromValue(value);
    return { ok: true, reason: REASON_ALREADY_CURRENT, value: storedQuestWriteValue(stampEnvelope(parsed, envelope)) };
  }
  const parsed = storedWalletRefFromValue(value);
  if (parsed === null) {
    return { ok: false, reason: REASON_CORRUPTED_REQUIRED_FIELDS, value: null };
  }
  return { ok: true, reason: REASON_ALREADY_CURRENT, value: storedWalletRefWriteValue(stampEnvelope(parsed, envelope)) };
}

function stampEnvelope<T extends { schemaVersion?: number; createdAt?: number; updatedAt?: number }>(
  record: T,
  envelope: SaveEnvelope,
): T {
  record.schemaVersion = envelope.schemaVersion;
  record.createdAt = envelope.createdAt;
  record.updatedAt = envelope.updatedAt;
  return record;
}

function completeEnvelope(envelope: SaveEnvelope): SaveEnvelope {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: typeof envelope.createdAt === "number" ? envelope.createdAt : 0,
    updatedAt: typeof envelope.updatedAt === "number" ? envelope.updatedAt : 0,
  };
}

function okStep(migration: Migration, value: { [key: string]: unknown }): MigrationStepResult {
  return {
    ok: true,
    reason: REASON_MIGRATED,
    changed: true,
    fromVersion: migration.fromVersion,
    toVersion: migration.toVersion,
    migrationId: migration.id,
    value: value,
  };
}

function failStep(migration: Migration, reason: string): MigrationStepResult {
  return {
    ok: false,
    reason: reason,
    changed: false,
    fromVersion: migration.fromVersion,
    toVersion: migration.fromVersion,
    migrationId: migration.id,
    value: null,
  };
}

function isObject(value: unknown): value is { [key: string]: unknown } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function characterIdFromValue(value: { [key: string]: unknown } | null): string {
  if (value === null || typeof value.characterId !== "string") {
    return "";
  }
  return value.characterId;
}
