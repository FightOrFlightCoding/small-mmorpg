import {
  PARTY_COLLECTION,
  PARTY_KEY,
  PARTY_PERMISSION_READ,
  PARTY_PERMISSION_WRITE,
  PLAYER_PARTY_KEY,
  partyRecordFromStorage,
  type PartyIndex,
  type PartyRecord,
  type PartyRepository,
} from "../domain/party";
import { storageKey } from "../domain/storage_scope";
import { SYSTEM_USER_ID } from "./starter_zone_registry";

export function nakamaPartyRepository(nk: nkruntime.Nakama): PartyRepository {
  return {
    getParty: function (partyId: string): PartyRecord | null {
      const objects = nk.storageRead([
        { collection: PARTY_COLLECTION, key: storageKey(PARTY_KEY, partyId), userId: SYSTEM_USER_ID },
      ]);
      if (objects.length === 0) {
        return null;
      }
      return partyRecordFromStorage(objects[0].value);
    },
    putParty: function (party: PartyRecord): void {
      nk.storageWrite([
        {
          collection: PARTY_COLLECTION,
          key: storageKey(PARTY_KEY, party.partyId),
          userId: SYSTEM_USER_ID,
          value: partyWriteValue(party),
          permissionRead: PARTY_PERMISSION_READ,
          permissionWrite: PARTY_PERMISSION_WRITE,
        },
      ]);
    },
    deleteParty: function (partyId: string): void {
      nk.storageWrite([
        {
          collection: PARTY_COLLECTION,
          key: storageKey(PARTY_KEY, partyId),
          userId: SYSTEM_USER_ID,
          value: { schemaVersion: 1, partyId: partyId, expired: true },
          permissionRead: PARTY_PERMISSION_READ,
          permissionWrite: PARTY_PERMISSION_WRITE,
        },
      ]);
    },
    getIndex: function (accountUserId: string, characterId: string): PartyIndex | null {
      const objects = nk.storageRead([
        {
          collection: "player",
          key: storageKey(PLAYER_PARTY_KEY, characterId),
          userId: accountUserId,
        },
      ]);
      if (objects.length === 0) {
        return null;
      }
      return indexFromValue(objects[0].value, characterId);
    },
    putIndex: function (accountUserId: string, index: PartyIndex): void {
      nk.storageWrite([
        {
          collection: "player",
          key: storageKey(PLAYER_PARTY_KEY, index.characterId),
          userId: accountUserId,
          value: {
            schemaVersion: index.schemaVersion,
            characterId: index.characterId,
            partyId: index.partyId,
            pendingPartyId: index.pendingPartyId,
          },
          permissionRead: PARTY_PERMISSION_READ,
          permissionWrite: PARTY_PERMISSION_WRITE,
        },
      ]);
    },
    deleteIndex: function (accountUserId: string, characterId: string): void {
      nk.storageWrite([
        {
          collection: "player",
          key: storageKey(PLAYER_PARTY_KEY, characterId),
          userId: accountUserId,
          value: {
            schemaVersion: 1,
            characterId: characterId,
            partyId: "",
            pendingPartyId: "",
          },
          permissionRead: PARTY_PERMISSION_READ,
          permissionWrite: PARTY_PERMISSION_WRITE,
        },
      ]);
    },
  };
}

function indexFromValue(value: { [key: string]: unknown }, characterId: string): PartyIndex | null {
  const partyId = typeof value.partyId === "string" ? value.partyId : "";
  const pendingPartyId = typeof value.pendingPartyId === "string" ? value.pendingPartyId : "";
  if (partyId.length === 0 && pendingPartyId.length === 0) {
    return null;
  }
  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : 1,
    characterId: typeof value.characterId === "string" ? value.characterId : characterId,
    partyId: partyId,
    pendingPartyId: pendingPartyId,
  };
}

function partyWriteValue(party: PartyRecord): { [key: string]: unknown } {
  const value: { [key: string]: unknown } = {
    partyId: party.partyId,
    leaderCharacterId: party.leaderCharacterId,
    members: party.members,
    invites: party.invites,
    revision: party.revision,
    createdAt: party.createdAt,
    lastActiveAt: party.lastActiveAt,
    expiresAt: party.expiresAt,
    schemaVersion: party.schemaVersion,
    byRequestId: party.byRequestId,
    lootPolicy: party.lootPolicy,
  };
  if (typeof party.allAbsentSince === "number" && isFinite(party.allAbsentSince) && party.allAbsentSince > 0) {
    value.allAbsentSince = party.allAbsentSince;
  }
  return value;
}
