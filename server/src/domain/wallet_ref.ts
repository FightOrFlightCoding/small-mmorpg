import {
  WALLET_REF_SAVE_KEYS,
  attachEnvelope,
  envelopeFromRecord,
  optionalExtras,
} from "./save_schema";

export const WALLET_REF_COLLECTION = "player";
export const WALLET_REF_KEY = "wallet_ref";
export const WALLET_REF_PERMISSION_READ: 1 = 1;
export const WALLET_REF_PERMISSION_WRITE: 0 = 0;

export interface WalletRef {
  currencies: string[];
  schemaVersion?: number;
  createdAt?: number;
  updatedAt?: number;
  extras?: { [key: string]: unknown };
}

export function defaultWalletRef(): WalletRef {
  return { currencies: ["gold"] };
}

export function storedWalletRefWriteValue(ref: WalletRef): { [key: string]: unknown } {
  const currencies: string[] = [];
  for (let i = 0; i < ref.currencies.length; i++) {
    currencies.push(ref.currencies[i]);
  }
  currencies.sort();
  return attachEnvelope(
    { currencies: currencies },
    envelopeFromRecord(ref),
    ref.extras,
  );
}

export function storedWalletRefFromValue(value: unknown): WalletRef | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (Object.prototype.hasOwnProperty.call(data, "currencies") && !Array.isArray(data.currencies)) {
    return null;
  }
  const currencies: string[] = [];
  if (Array.isArray(data.currencies)) {
    for (let i = 0; i < data.currencies.length; i++) {
      if (typeof data.currencies[i] === "string" && data.currencies[i].length > 0) {
        currencies.push(data.currencies[i]);
      }
    }
  }
  const ref: WalletRef = {
    currencies: currencies.length > 0 ? currencies : defaultWalletRef().currencies,
    extras: optionalExtras(data, WALLET_REF_SAVE_KEYS),
  };
  if (typeof data.schemaVersion === "number") {
    ref.schemaVersion = data.schemaVersion;
  }
  if (typeof data.createdAt === "number") {
    ref.createdAt = data.createdAt;
  }
  if (typeof data.updatedAt === "number") {
    ref.updatedAt = data.updatedAt;
  }
  return ref;
}
