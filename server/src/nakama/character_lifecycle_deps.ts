import { content } from "../generated/content";
import { type StoredCharacter } from "../domain/character";
import { type CharacterLifecycleDeps } from "../domain/character_lifecycle";
import { classDefinitionsFromContent, startingEquipmentForClass } from "../domain/class_catalog";
import { initializeInventoryFromStacks } from "../domain/inventory";
import { SAVE_SCHEMA_VERSION } from "../domain/save_schema";
import { readCharacter, writeCharacter } from "./character_store";
import { readEquipment, writeEquipment } from "./equipment_store";
import { readInventory, writeInventoryOnce } from "./inventory_store";
import { readNameReservation, writeNameReservation } from "./name_reservation_store";
import { readQuests, writeQuests } from "./quest_store";
import { readRoster, writeRoster } from "./roster_store";
import { readSelection, writeSelection } from "./selection_store";

export function characterLifecycleDeps(nk: nkruntime.Nakama): CharacterLifecycleDeps {
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
    readReservation: function (canonicalName: string) {
      return readNameReservation(nk, canonicalName);
    },
    writeReservation: function (reservation) {
      writeNameReservation(nk, reservation);
    },
    confirmReservation: function (canonicalName: string) {
      return readNameReservation(nk, canonicalName);
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
  };
}

function copyLegacyGameplay(nk: nkruntime.Nakama, userId: string, characterId: string): void {
  const legacyInventory = readInventory(nk, userId);
  if (legacyInventory !== null) {
    writeInventoryOnce(nk, userId, legacyInventory, characterId);
  }
  const legacyEquipment = readEquipment(nk, userId);
  if (legacyEquipment !== null) {
    writeEquipment(nk, userId, legacyEquipment, characterId);
  }
  const legacyQuests = readQuests(nk, userId);
  if (Object.keys(legacyQuests.quests).length > 0) {
    writeQuests(nk, userId, legacyQuests, characterId);
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
}
