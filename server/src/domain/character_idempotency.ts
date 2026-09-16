import { SAVE_SCHEMA_VERSION } from "./save_schema";

export const CHARACTER_IDEMPOTENCY_KEY = "idem";
export const CHARACTER_IDEMPOTENCY_KEY_PREFIX = "idem_";

export interface CharacterIdempotencyRecord {
  operation: string;
  idempotencyKey: string;
  accountUserId: string;
  result: { [key: string]: unknown };
  schemaVersion: number;
  createdAt: number;
}

export function idempotencyStorageKey(operation: string, rawKey: string): string {
  let encoded = "";
  const source = rawKey.length > 64 ? rawKey.substring(0, 64) : rawKey;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charAt(i);
    const code = ch.charCodeAt(0);
    if ((code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || ch === "-" || ch === "_") {
      encoded += ch;
      continue;
    }
    encoded += "_";
  }
  if (encoded.length === 0) {
    encoded = "empty";
  }
  return CHARACTER_IDEMPOTENCY_KEY_PREFIX + operation + "_" + encoded;
}

export function idempotencyRecord(
  operation: string,
  idempotencyKey: string,
  accountUserId: string,
  result: { [key: string]: unknown },
  nowMs: number,
): CharacterIdempotencyRecord {
  return {
    operation: operation,
    idempotencyKey: idempotencyKey,
    accountUserId: accountUserId,
    result: result,
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: nowMs,
  };
}

export function idempotencyFromStorage(value: { [key: string]: unknown } | null | undefined): CharacterIdempotencyRecord | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (typeof value.operation !== "string" || typeof value.idempotencyKey !== "string" || typeof value.accountUserId !== "string") {
    return null;
  }
  if (value.result === null || typeof value.result !== "object" || Array.isArray(value.result)) {
    return null;
  }
  return {
    operation: value.operation,
    idempotencyKey: value.idempotencyKey,
    accountUserId: value.accountUserId,
    result: value.result as { [key: string]: unknown },
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : SAVE_SCHEMA_VERSION,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
  };
}
