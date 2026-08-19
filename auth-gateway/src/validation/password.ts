export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 128;

const COMMON_PASSWORDS = [
  "passwordpassword",
  "password1234567",
  "123456789012345",
  "qwertyuiopasdfg",
  "letmeinletmein1",
  "iloveyouiloveyou",
  "adminadminadmin",
  "welcome welcome1",
  "footballfootball",
  "monkeymonkeymon",
];

export function validatePassword(raw: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof raw !== "string") {
    return { ok: false, reason: "password_required" };
  }
  if (raw.length < PASSWORD_MIN) {
    return { ok: false, reason: "password_too_short" };
  }
  if (raw.length > PASSWORD_MAX) {
    return { ok: false, reason: "password_too_long" };
  }
  const lowered = raw.toLowerCase();
  for (let i = 0; i < COMMON_PASSWORDS.length; i++) {
    if (lowered === COMMON_PASSWORDS[i]) {
      return { ok: false, reason: "password_common" };
    }
  }
  return { ok: true };
}
