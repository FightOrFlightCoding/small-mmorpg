import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthChallengePurpose } from "./types";

export type { AuthChallengePurpose } from "./types";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateChallengeId(): string {
  return randomBytes(16).toString("hex");
}

export function generateChallengeCode(): string {
  const bytes = randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) {
    raw += ALPHABET.charAt(bytes[i] % ALPHABET.length);
  }
  return raw.slice(0, 4) + "-" + raw.slice(4, 8) + "-" + raw.slice(8, 12) + "-" + raw.slice(12, 16);
}

export function normalizeChallengeCode(raw: string): string {
  const upper = raw.toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0").replace(/[^A-Z0-9]/g, "");
  return upper;
}

export function hashChallengeSecret(secret: string, challengeId: string, code: string): string {
  return createHmac("sha256", secret).update(challengeId + ":" + normalizeChallengeCode(code), "utf8").digest("hex");
}

export function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function emailLookupHash(pepper: string, canonicalEmail: string): string {
  return createHmac("sha256", pepper).update(canonicalEmail, "utf8").digest("hex");
}

export const CHALLENGE_PURPOSES: AuthChallengePurpose[] = [
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "EMAIL_CHANGE",
  "ACCOUNT_DELETION",
];
