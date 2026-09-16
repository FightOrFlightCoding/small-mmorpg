import {
  CAVE_COLLECTION,
  CAVE_KEY,
  CAVE_OWNER_COLLECTION,
  CAVE_OWNER_KEY,
  CAVE_PERMISSION_READ,
  CAVE_PERMISSION_WRITE,
  PLAYER_CAVE_KEY,
  caveRecordFromStorage,
  type CaveRepository,
} from "../domain/cave";
import { CAVE_SCHEMA_VERSION, type CaveCharacterAssociation, type CaveOwnerIndex, type CaveRecord } from "../domain/instance";
import { storageKey } from "../domain/storage_scope";
import { SYSTEM_USER_ID } from "./starter_zone_registry";

export function nakamaCaveRepository(nk: nkruntime.Nakama): CaveRepository {
  return {
    getCave: function (instanceId: string): CaveRecord | null {
      const objects = nk.storageRead([
        { collection: CAVE_COLLECTION, key: storageKey(CAVE_KEY, instanceId), userId: SYSTEM_USER_ID },
      ]);
      if (objects.length === 0) {
        return null;
      }
      return caveRecordFromStorage(objects[0].value as { [key: string]: unknown });
    },
    putCave: function (record: CaveRecord): void {
      nk.storageWrite([
        {
          collection: CAVE_COLLECTION,
          key: storageKey(CAVE_KEY, record.instanceId),
          userId: SYSTEM_USER_ID,
          value: caveWriteValue(record),
          permissionRead: CAVE_PERMISSION_READ,
          permissionWrite: CAVE_PERMISSION_WRITE,
        },
      ]);
    },
    getOwnerIndex: function (ownerKind: "party" | "character", ownerId: string): CaveOwnerIndex | null {
      const objects = nk.storageRead([
        { collection: CAVE_OWNER_COLLECTION, key: ownerIndexKey(ownerKind, ownerId), userId: SYSTEM_USER_ID },
      ]);
      if (objects.length === 0) {
        return null;
      }
      return ownerIndexFromValue(objects[0].value as { [key: string]: unknown });
    },
    putOwnerIndexIfAbsent: function (index: CaveOwnerIndex): CaveOwnerIndex {
      let claimed: CaveOwnerIndex = index;
      nk.storageWriteRetry(
        [
          {
            collection: CAVE_OWNER_COLLECTION,
            key: ownerIndexKey(index.ownerKind, index.ownerId),
            userId: SYSTEM_USER_ID,
          },
        ],
        function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
          if (objects.length > 0) {
            const existing = ownerIndexFromValue(objects[0].value as { [key: string]: unknown });
            if (existing !== null && existing.instanceId.length > 0) {
              claimed = existing;
              return [];
            }
          }
          claimed = index;
          return [
            {
              collection: CAVE_OWNER_COLLECTION,
              key: ownerIndexKey(index.ownerKind, index.ownerId),
              userId: SYSTEM_USER_ID,
              value: {
                schemaVersion: index.schemaVersion,
                ownerKind: index.ownerKind,
                ownerId: index.ownerId,
                instanceId: index.instanceId,
              },
              permissionRead: CAVE_PERMISSION_READ,
              permissionWrite: CAVE_PERMISSION_WRITE,
            },
          ];
        },
        5,
      );
      return claimed;
    },
    deleteOwnerIndex: function (ownerKind: "party" | "character", ownerId: string): void {
      nk.storageWrite([
        {
          collection: CAVE_OWNER_COLLECTION,
          key: ownerIndexKey(ownerKind, ownerId),
          userId: SYSTEM_USER_ID,
          value: { schemaVersion: CAVE_SCHEMA_VERSION, ownerKind: ownerKind, ownerId: ownerId, instanceId: "", expired: true },
          permissionRead: CAVE_PERMISSION_READ,
          permissionWrite: CAVE_PERMISSION_WRITE,
        },
      ]);
    },
    getCharacterAssociation: function (_characterId: string): CaveCharacterAssociation | null {
      return null;
    },
    putCharacterAssociation: function (_association: CaveCharacterAssociation): void {
      return;
    },
    deleteCharacterAssociation: function (_characterId: string): void {
      return;
    },
  };
}

export function readCharacterCaveAssociation(
  nk: nkruntime.Nakama,
  accountUserId: string,
  characterId: string,
): CaveCharacterAssociation | null {
  const objects = nk.storageRead([
    { collection: "player", key: storageKey(PLAYER_CAVE_KEY, characterId), userId: accountUserId },
  ]);
  if (objects.length === 0) {
    return null;
  }
  const value = objects[0].value as { [key: string]: unknown };
  if (typeof value.characterId !== "string" || typeof value.instanceId !== "string" || value.instanceId.length === 0) {
    return null;
  }
  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : CAVE_SCHEMA_VERSION,
    characterId: value.characterId,
    instanceId: value.instanceId,
  };
}

export function writeCharacterCaveAssociation(
  nk: nkruntime.Nakama,
  accountUserId: string,
  association: CaveCharacterAssociation,
): void {
  nk.storageWrite([
    {
      collection: "player",
      key: storageKey(PLAYER_CAVE_KEY, association.characterId),
      userId: accountUserId,
      value: {
        schemaVersion: association.schemaVersion,
        characterId: association.characterId,
        instanceId: association.instanceId,
      },
      permissionRead: 1,
      permissionWrite: CAVE_PERMISSION_WRITE,
    },
  ]);
}

export function clearCharacterCaveAssociation(nk: nkruntime.Nakama, accountUserId: string, characterId: string): void {
  nk.storageWrite([
    {
      collection: "player",
      key: storageKey(PLAYER_CAVE_KEY, characterId),
      userId: accountUserId,
      value: { schemaVersion: CAVE_SCHEMA_VERSION, characterId: characterId, instanceId: "", expired: true },
      permissionRead: 1,
      permissionWrite: CAVE_PERMISSION_WRITE,
    },
  ]);
}

export function accountCaveRepository(nk: nkruntime.Nakama, accountUserId: string): CaveRepository {
  const inner = nakamaCaveRepository(nk);
  return {
    getCave: inner.getCave,
    putCave: inner.putCave,
    getOwnerIndex: inner.getOwnerIndex,
    putOwnerIndexIfAbsent: inner.putOwnerIndexIfAbsent,
    deleteOwnerIndex: inner.deleteOwnerIndex,
    getCharacterAssociation: function (characterId: string): CaveCharacterAssociation | null {
      return readCharacterCaveAssociation(nk, accountUserId, characterId);
    },
    putCharacterAssociation: function (association: CaveCharacterAssociation): void {
      writeCharacterCaveAssociation(nk, accountUserId, association);
    },
    deleteCharacterAssociation: function (characterId: string): void {
      clearCharacterCaveAssociation(nk, accountUserId, characterId);
    },
  };
}

export function caveWriteValue(record: CaveRecord): { [key: string]: unknown } {
  const value: { [key: string]: unknown } = {
    instanceId: record.instanceId,
    zoneTemplateId: record.zoneTemplateId,
    matchId: record.matchId,
    createdAt: record.createdAt,
    lastActiveAt: record.lastActiveAt,
    expiresAt: record.expiresAt,
    lifecycleState: record.lifecycleState,
    contentVersion: record.contentVersion,
    completionState: record.completionState,
    schemaVersion: record.schemaVersion,
  };
  if (record.ownerPartyId !== undefined) {
    value.ownerPartyId = record.ownerPartyId;
  }
  if (record.ownerCharacterId !== undefined) {
    value.ownerCharacterId = record.ownerCharacterId;
  }
  return value;
}

function ownerIndexKey(ownerKind: "party" | "character", ownerId: string): string {
  return storageKey(CAVE_OWNER_KEY + "_" + ownerKind, ownerId);
}

function ownerIndexFromValue(value: { [key: string]: unknown } | null | undefined): CaveOwnerIndex | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }
  if (value.ownerKind !== "party" && value.ownerKind !== "character") {
    return null;
  }
  if (typeof value.ownerId !== "string" || typeof value.instanceId !== "string") {
    return null;
  }
  if (value.instanceId.length === 0) {
    return null;
  }
  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : CAVE_SCHEMA_VERSION,
    ownerKind: value.ownerKind,
    ownerId: value.ownerId,
    instanceId: value.instanceId,
  };
}
