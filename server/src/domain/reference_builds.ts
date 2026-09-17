import { CANONICAL_FREE_POINTS_PER_LEVEL, CANONICAL_LEVEL_CAP, CANONICAL_STAT_IDS } from "./canonical_progression";
import { allocateFreeStatBatch } from "./canonical_leveling";
import type { CharacterProgression } from "./progression";
import type { ProgressionCatalog } from "./stats";

export const REFERENCE_FREE_POINTS = CANONICAL_FREE_POINTS_PER_LEVEL * (CANONICAL_LEVEL_CAP - 1);

export interface ReferenceBuildView {
  id: string;
  displayName: string;
  branchId: string;
  statPriority: string[];
  pairedNodeIds: string[];
}

export function parseReferenceBuild(raw: unknown, id: string): ReferenceBuildView | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as { [key: string]: unknown };
  const branchId = typeof row.branchId === "string" ? row.branchId : "";
  const priority = stringList(row.statPriority);
  if (branchId.length === 0 || priority.length === 0) {
    return null;
  }
  for (let i = 0; i < priority.length; i++) {
    if (CANONICAL_STAT_IDS.indexOf(priority[i] as (typeof CANONICAL_STAT_IDS)[number]) < 0) {
      return null;
    }
  }
  return {
    id: typeof row.id === "string" && row.id.length > 0 ? row.id : id,
    displayName: typeof row.displayName === "string" ? row.displayName : id,
    branchId: branchId,
    statPriority: priority,
    pairedNodeIds: stringList(row.pairedNodeIds),
  };
}

export function allocationsFromPriority(
  priority: ReadonlyArray<string>,
  points: number,
): Array<{ statId: string; amount: number }> {
  const amounts: { [id: string]: number } = {};
  const total = points > 0 && isFinite(points) ? Math.floor(points) : 0;
  if (priority.length === 0 || total <= 0) {
    return [];
  }
  for (let i = 0; i < total; i++) {
    const id = priority[i % priority.length];
    amounts[id] = (amounts[id] !== undefined ? amounts[id] : 0) + 1;
  }
  const entries: Array<{ statId: string; amount: number }> = [];
  for (let i = 0; i < priority.length; i++) {
    const id = priority[i];
    if (amounts[id] !== undefined && amounts[id] > 0) {
      entries.push({ statId: id, amount: amounts[id] });
      amounts[id] = 0;
    }
  }
  return entries;
}

export function allocateReferenceBuild(
  progression: CharacterProgression,
  build: ReferenceBuildView,
  points: number = REFERENCE_FREE_POINTS,
): { ok: boolean; code: string } {
  return allocateFreeStatBatch(progression, allocationsFromPriority(build.statPriority, points));
}

export function referenceBuildPriorityResolves(catalog: ProgressionCatalog, build: ReferenceBuildView): boolean {
  if (catalog.branches[build.branchId] === undefined) {
    return false;
  }
  for (let i = 0; i < build.pairedNodeIds.length; i++) {
    if (catalog.talentNodes[build.pairedNodeIds[i]] === undefined) {
      return false;
    }
  }
  return true;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] === "string" && value[i].length > 0) {
      out.push(value[i]);
    }
  }
  return out;
}
