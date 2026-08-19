import { constantTimeEqual, hmacSha256Hex, sha256Hex } from "./hmac";

export const GATEWAY_ASSERTION_MAX_SKEW_MS = 60000;
export const GATEWAY_ASSERTION_NONCE_MAX = 4096;

export interface GatewayAssertion {
  request_id: string;
  timestamp: number;
  nonce: string;
  operation: string;
  payload_hash: string;
  signature: string;
}

export type AssertionFailure =
  | "missing_assertion"
  | "invalid_assertion"
  | "stale_assertion"
  | "replayed_nonce"
  | "operation_mismatch"
  | "payload_mismatch"
  | "bad_signature";

export function canonicalPayloadHash(payloadJson: string): string {
  return sha256Hex(payloadJson);
}

export function assertionSigningMessage(assertion: {
  request_id: string;
  timestamp: number;
  nonce: string;
  operation: string;
  payload_hash: string;
}): string {
  return (
    assertion.request_id +
    "\n" +
    String(assertion.timestamp) +
    "\n" +
    assertion.nonce +
    "\n" +
    assertion.operation +
    "\n" +
    assertion.payload_hash
  );
}

export function signGatewayAssertion(
  secret: string,
  assertion: {
    request_id: string;
    timestamp: number;
    nonce: string;
    operation: string;
    payload_hash: string;
  },
): string {
  return hmacSha256Hex(secret, assertionSigningMessage(assertion));
}

export function parseGatewayAssertion(value: unknown): GatewayAssertion | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (
    typeof data.request_id !== "string" ||
    data.request_id.length === 0 ||
    data.request_id.length > 128 ||
    typeof data.timestamp !== "number" ||
    !isFinite(data.timestamp) ||
    typeof data.nonce !== "string" ||
    data.nonce.length < 16 ||
    data.nonce.length > 128 ||
    typeof data.operation !== "string" ||
    data.operation.length === 0 ||
    data.operation.length > 64 ||
    typeof data.payload_hash !== "string" ||
    data.payload_hash.length !== 64 ||
    typeof data.signature !== "string" ||
    data.signature.length !== 64
  ) {
    return null;
  }
  return {
    request_id: data.request_id,
    timestamp: data.timestamp,
    nonce: data.nonce,
    operation: data.operation,
    payload_hash: data.payload_hash,
    signature: data.signature.toLowerCase(),
  };
}

export function verifyGatewayAssertion(input: {
  assertion: GatewayAssertion;
  secret: string;
  operation: string;
  payloadJson: string;
  nowMs: number;
  seenNonce: boolean;
}): { ok: true } | { ok: false; reason: AssertionFailure } {
  if (input.secret.length === 0) {
    return { ok: false, reason: "bad_signature" };
  }
  if (input.assertion.operation !== input.operation) {
    return { ok: false, reason: "operation_mismatch" };
  }
  const skew = input.nowMs - input.assertion.timestamp;
  const abs = skew < 0 ? -skew : skew;
  if (abs > GATEWAY_ASSERTION_MAX_SKEW_MS) {
    return { ok: false, reason: "stale_assertion" };
  }
  if (input.seenNonce) {
    return { ok: false, reason: "replayed_nonce" };
  }
  const expectedHash = canonicalPayloadHash(input.payloadJson);
  if (!constantTimeEqual(expectedHash, input.assertion.payload_hash.toLowerCase())) {
    return { ok: false, reason: "payload_mismatch" };
  }
  const expectedSignature = signGatewayAssertion(input.secret, {
    request_id: input.assertion.request_id,
    timestamp: input.assertion.timestamp,
    nonce: input.assertion.nonce,
    operation: input.assertion.operation,
    payload_hash: input.assertion.payload_hash.toLowerCase(),
  });
  if (!constantTimeEqual(expectedSignature, input.assertion.signature.toLowerCase())) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}

export function isGatewayHttpInvocation(userId: string | undefined, sessionId: string | undefined): boolean {
  const hasUser = typeof userId === "string" && userId.length > 0;
  const hasSession = typeof sessionId === "string" && sessionId.length > 0;
  return !hasUser && !hasSession;
}
