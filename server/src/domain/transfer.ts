import {
  TRANSFER_SCHEMA_VERSION,
  TRANSFER_TICKET_TTL_MS,
  type TransferTicket,
} from "./instance";

export interface TransferTicketRepository {
  getTicket(ticketId: string): TransferTicket | null;
  putTicket(ticket: TransferTicket): void;
}

export function issueTransferTicket(input: {
  ticketId: string;
  characterId: string;
  accountUserId: string;
  originMatchId: string;
  destinationMatchId: string;
  destinationInstanceId: string;
  nowMs: number;
  ttlMs?: number;
}): TransferTicket {
  const ttl = input.ttlMs !== undefined ? input.ttlMs : TRANSFER_TICKET_TTL_MS;
  return {
    ticketId: input.ticketId,
    characterId: input.characterId,
    accountUserId: input.accountUserId,
    originMatchId: input.originMatchId,
    destinationMatchId: input.destinationMatchId,
    destinationInstanceId: input.destinationInstanceId,
    issuedAt: input.nowMs,
    expiresAt: input.nowMs + ttl,
    consumedAt: 0,
    schemaVersion: TRANSFER_SCHEMA_VERSION,
  };
}

export function previewTransferTicket(
  ticket: TransferTicket | null,
  expected: {
    characterId: string;
    accountUserId: string;
    destinationMatchId: string;
    nowMs: number;
  },
): { ok: boolean; code: string } {
  if (ticket === null) {
    return { ok: false, code: "invalid_ticket" };
  }
  if (ticket.consumedAt > 0) {
    return { ok: false, code: "ticket_reused" };
  }
  if (expected.nowMs > ticket.expiresAt) {
    return { ok: false, code: "ticket_expired" };
  }
  if (ticket.characterId !== expected.characterId) {
    return { ok: false, code: "ticket_wrong_character" };
  }
  if (ticket.accountUserId !== expected.accountUserId) {
    return { ok: false, code: "ticket_wrong_character" };
  }
  if (ticket.destinationMatchId !== expected.destinationMatchId) {
    return { ok: false, code: "ticket_wrong_destination" };
  }
  return { ok: true, code: "ok" };
}

export function consumeTransferTicket(
  repo: TransferTicketRepository,
  ticketId: string,
  expected: {
    characterId: string;
    accountUserId: string;
    destinationMatchId: string;
    nowMs: number;
  },
): { ok: boolean; code: string; ticket?: TransferTicket } {
  const ticket = repo.getTicket(ticketId);
  const preview = previewTransferTicket(ticket, expected);
  if (!preview.ok || ticket === null) {
    return { ok: false, code: preview.code };
  }
  const consumed: TransferTicket = {
    ticketId: ticket.ticketId,
    characterId: ticket.characterId,
    accountUserId: ticket.accountUserId,
    originMatchId: ticket.originMatchId,
    destinationMatchId: ticket.destinationMatchId,
    destinationInstanceId: ticket.destinationInstanceId,
    issuedAt: ticket.issuedAt,
    expiresAt: ticket.expiresAt,
    consumedAt: expected.nowMs,
    schemaVersion: ticket.schemaVersion,
  };
  repo.putTicket(consumed);
  return { ok: true, code: "ok", ticket: consumed };
}

export function ticketFromStorage(value: { [key: string]: unknown } | null | undefined): TransferTicket | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (typeof value.ticketId !== "string" || value.ticketId.length === 0) {
    return null;
  }
  if (typeof value.characterId !== "string" || typeof value.accountUserId !== "string") {
    return null;
  }
  if (typeof value.originMatchId !== "string" || typeof value.destinationMatchId !== "string") {
    return null;
  }
  if (typeof value.destinationInstanceId !== "string") {
    return null;
  }
  if (typeof value.issuedAt !== "number" || typeof value.expiresAt !== "number") {
    return null;
  }
  const consumedAt = typeof value.consumedAt === "number" ? value.consumedAt : 0;
  return {
    ticketId: value.ticketId,
    characterId: value.characterId,
    accountUserId: value.accountUserId,
    originMatchId: value.originMatchId,
    destinationMatchId: value.destinationMatchId,
    destinationInstanceId: value.destinationInstanceId,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    consumedAt: consumedAt,
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : TRANSFER_SCHEMA_VERSION,
  };
}
