export function selectCanonicalMatchId(matchIds: string[]): string {
  if (matchIds.length === 0) {
    throw new Error("internal_error");
  }
  const copy = matchIds.slice();
  copy.sort();
  return copy[0];
}

export function resolveStarterMatchId(
  listedIds: string[],
  storedId: string | null,
  storedIsRunning: boolean,
  createdId: string | null,
): string {
  if (storedIsRunning && storedId !== null && storedId.length > 0) {
    return storedId;
  }
  if (listedIds.length > 0) {
    return selectCanonicalMatchId(listedIds);
  }
  if (createdId !== null && createdId.length > 0) {
    return createdId;
  }
  throw new Error("internal_error");
}
