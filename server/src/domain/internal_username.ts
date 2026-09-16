const USERNAME_HEX_LENGTH = 32;

export function generateInternalUsername(randomHex: () => string): string {
  const hex = randomHex().toLowerCase().replace(/[^0-9a-f]/g, "");
  const padded = (hex + "00000000000000000000000000000000").slice(0, USERNAME_HEX_LENGTH);
  return "u" + padded;
}

export function usernameLooksEmailDerived(username: string, email: string): boolean {
  if (username.length === 0 || email.length === 0) {
    return false;
  }
  const local = email.split("@")[0].toLowerCase();
  const cleaned = username.toLowerCase();
  return local.length >= 3 && cleaned.indexOf(local) !== -1;
}
