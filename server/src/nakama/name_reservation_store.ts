import {
  NAMES_COLLECTION,
  NAMES_KEY,
  NAMES_PERMISSION_READ,
  NAMES_PERMISSION_WRITE,
} from "../domain/character_roster";
import {
  NAME_RESERVATION_SCHEMA_VERSION,
  RESERVATION_HELD,
  nameReservationConflict,
  type NameReservation,
} from "../domain/character_name";
import { nameReservationKey } from "../domain/storage_scope";
import { SYSTEM_USER_ID } from "./starter_zone_registry";

export function readNameReservation(nk: nkruntime.Nakama, canonicalName: string): NameReservation | null {
  const objects = nk.storageRead([
    {
      collection: NAMES_COLLECTION,
      key: nameReservationKey(canonicalName),
      userId: SYSTEM_USER_ID,
    },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return reservationFromValue(objects[0].value as { [key: string]: unknown });
}

export function writeNameReservation(nk: nkruntime.Nakama, reservation: NameReservation): void {
  const key = nameReservationKey(reservation.canonicalName);
  nk.storageWriteRetry(
    [{ collection: NAMES_COLLECTION, key: key, userId: SYSTEM_USER_ID }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        const existing = reservationFromValue(objects[0].value as { [key: string]: unknown });
        if (existing !== null && nameReservationConflict(existing, reservation)) {
          return [];
        }
        if (existing !== null && existing.token === reservation.token) {
          return [];
        }
      }
      const write: nkruntime.StorageWriteRequest = {
        collection: NAMES_COLLECTION,
        key: key,
        userId: SYSTEM_USER_ID,
        value: reservationWriteValue(reservation),
        permissionRead: NAMES_PERMISSION_READ,
        permissionWrite: NAMES_PERMISSION_WRITE,
      };
      if (objects.length > 0) {
        write.version = objects[0].version;
      } else {
        write.version = "*";
      }
      return [write];
    },
    5,
  );
}

export function deleteNameReservation(nk: nkruntime.Nakama, canonicalName: string): void {
  nk.storageDelete([
    {
      collection: NAMES_COLLECTION,
      key: nameReservationKey(canonicalName),
      userId: SYSTEM_USER_ID,
    },
  ]);
}

export function reservationFromValue(value: { [key: string]: unknown }): NameReservation | null {
  if (
    typeof value.canonicalName !== "string" ||
    typeof value.characterId !== "string" ||
    typeof value.accountUserId !== "string" ||
    typeof value.token !== "string"
  ) {
    return null;
  }
  return {
    canonicalName: value.canonicalName,
    characterId: value.characterId,
    accountUserId: value.accountUserId,
    token: value.token,
    reservationState: typeof value.reservationState === "string" ? value.reservationState : RESERVATION_HELD,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
    releasedAt: typeof value.releasedAt === "number" ? value.releasedAt : 0,
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : NAME_RESERVATION_SCHEMA_VERSION,
  };
}

function reservationWriteValue(reservation: NameReservation): { [key: string]: unknown } {
  return {
    canonicalName: reservation.canonicalName,
    characterId: reservation.characterId,
    accountUserId: reservation.accountUserId,
    token: reservation.token,
    reservationState: reservation.reservationState,
    createdAt: reservation.createdAt,
    releasedAt: reservation.releasedAt,
    schemaVersion: reservation.schemaVersion,
    keyPrefix: NAMES_KEY,
  };
}
