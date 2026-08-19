export interface ErrorEnvelope {
  ok: false;
  code: string;
  message_key: string;
  request_id: string;
  retry_after_seconds: number;
  field_errors: { [field: string]: string };
}

export interface OkEnvelope {
  ok: true;
  request_id: string;
  [key: string]: unknown;
}

export function errorEnvelope(input: {
  code: string;
  messageKey: string;
  requestId: string;
  retryAfterSeconds?: number;
  fieldErrors?: { [field: string]: string };
}): ErrorEnvelope {
  return {
    ok: false,
    code: input.code,
    message_key: input.messageKey,
    request_id: input.requestId,
    retry_after_seconds: input.retryAfterSeconds !== undefined ? input.retryAfterSeconds : 0,
    field_errors: input.fieldErrors !== undefined ? input.fieldErrors : {},
  };
}

export function httpStatusForCode(code: string): number {
  if (code === "AUTH_INVALID_JSON" || code === "AUTH_VALIDATION") {
    return 400;
  }
  if (code === "AUTH_INVALID_CREDENTIALS" || code === "AUTH_INVALID_CHALLENGE") {
    return 401;
  }
  if (code === "AUTH_FORBIDDEN") {
    return 403;
  }
  if (code === "AUTH_EMAIL_TAKEN") {
    return 409;
  }
  if (code === "AUTH_PAYLOAD_TOO_LARGE") {
    return 413;
  }
  if (code === "AUTH_RATE_LIMITED") {
    return 429;
  }
  if (code === "AUTH_CONFIG") {
    return 500;
  }
  if (code === "AUTH_UNAVAILABLE") {
    return 503;
  }
  return 400;
}
