export const SELECTION_TICKET_TTL_MS = 300000;
export const SELECTION_COLLECTION = "player";
export const SELECTION_KEY = "selection";
export const SELECTION_PERMISSION_READ: 1 = 1;
export const SELECTION_PERMISSION_WRITE: 0 = 0;

export interface SelectionTicket {
  ticketId: string;
  accountUserId: string;
  characterId: string;
  expiresAt: number;
  invalidated: boolean;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

export function issueSelectionTicket(
  ticketId: string,
  accountUserId: string,
  characterId: string,
  nowMs: number,
  ttlMs: number = SELECTION_TICKET_TTL_MS,
): SelectionTicket {
  return {
    ticketId: ticketId,
    accountUserId: accountUserId,
    characterId: characterId,
    expiresAt: nowMs + ttlMs,
    invalidated: false,
    schemaVersion: 1,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

export function validateSelectionTicket(
  ticket: SelectionTicket | null,
  accountUserId: string,
  nowMs: number,
): { ok: true; ticket: SelectionTicket } | { ok: false; reason: string } {
  if (ticket === null) {
    return { ok: false, reason: "selection_required" };
  }
  if (ticket.accountUserId !== accountUserId) {
    return { ok: false, reason: "selection_foreign" };
  }
  if (ticket.invalidated) {
    return { ok: false, reason: "selection_invalidated" };
  }
  if (nowMs >= ticket.expiresAt) {
    return { ok: false, reason: "selection_expired" };
  }
  return { ok: true, ticket: ticket };
}

export function ticketMatchesPresented(ticket: SelectionTicket, presentedTicketId: string): boolean {
  return ticket.ticketId === presentedTicketId;
}

export function validateJoinSelection(
  presentedTicketId: string,
  ticket: SelectionTicket | null,
  accountUserId: string,
  character: { accountUserId?: string; deletedAt?: number } | null,
  nowMs: number,
): { ok: true; ticket: SelectionTicket } | { ok: false; reason: string } {
  if (typeof presentedTicketId !== "string" || presentedTicketId.length === 0) {
    return { ok: false, reason: "selection_required" };
  }
  const checked = validateSelectionTicket(ticket, accountUserId, nowMs);
  if (!checked.ok) {
    return checked;
  }
  if (!ticketMatchesPresented(checked.ticket, presentedTicketId)) {
    return { ok: false, reason: "selection_invalidated" };
  }
  if (character === null) {
    return { ok: false, reason: "character_missing" };
  }
  if (character.accountUserId !== undefined && character.accountUserId.length > 0 && character.accountUserId !== accountUserId) {
    return { ok: false, reason: "selection_foreign" };
  }
  if (typeof character.deletedAt === "number" && character.deletedAt > 0) {
    return { ok: false, reason: "character_deleted" };
  }
  return { ok: true, ticket: checked.ticket };
}

export function invalidateTicket(ticket: SelectionTicket, nowMs: number): SelectionTicket {
  return {
    ticketId: ticket.ticketId,
    accountUserId: ticket.accountUserId,
    characterId: ticket.characterId,
    expiresAt: ticket.expiresAt,
    invalidated: true,
    schemaVersion: ticket.schemaVersion,
    createdAt: ticket.createdAt,
    updatedAt: nowMs,
  };
}
