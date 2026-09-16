export type RegistrationMode = "OPEN" | "INVITE_ONLY" | "CLOSED";

export function parseRegistrationMode(raw: string): RegistrationMode {
  const upper = raw.trim().toUpperCase();
  if (upper === "OPEN" || upper === "INVITE_ONLY" || upper === "CLOSED") {
    return upper;
  }
  return "OPEN";
}

export function parseAllowlist(raw: string, canonicalize: (email: unknown) => { ok: true; canonical: string } | { ok: false }): string[] {
  if (raw.length === 0) {
    return [];
  }
  const parts = raw.split(",");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const parsed = canonicalize(parts[i].trim());
    if (parsed.ok && out.indexOf(parsed.canonical) === -1) {
      out.push(parsed.canonical);
    }
  }
  return out;
}

export function evaluateRegistrationAccess(
  mode: RegistrationMode,
  canonicalEmail: string,
  allowlist: string[],
): { ok: true } | { ok: false; code: "AUTH_REGISTRATION_CLOSED" } {
  if (mode === "CLOSED") {
    return { ok: false, code: "AUTH_REGISTRATION_CLOSED" };
  }
  if (mode === "INVITE_ONLY") {
    if (allowlist.indexOf(canonicalEmail) === -1) {
      return { ok: false, code: "AUTH_REGISTRATION_CLOSED" };
    }
  }
  return { ok: true };
}

export function evaluateLegalAcceptance(input: {
  acceptedTermsVersion: unknown;
  acceptedPrivacyVersion: unknown;
  currentTermsVersion: string;
  currentPrivacyVersion: string;
}): { ok: true } | { ok: false; fieldErrors: { [field: string]: string } } {
  const fieldErrors: { [field: string]: string } = {};
  if (input.acceptedTermsVersion !== input.currentTermsVersion) {
    fieldErrors.accepted_terms_version = "required";
  }
  if (input.acceptedPrivacyVersion !== input.currentPrivacyVersion) {
    fieldErrors.accepted_privacy_version = "required";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors: fieldErrors };
  }
  return { ok: true };
}

export function generateInternalUsername(randomHex: () => string): string {
  const hex = randomHex().toLowerCase().replace(/[^0-9a-f]/g, "");
  return "u" + (hex + "00000000000000000000000000000000").slice(0, 32);
}
