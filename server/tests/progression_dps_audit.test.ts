import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  CANONICAL_MAX_OWNED_ACTIVES,
  CANONICAL_STAT_IDS,
  CANONICAL_TOTAL_XP_TO_10,
  CANONICAL_XP_TO_NEXT,
  classPointsEarned,
  branchPointsEarned,
} from "../src/domain/canonical_progression";
import {
  evaluateCanonicalHit,
  evaluateCanonicalSnapshot,
  formulaCastTime,
  L10_REFERENCE,
  roundToTenths,
} from "../src/domain/canonical_stats";
import { hasteDoesNotChangeCooldown } from "../src/domain/canonical_combat";
import { applyCanonicalTalentPurchase } from "../src/domain/canonical_talents";
import { grantXp, initializeProgression, selectBranch } from "../src/domain/progression";
import { catalogFromContent } from "../src/domain/stats";
import {
  CERT_DPS_TOLERANCE,
  SECTION_12_TARGETS,
  simulateProgressionFight,
  withinTolerance,
  type SimulationResult,
} from "../src/domain/progression_simulator";

const catalog = catalogFromContent(content);
const bundle = { abilities: content.abilities, autoAttacks: content.autoAttacks };
const BRANCHES = Object.keys(SECTION_12_TARGETS);

function analytic(branchId: string, extra: { partyHeal?: boolean; free?: { [id: string]: number } } = {}): SimulationResult {
  return simulateProgressionFight({
    catalog: catalog,
    content: bundle,
    branchId: branchId,
    mode: "analytic",
    partyHeal: extra.partyHeal === true,
    freeStatAllocations: extra.free,
    trace: true,
  });
}

test("level-10 auto-growth sheet matches §6.3 for every class", () => {
  const ids = ["class.warrior", "class.mage", "class.marksman", "class.mystic"] as const;
  for (let i = 0; i < ids.length; i++) {
    const classDef = catalog.classes[ids[i]];
    assert.ok(classDef !== undefined);
    const snap = evaluateCanonicalSnapshot({
      classId: ids[i],
      level: 10,
      baseStats: classDef.baseStats !== undefined ? classDef.baseStats : {},
      automaticGrowth: classDef.automaticGrowth !== undefined ? classDef.automaticGrowth : {},
      freeStatAllocations: {},
      usesMana: classDef.resourceType !== "resource.none",
      modifiers: [],
    });
    const expected = L10_REFERENCE[ids[i].slice("class.".length) as keyof typeof L10_REFERENCE];
    assert.deepEqual(snap.stats, expected.stats);
    assert.equal(snap.hpMax, expected.hp);
    assert.equal(roundToTenths(snap.effectiveHp), expected.effectiveHp);
    assert.equal(snap.critChance, expected.critChance);
    assert.equal(snap.critMult, expected.critMult);
    assert.equal(snap.hasteMult, expected.hasteMult);
    assert.equal(snap.damageReduction, expected.damageReduction);
  }
});

test("section 12 analytic DPS and HPS stay within ±5% of the canonical table", () => {
  for (let i = 0; i < BRANCHES.length; i++) {
    const branchId = BRANCHES[i];
    const target = SECTION_12_TARGETS[branchId];
    const result = analytic(branchId);
    assert.equal(withinTolerance(result.dps, target.dps), true, branchId + " dps " + String(result.dps));
    if (target.hps !== undefined) {
      const healer = analytic(branchId, { partyHeal: true });
      assert.equal(withinTolerance(healer.hps, target.hps), true, branchId + " hps " + String(healer.hps));
    }
    if (target.partyHps !== undefined) {
      const party = analytic(branchId, { partyHeal: true });
      assert.equal(withinTolerance(party.partyHps, target.partyHps), true, branchId + " party hps " + String(party.partyHps));
    }
  }
});

test("seeded event simulation is deterministic and stays near the analytic EV", () => {
  for (let i = 0; i < BRANCHES.length; i++) {
    const branchId = BRANCHES[i];
    const a = analytic(branchId);
    const first = simulateProgressionFight({
      catalog: catalog,
      content: bundle,
      branchId: branchId,
      mode: "seeded",
      seed: 34,
      trace: true,
    });
    const second = simulateProgressionFight({
      catalog: catalog,
      content: bundle,
      branchId: branchId,
      mode: "seeded",
      seed: 34,
    });
    assert.equal(first.dps, second.dps, branchId);
    assert.ok(first.traces.length > 0, branchId + " trace");
    assert.ok(a.traces.length > 0, branchId + " analytic trace");
    if (a.dps > 0) {
      assert.equal(withinTolerance(first.dps, a.dps, 0.15), true, branchId + " seeded " + String(first.dps) + " vs analytic " + String(a.dps));
    }
  }
});

test("tank margin healer pressure TTK metronome and budget cross-checks hold", () => {
  const warrior = L10_REFERENCE.warrior;
  const others = [L10_REFERENCE.mage.effectiveHp, L10_REFERENCE.marksman.effectiveHp, L10_REFERENCE.mystic.effectiveHp];
  for (let i = 0; i < others.length; i++) {
    const ratio = warrior.effectiveHp / others[i];
    assert.ok(ratio >= 1.69 - 0.01 && ratio <= 1.79 + 0.01, "tank margin " + String(ratio));
  }
  const dpsRows: number[] = [];
  for (let i = 0; i < BRANCHES.length; i++) {
    if (BRANCHES[i] === "branch.warrior.bulwark" || BRANCHES[i] === "branch.mystic.charms") {
      continue;
    }
    dpsRows.push(analytic(BRANCHES[i]).dps);
  }
  let sum = 0;
  for (let i = 0; i < dpsRows.length; i++) {
    sum += dpsRows[i];
  }
  const meanDps = sum / dpsRows.length;
  const healer = analytic("branch.mystic.charms", { partyHeal: true });
  const vsOne = healer.partyHps - meanDps;
  const vsTwo = healer.partyHps - 2 * meanDps;
  assert.ok(Math.abs(vsOne - 4.3) <= 1.5, "healer vs one " + String(vsOne));
  assert.ok(Math.abs(vsTwo + 13.6) <= 2.5, "healer vs two " + String(vsTwo));
  assert.ok(warrior.effectiveHp / Math.abs(vsTwo) >= 20 && warrior.effectiveHp / Math.abs(vsTwo) <= 26);
  for (let i = 0; i < BRANCHES.length; i++) {
    const ttk = analytic(BRANCHES[i]).ttk120;
    assert.ok(ttk >= 6.3 * 0.95 && ttk <= 8.1 * 1.05, BRANCHES[i] + " ttk " + String(ttk));
  }
  const mage = analytic("branch.mage.fire");
  assert.equal(mage.metronome.length > 0 && mage.metronome[0].holds, true);
  const mystic = analytic("branch.mystic.charms");
  assert.equal(mystic.metronome[0].authoredMiss, true);
  assert.equal(mystic.metronome[0].holds, false);
  let xp = 0;
  for (let i = 0; i < CANONICAL_XP_TO_NEXT.length; i++) {
    xp += CANONICAL_XP_TO_NEXT[i];
  }
  assert.equal(xp, CANONICAL_TOTAL_XP_TO_10);
  assert.equal(CANONICAL_TOTAL_XP_TO_10, 11100);
  const classIds = ["class.warrior", "class.mage", "class.marksman", "class.mystic"];
  for (let c = 0; c < classIds.length; c++) {
    const classDef = catalog.classes[classIds[c]];
    let baseTotal = 0;
    let growthTotal = 0;
    for (let s = 0; s < CANONICAL_STAT_IDS.length; s++) {
      baseTotal += classDef.baseStats !== undefined ? classDef.baseStats[CANONICAL_STAT_IDS[s]] : 0;
      growthTotal += classDef.automaticGrowth !== undefined ? classDef.automaticGrowth[CANONICAL_STAT_IDS[s]] : 0;
    }
    assert.equal(baseTotal, 34, classIds[c]);
    assert.equal(baseTotal + growthTotal * 9 + 27, 115, classIds[c]);
  }
  assert.equal(classPointsEarned(10), 2);
  assert.equal(branchPointsEarned(10), 6);
});

test("single-stat greed checks keep the intended ordering within tolerance", () => {
  const berserkerBase = analytic("branch.warrior.berserker").dps;
  const fireBase = analytic("branch.mage.fire").dps;
  function gain(branchId: string, statId: string, base: number): number {
    const dump: { [id: string]: number } = {};
    dump[statId] = 27;
    return analytic(branchId, { free: dump }).dps / base - 1;
  }
  const str = gain("branch.warrior.berserker", "stat.strength", berserkerBase);
  const hst = gain("branch.warrior.berserker", "stat.haste", berserkerBase);
  const pre = gain("branch.warrior.berserker", "stat.precision", berserkerBase);
  const vit = gain("branch.warrior.berserker", "stat.vitality", berserkerBase);
  assert.ok(str > hst && hst > pre && pre > vit);
  assert.equal(withinTolerance(str, 0.205, 0.08), true, "berserker str " + String(str));
  assert.equal(withinTolerance(hst, 0.158, 0.08), true, "berserker hst " + String(hst));
  assert.equal(withinTolerance(pre, 0.113, 0.08), true, "berserker pre " + String(pre));
  assert.ok(Math.abs(vit) <= 0.01);
  const intel = gain("branch.mage.fire", "stat.intelligence", fireBase);
  const fireHst = gain("branch.mage.fire", "stat.haste", fireBase);
  const spi = gain("branch.mage.fire", "stat.spirit", fireBase);
  const firePre = gain("branch.mage.fire", "stat.precision", fireBase);
  assert.ok(intel > fireHst && fireHst > spi && spi > firePre);
  assert.equal(withinTolerance(intel, 0.299, 0.08), true, "fire int " + String(intel));
  assert.equal(withinTolerance(fireHst, 0.195, 0.08), true, "fire hst " + String(fireHst));
  assert.equal(withinTolerance(spi, 0.113, 0.1), true, "fire spi " + String(spi));
  assert.equal(withinTolerance(firePre, 0.07, 0.15), true, "fire pre " + String(firePre));
});

test("tier-3 lockout max actives DoT no-crit and haste-independent cooldowns still hold", () => {
  let progression = initializeProgression(catalog, "class.warrior");
  let toL8 = 0;
  for (let i = 0; i < 7; i++) {
    toL8 += CANONICAL_XP_TO_NEXT[i];
  }
  const granted = grantXp(progression, catalog, "class.warrior", {
    characterId: "char-cert",
    amount: toL8,
    reasonType: "dev",
    reasonId: "cert-l8",
    eventId: "cert-l8",
  });
  progression = granted.progression;
  assert.equal(progression.level, 8);
  const selected = selectBranch(progression, catalog, "class.warrior", {
    branchId: "branch.warrior.berserker",
    requestId: "cert-branch",
  });
  assert.equal(selected.ok, true);
  progression = selected.progression;
  const t1a = applyCanonicalTalentPurchase(progression, catalog, "class.warrior", {
    treeId: "tree.warrior.berserker",
    nodeId: "talent.warrior.berserker.frenzy_r2",
    requestedRank: 1,
    requestId: "t1a",
  });
  assert.equal(t1a.ok, true);
  const t1b = applyCanonicalTalentPurchase(progression, catalog, "class.warrior", {
    treeId: "tree.warrior.berserker",
    nodeId: "talent.warrior.berserker.slaughter",
    requestedRank: 1,
    requestId: "t1b",
  });
  assert.equal(t1b.ok, true);
  const t2a = applyCanonicalTalentPurchase(progression, catalog, "class.warrior", {
    treeId: "tree.warrior.berserker",
    nodeId: "talent.warrior.berserker.bloodlust",
    requestedRank: 1,
    requestId: "t2a",
  });
  assert.equal(t2a.ok, true);
  const earlyT3 = applyCanonicalTalentPurchase(progression, catalog, "class.warrior", {
    treeId: "tree.warrior.berserker",
    nodeId: "talent.warrior.berserker.bloodthirst",
    requestedRank: 1,
    requestId: "t3-early",
  });
  assert.equal(earlyT3.ok, false);
  assert.equal(earlyT3.code, "level_restricted");
  const t2b = applyCanonicalTalentPurchase(progression, catalog, "class.warrior", {
    treeId: "tree.warrior.berserker",
    nodeId: "talent.warrior.berserker.whirlwind",
    requestedRank: 1,
    requestId: "t2b",
  });
  assert.equal(t2b.ok, true);
  const toTen = grantXp(progression, catalog, "class.warrior", {
    characterId: "char-cert",
    amount: 2700 + 2260,
    reasonType: "dev",
    reasonId: "cert-l10",
    eventId: "cert-l10",
  });
  progression = toTen.progression;
  assert.equal(progression.level, 10);
  const t3 = applyCanonicalTalentPurchase(progression, catalog, "class.warrior", {
    treeId: "tree.warrior.berserker",
    nodeId: "talent.warrior.berserker.bloodthirst",
    requestedRank: 1,
    requestId: "t3",
  });
  assert.equal(t3.ok, true);
  const owned = progression.unlockedAbilityIds.filter(function (id) {
    return catalog.abilities[id] !== undefined && catalog.abilities[id].category !== "passive";
  });
  assert.ok(owned.length <= CANONICAL_MAX_OWNED_ACTIVES);
  const dot = evaluateCanonicalHit({
    base: 36,
    category: "spell",
    stats: L10_REFERENCE.mystic.stats,
    critChance: 1,
    critMult: 3,
    outgoingProduct: 1,
    damageReduction: 0,
    takenProduct: 1,
    critDamageProduct: 1,
    guaranteedCrit: true,
    isDot: true,
  });
  assert.equal(dot.crit, false);
  assert.equal(dot.final, dot.rawScaled);
  const remaining = 50;
  assert.equal(hasteDoesNotChangeCooldown(remaining, 2), remaining);
  const mage = L10_REFERENCE.mage;
  assert.equal(formulaCastTime(1.5, mage.hasteMult) < 1.5, true);
});

test("seeded Curses replaces Wither instead of stacking overlapping DoTs", () => {
  const a = analytic("branch.mystic.curses");
  const seeded = simulateProgressionFight({
    catalog: catalog,
    content: bundle,
    branchId: "branch.mystic.curses",
    mode: "seeded",
    seed: 34,
  });
  assert.equal(withinTolerance(seeded.dps, a.dps, 0.15), true, "curses stacked " + String(seeded.dps) + " vs " + String(a.dps));
  assert.ok(seeded.dps < a.dps * 1.2);
});

test("simulator JSON and human reports are finite", () => {
  const result = analytic("branch.marksman.sniper");
  assert.equal(Number.isFinite(result.dps), true);
  assert.ok(result.traces.length > 0);
  assert.equal(CERT_DPS_TOLERANCE, 0.05);
});
