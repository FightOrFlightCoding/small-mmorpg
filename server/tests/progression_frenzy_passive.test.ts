import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  CANONICAL_HOTBAR_SIZE,
  FRENZY_ABILITY_ID,
} from "../src/domain/canonical_progression";
import {
  assignCanonicalHotbar,
  countOwnedActives,
  isCanonicalActiveAbility,
  syncDerivedAbilityOwnership,
} from "../src/domain/canonical_talents";
import {
  grantXp,
  initializeProgression,
  selectBranch,
} from "../src/domain/progression";
import { catalogFromContent } from "../src/domain/stats";

const catalog = catalogFromContent(content);
const WARRIOR = "class.warrior";
const BERSERKER = "branch.warrior.berserker";
const BASIC = "ability.warrior.heavy_strike";
const CAPSTONE = "ability.warrior.berserk";

test("Frenzy is the Berserker signature and is a passive that does not occupy a hotbar slot", () => {
  assert.equal(catalog.abilities[FRENZY_ABILITY_ID].category, "passive");
  assert.equal(catalog.branches[BERSERKER].signatureAbilityId, FRENZY_ABILITY_ID);
  assert.equal(isCanonicalActiveAbility(catalog, FRENZY_ABILITY_ID, WARRIOR), false);
  let progression = grantXp(initializeProgression(catalog, WARRIOR), catalog, WARRIOR, {
    characterId: "char-alice",
    amount: 1700,
    reasonType: "dev",
    reasonId: "dev",
    eventId: "frenzy-l5",
    createdAt: 1,
  }).progression;
  progression = selectBranch(progression, catalog, WARRIOR, {
    requestId: "sel-frenzy01",
    branchId: BERSERKER,
  }).progression;
  assert.equal(progression.unlockedAbilityIds.indexOf(FRENZY_ABILITY_ID) >= 0, true);
  assert.equal(progression.unlockedAbilityIds.indexOf(BASIC) >= 0, true);
  assert.equal(
    countOwnedActives(
      catalog,
      WARRIOR,
      progression.level,
      progression.branchId,
      progression.purchasedClassNodeIds,
      progression.purchasedBranchNodeRanks,
    ),
    1,
  );
  const assigned = assignCanonicalHotbar(progression, catalog, WARRIOR, 0, FRENZY_ABILITY_ID);
  assert.equal(assigned.ok, false);
  assert.equal(assigned.code, "ability_passive");
  const basic = assignCanonicalHotbar(progression, catalog, WARRIOR, 0, BASIC);
  assert.equal(basic.ok, true);
  assert.equal(progression.hotbarAssignments.indexOf(FRENZY_ABILITY_ID), -1);
  assert.equal(progression.hotbarAssignments.length, CANONICAL_HOTBAR_SIZE);
  progression.hotbarAssignments = [FRENZY_ABILITY_ID, BASIC, "", ""];
  syncDerivedAbilityOwnership(progression, catalog, WARRIOR);
  assert.equal(progression.hotbarAssignments[0], "");
  assert.equal(progression.hotbarAssignments[1], BASIC);
  assert.equal(progression.unlockedAbilityIds.indexOf(CAPSTONE), -1);
});
