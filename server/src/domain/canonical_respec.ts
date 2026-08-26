import { pendingBranchSelection } from "./canonical_leveling";
import { respecGoldCost } from "./canonical_progression";
import { distance, findNpc, type InteractionNpc } from "./interaction";
import { findNpcService, NPC_SERVICE_RESPEC, type NpcDefinition } from "./npc";
import type { CharacterProgression } from "./progression";
import type { ProgressionCatalog } from "./stats";

export { NPC_SERVICE_RESPEC };
export const RESPEC_TRAINER_NPC_IDS = ["npc.test_innkeeper", "npc.lab_trainer"];

export interface RespecSnapshot {
  characterId: string;
  level: number;
  goldCost: number;
  previousBranch: string;
  previousAllocations: { [statId: string]: number };
  previousClassNodes: string[];
  previousBranchRanks: { [nodeId: string]: number };
  requestId: string;
  trainerId: string;
  timestamp: number;
}

export interface CanonicalRespecResult {
  ok: boolean;
  code: string;
  goldCost: number;
  snapshot: RespecSnapshot;
}

export function applyCanonicalRespec(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
  characterId: string,
  requestId: string,
  trainerId: string,
  timestamp: number,
): CanonicalRespecResult {
  const snapshot: RespecSnapshot = {
    characterId: characterId,
    level: progression.level,
    goldCost: respecGoldCost(progression.level),
    previousBranch: progression.branchId,
    previousAllocations: copyAmounts(progression.freeStatAllocations),
    previousClassNodes: copyIds(progression.purchasedClassNodeIds),
    previousBranchRanks: copyAmounts(progression.purchasedBranchNodeRanks),
    requestId: requestId,
    trainerId: trainerId,
    timestamp: timestamp,
  };
  const classDef = catalog.classes[classId];
  const remove = grantedAbilityIds(
    catalog,
    progression.branchId,
    progression.purchasedClassNodeIds,
    progression.purchasedBranchNodeRanks,
  );
  const basicAbilityId = progression.level >= 2 ? classDef?.basicAbilityId : undefined;
  progression.freeStatAllocations = {};
  progression.purchasedClassNodeIds = [];
  progression.purchasedBranchNodeRanks = {};
  progression.branchId = "";
  progression.unlockedAbilityIds = keepOwnedAbilities(progression.unlockedAbilityIds, basicAbilityId, remove);
  progression.hotbarAssignments = filterHotbar(progression.hotbarAssignments, progression.unlockedAbilityIds);
  if (progression.hotbar !== undefined) {
    progression.hotbar = filterHotbar(progression.hotbar, progression.unlockedAbilityIds);
  }
  return {
    ok: true,
    code: "ok",
    goldCost: snapshot.goldCost,
    snapshot: snapshot,
  };
}

export function pendingBranchGuidance(level: number, branchId: string): boolean {
  return pendingBranchSelection(level, branchId);
}

export function evaluateTrainerNpc(input: {
  playerX: number;
  playerY: number;
  npcId: string;
  npcs: ReadonlyArray<InteractionNpc>;
  interactionRange: number;
  npcById: { [id: string]: NpcDefinition };
}): { ok: boolean; code: string } {
  const npc = findNpc(input.npcs, input.npcId);
  if (npc === null) {
    return { ok: false, code: "invalid_target" };
  }
  const range = npc.interactionRange !== undefined ? npc.interactionRange : input.interactionRange;
  if (distance(input.playerX, input.playerY, npc.x, npc.y) > range) {
    return { ok: false, code: "out_of_range" };
  }
  const service = findNpcService(input.npcById[npc.npcId], NPC_SERVICE_RESPEC);
  if (service === null) {
    return { ok: false, code: "invalid_service" };
  }
  return { ok: true, code: "ok" };
}

export function respecAuditMetadata(snapshot: RespecSnapshot): { [key: string]: unknown } {
  return {
    character_id: snapshot.characterId,
    level: snapshot.level,
    gold_cost: snapshot.goldCost,
    previous_branch: snapshot.previousBranch,
    previous_allocations: snapshot.previousAllocations,
    previous_nodes: {
      classNodeIds: snapshot.previousClassNodes,
      branchNodeRanks: snapshot.previousBranchRanks,
    },
    request_id: snapshot.requestId,
    trainer_id: snapshot.trainerId,
    timestamp: snapshot.timestamp,
  };
}

function grantedAbilityIds(
  catalog: ProgressionCatalog,
  branchId: string,
  classNodes: ReadonlyArray<string>,
  branchRanks: { [nodeId: string]: number },
): { [abilityId: string]: boolean } {
  const remove: { [abilityId: string]: boolean } = {};
  const branch = branchId.length > 0 ? catalog.branches[branchId] : undefined;
  if (branch !== undefined) {
    mark(remove, branch.signatureAbilityId);
    mark(remove, branch.capstoneAbilityId);
  }
  const grants = catalog.talentGrants !== undefined ? catalog.talentGrants : {};
  for (let i = 0; i < classNodes.length; i++) {
    addNodeGrants(remove, grants[classNodes[i]]);
  }
  const nodeIds = Object.keys(branchRanks);
  for (let i = 0; i < nodeIds.length; i++) {
    if (numberOr(branchRanks[nodeIds[i]], 0) > 0) {
      addNodeGrants(remove, grants[nodeIds[i]]);
    }
  }
  return remove;
}

function addNodeGrants(
  remove: { [abilityId: string]: boolean },
  grant: { grantsActiveAbilityId?: string; rankReplacementAbilityId?: string } | undefined,
): void {
  if (grant === undefined) {
    return;
  }
  mark(remove, grant.grantsActiveAbilityId);
  mark(remove, grant.rankReplacementAbilityId);
}

function keepOwnedAbilities(
  unlocked: ReadonlyArray<string>,
  basicAbilityId: string | undefined,
  remove: { [abilityId: string]: boolean },
): string[] {
  const kept: string[] = [];
  const basic = basicAbilityId !== undefined ? basicAbilityId : "";
  for (let i = 0; i < unlocked.length; i++) {
    const id = unlocked[i];
    if (id === basic) {
      if (kept.indexOf(id) === -1) {
        kept.push(id);
      }
      continue;
    }
    if (remove[id] === true) {
      continue;
    }
    kept.push(id);
  }
  if (basic.length > 0 && kept.indexOf(basic) === -1) {
    kept.unshift(basic);
  }
  return kept;
}

function filterHotbar(hotbar: ReadonlyArray<string>, unlocked: ReadonlyArray<string>): string[] {
  const next: string[] = [];
  for (let i = 0; i < hotbar.length; i++) {
    const id = hotbar[i];
    if (id.length === 0) {
      next.push("");
      continue;
    }
    if (unlocked.indexOf(id) >= 0) {
      next.push(id);
    } else {
      next.push("");
    }
  }
  return next;
}

function mark(map: { [id: string]: boolean }, id: string | undefined): void {
  if (id !== undefined && id.length > 0) {
    map[id] = true;
  }
}

function copyAmounts(source: { [id: string]: number } | undefined): { [id: string]: number } {
  const out: { [id: string]: number } = {};
  if (source === undefined) {
    return out;
  }
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const value = source[keys[i]];
    if (typeof value === "number" && isFinite(value) && value !== 0) {
      out[keys[i]] = value;
    }
  }
  return out;
}

function copyIds(values: ReadonlyArray<string> | undefined): string[] {
  const list: string[] = [];
  if (values === undefined) {
    return list;
  }
  for (let i = 0; i < values.length; i++) {
    list.push(values[i]);
  }
  return list;
}

function numberOr(value: number | undefined, fallback: number): number {
  if (value === undefined || !isFinite(value)) {
    return fallback;
  }
  return value;
}
