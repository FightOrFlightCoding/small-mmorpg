/** Domain RPC failures must be thrown as strings. Nakama serializes `Error` objects with stack traces. */

const SAFE_CODE = /^[a-z][a-z0-9_.:-]*$/i;

const KNOWN_EMBEDDED_CODES = [
  "email_verification_required",
  "account_disabled",
  "account_deleting",
  "account_deleted",
  "unauthenticated",
  "server_maintenance",
  "registration_disabled",
  "device_auth_disabled",
  "gateway_rpc_forbidden",
];

function rawFailureText(error: unknown): string {
  if (typeof error === "string") {
    return error.trim();
  }
  if (error instanceof Error) {
    return error.message.trim();
  }
  return "";
}

function firstLineCode(raw: string): string {
  const firstLine = raw.split(/\r?\n/, 2)[0].replace(/^error:\s*/i, "").trim();
  if (firstLine.length > 0 && firstLine.length <= 80 && SAFE_CODE.test(firstLine)) {
    return firstLine;
  }
  return "";
}

function embeddedKnownCode(raw: string): string {
  const lowered = raw.toLowerCase();
  let best = "";
  for (let i = 0; i < KNOWN_EMBEDDED_CODES.length; i++) {
    const code = KNOWN_EMBEDDED_CODES[i];
    if (lowered.indexOf(code) !== -1 && code.length > best.length) {
      best = code;
    }
  }
  return best;
}

export function rpcFailureCode(error: unknown): string {
  const raw = rawFailureText(error);
  if (raw.length === 0) {
    return "internal_error";
  }
  const first = firstLineCode(raw);
  if (first.length > 0) {
    return first;
  }
  const embedded = embeddedKnownCode(raw);
  if (embedded.length > 0) {
    return embedded;
  }
  return "internal_error";
}

export function throwRpcFailure(error: unknown): never {
  throw rpcFailureCode(error);
}

/** RPC adapters must return this JSON instead of throwing. Nakama attaches a stack to every thrown value. */
export function rpcFailurePayload(error: unknown): string {
  return JSON.stringify({ ok: false, code: rpcFailureCode(error) });
}
