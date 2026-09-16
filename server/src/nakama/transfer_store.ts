import { TRANSFER_COLLECTION, TRANSFER_KEY } from "../domain/cave";
import { TRANSFER_SCHEMA_VERSION, type TransferTicket } from "../domain/instance";
import { ticketFromStorage, type TransferTicketRepository } from "../domain/transfer";
import { storageKey } from "../domain/storage_scope";
import { SYSTEM_USER_ID } from "./starter_zone_registry";

export function nakamaTransferRepository(nk: nkruntime.Nakama): TransferTicketRepository {
  return {
    getTicket: function (ticketId: string): TransferTicket | null {
      const objects = nk.storageRead([
        { collection: TRANSFER_COLLECTION, key: storageKey(TRANSFER_KEY, ticketId), userId: SYSTEM_USER_ID },
      ]);
      if (objects.length === 0) {
        return null;
      }
      return ticketFromStorage(objects[0].value as { [key: string]: unknown });
    },
    putTicket: function (ticket: TransferTicket): void {
      nk.storageWrite([
        {
          collection: TRANSFER_COLLECTION,
          key: storageKey(TRANSFER_KEY, ticket.ticketId),
          userId: SYSTEM_USER_ID,
          value: {
            ticketId: ticket.ticketId,
            characterId: ticket.characterId,
            accountUserId: ticket.accountUserId,
            originMatchId: ticket.originMatchId,
            destinationMatchId: ticket.destinationMatchId,
            destinationInstanceId: ticket.destinationInstanceId,
            issuedAt: ticket.issuedAt,
            expiresAt: ticket.expiresAt,
            consumedAt: ticket.consumedAt,
            schemaVersion: TRANSFER_SCHEMA_VERSION,
          },
          permissionRead: 0,
          permissionWrite: 0,
        },
      ]);
    },
  };
}
