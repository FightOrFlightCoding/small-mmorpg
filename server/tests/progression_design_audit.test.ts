import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { HOTBAR_SIZE } from "../src/domain/ability";
import { content } from "../src/generated/content";
import {
  DESIGN_RELATIVE_PATH,
  EXPECTED_BRANCH_NODES,
  EXPECTED_BRANCH_POINT_SLOTS,
  EXPECTED_BRANCH_POINTS,
  EXPECTED_CLASS_POINTS,
  EXPECTED_XP_TOTAL,
  LOCKED_BRANCH_IDS,
  LOCKED_CLASS_IDS,
  PLANNED_REGRESSION_TESTS,
  REQUIRED_CONTRACT_DOCS,
  auditCanonicalDesign,
  canonicalCatalog,
  missingCatalogIdsInText,
  missingPlannedTestsInText,
  parseMarkdownTables,
  sumStatMap,
  EXPECTED_BASE,
  EXPECTED_GROWTH,
} from "../src/domain/progression_design_audit";

function repoRoot(): string {
  const cwdParent = join(process.cwd(), "..");
  if (existsSync(join(cwdParent, DESIGN_RELATIVE_PATH))) {
    return cwdParent;
  }
  const fromDist = join(__dirname, "..", "..", "..");
  if (existsSync(join(fromDist, DESIGN_RELATIVE_PATH))) {
    return fromDist;
  }
  throw new Error("cannot locate repo root for progression design audit");
}

function readRepoFile(relativePath: string): string {
  const full = join(repoRoot(), relativePath);
  assert.equal(existsSync(full), true, "missing " + relativePath);
  return readFileSync(full, "utf8");
}

test("canonical progression design file exists and is the v1.0 source", () => {
  const markdown = readRepoFile(DESIGN_RELATIVE_PATH);
  assert.equal(markdown.indexOf("# RPG Progression System — Design Document v1.0") >= 0, true);
  assert.equal(markdown.indexOf("*End of document — v1.0, 2026-08-21.*") >= 0, true);
  assert.equal(markdown.indexOf("## 14. Compile-Time Additions") >= 0, true);
});

test("PROG-01 contract documents exist", () => {
  for (let i = 0; i < REQUIRED_CONTRACT_DOCS.length; i++) {
    const path = REQUIRED_CONTRACT_DOCS[i];
    assert.equal(existsSync(join(repoRoot(), path)), true, "missing " + path);
  }
});

test("canonical design audit: four classes, eight branches, budgets, XP, trees", () => {
  const markdown = readRepoFile(DESIGN_RELATIVE_PATH);
  const result = auditCanonicalDesign(markdown);
  if (result.issues.length > 0) {
    const messages: string[] = [];
    for (let i = 0; i < result.issues.length; i++) {
      messages.push(result.issues[i].code + ": " + result.issues[i].message);
    }
    assert.fail(messages.join("\n"));
  }
  assert.equal(result.classIds.length, 4);
  assert.equal(result.branchIds.length, 8);
  assert.deepEqual(result.classIds, LOCKED_CLASS_IDS);
  assert.deepEqual(result.branchIds, LOCKED_BRANCH_IDS);
  assert.equal(result.xpTotal, EXPECTED_XP_TOTAL);
  assert.equal(result.classPoints, EXPECTED_CLASS_POINTS);
  assert.equal(result.branchPoints, EXPECTED_BRANCH_POINTS);
  assert.equal(result.frenzyType.toLowerCase().indexOf("passive") >= 0, true);
  for (let c = 0; c < LOCKED_CLASS_IDS.length; c++) {
    const classId = LOCKED_CLASS_IDS[c];
    assert.equal(result.baseTotals[classId], 34, classId + " base");
    assert.equal(result.growthTotals[classId], 6, classId + " growth");
    assert.equal(sumStatMap(EXPECTED_BASE[classId]), 34);
    assert.equal(sumStatMap(EXPECTED_GROWTH[classId]), 6);
  }
  for (let b = 0; b < LOCKED_BRANCH_IDS.length; b++) {
    const branchId = LOCKED_BRANCH_IDS[b];
    assert.equal(result.branchNodeCounts[branchId], EXPECTED_BRANCH_NODES, branchId + " nodes");
    assert.equal(result.branchPointSlots[branchId], EXPECTED_BRANCH_POINT_SLOTS, branchId + " slots");
    assert.equal(result.buyableActives[branchId].length, 1, branchId + " buyable active");
  }
});

test("every class has two locked branches", () => {
  const byClass: { [classId: string]: number } = {};
  for (let i = 0; i < LOCKED_BRANCH_IDS.length; i++) {
    const parts = LOCKED_BRANCH_IDS[i].split(".");
    const classId = "class." + parts[1];
    byClass[classId] = (byClass[classId] !== undefined ? byClass[classId] : 0) + 1;
  }
  for (let c = 0; c < LOCKED_CLASS_IDS.length; c++) {
    assert.equal(byClass[LOCKED_CLASS_IDS[c]], 2);
  }
});

test("canonical value catalog lists every catalog id, compile-time tag, and planned test", () => {
  const catalogDoc = readRepoFile("docs/progression/CANONICAL_VALUE_CATALOG.md");
  const testPlan = readRepoFile("docs/progression/PROGRESSION_TEST_PLAN.md");
  const combined = catalogDoc + "\n" + testPlan;
  const missingIds = missingCatalogIdsInText(combined);
  assert.deepEqual(missingIds, [], "catalog missing ids: " + missingIds.join(", "));
  const missingTests = missingPlannedTestsInText(testPlan);
  assert.deepEqual(missingTests, [], "test plan missing: " + missingTests.join(", "));
  const rows = canonicalCatalog();
  let compileTime = 0;
  let untested = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].classification === "compile-time-addition") {
      compileTime += 1;
    }
    if (rows[i].intendedTest === "") {
      untested += 1;
    }
  }
  assert.equal(compileTime > 0, true);
  assert.equal(untested, 0);
  assert.equal(catalogDoc.indexOf("compile-time-addition") >= 0, true);
  assert.equal(catalogDoc.indexOf("canonical") >= 0, true);
});

test("interpretations record Frenzy as a passive that does not occupy a hotbar slot", () => {
  const text = readRepoFile("docs/design/progression-interpretations.md");
  assert.equal(text.indexOf("Frenzy") >= 0, true);
  assert.equal(text.toLowerCase().indexOf("passive") >= 0, true);
  assert.equal(text.toLowerCase().indexOf("hotbar") >= 0, true);
  assert.equal(text.toLowerCase().indexOf("hard maximum") >= 0, true);
});

test("implementation addendum exists and does not invent PROG-01 balance numbers", () => {
  const text = readRepoFile("docs/design/progression-implementation-addendum.md");
  assert.equal(text.indexOf("PROG-01") >= 0, true);
  assert.equal(text.indexOf("not canonical design data") >= 0, true);
});

test("design markdown tables parse", () => {
  const markdown = readRepoFile(DESIGN_RELATIVE_PATH);
  const tables = parseMarkdownTables(markdown);
  assert.equal(tables.length >= 12, true);
});

test("live catalog snapshot keeps foundation combat while four production classes are selectable", () => {
  const classIds = Object.keys(content.classes);
  const production: string[] = [];
  const selectable: string[] = [];
  for (let i = 0; i < classIds.length; i++) {
    if (classIds[i].indexOf("class.") === 0) {
      production.push(classIds[i]);
      const row = content.classes[classIds[i] as keyof typeof content.classes] as { rosterSelectable?: boolean };
      if (row.rosterSelectable !== false) {
        selectable.push(classIds[i]);
      }
    }
  }
  production.sort();
  selectable.sort();
  assert.deepEqual(production, ["class.mage", "class.marksman", "class.mystic", "class.warrior"]);
  assert.deepEqual(selectable, ["class.mage", "class.marksman", "class.mystic", "class.warrior"]);
  assert.equal(content.classes["class.mystic"].rosterSelectable, true);
  assert.equal(content.levelCurves["test.curve.standard"].maxLevel, 5);
  assert.equal(content.levelCurves["curve.vibecode.l10"].maxLevel, 10);
  const xp = content.levelCurves["test.curve.standard"].xpRequired;
  let sum = 0;
  for (let i = 0; i < xp.length; i++) {
    sum += xp[i];
  }
  assert.equal(sum, 375);
  assert.equal(HOTBAR_SIZE, 8);
  const warriorResources = content.classes["class.warrior"].startingResources as { [id: string]: number };
  const marksmanResources = content.classes["class.marksman"].startingResources as { [id: string]: number };
  const mageResources = content.classes["class.mage"].startingResources as { [id: string]: number };
  const mysticResources = content.classes["class.mystic"].startingResources as { [id: string]: number };
  assert.equal(Object.prototype.hasOwnProperty.call(warriorResources, "test.resource.mana"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(marksmanResources, "test.resource.mana"), false);
  assert.ok(mageResources["test.resource.mana"] > 0);
  assert.ok(mysticResources["test.resource.mana"] > 0);
  assert.ok(Object.prototype.hasOwnProperty.call(content.stats, "stat.strength"));
  assert.equal(content.abilities["ability.warrior.heavy_strike"].runtimeEnabled, false);
  const conflicts = readRepoFile("docs/progression/CURRENT_CONFLICTS.md");
  assert.equal(conflicts.indexOf("class.mystic") >= 0, true);
  assert.equal(conflicts.indexOf("HOTBAR_SIZE") >= 0, true);
  assert.equal(conflicts.indexOf("test.curve.standard") >= 0, true);
});

test("every planned regression test is named for a later phase or this audit", () => {
  assert.equal(PLANNED_REGRESSION_TESTS[0], "server/tests/progression_design_audit.test.ts");
  assert.equal(PLANNED_REGRESSION_TESTS.length >= 16, true);
});
