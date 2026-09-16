import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { HOTBAR_SIZE, assignHotbar, publicAbilityState, unlockAbility } from "../src/domain/ability";
import {
  CANONICAL_HOTBAR_SIZE,
  CANONICAL_MAX_OWNED_ACTIVES,
  CANONICAL_TOTAL_XP_TO_10,
} from "../src/domain/canonical_progression";
import {
  assignCanonicalHotbar,
  countOwnedActives,
  derivedOwnedAbilityIds,
  isCanonicalActiveAbility,
} from "../src/domain/canonical_talents";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import { emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import {
  grantXp,
  initializeProgression,
  purchaseTalent,
  selectBranch,
  type CharacterProgression,
} from "../src/domain/progression";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import { catalogFromContent, type ProgressionCatalog } from "../src/domain/stats";

const catalog = catalogFromContent(content);
const WARRIOR = "class.warrior";
const BERSERKER = "branch.warrior.berserker";
const CLASS_TREE = "tree.warrior.class";
const BERSERKER_TREE = "tree.warrior.berserker";
const CLASS_NODE_A = "talent.warrior.heavy_strike_r2";
const CLASS_NODE_B = "talent.warrior.conditioning";
const SLAUGHTER = "talent.warrior.berserker.slaughter";
const FRENZY_R2 = "talent.warrior.berserker.frenzy_r2";
const WHIRLWIND_NODE = "talent.warrior.berserker.whirlwind";
const BASIC = "ability.warrior.heavy_strike";
const AUTO_ATTACK = "ability.warrior.auto_attack";
const WHIRLWIND = "ability.warrior.whirlwind";
const CAPSTONE = "ability.warrior.berserk";
const FAKE_A = "ability.fake.active.a";
const FAKE_B = "ability.fake.active.b";

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function innPos() {
  return content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.test_innkeeper") as { x: number; y: number };
}

function grantTo(currentCatalog: ProgressionCatalog, progression: CharacterProgression, amount: number, eventId: string) {
  return grantXp(progression, currentCatalog, WARRIOR, {
    characterId: "char-alice",
    amount: amount,
    reasonType: "dev",
    reasonId: "dev",
    eventId: eventId,
    createdAt: 1,
  }).progression;
}

function warriorAtInn(progression: CharacterProgression): MatchPlayer {
  const inn = innPos();
  return {
    userId: "user-alice",
    sessionId: "session-alice",
    username: "alice",
    characterId: "char-alice",
    name: "Alice",
    classId: WARRIOR,
    x: inn.x,
    y: inn.y,
    maxHealth: 110,
    health: 110,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    gold: 0,
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    progression: progression,
  };
}

function serviceZone(): StarterZoneState {
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
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
    },
  );
  state.progressionCatalog = catalog;
  return state;
}

function actions(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { ok: boolean; code: string });
}

function inflatedCatalog(): ProgressionCatalog {
  const clone = catalogFromContent(content);
  clone.talentNodes[CLASS_NODE_A].grantsActiveAbilityId = FAKE_A;
  clone.talentNodes[CLASS_NODE_B].grantsActiveAbilityId = FAKE_B;
  return clone;
}

test("foundation hotbar size remains eight for test classes while production uses four", () => {
  assert.equal(HOTBAR_SIZE, 8);
  assert.equal(CANONICAL_HOTBAR_SIZE, 4);
  assert.equal(CANONICAL_MAX_OWNED_ACTIVES, 4);
});

test("auto-attack is owned by class and level but is not a hotbar active", () => {
  const progression = initializeProgression(catalog, WARRIOR);
  const owned = derivedOwnedAbilityIds(
    catalog,
    WARRIOR,
    progression.level,
    progression.branchId,
    progression.purchasedClassNodeIds,
    progression.purchasedBranchNodeRanks,
  );
  assert.equal(owned.indexOf(AUTO_ATTACK), -1);
  assert.equal(isCanonicalActiveAbility(catalog, AUTO_ATTACK, WARRIOR), false);
  const assigned = assignCanonicalHotbar(progression, catalog, WARRIOR, 0, AUTO_ATTACK);
  assert.equal(assigned.ok, false);
  assert.equal(assigned.code, "ability_locked");
});

test("production cannot unlock an arbitrary ability with skill points", () => {
  const progression = grantTo(catalog, initializeProgression(catalog, WARRIOR), 100, "unlock-l2");
  const unlocked = unlockAbility(progression, undefined, ["warrior"], WARRIOR, "req-unlock-p1", 1);
  assert.equal(unlocked.ok, false);
  assert.equal(unlocked.code, "unsupported_class");
  const replay = unlockAbility(unlocked.progression, undefined, ["warrior"], WARRIOR, "req-unlock-p1", 2);
  assert.equal(replay.replay, true);
  assert.equal(replay.code, "unsupported_class");
});

test("ownership is derived from class, level, branch, and purchased nodes", () => {
  let progression = grantTo(catalog, initializeProgression(catalog, WARRIOR), CANONICAL_TOTAL_XP_TO_10, "own-l10");
  assert.equal(progression.unlockedAbilityIds.indexOf(BASIC) >= 0, true);
  assert.equal(progression.unlockedAbilityIds.indexOf(WHIRLWIND), -1);
  progression = selectBranch(progression, catalog, WARRIOR, {
    requestId: "sel-own-01",
    branchId: BERSERKER,
  }).progression;
  assert.equal(progression.unlockedAbilityIds.indexOf(CAPSTONE) >= 0, true);
  const clientList = progression.unlockedAbilityIds.slice();
  clientList.push("ability.injected.client");
  progression.unlockedAbilityIds = clientList;
  progression = purchaseTalent(progression, catalog, WARRIOR, {
    treeId: BERSERKER_TREE,
    nodeId: SLAUGHTER,
    requestedRank: 1,
    requestId: "own-t1a",
  }).progression;
  progression = purchaseTalent(progression, catalog, WARRIOR, {
    treeId: BERSERKER_TREE,
    nodeId: FRENZY_R2,
    requestedRank: 1,
    requestId: "own-t1b",
  }).progression;
  progression = purchaseTalent(progression, catalog, WARRIOR, {
    treeId: BERSERKER_TREE,
    nodeId: WHIRLWIND_NODE,
    requestedRank: 1,
    requestId: "own-ww",
  }).progression;
  assert.equal(progression.unlockedAbilityIds.indexOf(WHIRLWIND) >= 0, true);
  assert.equal(progression.unlockedAbilityIds.indexOf("ability.injected.client"), -1);
});

test("a fifth owned active is rejected", () => {
  const inflated = inflatedCatalog();
  let progression = grantTo(inflated, initializeProgression(inflated, WARRIOR), CANONICAL_TOTAL_XP_TO_10, "ceil-l10");
  progression = selectBranch(progression, inflated, WARRIOR, {
    requestId: "sel-ceil-01",
    branchId: BERSERKER,
  }).progression;
  progression = purchaseTalent(progression, inflated, WARRIOR, {
    treeId: CLASS_TREE,
    nodeId: CLASS_NODE_A,
    requestedRank: 1,
    requestId: "ceil-cls-a",
  }).progression;
  progression = purchaseTalent(progression, inflated, WARRIOR, {
    treeId: CLASS_TREE,
    nodeId: CLASS_NODE_B,
    requestedRank: 1,
    requestId: "ceil-cls-b",
  }).progression;
  assert.equal(
    countOwnedActives(
      inflated,
      WARRIOR,
      progression.level,
      progression.branchId,
      progression.purchasedClassNodeIds,
      progression.purchasedBranchNodeRanks,
    ),
    4,
  );
  progression = purchaseTalent(progression, inflated, WARRIOR, {
    treeId: BERSERKER_TREE,
    nodeId: SLAUGHTER,
    requestedRank: 1,
    requestId: "ceil-t1a",
  }).progression;
  progression = purchaseTalent(progression, inflated, WARRIOR, {
    treeId: BERSERKER_TREE,
    nodeId: FRENZY_R2,
    requestedRank: 1,
    requestId: "ceil-t1b",
  }).progression;
  const fifth = purchaseTalent(progression, inflated, WARRIOR, {
    treeId: BERSERKER_TREE,
    nodeId: WHIRLWIND_NODE,
    requestedRank: 1,
    requestId: "ceil-ww",
  });
  assert.equal(fifth.ok, false);
  assert.equal(fifth.code, "active_ceiling");
  assert.equal(fifth.progression.purchasedBranchNodeRanks[WHIRLWIND_NODE], undefined);
});

test("canonical hotbar validates ownership, actives, slots, and duplicates", () => {
  let progression = grantTo(catalog, initializeProgression(catalog, WARRIOR), CANONICAL_TOTAL_XP_TO_10, "bar-l10");
  progression = selectBranch(progression, catalog, WARRIOR, {
    requestId: "sel-bar-01",
    branchId: BERSERKER,
  }).progression;
  progression = purchaseTalent(progression, catalog, WARRIOR, {
    treeId: BERSERKER_TREE,
    nodeId: SLAUGHTER,
    requestedRank: 1,
    requestId: "bar-t1a",
  }).progression;
  progression = purchaseTalent(progression, catalog, WARRIOR, {
    treeId: BERSERKER_TREE,
    nodeId: FRENZY_R2,
    requestedRank: 1,
    requestId: "bar-t1b",
  }).progression;
  progression = purchaseTalent(progression, catalog, WARRIOR, {
    treeId: BERSERKER_TREE,
    nodeId: WHIRLWIND_NODE,
    requestedRank: 1,
    requestId: "bar-ww",
  }).progression;
  const locked = assignCanonicalHotbar(progression, catalog, WARRIOR, 0, "ability.mage.fireball");
  assert.equal(locked.ok, false);
  assert.equal(locked.code, "ability_locked");
  const slot = assignCanonicalHotbar(progression, catalog, WARRIOR, 4, BASIC);
  assert.equal(slot.ok, false);
  assert.equal(slot.code, "invalid_slot");
  const first = assignCanonicalHotbar(progression, catalog, WARRIOR, 0, BASIC);
  assert.equal(first.ok, true);
  const dup = assignCanonicalHotbar(progression, catalog, WARRIOR, 1, BASIC);
  assert.equal(dup.ok, false);
  assert.equal(dup.code, "duplicate_hotbar");
  const whirl = assignCanonicalHotbar(progression, catalog, WARRIOR, 1, WHIRLWIND);
  assert.equal(whirl.ok, true);
  const clear = assignCanonicalHotbar(progression, catalog, WARRIOR, 0, "");
  assert.equal(clear.ok, true);
  assert.equal(progression.hotbarAssignments[0], "");
  assert.equal(progression.hotbarAssignments[1], WHIRLWIND);
  const live = assignHotbar(progression, 2, CAPSTONE, "req-bar-live1", 3, catalog, WARRIOR);
  assert.equal(live.ok, true);
  assert.equal(live.progression.hotbarAssignments[2], CAPSTONE);
});

test("match ASSIGN_HOTBAR uses the four-slot production path and ABILITY_STATE reports it", () => {
  let progression = grantTo(catalog, initializeProgression(catalog, WARRIOR), 100, "match-bar");
  const first = applyMatchLoop(addPlayer(serviceZone(), warriorAtInn(progression)), 31, contentHash, [
    {
      opcode: ClientOpcode.ASSIGN_HOTBAR,
      raw: envelope({ slotIndex: 0, abilityId: BASIC, requestId: "req-bar-ok01" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(first)[0].ok, true);
  const abilityBodies = first.outbound
    .filter((item) => item.opcode === ServerOpcode.ABILITY_STATE)
    .map((item) => JSON.parse(item.body) as { abilities: { hotbar: string[]; hotbarAssignments: string[] } });
  assert.equal(abilityBodies.length > 0, true);
  assert.equal(abilityBodies[0].abilities.hotbar.length, CANONICAL_HOTBAR_SIZE);
  assert.equal(abilityBodies[0].abilities.hotbar[0], BASIC);
  assert.equal(abilityBodies[0].abilities.hotbarAssignments[0], BASIC);
  const over = applyMatchLoop(addPlayer(serviceZone(), warriorAtInn(progression)), 32, contentHash, [
    {
      opcode: ClientOpcode.ASSIGN_HOTBAR,
      raw: envelope({ slotIndex: 7, abilityId: BASIC, requestId: "req-bar-slot7" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(over)[0].ok, false);
  assert.equal(actions(over)[0].code, "invalid_slot");
  const player = warriorAtInn(progression);
  const published = publicAbilityState(player, 1, catalog);
  assert.equal((published.hotbar as string[]).length, CANONICAL_HOTBAR_SIZE);
});
