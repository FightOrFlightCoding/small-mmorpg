import {
  NAMES_COLLECTION,
  NAMES_KEY,
  NAMES_PERMISSION_READ,
  NAMES_PERMISSION_WRITE,
} from "../domain/character_roster";
import { type NameReservation } from "../domain/character_name";
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
  return reservationFromValue(objects[0].value);
}

export function writeNameReservation(nk: nkruntime.Nakama, reservation: NameReservation): void {
  nk.storageWrite([
    {
      collection: NAMES_COLLECTION,
      key: nameReservationKey(reservation.canonicalName),
      userId: SYSTEM_USER_ID,
      value: {
        canonicalName: reservation.canonicalName,
        characterId: reservation.characterId,
        accountUserId: reservation.accountUserId,
        token: reservation.token,
        keyPrefix: NAMES_KEY,
      },
      permissionRead: NAMES_PERMISSION_READ,
      permissionWrite: NAMES_PERMISSION_WRITE,
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
  };
}
