import { createHmac, createHash, randomBytes } from "node:crypto";

export interface GatewayAssertion {
  request_id: string;
  timestamp: number;
  nonce: string;
  operation: string;
  payload_hash: string;
  signature: string;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacSha256Hex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function signRpcEnvelope(
  secret: string,
  operation: string,
  body: { [key: string]: unknown },
  requestId: string,
  nowMs: number,
): { assertion: GatewayAssertion; envelope: { [key: string]: unknown } } {
  const payloadJson = JSON.stringify(body);
  const unsigned = {
    request_id: requestId,
    timestamp: nowMs,
    nonce: randomBytes(16).toString("hex"),
    operation: operation,
    payload_hash: sha256Hex(payloadJson),
  };
  const assertion: GatewayAssertion = {
    ...unsigned,
    signature: hmacSha256Hex(
      secret,
      unsigned.request_id + "\n" + String(unsigned.timestamp) + "\n" + unsigned.nonce + "\n" + unsigned.operation + "\n" + unsigned.payload_hash,
    ),
  };
  return { assertion: assertion, envelope: { assertion: assertion, ...body } };
}
