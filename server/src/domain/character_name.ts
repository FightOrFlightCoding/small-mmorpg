export const CHARACTER_NAME_MIN = 3;
export const CHARACTER_NAME_MAX = 16;

const SEPARATORS = " -'";

export function trimCharacterName(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end && raw.charAt(start) === " ") {
    start += 1;
  }
  while (end > start && raw.charAt(end - 1) === " ") {
    end -= 1;
  }
  return raw.substring(start, end);
}

export function canonicalCharacterName(displayName: string): string {
  return trimCharacterName(displayName).toLowerCase();
}

export function validateCharacterName(raw: unknown): { ok: true; name: string; canonicalName: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") {
    return { ok: false, reason: "invalid_name" };
  }
  const name = trimCharacterName(raw);
  if (name.length < CHARACTER_NAME_MIN || name.length > CHARACTER_NAME_MAX) {
    return { ok: false, reason: "invalid_name" };
  }
  if (isSeparator(name.charAt(0)) || isSeparator(name.charAt(name.length - 1))) {
    return { ok: false, reason: "invalid_name" };
  }
  let previousSpace = false;
  for (let i = 0; i < name.length; i++) {
    const ch = name.charAt(i);
    if (ch === " ") {
      if (previousSpace) {
        return { ok: false, reason: "invalid_name" };
      }
      previousSpace = true;
      continue;
    }
    previousSpace = false;
    if (!isAllowedNameChar(ch)) {
      return { ok: false, reason: "invalid_name" };
    }
  }
  return { ok: true, name: name, canonicalName: name.toLowerCase() };
}

function isSeparator(ch: string): boolean {
  return SEPARATORS.indexOf(ch) !== -1;
}

function isAllowedNameChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return true;
  }
  if (code >= 97 && code <= 122) {
    return true;
  }
  if (code >= 48 && code <= 57) {
    return true;
  }
  return ch === "-" || ch === "'";
}

export const NAME_RESERVATION_SCHEMA_VERSION = 1;
export const RESERVATION_HELD = "HELD";
export const RESERVATION_RELEASED = "RELEASED";

export interface NameReservation {
  canonicalName: string;
  characterId: string;
  accountUserId: string;
  token: string;
  reservationState: string;
  createdAt: number;
  releasedAt: number;
  schemaVersion: number;
}

export function reservationWrite(
  canonicalName: string,
  characterId: string,
  accountUserId: string,
  token: string,
  nowMs: number = 0,
): NameReservation {
  return {
    canonicalName: canonicalName,
    characterId: characterId,
    accountUserId: accountUserId,
    token: token,
    reservationState: RESERVATION_HELD,
    createdAt: nowMs,
    releasedAt: 0,
    schemaVersion: NAME_RESERVATION_SCHEMA_VERSION,
  };
}

export function confirmNameReservation(desired: NameReservation, observed: NameReservation | null): boolean {
  if (observed === null) {
    return false;
  }
  return observed.token === desired.token && observed.canonicalName === desired.canonicalName;
}

export function nameReservationHeldByCharacter(reservation: NameReservation | null, characterId: string, accountUserId: string): boolean {
  if (reservation === null) {
    return false;
  }
  if (reservation.reservationState === RESERVATION_RELEASED) {
    return false;
  }
  return reservation.characterId === characterId && reservation.accountUserId === accountUserId;
}

export function releasedReservation(reservation: NameReservation, nowMs: number): NameReservation {
  return {
    canonicalName: reservation.canonicalName,
    characterId: reservation.characterId,
    accountUserId: reservation.accountUserId,
    token: reservation.token,
    reservationState: RESERVATION_RELEASED,
    createdAt: reservation.createdAt,
    releasedAt: nowMs,
    schemaVersion: NAME_RESERVATION_SCHEMA_VERSION,
  };
}

export function nameReservationConflict(existing: NameReservation | null, desired: NameReservation): boolean {
  if (existing === null) {
    return false;
  }
  if (existing.reservationState === RESERVATION_RELEASED) {
    return false;
  }
  if (existing.token === desired.token) {
    return false;
  }
  if (existing.characterId === desired.characterId && existing.accountUserId === desired.accountUserId) {
    return false;
  }
  return true;
}
