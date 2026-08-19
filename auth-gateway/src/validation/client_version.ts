const SEMVER = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/;

export function parseSemver(value: string): [number, number, number] | null {
  const match = SEMVER.exec(value);
  if (match === null) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (a === null || b === null) {
    return NaN;
  }
  if (a[0] !== b[0]) {
    return a[0] - b[0];
  }
  if (a[1] !== b[1]) {
    return a[1] - b[1];
  }
  return a[2] - b[2];
}

export function evaluateClientVersion(
  clientVersion: unknown,
  minClientVersion: string,
  maxClientVersion: string,
): { ok: true } | { ok: false; reason: "missing" | "too_old" | "too_new" } {
  if (typeof clientVersion !== "string" || clientVersion.length === 0 || parseSemver(clientVersion) === null) {
    return { ok: false, reason: "missing" };
  }
  if (compareSemver(clientVersion, minClientVersion) < 0) {
    return { ok: false, reason: "too_old" };
  }
  if (compareSemver(clientVersion, maxClientVersion) > 0) {
    return { ok: false, reason: "too_new" };
  }
  return { ok: true };
}
