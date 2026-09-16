export function compactCharacterId(characterId: string): string {
  return characterId.replace(/-/g, "").toLowerCase();
}

export function scopedPlayerKey(base: string, characterId: string): string {
  return base + "_" + compactCharacterId(characterId);
}

export function storageKey(base: string, characterId?: string): string {
  if (characterId === undefined || characterId.length === 0) {
    return base;
  }
  return scopedPlayerKey(base, characterId);
}

export function nameReservationKey(canonicalName: string): string {
  let encoded = "n_";
  for (let i = 0; i < canonicalName.length; i++) {
    const ch = canonicalName.charAt(i);
    const code = ch.charCodeAt(0);
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      encoded += ch;
      continue;
    }
    encoded += "_" + code.toString(16);
  }
  return encoded;
}
