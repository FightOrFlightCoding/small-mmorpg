const META_KEYS = ["schemaVersion", "developmentOnly"];

export function isDevelopmentOnly(data: Record<string, unknown>): boolean {
  return data["developmentOnly"] === true;
}

export function definitionSchemaVersion(data: Record<string, unknown>, fallback: number): number {
  const value = data["schemaVersion"];
  if (typeof value === "number" && isFinite(value) && value >= 1) {
    return value;
  }
  return fallback;
}

export function stripDefinitionMeta(data: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (META_KEYS.indexOf(key) !== -1) {
      continue;
    }
    copy[key] = data[key];
  }
  return copy;
}
