import {
  CANONICAL_HOTBAR_SIZE,
  CANONICAL_LEVEL_CAP,
  CANONICAL_MAX_CLASS_NODES,
  CANONICAL_MAX_OWNED_ACTIVES,
  FRENZY_ABILITY_ID,
  usesCanonicalCreateState,
} from "./canonical_progression";
import type { CharacterProgression } from "./progression";
import type { ProgressionCatalog, TalentNodeContent, TalentTreeContent } from "./stats";

export const ABILITY_CATEGORY_PASSIVE = "passive";

export interface TalentPurchaseInput {
  treeId: string;
  nodeId: string;
  requestedRank: number;
  requestId: string;
}

export interface TalentPurchaseResult {
  ok: boolean;
  code: string;
  events: Array<{ type: string; abilityId?: string }>;
}

export interface CanonicalHotbarResult {
  ok: boolean;
  code: string;
}

export function emptyCanonicalHotbar(): string[] {
  const slots: string[] = [];
  for (let i = 0; i < CANONICAL_HOTBAR_SIZE; i++) {
    slots.push("");
  }
  return slots;
}

export function usesCanonicalTalentRuntime(catalog: ProgressionCatalog, classId: string): boolean {
  const classDef = catalog.classes[classId];
  return usesCanonicalCreateState(classDef !== undefined ? classDef.autoAttackId : undefined);
}

export function nodeRank(
  purchasedClassNodeIds: ReadonlyArray<string>,
  purchasedBranchNodeRanks: { [nodeId: string]: number },
  nodeId: string,
): number {
  if (purchasedClassNodeIds.indexOf(nodeId) >= 0) {
    return 1;
  }
  const rank = purchasedBranchNodeRanks[nodeId];
  if (typeof rank === "number" && isFinite(rank) && rank > 0) {
    return Math.floor(rank);
  }
  return 0;
}

export function derivedOwnedAbilityIds(
  catalog: ProgressionCatalog,
  classId: string,
  level: number,
  branchId: string,
  purchasedClassNodeIds: ReadonlyArray<string>,
  purchasedBranchNodeRanks: { [nodeId: string]: number },
): string[] {
  const owned: string[] = [];
  const classDef = catalog.classes[classId];
  if (classDef === undefined) {
    return owned;
  }
  if (level >= 2 && classDef.basicAbilityId !== undefined && classDef.basicAbilityId.length > 0) {
    pushUnique(owned, classDef.basicAbilityId);
  }
  const branch = branchId.length > 0 ? catalog.branches[branchId] : undefined;
  if (branch !== undefined) {
    if (level >= 5 && branch.signatureAbilityId.length > 0) {
      pushUnique(owned, branch.signatureAbilityId);
    }
    if (level >= CANONICAL_LEVEL_CAP && branch.capstoneAbilityId.length > 0) {
      pushUnique(owned, branch.capstoneAbilityId);
    }
  }
  addNodeAbilityGrants(owned, catalog, purchasedClassNodeIds, {});
  addNodeAbilityGrants(owned, catalog, Object.keys(purchasedBranchNodeRanks), purchasedBranchNodeRanks);
  return owned;
}

export function isCanonicalActiveAbility(
  catalog: ProgressionCatalog,
  abilityId: string,
  classId: string,
): boolean {
  if (abilityId.length === 0 || abilityId === FRENZY_ABILITY_ID) {
    return false;
  }
  const classDef = catalog.classes[classId];
  if (classDef !== undefined && classDef.autoAttackId === abilityId) {
    return false;
  }
  const meta = catalog.abilities[abilityId];
  if (meta === undefined) {
    return true;
  }
  return meta.category !== ABILITY_CATEGORY_PASSIVE;
}

export function ownedActiveAbilityIds(
  catalog: ProgressionCatalog,
  classId: string,
  ownedIds: ReadonlyArray<string>,
): string[] {
  const actives: string[] = [];
  for (let i = 0; i < ownedIds.length; i++) {
    const id = ownedIds[i];
    if (isCanonicalActiveAbility(catalog, id, classId)) {
      pushUnique(actives, id);
    }
  }
  return actives;
}

export function countOwnedActives(
  catalog: ProgressionCatalog,
  classId: string,
  level: number,
  branchId: string,
  purchasedClassNodeIds: ReadonlyArray<string>,
  purchasedBranchNodeRanks: { [nodeId: string]: number },
): number {
  const owned = derivedOwnedAbilityIds(
    catalog,
    classId,
    level,
    branchId,
    purchasedClassNodeIds,
    purchasedBranchNodeRanks,
  );
  return ownedActiveAbilityIds(catalog, classId, owned).length;
}

export function syncDerivedAbilityOwnership(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
): boolean {
  if (!usesCanonicalTalentRuntime(catalog, classId)) {
    return false;
  }
  const owned = derivedOwnedAbilityIds(
    catalog,
    classId,
    progression.level,
    progression.branchId,
    progression.purchasedClassNodeIds,
    progression.purchasedBranchNodeRanks,
  );
  let changed = !sameIdList(progression.unlockedAbilityIds, owned);
  progression.unlockedAbilityIds = copyIds(owned);
  const nextHotbar = sanitizeCanonicalHotbar(
    catalog,
    classId,
    owned,
    progression.hotbarAssignments,
  );
  if (!sameIdList(progression.hotbarAssignments, nextHotbar)) {
    changed = true;
  }
  progression.hotbarAssignments = nextHotbar;
  return changed;
}

export function applyCanonicalTalentPurchase(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
  input: TalentPurchaseInput,
): TalentPurchaseResult {
  const events: Array<{ type: string; abilityId?: string }> = [];
  if (!usesCanonicalTalentRuntime(catalog, classId)) {
    return { ok: false, code: "unsupported_class", events: events };
  }
  const tree = catalog.talentTrees[input.treeId];
  const node = catalog.talentNodes[input.nodeId];
  if (tree === undefined) {
    return { ok: false, code: "invalid_tree", events: events };
  }
  if (node === undefined || node.treeId !== tree.id || tree.nodeIds.indexOf(node.id) < 0) {
    return { ok: false, code: "invalid_id", events: events };
  }
  if (!(input.requestedRank > 0) || input.requestedRank !== Math.floor(input.requestedRank) || !isFinite(input.requestedRank)) {
    return { ok: false, code: "invalid_rank", events: events };
  }
  if (input.requestedRank > node.maxRank) {
    return { ok: false, code: "invalid_rank", events: events };
  }
  const classDef = catalog.classes[classId];
  if (classDef === undefined) {
    return { ok: false, code: "unsupported_class", events: events };
  }
  if (tree.treeKind === "class") {
    if (tree.ownerId !== classId || (classDef.classTreeId !== undefined && classDef.classTreeId !== tree.id)) {
      return { ok: false, code: "class_restricted", events: events };
    }
  } else {
    if (progression.branchId.length === 0) {
      return { ok: false, code: "branch_locked", events: events };
    }
    const branch = catalog.branches[progression.branchId];
    if (branch === undefined || tree.ownerId !== progression.branchId) {
      return { ok: false, code: "invalid_branch", events: events };
    }
    if (branch.branchTreeId !== undefined && branch.branchTreeId !== tree.id) {
      return { ok: false, code: "invalid_tree", events: events };
    }
    if (branch.classId !== classId) {
      return { ok: false, code: "class_restricted", events: events };
    }
  }
  const current = nodeRank(progression.purchasedClassNodeIds, progression.purchasedBranchNodeRanks, node.id);
  if (input.requestedRank <= current) {
    return { ok: false, code: "already_unlocked", events: events };
  }
  if (input.requestedRank !== current + 1) {
    return { ok: false, code: "invalid_rank", events: events };
  }
  const delta = node.pointCostPerRank * (input.requestedRank - current);
  if (tree.treeKind === "class") {
    if (progression.purchasedClassNodeIds.length >= CANONICAL_MAX_CLASS_NODES) {
      return { ok: false, code: "insufficient_points", events: events };
    }
    const earned = classPointsAvailable(progression.level);
    const spent = progression.purchasedClassNodeIds.length;
    if (spent + delta > earned) {
      return { ok: false, code: "insufficient_points", events: events };
    }
  } else {
    const earned = branchPointsAvailable(progression.level);
    const spent = spentBranchRanks(progression.purchasedBranchNodeRanks);
    if (spent + delta > earned) {
      return { ok: false, code: "insufficient_points", events: events };
    }
  }
  const gate = evaluateTierGate(tree, node.tier, progression.level, spentInTree(tree, progression));
  if (!gate.ok) {
    return { ok: false, code: gate.code, events: events };
  }
  if (!prerequisitesMet(node, progression.purchasedClassNodeIds, progression.purchasedBranchNodeRanks)) {
    return { ok: false, code: "prerequisite_missing", events: events };
  }
  const nextClass = copyIds(progression.purchasedClassNodeIds);
  const nextBranch = copyAmounts(progression.purchasedBranchNodeRanks);
  if (tree.treeKind === "class") {
    nextClass.push(node.id);
  } else {
    nextBranch[node.id] = input.requestedRank;
  }
  if (wouldExceedBuyableActives(catalog, tree, node, nextBranch)) {
    return { ok: false, code: "active_ceiling", events: events };
  }
  const projectedActives = countOwnedActives(
    catalog,
    classId,
    progression.level,
    progression.branchId,
    nextClass,
    nextBranch,
  );
  if (projectedActives > CANONICAL_MAX_OWNED_ACTIVES) {
    return { ok: false, code: "active_ceiling", events: events };
  }
  progression.purchasedClassNodeIds = nextClass;
  progression.purchasedBranchNodeRanks = nextBranch;
  syncDerivedAbilityOwnership(progression, catalog, classId);
  if (node.grantsActiveAbilityId !== undefined && node.grantsActiveAbilityId.length > 0) {
    events.push({ type: "talent_active_unlocked", abilityId: node.grantsActiveAbilityId });
  }
  return { ok: true, code: "ok", events: events };
}

export function assignCanonicalHotbar(
  progression: CharacterProgression,
  catalog: ProgressionCatalog,
  classId: string,
  slotIndex: number,
  abilityId: string,
): CanonicalHotbarResult {
  if (!usesCanonicalTalentRuntime(catalog, classId)) {
    return { ok: false, code: "unsupported_class" };
  }
  if (slotIndex < 0 || slotIndex >= CANONICAL_HOTBAR_SIZE || slotIndex !== Math.floor(slotIndex)) {
    return { ok: false, code: "invalid_slot" };
  }
  syncDerivedAbilityOwnership(progression, catalog, classId);
  const slots = padCanonicalHotbar(progression.hotbarAssignments);
  if (abilityId.length === 0) {
    slots[slotIndex] = "";
    progression.hotbarAssignments = slots;
    return { ok: true, code: "ok" };
  }
  if (progression.unlockedAbilityIds.indexOf(abilityId) < 0) {
    return { ok: false, code: "ability_locked" };
  }
  if (!isCanonicalActiveAbility(catalog, abilityId, classId)) {
    return { ok: false, code: "ability_passive" };
  }
  for (let i = 0; i < slots.length; i++) {
    if (i !== slotIndex && slots[i] === abilityId) {
      return { ok: false, code: "duplicate_hotbar" };
    }
  }
  slots[slotIndex] = abilityId;
  progression.hotbarAssignments = slots;
  return { ok: true, code: "ok" };
}

export function publicCanonicalHotbar(progression: CharacterProgression): string[] {
  return padCanonicalHotbar(progression.hotbarAssignments);
}

function classPointsAvailable(level: number): number {
  if (level < 3) {
    return 0;
  }
  if (level === 3) {
    return 1;
  }
  return 2;
}

function branchPointsAvailable(level: number): number {
  if (level < 5) {
    return 0;
  }
  const earned = level - 4;
  return earned > 6 ? 6 : earned;
}

function spentBranchRanks(ranks: { [nodeId: string]: number }): number {
  let spent = 0;
  const keys = Object.keys(ranks);
  for (let i = 0; i < keys.length; i++) {
    const rank = ranks[keys[i]];
    if (typeof rank === "number" && isFinite(rank) && rank > 0) {
      spent += rank;
    }
  }
  return spent;
}

function spentInTree(tree: TalentTreeContent, progression: CharacterProgression): number {
  if (tree.treeKind === "class") {
    return progression.purchasedClassNodeIds.length;
  }
  let spent = 0;
  for (let i = 0; i < tree.nodeIds.length; i++) {
    spent += nodeRank(progression.purchasedClassNodeIds, progression.purchasedBranchNodeRanks, tree.nodeIds[i]);
  }
  return spent;
}

function evaluateTierGate(
  tree: TalentTreeContent,
  tier: number,
  level: number,
  spentBeforePurchase: number,
): { ok: boolean; code: string } {
  if (tree.treeKind === "class") {
    return { ok: true, code: "ok" };
  }
  let minPoints = 0;
  let minLevel = 0;
  if (tier <= 1) {
    minPoints = 0;
    minLevel = 5;
  } else if (tier === 2) {
    minPoints = 2;
  } else {
    minPoints = 4;
    minLevel = 9;
  }
  const gates = tree.tierGates;
  if (gates !== undefined) {
    for (let i = 0; i < gates.length; i++) {
      if (gates[i].tier === tier) {
        minPoints = gates[i].minPointsSpent;
        if (gates[i].minLevel !== undefined) {
          minLevel = gates[i].minLevel as number;
        }
      }
    }
  }
  if (minLevel > 0 && level < minLevel) {
    return { ok: false, code: "level_restricted" };
  }
  if (spentBeforePurchase < minPoints) {
    return { ok: false, code: "prerequisite_missing" };
  }
  return { ok: true, code: "ok" };
}

function prerequisitesMet(
  node: TalentNodeContent,
  classNodes: ReadonlyArray<string>,
  branchRanks: { [nodeId: string]: number },
): boolean {
  const prereqs = node.prerequisites;
  if (prereqs === undefined) {
    return true;
  }
  for (let i = 0; i < prereqs.length; i++) {
    if (nodeRank(classNodes, branchRanks, prereqs[i].nodeId) < prereqs[i].minRank) {
      return false;
    }
  }
  return true;
}

function wouldExceedBuyableActives(
  catalog: ProgressionCatalog,
  tree: TalentTreeContent,
  node: TalentNodeContent,
  nextBranchRanks: { [nodeId: string]: number },
): boolean {
  if (tree.treeKind !== "branch") {
    return false;
  }
  if (node.grantsActiveAbilityId === undefined || node.grantsActiveAbilityId.length === 0) {
    return false;
  }
  const max = tree.maxActiveGrants !== undefined ? tree.maxActiveGrants : 1;
  let count = 0;
  for (let i = 0; i < tree.nodeIds.length; i++) {
    const other = catalog.talentNodes[tree.nodeIds[i]];
    if (other === undefined || other.grantsActiveAbilityId === undefined || other.grantsActiveAbilityId.length === 0) {
      continue;
    }
    if (nodeRank([], nextBranchRanks, other.id) > 0) {
      count += 1;
    }
  }
  return count > max;
}

function addNodeAbilityGrants(
  owned: string[],
  catalog: ProgressionCatalog,
  nodeIds: ReadonlyArray<string>,
  ranks: { [nodeId: string]: number },
): void {
  for (let i = 0; i < nodeIds.length; i++) {
    const id = nodeIds[i];
    if (Object.keys(ranks).length > 0 && nodeRank([], ranks, id) <= 0) {
      continue;
    }
    const node = catalog.talentNodes[id];
    if (node === undefined) {
      const grant = catalog.talentGrants[id];
      if (grant !== undefined && grant.grantsActiveAbilityId !== undefined) {
        pushUnique(owned, grant.grantsActiveAbilityId);
      }
      continue;
    }
    if (node.grantsActiveAbilityId !== undefined && node.grantsActiveAbilityId.length > 0) {
      pushUnique(owned, node.grantsActiveAbilityId);
    }
  }
}

function sanitizeCanonicalHotbar(
  catalog: ProgressionCatalog,
  classId: string,
  ownedIds: ReadonlyArray<string>,
  current: ReadonlyArray<string>,
): string[] {
  const next = emptyCanonicalHotbar();
  const seen: { [id: string]: boolean } = {};
  let slot = 0;
  for (let i = 0; i < current.length && slot < CANONICAL_HOTBAR_SIZE; i++) {
    const id = current[i];
    if (id.length === 0) {
      slot += 1;
      continue;
    }
    if (ownedIds.indexOf(id) < 0 || !isCanonicalActiveAbility(catalog, id, classId) || seen[id] === true) {
      slot += 1;
      continue;
    }
    seen[id] = true;
    next[slot] = id;
    slot += 1;
  }
  return next;
}

function padCanonicalHotbar(current: ReadonlyArray<string> | undefined): string[] {
  const next = emptyCanonicalHotbar();
  if (current === undefined) {
    return next;
  }
  const limit = current.length < CANONICAL_HOTBAR_SIZE ? current.length : CANONICAL_HOTBAR_SIZE;
  for (let i = 0; i < limit; i++) {
    next[i] = current[i];
  }
  return next;
}

function pushUnique(list: string[], id: string): void {
  if (id.length === 0) {
    return;
  }
  if (list.indexOf(id) < 0) {
    list.push(id);
  }
}

function copyIds(values: ReadonlyArray<string>): string[] {
  const list: string[] = [];
  for (let i = 0; i < values.length; i++) {
    list.push(values[i]);
  }
  return list;
}

function copyAmounts(source: { [id: string]: number }): { [id: string]: number } {
  const out: { [id: string]: number } = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const value = source[keys[i]];
    if (typeof value === "number" && isFinite(value) && value > 0) {
      out[keys[i]] = value;
    }
  }
  return out;
}

function sameIdList(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
