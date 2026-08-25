import assert from "node:assert/strict";
import test from "node:test";
import { prepareJoinedPlayerAbilities } from "../src/domain/ability";
import {
  CANONICAL_AUTO_ASSIGN_DEFAULT,
  CANONICAL_HOTBAR_SIZE,
  CANONICAL_LEVEL_CAP,
  CANONICAL_PROGRESSION_SCHEMA_VERSION,
  CANONICAL_STAT_IDS,
  canonicalHotbarFromLive,
  canonicalMaxHealth,
  canonicalMaxMana,
  canonicalStatTotals,
  classPointsEarned,
  classUsesMana,
  unspentBranchPoints,
  unspentClassPoints,
  unspentFreeStatPoints,
  usesCanonicalCreateState,
} from "../src/domain/canonical_progression";
import { emptyQuestLog } from "../src/domain/quest";
import { content } from "../src/generated/content";
import {
  cloneProgression,
  initializeProgression,
  migrateToCanonicalProgression,
  publicProgression,
  type CharacterProgression,
} from "../src/domain/progression";
import { storedProgressionFromValue, storedProgressionWriteValue } from "../src/domain/progression_store";
import {
  catalogFromContent,
  emptyModifierMap,
  evaluateStats,
} from "../src/domain/stats";
import type { MatchPlayer, StarterZoneState } from "../src/domain/match_state";

const catalog = catalogFromContent(content);
const PRODUCTION_CLASS_IDS = ["class.warrior", "class.mage", "class.marksman", "class.mystic"];
const MANA_ID = "test.resource.mana";

function classRow(classId: string) {
  return content.classes[classId as keyof typeof content.classes] as unknown as {
    baseStats: { [id: string]: number };
    automaticGrowth: { [id: string]: number };
    resourceType?: string;
    autoAttackId?: string;
    startingAbilities?: string[];
  };
}

function joinedPlayer(classId: string, resources?: { [id: string]: number }): MatchPlayer {
  const player: MatchPlayer = {
    userId: "user-a",
    sessionId: "session-a",
    username: "a",
    characterId: "char-a",
    name: "A",
    classId: classId,
    x: 0,
    y: 0,
    maxHealth: 100,
    health: 100,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    progression: initializeProgression(catalog, classId),
    resources: resources !== undefined ? resources : { [MANA_ID]: 99 },
  };
  const state = {
    progressionCatalog: catalog,
    itemsById: {},
    abilitiesById: {},
    basicAbilityId: "test.ability.basic_melee",
  } as StarterZoneState;
  prepareJoinedPlayerAbilities(state, player, true);
  return player;
}

function v1Warrior(level: number, currentXp: number, lifetimeXp: number): CharacterProgression {
  const next = initializeProgression(catalog, "class.warrior");
  next.progressionSchemaVersion = 1;
  next.level = level;
  next.currentXp = currentXp;
  next.lifetimeXp = lifetimeXp;
  next.xpIntoLevel = 0;
  next.unlockedAbilityIds = ["test.ability.basic_melee"];
  next.hotbar = [
    "ability.warrior.heavy_strike",
    "ability.warrior.frenzy",
    "test.ability.basic_melee",
    "",
    "",
    "",
    "",
    "",
  ];
  next.allocatedAttributes = { "test.attribute.might": 1 };
  next.unspentAttributePoints = 1;
  next.unspentSkillPoints = 2;
  next.createdAt = 50;
  next.updatedAt = 50;
  return next;
}

test("canonical create skips starting abilities for production classes and keeps test-class grants", () => {
  for (let i = 0; i < PRODUCTION_CLASS_IDS.length; i++) {
    const classId = PRODUCTION_CLASS_IDS[i];
    assert.equal(usesCanonicalCreateState(classRow(classId).autoAttackId), true);
    const created = initializeProgression(catalog, classId);
    assert.deepEqual(created.unlockedAbilityIds, []);
    assert.deepEqual(created.hotbarAssignments, []);
    assert.equal(created.autoAssignEnabled, CANONICAL_AUTO_ASSIGN_DEFAULT);
  }
  const vanguard = initializeProgression(catalog, "test.class.vanguard");
  assert.equal(usesCanonicalCreateState(catalog.classes["test.class.vanguard"].autoAttackId), false);
  assert.equal(vanguard.unlockedAbilityIds.indexOf("test.ability.basic_melee") >= 0, true);
});

test("level-1 arrays match authored base stats and grant zero points", () => {
  for (let i = 0; i < PRODUCTION_CLASS_IDS.length; i++) {
    const classId = PRODUCTION_CLASS_IDS[i];
    const created = initializeProgression(catalog, classId);
    const totals = canonicalStatTotals(classRow(classId).baseStats, classRow(classId).automaticGrowth, {}, 1);
    assert.deepEqual(totals, classRow(classId).baseStats);
    assert.equal(created.level, 1);
    assert.equal(created.xpIntoLevel, 0);
    assert.equal(created.lifetimeXp, 0);
    assert.equal(created.branchId, "");
    assert.equal(created.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION);
    assert.equal(unspentClassPoints(created.purchasedClassNodeIds, 1), 0);
    assert.equal(unspentBranchPoints(created.purchasedBranchNodeRanks, 1), 0);
    assert.equal(unspentFreeStatPoints(created.freeStatAllocations, 1), 0);
    assert.equal(classPointsEarned(1), 0);
    const vitality = totals["stat.vitality"];
    const intelligence = totals["stat.intelligence"];
    assert.ok(canonicalMaxHealth(vitality) > 0);
    const usesMana = classUsesMana(classRow(classId).resourceType);
    if (classId === "class.warrior" || classId === "class.marksman") {
      assert.equal(usesMana, false);
      assert.equal(canonicalMaxMana(intelligence, usesMana), 0);
    } else {
      assert.equal(usesMana, true);
      assert.ok(canonicalMaxMana(intelligence, usesMana) > 0);
    }
  }
  assert.equal(CANONICAL_STAT_IDS.length, 8);
  assert.equal(CANONICAL_HOTBAR_SIZE, 4);
  assert.equal(CANONICAL_LEVEL_CAP, 10);
});

test("physical classes have no mana resource and casters keep a mana pool", () => {
  const warrior = evaluateStats(catalog, {
    classId: "class.warrior",
    level: 1,
    allocatedAttributes: {},
    equipmentModifiers: emptyModifierMap(),
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  const marksman = evaluateStats(catalog, {
    classId: "class.marksman",
    level: 1,
    allocatedAttributes: {},
    equipmentModifiers: emptyModifierMap(),
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  const mage = evaluateStats(catalog, {
    classId: "class.mage",
    level: 1,
    allocatedAttributes: {},
    equipmentModifiers: emptyModifierMap(),
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  const mystic = evaluateStats(catalog, {
    classId: "class.mystic",
    level: 1,
    allocatedAttributes: {},
    equipmentModifiers: emptyModifierMap(),
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  assert.ok(warrior.maxHealth > 0);
  assert.ok(marksman.maxHealth > 0);
  assert.ok(mage.maxHealth > 0);
  assert.ok(mystic.maxHealth > 0);
  assert.equal(warrior.maxMana, 0);
  assert.equal(marksman.maxMana, 0);
  assert.ok(mage.maxMana > 0);
  assert.ok(mystic.maxMana > 0);
  const joinedWarrior = joinedPlayer("class.warrior");
  const joinedMage = joinedPlayer("class.mage");
  assert.equal(joinedWarrior.resources !== undefined && joinedWarrior.resources[MANA_ID], undefined);
  assert.ok(joinedMage.resources !== undefined && joinedMage.resources[MANA_ID] > 0);
  assert.deepEqual(joinedWarrior.progression?.unlockedAbilityIds, []);
  assert.deepEqual(joinedMage.progression?.unlockedAbilityIds, []);
});

test("v1 warrior migration keeps identity xp and live unlocks and is idempotent", () => {
  const l1 = migrateToCanonicalProgression(v1Warrior(1, 0, 0), "class.warrior", 100, catalog);
  assert.equal(l1.changed, true);
  assert.equal(l1.progression.classId, "class.warrior");
  assert.equal(l1.progression.level, 1);
  assert.equal(l1.progression.xpIntoLevel, 0);
  assert.equal(l1.progression.lifetimeXp, 0);
  assert.equal(l1.progression.branchId, "");
  assert.deepEqual(l1.progression.unlockedAbilityIds, ["test.ability.basic_melee"]);
  assert.deepEqual(l1.progression.hotbarAssignments, ["ability.warrior.heavy_strike"]);
  const l5 = migrateToCanonicalProgression(v1Warrior(5, 20, 395), "class.warrior", 100, catalog);
  assert.equal(l5.progression.level, 5);
  assert.equal(l5.progression.xpIntoLevel, 20);
  assert.equal(l5.progression.lifetimeXp, 395);
  assert.equal(l5.progression.classId, "class.warrior");
  assert.notEqual(l5.progression.classId, "class.mystic");
  assert.equal(l5.progression.branchId, "");
  assert.deepEqual(l5.progression.purchasedClassNodeIds, []);
  assert.deepEqual(l5.progression.purchasedBranchNodeRanks, {});
  assert.equal(unspentClassPoints(l5.progression.purchasedClassNodeIds, 5), 2);
  assert.equal(unspentBranchPoints(l5.progression.purchasedBranchNodeRanks, 5), 1);
  const view = publicProgression(catalog, "class.warrior", l5.progression, {});
  assert.equal(view.unspentClassPoints, 2);
  assert.equal(view.unspentBranchPoints, 1);
  assert.equal(typeof view.unspentAttributePoints, "number");
  const second = migrateToCanonicalProgression(l5.progression, "class.warrior", 200, catalog);
  assert.equal(second.changed, false);
  assert.equal(second.progression.updatedAt, 100);
});

test("missing progression initializes canonical level 1 for the character class", () => {
  const created = migrateToCanonicalProgression(null, "class.marksman", 9, catalog);
  assert.equal(created.changed, true);
  assert.equal(created.progression.classId, "class.marksman");
  assert.equal(created.progression.level, 1);
  assert.equal(created.progression.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION);
  assert.deepEqual(created.progression.unlockedAbilityIds, []);
});

test("canonical hotbar drops frenzy test abilities and empty slots", () => {
  assert.deepEqual(
    canonicalHotbarFromLive([
      "",
      "ability.warrior.frenzy",
      "test.ability.basic_melee",
      "ability.warrior.heavy_strike",
      "ability.warrior.whirlwind",
      "ability.warrior.challenge",
      "ability.warrior.unbreakable",
      "ability.warrior.shield_bash",
    ]),
    [
      "ability.warrior.heavy_strike",
      "ability.warrior.whirlwind",
      "ability.warrior.challenge",
      "ability.warrior.unbreakable",
    ],
  );
});

test("stored progression round-trips canonical fields", () => {
  const created = initializeProgression(catalog, "class.mystic");
  created.createdAt = 3;
  created.updatedAt = 3;
  const parsed = storedProgressionFromValue(storedProgressionWriteValue(created));
  assert.notEqual(parsed, null);
  if (parsed === null) {
    return;
  }
  assert.equal(parsed.classId, "class.mystic");
  assert.equal(parsed.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION);
  assert.equal(parsed.autoAssignEnabled, CANONICAL_AUTO_ASSIGN_DEFAULT);
  assert.deepEqual(parsed.hotbarAssignments, []);
  assert.deepEqual(cloneProgression(parsed).freeStatAllocations, {});
});
