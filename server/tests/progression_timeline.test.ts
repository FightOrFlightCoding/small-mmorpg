import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import {
  CANONICAL_FREE_POINTS_PER_LEVEL,
  CANONICAL_TOTAL_XP_TO_10,
  canonicalStatTotals,
  unspentFreeStatPoints,
} from "../src/domain/canonical_progression";
import { pendingBranchSelection, usesCanonicalLeveling } from "../src/domain/canonical_leveling";
import { catalogLevel } from "../src/domain/character_catalog";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import {
  allocateAttributes,
  autoAssignUnspentPoints,
  grantXp,
  initializeProgression,
  publicProgression,
  selectBranch,
  setAutoAssign,
  type CharacterProgression,
} from "../src/domain/progression";
import { storedProgressionFromValue, storedProgressionWriteValue } from "../src/domain/progression_store";
import { ClientOpcode, PROTOCOL_VERSION, isProtocolError, parseClientMessage } from "../src/domain/protocol";
import { catalogFromContent } from "../src/domain/stats";

const catalog = catalogFromContent(content);
const WARRIOR = "class.warrior";
const BERSERKER = "branch.warrior.berserker";

function grant(progression: CharacterProgression, amount: number, eventId: string, reasonType = "dev") {
  return grantXp(progression, catalog, WARRIOR, {
    characterId: "char-1",
    amount: amount,
    reasonType: reasonType,
    reasonId: reasonType,
    eventId: eventId,
    createdAt: 1,
  });
}

function totals(progression: CharacterProgression) {
  const classDef = catalog.classes[WARRIOR];
  return canonicalStatTotals(
    classDef.baseStats,
    classDef.automaticGrowth,
    progression.freeStatAllocations,
    progression.level,
  );
}

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function warriorPlayer(): MatchPlayer {
  return {
    userId: "user-alice",
    sessionId: "session-alice",
    username: "alice",
    characterId: "char-alice",
    name: "Alice",
    classId: WARRIOR,
    x: content.zones["zone.starter"].playerSpawn.x,
    y: content.zones["zone.starter"].playerSpawn.y,
    maxHealth: 110,
    health: 110,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    progression: initializeProgression(catalog, WARRIOR),
  };
}

function zoneWithWarrior() {
  const state = createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
      attack: content.player.attack,
      attackRange: content.player.attackRange,
      attackCooldown: content.player.attackCooldown,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
  );
  state.progressionCatalog = catalog;
  return addPlayer(state, warriorPlayer());
}

test("usesCanonicalLeveling is true for production classes only", () => {
  assert.equal(usesCanonicalLeveling(catalog, WARRIOR), true);
  assert.equal(usesCanonicalLeveling(catalog, "test.class.vanguard"), false);
});

test("one grant can cross multiple canonical levels with sequential processing", () => {
  const result = grant(initializeProgression(catalog, WARRIOR), 100 + 280 + 20, "multi-1");
  assert.equal(result.levelsGained, 2);
  assert.equal(result.progression.level, 3);
  assert.equal(result.progression.currentXp, 20);
  assert.equal(result.progression.xpIntoLevel, 20);
  assert.equal(result.progression.lifetimeXp, 400);
  assert.equal(unspentFreeStatPoints(result.progression.freeStatAllocations, 3), 6);
  assert.equal(result.progression.unspentAttributePoints, 0);
  assert.equal(result.progression.unspentSkillPoints, 0);
  const types = result.events.map(function (event) {
    return event.type;
  });
  assert.equal(types.indexOf("xp_gained") >= 0, true);
  assert.equal(types.filter(function (type) { return type === "level_gained"; }).length, 2);
  assert.equal(types.indexOf("basic_unlocked") >= 0, true);
  assert.equal(types.indexOf("class_point_gained") >= 0, true);
  assert.equal(result.progression.unlockedAbilityIds.indexOf("ability.warrior.heavy_strike") >= 0, true);
});

test("duplicate XP event ids do not grant twice", () => {
  const first = grant(initializeProgression(catalog, WARRIOR), 100, "dup-1");
  const second = grantXp(first.progression, catalog, WARRIOR, {
    characterId: "char-1",
    amount: 100,
    reasonType: "dev",
    reasonId: "dev",
    eventId: "dup-1",
  });
  assert.equal(second.replay, true);
  assert.equal(second.changed, false);
  assert.equal(second.progression.level, 2);
  assert.equal(second.progression.lifetimeXp, 100);
});

test("11100 XP reaches level 10 exactly and extra XP stays lifetime-only", () => {
  const toCap = grant(initializeProgression(catalog, WARRIOR), CANONICAL_TOTAL_XP_TO_10, "to-cap");
  assert.equal(toCap.progression.level, 10);
  assert.equal(toCap.progression.currentXp, 0);
  assert.equal(toCap.progression.xpIntoLevel, 0);
  assert.equal(toCap.progression.lifetimeXp, CANONICAL_TOTAL_XP_TO_10);
  assert.equal(unspentFreeStatPoints(toCap.progression.freeStatAllocations, 10), 27);
  const capEvents = toCap.events.filter(function (event) {
    return event.type === "level_cap_reached";
  });
  assert.equal(capEvents.length, 1);
  const overflow = grant(toCap.progression, 500, "overflow");
  assert.equal(overflow.levelsGained, 0);
  assert.equal(overflow.progression.level, 10);
  assert.equal(overflow.progression.currentXp, 0);
  assert.equal(overflow.progression.lifetimeXp, CANONICAL_TOTAL_XP_TO_10 + 500);
  assert.equal(unspentFreeStatPoints(overflow.progression.freeStatAllocations, 10), 27);
  assert.equal(
    overflow.events.filter(function (event) {
      return event.type === "level_cap_reached";
    }).length,
    0,
  );
});

test("automatic growth is computed from class and level and is not stored as allocations", () => {
  const leveled = grant(initializeProgression(catalog, WARRIOR), 100, "growth-1");
  assert.deepEqual(leveled.progression.freeStatAllocations, {});
  const l1 = totals(initializeProgression(catalog, WARRIOR));
  const l2 = totals(leveled.progression);
  assert.equal(l2["stat.strength"], l1["stat.strength"] + 3);
  assert.equal(l2["stat.vitality"], l1["stat.vitality"] + 2);
  assert.equal(l2["stat.endurance"], l1["stat.endurance"] + 1);
});

test("free points earned equal 3 times (level - 1)", () => {
  const l4 = grant(initializeProgression(catalog, WARRIOR), 100 + 280 + 520, "free-l4");
  assert.equal(l4.progression.level, 4);
  assert.equal(unspentFreeStatPoints(l4.progression.freeStatAllocations, 4), 9);
  const spent = allocateAttributes(l4.progression, catalog, {
    requestId: "alloc-str-01",
    attributeId: "stat.strength",
    amount: 2,
    classId: WARRIOR,
  });
  assert.equal(spent.ok, true);
  assert.equal(spent.progression.freeStatAllocations["stat.strength"], 2);
  assert.equal(unspentFreeStatPoints(spent.progression.freeStatAllocations, 4), 7);
});

test("auto-assign on level gain spends only the newly earned three points", () => {
  let progression = initializeProgression(catalog, WARRIOR);
  progression = grant(progression, 100, "aa-l2").progression;
  assert.equal(unspentFreeStatPoints(progression.freeStatAllocations, 2), 3);
  const toggled = setAutoAssign(progression, { requestId: "aa-on-xxxx", enabled: true });
  assert.equal(toggled.progression.autoAssignEnabled, true);
  assert.equal(unspentFreeStatPoints(toggled.progression.freeStatAllocations, 2), 3);
  const next = grant(toggled.progression, 280, "aa-l3");
  assert.equal(next.progression.level, 3);
  assert.equal(next.progression.freeStatAllocations["stat.strength"], 2);
  assert.equal(next.progression.freeStatAllocations["stat.vitality"], 1);
  assert.equal(unspentFreeStatPoints(next.progression.freeStatAllocations, 3), 3);
});

test("AUTO_ASSIGN_UNSPENT_POINTS spends existing unspent points on the class template", () => {
  const leveled = grant(initializeProgression(catalog, WARRIOR), 100 + 280, "aa-unspent");
  assert.equal(unspentFreeStatPoints(leveled.progression.freeStatAllocations, 3), 6);
  const spent = autoAssignUnspentPoints(leveled.progression, catalog, WARRIOR, { requestId: "aa-spend-01" });
  assert.equal(spent.ok, true);
  assert.equal(unspentFreeStatPoints(spent.progression.freeStatAllocations, 3), 0);
  assert.equal(spent.progression.freeStatAllocations["stat.strength"], 4);
  assert.equal(spent.progression.freeStatAllocations["stat.vitality"], 2);
  const replay = autoAssignUnspentPoints(spent.progression, catalog, WARRIOR, { requestId: "aa-spend-01" });
  assert.equal(replay.replay, true);
  assert.equal(replay.progression.freeStatAllocations["stat.strength"], 4);
});

test("level 5 without a branch keeps signature pending and continues XP", () => {
  const l5 = grant(initializeProgression(catalog, WARRIOR), 100 + 280 + 520 + 800, "l5-pending");
  assert.equal(l5.progression.level, 5);
  assert.equal(l5.progression.branchId, "");
  assert.equal(pendingBranchSelection(5, ""), true);
  assert.equal(l5.progression.unlockedAbilityIds.indexOf("ability.warrior.frenzy"), -1);
  const types = l5.events.map(function (event) {
    return event.type;
  });
  assert.equal(types.indexOf("branch_selection_available") >= 0, true);
  const more = grant(l5.progression, 50, "l5-more");
  assert.equal(more.progression.level, 5);
  assert.equal(more.progression.currentXp, 50);
  const selected = selectBranch(more.progression, catalog, WARRIOR, {
    requestId: "sel-branch1",
    branchId: BERSERKER,
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.progression.branchId, BERSERKER);
  assert.equal(selected.progression.unlockedAbilityIds.indexOf("ability.warrior.frenzy") >= 0, true);
  assert.equal(selected.events.some(function (event) { return event.type === "signature_unlocked"; }), true);
});

test("level 10 without a branch does not invent a branch or duplicate capstone", () => {
  const l10 = grant(initializeProgression(catalog, WARRIOR), CANONICAL_TOTAL_XP_TO_10, "l10-nobranch");
  assert.equal(l10.progression.level, 10);
  assert.equal(l10.progression.branchId, "");
  assert.equal(l10.progression.unlockedAbilityIds.indexOf("ability.warrior.berserk"), -1);
  const again = grant(l10.progression, 100, "l10-again");
  assert.equal(again.progression.unlockedAbilityIds.indexOf("ability.warrior.berserk"), -1);
  const selected = selectBranch(again.progression, catalog, WARRIOR, {
    requestId: "sel-capstone",
    branchId: BERSERKER,
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.progression.unlockedAbilityIds.indexOf("ability.warrior.frenzy") >= 0, true);
  assert.equal(selected.progression.unlockedAbilityIds.indexOf("ability.warrior.berserk") >= 0, true);
  const replay = selectBranch(selected.progression, catalog, WARRIOR, {
    requestId: "sel-capstone",
    branchId: BERSERKER,
  });
  assert.equal(replay.replay, true);
  assert.equal(selected.progression.unlockedAbilityIds.filter(function (id) { return id === "ability.warrior.berserk"; }).length, 1);
});

test("storage round-trip preserves level XP allocations and request maps after restart", () => {
  let progression = initializeProgression(catalog, WARRIOR);
  progression = setAutoAssign(progression, { requestId: "aa-store-01", enabled: true }).progression;
  progression = grant(progression, 100 + 280, "store-xp").progression;
  const stored = storedProgressionFromValue(storedProgressionWriteValue(progression));
  assert.notEqual(stored, null);
  if (stored === null) {
    return;
  }
  assert.equal(stored.level, 3);
  assert.equal(stored.autoAssignEnabled, true);
  assert.equal(stored.freeStatAllocations["stat.strength"], 4);
  assert.equal(stored.unlockedAbilityIds.indexOf("ability.warrior.heavy_strike") >= 0, true);
  assert.equal(Object.keys(stored.xpByEventId).length, 1);
});

test("character select reads persisted level", () => {
  const leveled = grant(initializeProgression(catalog, WARRIOR), 100, "select-level");
  assert.equal(catalogLevel(leveled.progression), 2);
  const stored = storedProgressionFromValue(storedProgressionWriteValue(leveled.progression));
  assert.equal(catalogLevel(stored), 2);
});

test("client cannot inject XP amounts or free-point totals", () => {
  const injected = parseClientMessage(
    ClientOpcode.ALLOCATE_ATTRIBUTES,
    envelope({ requestId: "inj-xp-0001", attributeId: "stat.strength", amount: 1, xp: 999 }),
    contentHash,
  );
  assert.equal(isProtocolError(injected), true);
  if (isProtocolError(injected)) {
    assert.equal(injected.code, "stat_injection:xp");
  }
  const points = parseClientMessage(
    ClientOpcode.ALLOCATE_ATTRIBUTES,
    envelope({
      requestId: "inj-pts-0001",
      attributeId: "stat.strength",
      amount: 1,
      freeStatAllocations: { "stat.strength": 99 },
    }),
    contentHash,
  );
  assert.equal(isProtocolError(points), true);
  if (isProtocolError(points)) {
    assert.equal(points.code, "stat_injection:freeStatAllocations");
  }
});

test("match SET_AUTO_ASSIGN persists the flag without spending existing points", () => {
  let state = zoneWithWarrior();
  state.players["user-alice"].progression = grant(
    state.players["user-alice"].progression!,
    100,
    "match-aa-xp",
  ).progression;
  const before = unspentFreeStatPoints(state.players["user-alice"].progression!.freeStatAllocations, 2);
  assert.equal(before, 3);
  const result = applyMatchLoop(state, 4, contentHash, [
    {
      opcode: ClientOpcode.SET_AUTO_ASSIGN,
      raw: envelope({ requestId: "match-aa-flag", enabled: true }),
      userId: "user-alice",
    },
  ]);
  assert.equal(result.state.players["user-alice"].progression?.autoAssignEnabled, true);
  assert.equal(
    unspentFreeStatPoints(result.state.players["user-alice"].progression!.freeStatAllocations, 2),
    3,
  );
});

test("public progression overlays free points for production classes", () => {
  const leveled = grant(initializeProgression(catalog, WARRIOR), 100, "pub-1");
  const view = publicProgression(catalog, WARRIOR, leveled.progression, {}, leveled.events);
  assert.equal(view.unspentAttributePoints, CANONICAL_FREE_POINTS_PER_LEVEL);
  assert.equal(view.unspentFreeStatPoints, 3);
  assert.equal(view.pendingBranchSelection, false);
  assert.equal(Array.isArray(view.events), true);
});
