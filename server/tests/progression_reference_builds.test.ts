import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  CANONICAL_STAT_IDS,
  unspentBranchPoints,
  unspentClassPoints,
  unspentFreeStatPoints,
} from "../src/domain/canonical_progression";
import { evaluateCanonicalSnapshot, validateNumericTree } from "../src/domain/canonical_stats";
import { grantXp, initializeProgression } from "../src/domain/progression";
import { catalogFromContent } from "../src/domain/stats";
import {
  REFERENCE_FREE_POINTS,
  allocateReferenceBuild,
  parseReferenceBuild,
  referenceBuildPriorityResolves,
} from "../src/domain/reference_builds";
import { CANONICAL_TOTAL_XP_TO_10 } from "../src/domain/canonical_progression";
import { simulateProgressionFight } from "../src/domain/progression_simulator";

const catalog = catalogFromContent(content);

test("sixteen reference builds allocate 27 free points without violating totals", () => {
  const builds = content.referenceBuilds;
  const ids = Object.keys(builds);
  assert.equal(ids.length, 16);
  assert.equal(REFERENCE_FREE_POINTS, 27);
  for (let i = 0; i < ids.length; i++) {
    const parsed = parseReferenceBuild(builds[ids[i] as keyof typeof builds], ids[i]);
    assert.ok(parsed !== null, ids[i]);
    if (parsed === null) {
      continue;
    }
    assert.equal(referenceBuildPriorityResolves(catalog, parsed), true, ids[i]);
    let progression = initializeProgression(catalog, catalog.branches[parsed.branchId].classId);
    progression = grantXp(progression, catalog, catalog.branches[parsed.branchId].classId, {
      characterId: "build-" + parsed.id,
      amount: CANONICAL_TOTAL_XP_TO_10,
      reasonType: "dev",
      reasonId: "build",
      eventId: "build-" + parsed.id,
    }).progression;
    assert.equal(progression.level, 10);
    const allocated = allocateReferenceBuild(progression, parsed);
    assert.equal(allocated.ok, true, ids[i] + " " + allocated.code);
    assert.equal(unspentFreeStatPoints(progression.freeStatAllocations, 10), 0, ids[i]);
    assert.equal(unspentClassPoints(progression.purchasedClassNodeIds, 10), 2);
    assert.equal(unspentBranchPoints(progression.purchasedBranchNodeRanks, 10), 6);
    const classDef = catalog.classes[catalog.branches[parsed.branchId].classId];
    const snap = evaluateCanonicalSnapshot({
      classId: classDef.id,
      level: 10,
      baseStats: classDef.baseStats !== undefined ? classDef.baseStats : {},
      automaticGrowth: classDef.automaticGrowth !== undefined ? classDef.automaticGrowth : {},
      freeStatAllocations: progression.freeStatAllocations,
      usesMana: classDef.resourceType !== "resource.none",
      modifiers: [],
    });
    const issues: string[] = [];
    validateNumericTree(snap, parsed.id, issues);
    assert.deepEqual(issues, []);
    let spent = 0;
    for (let s = 0; s < CANONICAL_STAT_IDS.length; s++) {
      spent += progression.freeStatAllocations[CANONICAL_STAT_IDS[s]] !== undefined ? progression.freeStatAllocations[CANONICAL_STAT_IDS[s]] : 0;
    }
    assert.equal(spent, 27, ids[i]);
    assert.ok(Number.isFinite(snap.hpMax) && snap.hpMax > 0);
  }
});

test("reference-build greed comparisons keep primary dumps ahead of vitality", () => {
  const bundle = { abilities: content.abilities, autoAttacks: content.autoAttacks };
  function dps(branchId: string, free: { [id: string]: number }): number {
    return simulateProgressionFight({
      catalog: catalog,
      content: bundle,
      branchId: branchId,
      mode: "analytic",
      freeStatAllocations: free,
    }).dps;
  }
  const executioner = dps("branch.warrior.berserker", { "stat.strength": 14, "stat.precision": 13 });
  const berserkerVit = dps("branch.warrior.berserker", { "stat.vitality": 27 });
  assert.ok(executioner > berserkerVit);
  const meteor = dps("branch.mage.fire", { "stat.intelligence": 14, "stat.precision": 13 });
  const fireVit = dps("branch.mage.fire", { "stat.vitality": 27 });
  assert.ok(meteor > fireVit);
  const deadeye = dps("branch.marksman.sniper", { "stat.agility": 14, "stat.precision": 13 });
  const sniperVit = dps("branch.marksman.sniper", { "stat.vitality": 27 });
  assert.ok(deadeye > sniperVit);
});
