import { isDeleted } from "./character_roster";
import {
  liveGameplayLease,
  locationNameKey,
  presenceFromLease,
  type GameplayLease,
  type PresenceState,
} from "./gameplay_lease";
import type { ActiveLocation } from "./instance";
import type { CharacterProgression } from "./progression";
import type { StoredCharacter } from "./character";

export const CHARACTER_STATUS_ACTIVE = "ACTIVE";
export const CHARACTER_STATUS_SOFT_DELETED = "SOFT_DELETED";
export const CHARACTER_STATUS_PURGED = "PURGED";

export type CharacterStatus = "ACTIVE" | "SOFT_DELETED" | "PURGED";
export type PlayBlockedReason =
  | ""
  | "deleted"
  | "account_busy"
  | "link_dead"
  | "maintenance"
  | "content_incompatible"
  | "selection_pending";

export interface CharacterCatalogEntry {
  characterId: string;
  displayName: string;
  name: string;
  canonicalName: string;
  classId: string;
  level: number;
  lastLocationNameKey: string;
  lastPlayedAt: number;
  createdAt: number;
  status: CharacterStatus;
  softDeleteExpiresAt: number;
  activePresenceState: PresenceState;
  playAvailableAt: number;
  playBlockedReason: PlayBlockedReason;
  deletedAt: number;
  accountUserId: string;
  schemaVersion: number;
}

export function characterStatusOf(record: StoredCharacter, nowMs: number): CharacterStatus {
  if (record.status === CHARACTER_STATUS_PURGED) {
    return CHARACTER_STATUS_PURGED;
  }
  if (isDeleted(record.deletedAt)) {
    const expires = record.softDeleteExpiresAt !== undefined ? record.softDeleteExpiresAt : 0;
    if (expires > 0 && nowMs >= expires) {
      return CHARACTER_STATUS_SOFT_DELETED;
    }
    return CHARACTER_STATUS_SOFT_DELETED;
  }
  return CHARACTER_STATUS_ACTIVE;
}

export function playAvailability(input: {
  record: StoredCharacter;
  nowMs: number;
  lease: GameplayLease | null;
  maintenance: boolean;
  contentCompatible: boolean;
  selectionPendingCharacterId: string;
}): { playAvailableAt: number; playBlockedReason: PlayBlockedReason; presence: PresenceState } {
  const status = characterStatusOf(input.record, input.nowMs);
  const presence = presenceFromLease(input.lease, input.record.characterId, input.nowMs);
  if (status !== CHARACTER_STATUS_ACTIVE) {
    return { playAvailableAt: 0, playBlockedReason: "deleted", presence: presence };
  }
  if (!input.contentCompatible) {
    return { playAvailableAt: 0, playBlockedReason: "content_incompatible", presence: presence };
  }
  if (input.maintenance) {
    return { playAvailableAt: 0, playBlockedReason: "maintenance", presence: presence };
  }
  const live = liveGameplayLease(input.lease, input.nowMs);
  if (live !== null && live.characterId !== input.record.characterId) {
    return {
      playAvailableAt: live.playAvailableAt,
      playBlockedReason: "account_busy",
      presence: presence,
    };
  }
  if (live !== null && live.characterId === input.record.characterId && live.presenceState === "DISCONNECTING") {
    return {
      playAvailableAt: live.playAvailableAt,
      playBlockedReason: "link_dead",
      presence: presence,
    };
  }
  if (live !== null && live.characterId === input.record.characterId && live.presenceState === "ONLINE") {
    return {
      playAvailableAt: live.playAvailableAt,
      playBlockedReason: "account_busy",
      presence: presence,
    };
  }
  if (
    input.selectionPendingCharacterId.length > 0 &&
    input.selectionPendingCharacterId !== input.record.characterId
  ) {
    return { playAvailableAt: 0, playBlockedReason: "selection_pending", presence: presence };
  }
  return { playAvailableAt: 0, playBlockedReason: "", presence: presence };
}

export function characterCatalogEntry(input: {
  record: StoredCharacter;
  accountUserId: string;
  nowMs: number;
  level: number;
  location: ActiveLocation | null;
  lease: GameplayLease | null;
  maintenance: boolean;
  contentCompatible: boolean;
  selectionPendingCharacterId: string;
}): CharacterCatalogEntry {
  const record = input.record;
  const play = playAvailability({
    record: record,
    nowMs: input.nowMs,
    lease: input.lease,
    maintenance: input.maintenance,
    contentCompatible: input.contentCompatible,
    selectionPendingCharacterId: input.selectionPendingCharacterId,
  });
  const deletedAt = record.deletedAt !== undefined ? record.deletedAt : 0;
  return {
    characterId: record.characterId,
    displayName: record.name,
    name: record.name,
    canonicalName: record.canonicalName !== undefined ? record.canonicalName : record.name.toLowerCase(),
    classId: record.classId !== undefined ? record.classId : "",
    level: input.level,
    lastLocationNameKey: locationNameKey(input.location, record.zoneId),
    lastPlayedAt: record.lastPlayedAt !== undefined ? record.lastPlayedAt : record.updatedAt,
    createdAt: record.createdAt,
    status: characterStatusOf(record, input.nowMs),
    softDeleteExpiresAt: record.softDeleteExpiresAt !== undefined ? record.softDeleteExpiresAt : 0,
    activePresenceState: play.presence,
    playAvailableAt: play.playAvailableAt,
    playBlockedReason: play.playBlockedReason,
    deletedAt: deletedAt,
    accountUserId:
      record.accountUserId !== undefined && record.accountUserId.length > 0 ? record.accountUserId : input.accountUserId,
    schemaVersion: record.schemaVersion,
  };
}

export function catalogLevel(progression: CharacterProgression | null): number {
  if (progression === null || typeof progression.level !== "number" || progression.level < 1) {
    return 1;
  }
  return progression.level;
}
