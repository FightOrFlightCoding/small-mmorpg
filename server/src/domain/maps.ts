/** Nakama JSON-roundtrips match state; empty objects can arrive as null. */

export function dict<T>(value: { [key: string]: T } | null | undefined): { [key: string]: T } {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

export function cloneTickMap(
  ticks: { [requestId: string]: number } | null | undefined,
): { [requestId: string]: number } | undefined {
  if (ticks === null || ticks === undefined || typeof ticks !== "object" || Array.isArray(ticks)) {
    return undefined;
  }
  const copy: { [requestId: string]: number } = {};
  const keys = Object.keys(ticks);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = ticks[keys[i]];
  }
  return copy;
}
