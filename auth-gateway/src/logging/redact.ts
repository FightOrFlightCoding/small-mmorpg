const SECRET_KEYS = [
  "password",
  "new_password",
  "reset_challenge",
  "token",
  "refresh_token",
  "authorization",
  "code",
  "secret",
  "support_key",
  "signature",
  "api_key",
  "apikey",
  "nakama_server_key",
  "nakama_http_key",
  "sendgrid_api_key",
  "pepper",
];

export function redactValue(key: string, value: unknown): unknown {
  const lowered = key.toLowerCase();
  for (let i = 0; i < SECRET_KEYS.length; i++) {
    if (lowered.indexOf(SECRET_KEYS[i]) !== -1) {
      return "[redacted]";
    }
  }
  if (typeof value === "string") {
    return redactText(value);
  }
  return value;
}

export function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
}

export function redactObject(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item));
  }
  if (typeof value !== "object") {
    return typeof value === "string" ? redactText(value) : value;
  }
  const input = value as { [key: string]: unknown };
  const out: { [key: string]: unknown } = {};
  const keys = Object.keys(input);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = redactValue(keys[i], redactObject(input[keys[i]]));
  }
  return out;
}

export function createGatewayLogger(enabled = true): {
  info: (event: string, fields?: { [key: string]: unknown }) => void;
  warn: (event: string, fields?: { [key: string]: unknown }) => void;
  error: (event: string, fields?: { [key: string]: unknown }) => void;
  lines: string[];
} {
  const lines: string[] = [];
  function write(level: string, event: string, fields?: { [key: string]: unknown }): void {
    const record = redactObject({ level: level, event: event, ...(fields !== undefined ? fields : {}) });
    const line = JSON.stringify(record);
    lines.push(line);
    if (enabled) {
      process.stdout.write(line + "\n");
    }
  }
  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    lines: lines,
  };
}

export type GatewayLogger = ReturnType<typeof createGatewayLogger>;
