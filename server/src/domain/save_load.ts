import { storedCharacterFromValue, type StoredCharacter } from "./character";
import { storedEquipmentFromValue } from "./equipment_store";
import type { PlayerEquipment } from "./equipment";
import { storedInventoryFromValue } from "./inventory_store";
import type { PlayerInventory } from "./inventory";
import { migrateRecord, type RecordMigrationResult } from "./migration";
import { storedQuestFromValue } from "./quest_store";
import type { QuestLog } from "./quest";
import { readEnvelope } from "./save_schema";
import { storedProgressionFromValue } from "./progression_store";
import type { CharacterProgression } from "./progression";
import { storedWalletRefFromValue, type WalletRef } from "./wallet_ref";

export interface CanonicalLoad<T> {
  ok: boolean;
  reason: string;
  missing: boolean;
  persist: boolean;
  value: T | null;
  raw: { [key: string]: unknown } | null;
}

export function loadCanonicalCharacter(raw: unknown, present: boolean, storageVersion: string): CanonicalLoad<StoredCharacter> {
  const migrated = migrateRecord("character", raw, present);
  if (!migrated.ok) {
    return fail(migrated);
  }
  if (migrated.missing || migrated.value === null) {
    return missing();
  }
  const parsed = storedCharacterFromValue(migrated.value, storageVersion);
  if (parsed === null) {
    return { ok: false, reason: migrated.reason, missing: false, persist: false, value: null, raw: null };
  }
  const envelope = readEnvelope(migrated.value);
  parsed.schemaVersion = envelope.schemaVersion;
  parsed.createdAt = envelope.createdAt;
  parsed.updatedAt = envelope.updatedAt;
  return { ok: true, reason: migrated.reason, missing: false, persist: migrated.changed, value: parsed, raw: migrated.value };
}

export function loadCanonicalInventory(raw: unknown, present: boolean): CanonicalLoad<PlayerInventory> {
  const migrated = migrateRecord("inventory", raw, present);
  if (!migrated.ok) {
    return fail(migrated);
  }
  if (migrated.missing || migrated.value === null) {
    return missing();
  }
  const parsed = storedInventoryFromValue(migrated.value);
  if (parsed === null) {
    return { ok: false, reason: "corrupted_required_fields", missing: false, persist: false, value: null, raw: null };
  }
  stampInventory(parsed, migrated.value);
  return { ok: true, reason: migrated.reason, missing: false, persist: migrated.changed, value: parsed, raw: migrated.value };
}

export function loadCanonicalEquipment(raw: unknown, present: boolean): CanonicalLoad<PlayerEquipment> {
  const migrated = migrateRecord("equipment", raw, present);
  if (!migrated.ok) {
    return fail(migrated);
  }
  if (migrated.missing || migrated.value === null) {
    return missing();
  }
  const parsed = storedEquipmentFromValue(migrated.value);
  if (parsed === null) {
    return { ok: false, reason: "corrupted_required_fields", missing: false, persist: false, value: null, raw: null };
  }
  const envelope = readEnvelope(migrated.value);
  parsed.schemaVersion = envelope.schemaVersion;
  parsed.createdAt = envelope.createdAt;
  parsed.updatedAt = envelope.updatedAt;
  return { ok: true, reason: migrated.reason, missing: false, persist: migrated.changed, value: parsed, raw: migrated.value };
}

export function loadCanonicalQuests(raw: unknown, present: boolean): CanonicalLoad<QuestLog> {
  const migrated = migrateRecord("quests", raw, present);
  if (!migrated.ok) {
    return fail(migrated);
  }
  if (migrated.missing || migrated.value === null) {
    return missing();
  }
  const parsed = storedQuestFromValue(migrated.value);
  const envelope = readEnvelope(migrated.value);
  parsed.schemaVersion = envelope.schemaVersion;
  parsed.createdAt = envelope.createdAt;
  parsed.updatedAt = envelope.updatedAt;
  return { ok: true, reason: migrated.reason, missing: false, persist: migrated.changed, value: parsed, raw: migrated.value };
}

export function loadCanonicalWalletRef(raw: unknown, present: boolean): CanonicalLoad<WalletRef> {
  const migrated = migrateRecord("wallet_ref", raw, present);
  if (!migrated.ok) {
    return fail(migrated);
  }
  if (migrated.missing || migrated.value === null) {
    return missing();
  }
  const parsed = storedWalletRefFromValue(migrated.value);
  if (parsed === null) {
    return { ok: false, reason: "corrupted_required_fields", missing: false, persist: false, value: null, raw: null };
  }
  return { ok: true, reason: migrated.reason, missing: false, persist: migrated.changed, value: parsed, raw: migrated.value };
}

export function loadCanonicalProgression(raw: unknown, present: boolean): CanonicalLoad<CharacterProgression> {
  const migrated = migrateRecord("progression", raw, present);
  if (!migrated.ok) {
    return fail(migrated);
  }
  if (migrated.missing || migrated.value === null) {
    return missing();
  }
  const parsed = storedProgressionFromValue(migrated.value);
  if (parsed === null) {
    return { ok: false, reason: "corrupted_required_fields", missing: false, persist: false, value: null, raw: null };
  }
  const envelope = readEnvelope(migrated.value);
  parsed.schemaVersion = envelope.schemaVersion;
  parsed.createdAt = envelope.createdAt;
  parsed.updatedAt = envelope.updatedAt;
  return { ok: true, reason: migrated.reason, missing: false, persist: migrated.changed, value: parsed, raw: migrated.value };
}

function stampInventory(inventory: PlayerInventory, value: { [key: string]: unknown }): void {
  const envelope = readEnvelope(value);
  inventory.schemaVersion = envelope.schemaVersion;
  inventory.createdAt = envelope.createdAt;
  inventory.updatedAt = envelope.updatedAt;
}

function fail<T>(migrated: RecordMigrationResult): CanonicalLoad<T> {
  return {
    ok: false,
    reason: migrated.reason,
    missing: false,
    persist: false,
    value: null,
    raw: null,
  };
}

function missing<T>(): CanonicalLoad<T> {
  return {
    ok: true,
    reason: "missing",
    missing: true,
    persist: false,
    value: null,
    raw: null,
  };
}
