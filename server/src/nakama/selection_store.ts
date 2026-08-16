import {
  SELECTION_COLLECTION,
  SELECTION_KEY,
  SELECTION_PERMISSION_READ,
  SELECTION_PERMISSION_WRITE,
  type SelectionTicket,
} from "../domain/character_ticket";

export function readSelection(nk: nkruntime.Nakama, userId: string): SelectionTicket | null {
  const objects = nk.storageRead([
    { collection: SELECTION_COLLECTION, key: SELECTION_KEY, userId: userId },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return selectionFromValue(objects[0].value);
}

export function writeSelection(nk: nkruntime.Nakama, userId: string, ticket: SelectionTicket): void {
  nk.storageWrite([
    {
      collection: SELECTION_COLLECTION,
      key: SELECTION_KEY,
      userId: userId,
      value: {
        ticketId: ticket.ticketId,
        accountUserId: ticket.accountUserId,
        characterId: ticket.characterId,
        expiresAt: ticket.expiresAt,
        invalidated: ticket.invalidated,
        schemaVersion: ticket.schemaVersion,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
      permissionRead: SELECTION_PERMISSION_READ,
      permissionWrite: SELECTION_PERMISSION_WRITE,
    },
  ]);
}

export function selectionFromValue(value: { [key: string]: unknown }): SelectionTicket | null {
  if (typeof value.ticketId !== "string" || typeof value.accountUserId !== "string" || typeof value.characterId !== "string") {
    return null;
  }
  if (typeof value.expiresAt !== "number") {
    return null;
  }
  return {
    ticketId: value.ticketId,
    accountUserId: value.accountUserId,
    characterId: value.characterId,
    expiresAt: value.expiresAt,
    invalidated: value.invalidated === true,
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : 1,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
  };
}
