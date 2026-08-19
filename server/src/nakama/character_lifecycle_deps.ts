import { content } from "../generated/content";
import { type StoredCharacter } from "../domain/character";
import { type CharacterLifecycleDeps } from "../domain/character_lifecycle";
import { classDefinitionsFromContent, startingEquipmentForClass } from "../domain/class_catalog";
import { emptyEquipment } from "../domain/equipment";
import { initializeInventoryFromStacks } from "../domain/inventory";
import { publicWorldLocation } from "../domain/instance";
import { initializeProgression } from "../domain/progression";
import { emptyQuestLog } from "../domain/quest";
import { SAVE_SCHEMA_VERSION } from "../domain/save_schema";
import type { ProgressionCatalog } from "../domain/stats";
import type { PurgeStep } from "../domain/character_purge";
import { acquireGameplayLease, disconnectGameplayLease, leaseGraceMs } from "../domain/gameplay_lease";
import { readCharacter, writeCharacter, deleteCharacterRecord } from "./character_store";
import { readEquipment, writeEquipmentOnce } from "./equipment_store";
import { readInventory, writeInventoryOnce } from "./inventory_store";
import { deleteNameReservation, readNameReservation, writeNameReservation } from "./name_reservation_store";
import { readQuests, writeQuestsOnce } from "./quest_store";
import { readRoster, writeRoster } from "./roster_store";
import { readSelection, writeSelection } from "./selection_store";
import { readProgression, writeProgressionOnce } from "./progression_store";
import { deleteActiveLocation, readActiveLocation, writeActiveLocationIfAbsent } from "./location_store";
import { readGameplayLease, writeGameplayLease, deleteGameplayLease } from "./gameplay_lease_store";
import { readCharacterIdempotency, writeCharacterIdempotencyOnce } from "./character_idempotency_store";
import { deletePurgeJob, readPurgeJob, writePurgeAudit, writePurgeJob } from "./character_purge_store";
import { deletePlayerObject } from "./player_storage";
import { EQUIPMENT_COLLECTION, EQUIPMENT_KEY } from "../domain/equipment_store";
import { INVENTORY_COLLECTION, INVENTORY_KEY } from "../domain/inventory_store";
import { QUEST_COLLECTION, QUEST_KEY } from "../domain/quest_store";
import { PROGRESSION_COLLECTION, PROGRESSION_KEY } from "../domain/progression_store";
import { PLAYER_CAVE_KEY } from "../domain/cave";
import { readEffectiveMaintenance } from "./ops_store";
import { environmentFromRuntime } from "../domain/environment";

export function characterLifecycleDeps(nk: nkruntime.Nakama, runtimeEnv?: { [key: string]: string }): CharacterLifecycleDeps {
  return {
    nowMs: function () {
      return Date.now();
    },
    newId: function () {
      return nk.uuidv4();
    },
    newReservationToken: function () {
      return nk.uuidv4();
    },
    player: content.player,
    zone: content.zones["zone.starter"],
    classes: classDefinitionsFromContent(content.classes),
    readRoster: function (userId: string) {
      return readRoster(nk, userId);
    },
    writeRoster: function (userId: string, roster) {
      writeRoster(nk, userId, roster);
    },
    readLegacyCharacter: function (userId: string) {
      return readCharacter(nk, userId);
    },
    readCharacter: function (userId: string, characterId: string) {
      return readCharacter(nk, userId, characterId);
    },
    writeCharacter: function (userId: string, record: StoredCharacter) {
      writeCharacter(nk, userId, record);
    },
    deleteCharacterRecord: function (userId: string, characterId: string) {
      deleteCharacterRecord(nk, userId, characterId);
    },
    readReservation: function (canonicalName: string) {
      return readNameReservation(nk, canonicalName);
    },
    writeReservation: function (reservation) {
      writeNameReservation(nk, reservation);
    },
    confirmReservation: function (canonicalName: string) {
      return readNameReservation(nk, canonicalName);
    },
    deleteReservation: function (canonicalName: string) {
      deleteNameReservation(nk, canonicalName);
    },
    readSelection: function (userId: string) {
      return readSelection(nk, userId);
    },
    writeSelection: function (userId: string, ticket) {
      writeSelection(nk, userId, ticket);
    },
    copyGameplayFromLegacy: function (userId: string, characterId: string) {
      copyLegacyGameplay(nk, userId, characterId);
    },
    initializeNewCharacterGameplay: function (userId: string, record: StoredCharacter) {
      initializeNewGameplay(nk, userId, record);
    },
    readLease: function (userId: string) {
      return readGameplayLease(nk, userId);
    },
    writeLease: function (userId: string, lease) {
      if (lease === null) {
        deleteGameplayLease(nk, userId);
        return;
      }
      writeGameplayLease(nk, lease);
    },
    readProgression: function (userId: string, characterId: string) {
      return readProgression(nk, userId, characterId);
    },
    readLocation: function (userId: string, characterId: string) {
      return readActiveLocation(nk, userId, characterId);
    },
    readIdempotency: function (userId: string, operation: string, key: string) {
      const stored = readCharacterIdempotency(nk, userId, operation, key);
      return stored !== null ? stored.result : null;
    },
    writeIdempotency: function (userId: string, operation: string, key: string, result) {
      writeCharacterIdempotencyOnce(nk, userId, operation, key, result, Date.now());
    },
    readPurgeJob: function (userId: string, characterId: string) {
      return readPurgeJob(nk, userId, characterId);
    },
    writePurgeJob: function (userId: string, job) {
      writePurgeJob(nk, userId, job);
    },
    deletePurgeJob: function (userId: string, characterId: string) {
      deletePurgeJob(nk, userId, characterId);
    },
    applyPurgeStep: function (userId: string, record: StoredCharacter, step: PurgeStep) {
      applyNakamaPurgeStep(nk, userId, record, step);
    },
    maintenanceEnabled: function () {
      const env = environmentFromRuntime(runtimeEnv !== undefined ? runtimeEnv : {});
      return readEffectiveMaintenance(nk, env, runtimeEnv).enabled;
    },
    contentCompatible: function () {
      return true;
    },
  };
}

function copyLegacyGameplay(nk: nkruntime.Nakama, userId: string, characterId: string): void {
  const legacyInventory = readInventory(nk, userId);
  if (legacyInventory !== null) {
    writeInventoryOnce(nk, userId, legacyInventory, characterId);
  }
  const legacyEquipment = readEquipment(nk, userId);
  if (legacyEquipment !== null) {
    writeEquipmentOnce(nk, userId, legacyEquipment, characterId);
  }
  const legacyQuests = readQuests(nk, userId);
  if (Object.keys(legacyQuests.quests).length > 0) {
    writeQuestsOnce(nk, userId, legacyQuests, characterId);
  }
  const legacyProgression = readProgression(nk, userId);
  if (legacyProgression !== null) {
    writeProgressionOnce(nk, userId, legacyProgression, characterId);
  }
}

function initializeNewGameplay(nk: nkruntime.Nakama, userId: string, record: StoredCharacter): void {
  const classId = record.classId !== undefined ? record.classId : "";
  const stacks = startingEquipmentForClass(classDefinitionsFromContent(content.classes), classId);
  const loaded = initializeInventoryFromStacks(null, function () {
    return nk.uuidv4();
  }, stacks);
  const now = Date.now();
  loaded.inventory.schemaVersion = SAVE_SCHEMA_VERSION;
  loaded.inventory.createdAt = now;
  loaded.inventory.updatedAt = now;
  writeInventoryOnce(nk, userId, loaded.inventory, record.characterId);
  const equipment = emptyEquipment();
  equipment.schemaVersion = SAVE_SCHEMA_VERSION;
  equipment.createdAt = now;
  equipment.updatedAt = now;
  writeEquipmentOnce(nk, userId, equipment, record.characterId);
  const quests = emptyQuestLog();
  quests.schemaVersion = SAVE_SCHEMA_VERSION;
  quests.createdAt = now;
  quests.updatedAt = now;
  writeQuestsOnce(nk, userId, quests, record.characterId);
  const progression = initializeProgression(content as unknown as ProgressionCatalog, classId);
  progression.schemaVersion = SAVE_SCHEMA_VERSION;
  progression.createdAt = now;
  progression.updatedAt = now;
  writeProgressionOnce(nk, userId, progression, record.characterId);
  writeActiveLocationIfAbsent(
    nk,
    publicWorldLocation("", record.characterId, userId, record.position.x, record.position.y, now),
  );
}

function applyNakamaPurgeStep(
  nk: nkruntime.Nakama,
  userId: string,
  record: StoredCharacter,
  step: PurgeStep,
): void {
  if (step === "inventory") {
    deletePlayerObject(nk, INVENTORY_COLLECTION, INVENTORY_KEY, userId, record.characterId);
    return;
  }
  if (step === "equipment") {
    deletePlayerObject(nk, EQUIPMENT_COLLECTION, EQUIPMENT_KEY, userId, record.characterId);
    return;
  }
  if (step === "progression") {
    deletePlayerObject(nk, PROGRESSION_COLLECTION, PROGRESSION_KEY, userId, record.characterId);
    return;
  }
  if (step === "quests") {
    deletePlayerObject(nk, QUEST_COLLECTION, QUEST_KEY, userId, record.characterId);
    return;
  }
  if (step === "location") {
    deleteActiveLocation(nk, userId, record.characterId);
    return;
  }
  if (step === "cave") {
    deletePlayerObject(nk, "player", PLAYER_CAVE_KEY, userId, record.characterId);
    return;
  }
  if (step === "audit") {
    writePurgeAudit(nk, record.characterId, Date.now());
  }
}

export function acquireMatchGameplayLease(
  nk: nkruntime.Nakama,
  userId: string,
  characterId: string,
  matchId: string,
  nowMs: number,
): void {
  writeGameplayLease(nk, acquireGameplayLease({ accountUserId: userId, characterId: characterId, matchId: matchId, nowMs: nowMs }));
}

export function releaseMatchGameplayLease(
  nk: nkruntime.Nakama,
  userId: string,
  transferring: boolean,
  instanceType: string,
  nowMs: number,
): void {
  const current = readGameplayLease(nk, userId);
  if (current === null) {
    return;
  }
  if (transferring) {
    return;
  }
  writeGameplayLease(nk, disconnectGameplayLease(current, nowMs, leaseGraceMs(instanceType)));
}
