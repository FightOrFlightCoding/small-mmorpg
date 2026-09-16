export const EMAIL_MAX_LENGTH = 254;

export type CanonicalEmail =
  | { ok: true; canonical: string; display: string }
  | { ok: false; reason: "invalid_email" };

export function canonicalizeEmail(raw: unknown): CanonicalEmail {
  if (typeof raw !== "string") {
    return { ok: false, reason: "invalid_email" };
  }
  const display = raw.replace(/^[\s\t\r\n]+|[\s\t\r\n]+$/g, "");
  if (display.length === 0 || display.length > EMAIL_MAX_LENGTH) {
    return { ok: false, reason: "invalid_email" };
  }
  const at = display.indexOf("@");
  if (at <= 0 || at !== display.lastIndexOf("@") || at === display.length - 1) {
    return { ok: false, reason: "invalid_email" };
  }
  const domain = display.substring(at + 1);
  if (domain.indexOf(".") <= 0 || domain.charAt(domain.length - 1) === ".") {
    return { ok: false, reason: "invalid_email" };
  }
  for (let i = 0; i < display.length; i++) {
    if (display.charCodeAt(i) <= 32 || display.charCodeAt(i) === 127) {
      return { ok: false, reason: "invalid_email" };
    }
  }
  return { ok: true, canonical: display.toLowerCase(), display: display };
}
