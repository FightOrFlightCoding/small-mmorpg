import { PLAYER_LOCATION_KEY } from "../domain/cave";
import { LOCATION_SCHEMA_VERSION, type ActiveLocation } from "../domain/instance";
import { locationFromStorage } from "../domain/location";
import { storageKey } from "../domain/storage_scope";

export function readActiveLocation(nk: nkruntime.Nakama, accountUserId: string, characterId: string): ActiveLocation | null {
  const objects = nk.storageRead([
    { collection: "player", key: storageKey(PLAYER_LOCATION_KEY, characterId), userId: accountUserId },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return locationFromStorage(objects[0].value as { [key: string]: unknown });
}

export function writeActiveLocation(nk: nkruntime.Nakama, location: ActiveLocation): void {
  nk.storageWrite([
    {
      collection: "player",
      key: storageKey(PLAYER_LOCATION_KEY, location.characterId),
      userId: location.accountUserId,
      value: {
        instanceType: location.instanceType,
        zoneTemplateId: location.zoneTemplateId,
        instanceId: location.instanceId,
        matchId: location.matchId,
        position: { x: location.position.x, y: location.position.y },
        characterId: location.characterId,
        accountUserId: location.accountUserId,
        selectionTicketId: location.selectionTicketId !== undefined ? location.selectionTicketId : "",
        lastCheckpointAt: location.lastCheckpointAt,
        transferState: location.transferState,
        schemaVersion: LOCATION_SCHEMA_VERSION,
      },
      permissionRead: 1,
      permissionWrite: 0,
    },
  ]);
}
