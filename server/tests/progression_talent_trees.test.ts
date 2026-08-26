import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import {
  CANONICAL_HOTBAR_SIZE,
  CANONICAL_MAX_CLASS_NODES,
  CANONICAL_TOTAL_XP_TO_10,
  CANONICAL_XP_TO_NEXT,
  FRENZY_ABILITY_ID,
  unspentBranchPoints,
  unspentClassPoints,
} from "../src/domain/canonical_progression";
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
  applyTrainerRespec,
  grantXp,
  initializeProgression,
  purchaseTalent,
  selectBranch,
  type CharacterProgression,
} from "../src/domain/progression";
import { storedProgressionFromValue, storedProgressionWriteValue } from "../src/domain/progression_store";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import { catalogFromContent } from "../src/domain/stats";

const catalog = catalogFromContent(content);
const WARRIOR = "class.warrior";
const BERSERKER = "branch.warrior.berserker";
const BULWARK = "branch.warrior.bulwark";
const FROST = "branch.mage.frost";
const CLASS_TREE = "tree.warrior.class";
const BERSERKER_TREE = "tree.warrior.berserker";
const BULWARK_TREE = "tree.warrior.bulwark";
const CLASS_NODE_A = "talent.warrior.heavy_strike_r2";
const CLASS_NODE_B = "talent.warrior.conditioning";
const CLASS_NODE_C = "talent.warrior.weapon_mastery";
const SLAUGHTER = "talent.warrior.berserker.slaughter";
const FRENZY_R2 = "talent.warrior.berserker.frenzy_r2";
const RELENTLESS = "talent.warrior.berserker.relentless";
const FRENZY_R3 = "talent.warrior.berserker.frenzy_r3";
const BLOODLUST = "talent.warrior.berserker.bloodlust";
const WHIRLWIND_NODE = "talent.warrior.berserker.whirlwind";
const BLOODTHIRST = "talent.warrior.berserker.bloodthirst";
const RECKLESS = "talent.warrior.berserker.reckless";
const IRON_THORNS = "talent.warrior.bulwark.iron_thorns";
const FORTITUDE = "talent.warrior.bulwark.fortitude";
const SHIELD_BASH = "talent.warrior.bulwark.shield_bash";
const SHIELD_BASH_R2 = "talent.warrior.bulwark.shield_bash_r2";
const BASIC = "ability.warrior.heavy_strike";
const SIGNATURE = FRENZY_ABILITY_ID;
const CAPSTONE = "ability.warrior.berserk";
const WHIRLWIND = "ability.warrior.whirlwind";
const SHIELD_BASH_ABILITY = "ability.warrior.shield_bash";

function xpToLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += CANONICAL_XP_TO_NEXT[i - 1];
  }
  return total;
}

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

function grantTo(progression: CharacterProgression, amount: number, eventId: string) {
  return grantXp(progression, catalog, WARRIOR, {
    characterId: "char-alice",
    amount: amount,
    reasonType: "dev",
    reasonId: "dev",
    eventId: eventId,
    createdAt: 1,
  }).progression;
}

function warriorAt(level: number, eventId: string): CharacterProgression {
  return grantTo(initializeProgression(catalog, WARRIOR), xpToLevel(level), eventId);
}

function withBranch(progression: CharacterProgression, branchId: string, requestId: string): CharacterProgression {
  const selected = selectBranch(progression, catalog, WARRIOR, { requestId: requestId, branchId: branchId });
  assert.equal(selected.ok, true, selected.code);
  return selected.progression;
}

function buy(
  progression: CharacterProgression,
  treeId: string,
  nodeId: string,
  requestedRank: number,
  requestId: string,
) {
  return purchaseTalent(progression, catalog, WARRIOR, {
    treeId: treeId,
    nodeId: nodeId,
    requestedRank: requestedRank,
    requestId: requestId,
  });
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

test("berserker tree has eight nodes, nine purchasable ranks, and one two-rank node", () => {
  const tree = catalog.talentTrees[BERSERKER_TREE];
  assert.equal(tree !== undefined, true);
  assert.equal(tree.nodeIds.length, 8);
  let ranks = 0;
  let twoRank = 0;
  for (let i = 0; i < tree.nodeIds.length; i++) {
    const node = catalog.talentNodes[tree.nodeIds[i]];
    assert.equal(node !== undefined, true, tree.nodeIds[i]);
    ranks += node.maxRank;
    if (node.maxRank === 2) {
      twoRank += 1;
    }
  }
  assert.equal(ranks, 9);
  assert.equal(twoRank, 1);
  assert.equal(catalog.classes[WARRIOR].classTreeId, CLASS_TREE);
  assert.equal(catalog.branches[BERSERKER].branchTreeId, BERSERKER_TREE);
});

test("class points: one at level 3, two at level 4, third class node rejected", () => {
  const l2 = warriorAt(2, "to-l2");
  assert.equal(unspentClassPoints(l2.purchasedClassNodeIds, l2.level), 0);
  const tooEarly = buy(l2, CLASS_TREE, CLASS_NODE_A, 1, "cls-early01");
  assert.equal(tooEarly.ok, false);
  assert.equal(tooEarly.code, "insufficient_points");
  const l3 = warriorAt(3, "to-l3");
  assert.equal(unspentClassPoints(l3.purchasedClassNodeIds, l3.level), 1);
  const first = buy(l3, CLASS_TREE, CLASS_NODE_A, 1, "cls-l3-0001");
  assert.equal(first.ok, true);
  assert.equal(first.progression.purchasedClassNodeIds.indexOf(CLASS_NODE_A) >= 0, true);
  assert.equal(unspentClassPoints(first.progression.purchasedClassNodeIds, 3), 0);
  const secondAt3 = buy(first.progression, CLASS_TREE, CLASS_NODE_B, 1, "cls-l3-0002");
  assert.equal(secondAt3.ok, false);
  assert.equal(secondAt3.code, "insufficient_points");
  const l4 = warriorAt(4, "to-l4");
  assert.equal(unspentClassPoints(l4.purchasedClassNodeIds, l4.level), 2);
  const a = buy(l4, CLASS_TREE, CLASS_NODE_A, 1, "cls-l4-0001");
  const b = buy(a.progression, CLASS_TREE, CLASS_NODE_B, 1, "cls-l4-0002");
  assert.equal(b.ok, true);
  assert.equal(b.progression.purchasedClassNodeIds.length, CANONICAL_MAX_CLASS_NODES);
  const third = buy(b.progression, CLASS_TREE, CLASS_NODE_C, 1, "cls-l4-0003");
  assert.equal(third.ok, false);
  assert.equal(third.code, "insufficient_points");
  assert.equal(third.progression.purchasedClassNodeIds.length, 2);
});

test("class points cannot buy a branch node and branch points cannot buy a class node", () => {
  const l5 = withBranch(warriorAt(5, "cross-l5"), BERSERKER, "sel-cross01");
  assert.equal(unspentClassPoints(l5.purchasedClassNodeIds, 5), 2);
  assert.equal(unspentBranchPoints(l5.purchasedBranchNodeRanks, 5), 1);
  const crossTree = buy(l5, CLASS_TREE, SLAUGHTER, 1, "cross-cls-01");
  assert.equal(crossTree.ok, false);
  assert.equal(crossTree.code, "invalid_id");
  const classBuy = buy(l5, CLASS_TREE, CLASS_NODE_A, 1, "cross-ok-01");
  assert.equal(classBuy.ok, true);
  assert.equal(unspentClassPoints(classBuy.progression.purchasedClassNodeIds, 5), 1);
  assert.equal(unspentBranchPoints(classBuy.progression.purchasedBranchNodeRanks, 5), 1);
  const branchBuy = buy(classBuy.progression, BERSERKER_TREE, SLAUGHTER, 1, "cross-br-01");
  assert.equal(branchBuy.ok, true);
  assert.equal(unspentClassPoints(branchBuy.progression.purchasedClassNodeIds, 5), 1);
  assert.equal(unspentBranchPoints(branchBuy.progression.purchasedBranchNodeRanks, 5), 0);
  const noBranchForClass = buy(branchBuy.progression, CLASS_TREE, CLASS_NODE_B, 1, "cross-cls-02");
  assert.equal(noBranchForClass.ok, true);
  const thirdClass = buy(noBranchForClass.progression, CLASS_TREE, CLASS_NODE_C, 1, "cross-cls-03");
  assert.equal(thirdClass.ok, false);
  assert.equal(unspentBranchPoints(thirdClass.progression.purchasedBranchNodeRanks, 5), 0);
});

test("branch choice before level 5 and wrong-class branch are rejected", () => {
  const l4 = warriorAt(4, "br-early");
  const early = selectBranch(l4, catalog, WARRIOR, { requestId: "sel-early01", branchId: BERSERKER });
  assert.equal(early.ok, false);
  assert.equal(early.code, "branch_locked");
  const l5 = warriorAt(5, "br-wrong");
  const wrong = selectBranch(l5, catalog, WARRIOR, { requestId: "sel-wrong01", branchId: FROST });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, "invalid_branch");
  assert.equal(wrong.progression.branchId, "");
});

test("selecting a branch grants signature, keeps unspent branch points, and grants capstone at 10", () => {
  const l5 = warriorAt(5, "sig-l5");
  assert.equal(l5.unlockedAbilityIds.indexOf(BASIC) >= 0, true);
  assert.equal(l5.unlockedAbilityIds.indexOf(SIGNATURE), -1);
  const selected = selectBranch(l5, catalog, WARRIOR, { requestId: "sel-sig-01", branchId: BERSERKER });
  assert.equal(selected.ok, true);
  assert.equal(selected.progression.branchId, BERSERKER);
  assert.equal(selected.progression.unlockedAbilityIds.indexOf(SIGNATURE) >= 0, true);
  assert.equal(selected.progression.unlockedAbilityIds.indexOf(CAPSTONE), -1);
  assert.equal(unspentBranchPoints(selected.progression.purchasedBranchNodeRanks, 5), 1);
  const eventTypes = selected.events.map((event) => event.type);
  assert.equal(eventTypes.indexOf("signature_unlocked") >= 0, true);
  const again = selectBranch(selected.progression, catalog, WARRIOR, { requestId: "sel-sig-02", branchId: BULWARK });
  assert.equal(again.ok, false);
  assert.equal(again.code, "branch_already_selected");
  const replay = selectBranch(selected.progression, catalog, WARRIOR, { requestId: "sel-sig-01", branchId: BERSERKER });
  assert.equal(replay.replay, true);
  assert.equal(replay.ok, true);
  const l10 = grantTo(selected.progression, CANONICAL_TOTAL_XP_TO_10, "to-cap-sig");
  assert.equal(l10.unlockedAbilityIds.indexOf(CAPSTONE) >= 0, true);
  assert.equal(unspentBranchPoints(l10.purchasedBranchNodeRanks, 10), 6);
});

test("branch points earned are 1 at 5 through 6 at 10", () => {
  for (let level = 1; level <= 10; level++) {
    const progression = warriorAt(level, "bp-" + level);
    const expected = level < 5 ? 0 : Math.min(6, level - 4);
    assert.equal(unspentBranchPoints(progression.purchasedBranchNodeRanks, level), expected, "level " + level);
  }
});

test("tier 2 requires two points already spent in the branch tree", () => {
  const l6 = withBranch(warriorAt(6, "t2-l6"), BERSERKER, "sel-t2-01");
  assert.equal(unspentBranchPoints(l6.purchasedBranchNodeRanks, 6), 2);
  const tooSoon = buy(l6, BERSERKER_TREE, WHIRLWIND_NODE, 1, "t2-soon-01");
  assert.equal(tooSoon.ok, false);
  assert.equal(tooSoon.code, "prerequisite_missing");
  const one = buy(l6, BERSERKER_TREE, SLAUGHTER, 1, "t2-t1a-01");
  assert.equal(one.ok, true);
  const stillSoon = buy(one.progression, BERSERKER_TREE, WHIRLWIND_NODE, 1, "t2-soon-02");
  assert.equal(stillSoon.ok, false);
  assert.equal(stillSoon.code, "prerequisite_missing");
  const two = buy(one.progression, BERSERKER_TREE, FRENZY_R2, 1, "t2-t1b-01");
  assert.equal(two.ok, true);
  const whirl = buy(two.progression, BERSERKER_TREE, WHIRLWIND_NODE, 1, "t2-ok-0001");
  assert.equal(whirl.ok, false);
  assert.equal(whirl.code, "insufficient_points");
  const l7 = grantTo(two.progression, xpToLevel(7) - xpToLevel(6), "t2-to-l7");
  const unlocked = buy(l7, BERSERKER_TREE, WHIRLWIND_NODE, 1, "t2-ok-0002");
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.progression.unlockedAbilityIds.indexOf(WHIRLWIND) >= 0, true);
});

test("tier 3 requires four spent points and cannot be purchased before level 9", () => {
  let progression = withBranch(warriorAt(8, "t3-l8"), BERSERKER, "sel-t3-01");
  progression = buy(progression, BERSERKER_TREE, SLAUGHTER, 1, "t3-t1a").progression;
  progression = buy(progression, BERSERKER_TREE, FRENZY_R2, 1, "t3-t1b").progression;
  progression = buy(progression, BERSERKER_TREE, WHIRLWIND_NODE, 1, "t3-t2a").progression;
  const early = buy(progression, BERSERKER_TREE, BLOODTHIRST, 1, "t3-early01");
  assert.equal(early.ok, false);
  assert.equal(early.code, "level_restricted");
  progression = buy(progression, BERSERKER_TREE, BLOODLUST, 1, "t3-t2b").progression;
  assert.equal(unspentBranchPoints(progression.purchasedBranchNodeRanks, 8), 0);
  const l9 = grantTo(progression, xpToLevel(9) - xpToLevel(8), "t3-to-l9");
  const stillGated = buy(l9, BERSERKER_TREE, BLOODTHIRST, 1, "t3-gate-01");
  assert.equal(stillGated.ok, true);
  assert.equal(stillGated.progression.purchasedBranchNodeRanks[BLOODTHIRST], 1);
  const l10 = grantTo(stillGated.progression, xpToLevel(10) - xpToLevel(9), "t3-to-l10");
  const otherT3 = buy(l10, BERSERKER_TREE, RECKLESS, 1, "t3-ok-0002");
  assert.equal(otherT3.ok, true);
  assert.equal(otherT3.progression.purchasedBranchNodeRanks[RECKLESS], 1);
});

test("rank 2 requires rank 1 and signature R3 requires its R2 node", () => {
  const l6 = withBranch(warriorAt(6, "rank-l6"), BERSERKER, "sel-rank01");
  const skip = buy(l6, BERSERKER_TREE, RELENTLESS, 2, "rank-skip01");
  assert.equal(skip.ok, false);
  assert.equal(skip.code, "invalid_rank");
  const r1 = buy(l6, BERSERKER_TREE, RELENTLESS, 1, "rank-r1-01");
  assert.equal(r1.ok, true);
  const r2 = buy(r1.progression, BERSERKER_TREE, RELENTLESS, 2, "rank-r2-01");
  assert.equal(r2.ok, true);
  assert.equal(r2.progression.purchasedBranchNodeRanks[RELENTLESS], 2);
  const duplicate = buy(r2.progression, BERSERKER_TREE, RELENTLESS, 2, "rank-dup01");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "already_unlocked");
  const overMax = buy(r2.progression, BERSERKER_TREE, RELENTLESS, 3, "rank-max01");
  assert.equal(overMax.ok, false);
  assert.equal(overMax.code, "invalid_rank");
  const l7 = grantTo(r2.progression, xpToLevel(7) - xpToLevel(6), "rank-to-l7");
  const r3Missing = buy(l7, BERSERKER_TREE, FRENZY_R3, 1, "rank-r3-01");
  assert.equal(r3Missing.ok, false);
  assert.equal(r3Missing.code, "prerequisite_missing");
});

test("buyable branch active is granted only by its node; active R2 requires the unlock", () => {
  let progression = withBranch(warriorAt(10, "act-l10"), BULWARK, "sel-act-01");
  assert.equal(progression.unlockedAbilityIds.indexOf(SHIELD_BASH_ABILITY), -1);
  const r2First = buy(progression, BULWARK_TREE, SHIELD_BASH_R2, 1, "act-r2-01");
  assert.equal(r2First.ok, false);
  assert.equal(r2First.code, "prerequisite_missing");
  progression = buy(progression, BULWARK_TREE, IRON_THORNS, 1, "act-t1a").progression;
  progression = buy(progression, BULWARK_TREE, FORTITUDE, 1, "act-t1b").progression;
  const stillLocked = buy(progression, BULWARK_TREE, SHIELD_BASH_R2, 1, "act-r2-02");
  assert.equal(stillLocked.ok, false);
  assert.equal(stillLocked.code, "prerequisite_missing");
  const unlock = buy(progression, BULWARK_TREE, SHIELD_BASH, 1, "act-bash01");
  assert.equal(unlock.ok, true);
  assert.equal(unlock.progression.unlockedAbilityIds.indexOf(SHIELD_BASH_ABILITY) >= 0, true);
  progression = buy(unlock.progression, BULWARK_TREE, FORTITUDE, 2, "act-t1c").progression;
  const upgrade = buy(progression, BULWARK_TREE, SHIELD_BASH_R2, 1, "act-r2-03");
  assert.equal(upgrade.ok, true);
  assert.equal(upgrade.progression.purchasedBranchNodeRanks[SHIELD_BASH_R2], 1);
});

test("duplicate talent purchase is rejected and respec clears nodes, branch, and granted actives", () => {
  let progression = withBranch(warriorAt(10, "dup-l10"), BERSERKER, "sel-dup-01");
  const first = buy(progression, BERSERKER_TREE, SLAUGHTER, 1, "dup-buy-01");
  assert.equal(first.ok, true);
  const replay = buy(first.progression, BERSERKER_TREE, SLAUGHTER, 1, "dup-buy-01");
  assert.equal(replay.replay, true);
  assert.equal(replay.ok, true);
  const second = buy(first.progression, BERSERKER_TREE, SLAUGHTER, 1, "dup-buy-02");
  assert.equal(second.ok, false);
  assert.equal(second.code, "already_unlocked");
  progression = buy(first.progression, BERSERKER_TREE, FRENZY_R2, 1, "dup-t1b").progression;
  progression = buy(progression, BERSERKER_TREE, WHIRLWIND_NODE, 1, "dup-ww").progression;
  progression = buy(progression, CLASS_TREE, CLASS_NODE_A, 1, "dup-cls").progression;
  progression.hotbarAssignments = [WHIRLWIND, BASIC, "", ""];
  const respec = applyTrainerRespec(progression, catalog, {
    requestId: "respec-tal-01",
    trainerId: "npc.test_innkeeper",
    characterId: "char-alice",
    classId: WARRIOR,
    timestamp: 20,
  });
  assert.equal(respec.ok, true);
  const after = respec.progression;
  assert.equal(after.branchId, "");
  assert.equal(after.purchasedClassNodeIds.length, 0);
  assert.equal(Object.keys(after.purchasedBranchNodeRanks).length, 0);
  assert.equal(after.unlockedAbilityIds.indexOf(BASIC) >= 0, true);
  assert.equal(after.unlockedAbilityIds.indexOf(WHIRLWIND), -1);
  assert.equal(after.unlockedAbilityIds.indexOf(SIGNATURE), -1);
  assert.equal(after.hotbarAssignments.indexOf(WHIRLWIND), -1);
  assert.equal(after.hotbarAssignments.indexOf(BASIC) >= 0, true);
  assert.equal(after.hotbarAssignments.length, CANONICAL_HOTBAR_SIZE);
});

test("purchase talent match action is restricted, persisted, and restored on reconnect", () => {
  const progression = withBranch(warriorAt(5, "match-l5"), BERSERKER, "sel-match01");
  const fighter = warriorAtInn(progression);
  fighter.inCombat = true;
  const combat = applyMatchLoop(addPlayer(serviceZone(), fighter), 21, contentHash, [
    {
      opcode: ClientOpcode.PURCHASE_TALENT,
      raw: envelope({
        treeId: BERSERKER_TREE,
        nodeId: SLAUGHTER,
        requestedRank: 1,
        requestId: "req-tal-cmb01",
      }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(combat)[0].ok, false);
  assert.equal(actions(combat)[0].code, "in_combat");
  const first = applyMatchLoop(addPlayer(serviceZone(), warriorAtInn(progression)), 22, contentHash, [
    {
      opcode: ClientOpcode.PURCHASE_TALENT,
      raw: envelope({
        treeId: BERSERKER_TREE,
        nodeId: SLAUGHTER,
        requestedRank: 1,
        requestId: "req-tal-ok001",
      }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(first)[0].ok, true);
  const bought = first.state.players["user-alice"].progression;
  assert.equal(bought !== undefined ? bought.purchasedBranchNodeRanks[SLAUGHTER] : 0, 1);
  assert.equal(first.persistProgression.length, 1);
  const stored = storedProgressionFromValue(storedProgressionWriteValue(first.persistProgression[0].progression));
  assert.notEqual(stored, null);
  if (stored === null) {
    return;
  }
  assert.equal(stored.purchasedBranchNodeRanks[SLAUGHTER], 1);
  assert.equal(stored.branchId, BERSERKER);
  const rejoin = addPlayer(serviceZone(), warriorAtInn(stored));
  const restored = rejoin.players["user-alice"].progression;
  assert.equal(restored !== undefined ? restored.purchasedBranchNodeRanks[SLAUGHTER] : 0, 1);
  const replay = applyMatchLoop(rejoin, 23, contentHash, [
    {
      opcode: ClientOpcode.PURCHASE_TALENT,
      raw: envelope({
        treeId: BERSERKER_TREE,
        nodeId: SLAUGHTER,
        requestedRank: 1,
        requestId: "req-tal-ok001",
      }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(replay)[0].ok, true);
});

test("select branch in combat is rejected", () => {
  const fighter = warriorAtInn(warriorAt(5, "sel-cmb"));
  fighter.inCombat = true;
  const combat = applyMatchLoop(addPlayer(serviceZone(), fighter), 24, contentHash, [
    {
      opcode: ClientOpcode.SELECT_BRANCH,
      raw: envelope({ branchId: BERSERKER, requestId: "req-sel-cmb01" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(combat)[0].ok, false);
  assert.equal(actions(combat)[0].code, "in_combat");
});
