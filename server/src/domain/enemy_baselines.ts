import { canonicalKillXpAmount } from "./canonical_progression";

export const STANDARD_SCALING_ID = "enemy.scaling.standard";
export const ELITE_SCALING_ID = "enemy.scaling.elite";

export interface EnemyScalingProfileView {
  id: string;
  hpIntercept: number;
  hpPerLevel: number;
  damageIntercept: number;
  damagePerLevel: number;
  swingInterval: number;
  killXpIntercept: number;
  killXpPerLevel: number;
  hpMultiplier: number;
  damageMultiplier: number;
  killXpMultiplier: number;
}

export function parseEnemyScalingProfile(raw: unknown, id: string): EnemyScalingProfileView | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as { [key: string]: unknown };
  const hpIntercept = finiteNumber(row.hpIntercept);
  const hpPerLevel = finiteNumber(row.hpPerLevel);
  const damageIntercept = finiteNumber(row.damageIntercept);
  const damagePerLevel = finiteNumber(row.damagePerLevel);
  const swingInterval = finiteNumber(row.swingInterval);
  const killXpIntercept = finiteNumber(row.killXpIntercept);
  const killXpPerLevel = finiteNumber(row.killXpPerLevel);
  const hpMultiplier = finiteNumber(row.hpMultiplier);
  const damageMultiplier = finiteNumber(row.damageMultiplier);
  const killXpMultiplier = finiteNumber(row.killXpMultiplier);
  if (
    hpIntercept === null ||
    hpPerLevel === null ||
    damageIntercept === null ||
    damagePerLevel === null ||
    swingInterval === null ||
    killXpIntercept === null ||
    killXpPerLevel === null ||
    hpMultiplier === null ||
    damageMultiplier === null ||
    killXpMultiplier === null
  ) {
    return null;
  }
  return {
    id: typeof row.id === "string" && row.id.length > 0 ? row.id : id,
    hpIntercept: hpIntercept,
    hpPerLevel: hpPerLevel,
    damageIntercept: damageIntercept,
    damagePerLevel: damagePerLevel,
    swingInterval: swingInterval,
    killXpIntercept: killXpIntercept,
    killXpPerLevel: killXpPerLevel,
    hpMultiplier: hpMultiplier,
    damageMultiplier: damageMultiplier,
    killXpMultiplier: killXpMultiplier,
  };
}

export function scaledMobHp(profile: EnemyScalingProfileView, level: number): number {
  return (profile.hpIntercept + profile.hpPerLevel * clampedLevel(level)) * profile.hpMultiplier;
}

export function scaledMobDamage(profile: EnemyScalingProfileView, level: number): number {
  return (profile.damageIntercept + profile.damagePerLevel * clampedLevel(level)) * profile.damageMultiplier;
}

export function scaledMobDps(profile: EnemyScalingProfileView, level: number): number {
  const swing = profile.swingInterval > 0 ? profile.swingInterval : 1;
  return scaledMobDamage(profile, level) / swing;
}

export function scaledMobKillXp(profile: EnemyScalingProfileView, level: number): number {
  const tags = profile.killXpMultiplier > 1 ? ["elite"] : [];
  return canonicalKillXpAmount(clampedLevel(level), tags);
}

export function profileAuthoredKillXp(profile: EnemyScalingProfileView, level: number): number {
  return (profile.killXpIntercept + profile.killXpPerLevel * clampedLevel(level)) * profile.killXpMultiplier;
}

function clampedLevel(level: number): number {
  if (!(level >= 1) || !isFinite(level)) {
    return 1;
  }
  return Math.floor(level);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !isFinite(value)) {
    return null;
  }
  return value;
}
