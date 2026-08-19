export const EMAIL_MAX_LENGTH = 254;

export type CanonicalEmail =
  | { ok: true; canonical: string; display: string }
  | { ok: false; reason: "invalid_email" };

export function trimEmail(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end) {
    const code = raw.charCodeAt(start);
    if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
      break;
    }
    start += 1;
  }
  while (end > start) {
    const code = raw.charCodeAt(end - 1);
    if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
      break;
    }
    end -= 1;
  }
  return raw.substring(start, end);
}

export function hasBasicEmailSyntax(trimmed: string): boolean {
  if (trimmed.length === 0 || trimmed.length > EMAIL_MAX_LENGTH) {
    return false;
  }
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    return false;
  }
  const local = trimmed.substring(0, at);
  const domain = trimmed.substring(at + 1);
  if (local.length === 0 || domain.length === 0) {
    return false;
  }
  if (domain.indexOf(".") <= 0 || domain.charAt(domain.length - 1) === ".") {
    return false;
  }
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code <= 32 || code === 127) {
      return false;
    }
  }
  return true;
}

export function canonicalizeEmail(raw: unknown): CanonicalEmail {
  if (typeof raw !== "string") {
    return { ok: false, reason: "invalid_email" };
  }
  const display = trimEmail(raw);
  if (!hasBasicEmailSyntax(display)) {
    return { ok: false, reason: "invalid_email" };
  }
  return { ok: true, canonical: display.toLowerCase(), display: display };
}
