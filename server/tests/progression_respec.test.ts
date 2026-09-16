import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import {
  CANONICAL_STAT_IDS,
  CANONICAL_TOTAL_XP_TO_10,
  unspentBranchPoints,
  unspentClassPoints,
  unspentFreeStatPoints,
} from "../src/domain/canonical_progression";
import { pendingBranchSelection } from "../src/domain/canonical_leveling";
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
  allocateAttributes,
  allocateAttributesBatch,
  applyTrainerRespec,
  grantXp,
  initializeProgression,
  publicProgression,
  RESPEC_GOLD_PER_LEVEL,
  respecGoldCost,
  selectBranch,
  type CharacterProgression,
} from "../src/domain/progression";
import { storedProgressionFromValue, storedProgressionWriteValue } from "../src/domain/progression_store";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import { catalogFromContent, evaluateStats, playerStatContext } from "../src/domain/stats";
import { memoryCommitter } from "../src/domain/transaction";
import type { TradeRecord } from "../src/domain/trade";

const catalog = catalogFromContent(content);
const WARRIOR = "class.warrior";
const BERSERKER = "branch.warrior.berserker";
const BASIC = "ability.warrior.heavy_strike";
const SIGNATURE = "ability.warrior.frenzy";
const CAPSTONE = "ability.warrior.berserk";
const WHIRLWIND = "ability.warrior.whirlwind";
const WHIRLWIND_NODE = "talent.warrior.berserker.whirlwind";
const CLASS_NODE = "talent.warrior.class.dummy";

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

function warriorAtInn(gold = 0, progression?: CharacterProgression): MatchPlayer {
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
    gold: gold,
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    progression: progression !== undefined ? progression : initializeProgression(catalog, WARRIOR),
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

function seedSpentWarrior(): CharacterProgression {
  let progression = grantTo(initializeProgression(catalog, WARRIOR), CANONICAL_TOTAL_XP_TO_10, "to-cap");
  progression = selectBranch(progression, catalog, WARRIOR, {
    requestId: "sel-branch01",
    branchId: BERSERKER,
  }).progression;
  progression = allocateAttributes(progression, catalog, {
    requestId: "alloc-vit-01",
    attributeId: "stat.vitality",
    amount: 8,
    classId: WARRIOR,
  }).progression;
  progression = allocateAttributes(progression, catalog, {
    requestId: "alloc-int-01",
    attributeId: "stat.intelligence",
    amount: 3,
    classId: WARRIOR,
  }).progression;
  progression.purchasedClassNodeIds = [CLASS_NODE];
  progression.purchasedBranchNodeRanks = { [WHIRLWIND_NODE]: 1 };
  if (progression.unlockedAbilityIds.indexOf(WHIRLWIND) === -1) {
    progression.unlockedAbilityIds.push(WHIRLWIND);
  }
  progression.hotbarAssignments = [SIGNATURE, WHIRLWIND, BASIC, ""];
  progression.hotbar = [SIGNATURE, WHIRLWIND, BASIC, "test.ability.basic_melee", "", "", "", ""];
  return progression;
}

function liveTrade(): TradeRecord {
  return {
    tradeId: "trade-alice-1",
    participantA: { characterId: "char-alice", accountUserId: "user-alice", displayName: "Alice" },
    participantB: { characterId: "char-bob", accountUserId: "user-bob", displayName: "Bob" },
    state: "open",
    revision: 1,
    offers: {},
    goldOffers: {},
    acceptanceRevisionByParticipant: {},
    createdAt: 1,
    expiresAt: 9_999,
    createdAtTick: 1,
    expiresAtTick: 9_999,
    inviteExpiresAtTick: 9_999,
    matchId: "match-1",
    schemaVersion: 1,
    byRequestId: {},
  };
}

test("respec costs 50 gold per current level", () => {
  assert.equal(RESPEC_GOLD_PER_LEVEL, 50);
  assert.equal(respecGoldCost(1), 50);
  assert.equal(respecGoldCost(3), 150);
  assert.equal(respecGoldCost(10), 500);
});

test("all eight stats can receive free points including irrelevant mage stats on a warrior", () => {
  let progression = grantTo(initializeProgression(catalog, WARRIOR), 100, "l2");
  assert.equal(unspentFreeStatPoints(progression.freeStatAllocations, 2), 3);
  for (let i = 0; i < CANONICAL_STAT_IDS.length; i++) {
    const id = CANONICAL_STAT_IDS[i];
    progression = grantTo(initializeProgression(catalog, WARRIOR), 100, "l2-" + id);
    const spent = allocateAttributes(progression, catalog, {
      requestId: "alloc-" + id,
      attributeId: id,
      amount: 1,
      classId: WARRIOR,
    });
    assert.equal(spent.ok, true, id);
    assert.equal(spent.progression.freeStatAllocations[id], 1);
  }
});

test("single-point allocation is idempotent and rejects overspend unknown negative and zero", () => {
  let progression = grantTo(initializeProgression(catalog, WARRIOR), 100, "alloc-base");
  const first = allocateAttributes(progression, catalog, {
    requestId: "alloc-one-01",
    attributeId: "stat.strength",
    amount: 1,
    classId: WARRIOR,
  });
  assert.equal(first.ok, true);
  assert.equal(first.progression.freeStatAllocations["stat.strength"], 1);
  const replay = allocateAttributes(first.progression, catalog, {
    requestId: "alloc-one-01",
    attributeId: "stat.strength",
    amount: 1,
    classId: WARRIOR,
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.progression.freeStatAllocations["stat.strength"], 1);
  const overspend = allocateAttributes(first.progression, catalog, {
    requestId: "alloc-over-01",
    attributeId: "stat.strength",
    amount: 3,
    classId: WARRIOR,
  });
  assert.equal(overspend.ok, false);
  assert.equal(overspend.code, "insufficient_points");
  const unknown = allocateAttributes(progression, catalog, {
    requestId: "alloc-unk-01",
    attributeId: "stat.luck",
    amount: 1,
    classId: WARRIOR,
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "unknown_attribute");
  const negative = allocateAttributes(progression, catalog, {
    requestId: "alloc-neg-01",
    attributeId: "stat.strength",
    amount: -1,
    classId: WARRIOR,
  });
  assert.equal(negative.ok, false);
  assert.equal(negative.code, "invalid_amount");
  const zero = allocateAttributes(progression, catalog, {
    requestId: "alloc-zero-01",
    attributeId: "stat.strength",
    amount: 0,
    classId: WARRIOR,
  });
  assert.equal(zero.ok, false);
  assert.equal(zero.code, "invalid_amount");
});

test("there is no per-stat cap on free allocation", () => {
  let progression = grantTo(initializeProgression(catalog, WARRIOR), CANONICAL_TOTAL_XP_TO_10, "cap-free");
  const spent = allocateAttributes(progression, catalog, {
    requestId: "alloc-nocap-01",
    attributeId: "stat.intelligence",
    amount: 27,
    classId: WARRIOR,
  });
  assert.equal(spent.ok, true);
  assert.equal(spent.progression.freeStatAllocations["stat.intelligence"], 27);
  assert.equal(unspentFreeStatPoints(spent.progression.freeStatAllocations, 10), 0);
});

test("batch allocation validates the whole set and applies atomically", () => {
  const progression = grantTo(initializeProgression(catalog, WARRIOR), 100 + 280, "batch-base");
  assert.equal(unspentFreeStatPoints(progression.freeStatAllocations, 3), 6);
  const ok = allocateAttributesBatch(progression, catalog, {
    requestId: "batch-ok-0001",
    classId: WARRIOR,
    allocations: [
      { statId: "stat.strength", amount: 2 },
      { statId: "stat.vitality", amount: 3 },
    ],
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.progression.freeStatAllocations["stat.strength"], 2);
  assert.equal(ok.progression.freeStatAllocations["stat.vitality"], 3);
  const partial = allocateAttributesBatch(progression, catalog, {
    requestId: "batch-over-001",
    classId: WARRIOR,
    allocations: [
      { statId: "stat.strength", amount: 4 },
      { statId: "stat.vitality", amount: 4 },
    ],
  });
  assert.equal(partial.ok, false);
  assert.equal(partial.code, "insufficient_points");
  assert.equal(partial.progression.freeStatAllocations["stat.strength"], undefined);
  assert.equal(partial.progression.freeStatAllocations["stat.vitality"], undefined);
  const replay = allocateAttributesBatch(ok.progression, catalog, {
    requestId: "batch-ok-0001",
    classId: WARRIOR,
    allocations: [{ statId: "stat.strength", amount: 2 }],
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.progression.freeStatAllocations["stat.strength"], 2);
});

test("trainer overlay adds respec without rebuilding content", () => {
  const npcs = npcDefinitionsFromContent(content.npcs);
  assert.equal(npcs["npc.test_innkeeper"].services.some((service) => service.type === "respec"), true);
  if (npcs["npc.lab_trainer"] !== undefined) {
    assert.equal(npcs["npc.lab_trainer"].services.some((service) => service.type === "respec"), true);
  }
  assert.equal(catalog.talentGrants[WHIRLWIND_NODE] !== undefined, true);
});

test("successful respec refunds points, keeps class level xp growth and basic, and clears branch", () => {
  const before = seedSpentWarrior();
  const hpBefore = evaluateStats(
    catalog,
    playerStatContext(WARRIOR, before, emptyEquipment(), emptyInventory(), {}),
  ).maxHealth;
  const outcome = applyTrainerRespec(before, catalog, {
    requestId: "respec-ok-0001",
    trainerId: "npc.test_innkeeper",
    characterId: "char-alice",
    classId: WARRIOR,
    timestamp: 12,
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.goldCost, 500);
  const after = outcome.progression;
  assert.equal(after.classId, WARRIOR);
  assert.equal(after.level, 10);
  assert.equal(after.lifetimeXp, CANONICAL_TOTAL_XP_TO_10);
  assert.equal(after.branchId, "");
  assert.equal(Object.keys(after.freeStatAllocations).length, 0);
  assert.equal(after.purchasedClassNodeIds.length, 0);
  assert.equal(Object.keys(after.purchasedBranchNodeRanks).length, 0);
  assert.equal(unspentFreeStatPoints(after.freeStatAllocations, 10), 27);
  assert.equal(unspentClassPoints(after.purchasedClassNodeIds, 10), 2);
  assert.equal(unspentBranchPoints(after.purchasedBranchNodeRanks, 10), 6);
  assert.equal(after.unlockedAbilityIds.indexOf(BASIC) >= 0, true);
  assert.equal(after.unlockedAbilityIds.indexOf(SIGNATURE), -1);
  assert.equal(after.unlockedAbilityIds.indexOf(CAPSTONE), -1);
  assert.equal(after.unlockedAbilityIds.indexOf(WHIRLWIND), -1);
  assert.equal(after.hotbarAssignments[0], "");
  assert.equal(after.hotbarAssignments[1], "");
  assert.equal(after.hotbarAssignments[2], BASIC);
  assert.equal(pendingBranchSelection(after.level, after.branchId), true);
  const hpAfter = evaluateStats(
    catalog,
    playerStatContext(WARRIOR, after, emptyEquipment(), emptyInventory(), {}),
  ).maxHealth;
  assert.equal(hpAfter < hpBefore, true);
  const view = publicProgression(catalog, WARRIOR, after, { "formula.hp_max": hpAfter });
  assert.equal(view.pendingBranchSelection, true);
  assert.equal(view.autoAssignEnabled, false);
});

test("match respec charges gold, cleans hotbar, and persists across reconnect", () => {
  const progression = seedSpentWarrior();
  const actor = warriorAtInn(500, progression);
  actor.inventory = emptyInventory();
  const state = addPlayer(serviceZone(), actor);
  const first = applyMatchLoop(state, 4, contentHash, [
    {
      opcode: ClientOpcode.TRAINER_RESPEC,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-respec-m01" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(first)[0].ok, true);
  const player = first.state.players["user-alice"];
  assert.equal(player.gold, 0);
  assert.equal(player.progression !== undefined ? player.progression.branchId : "missing", "");
  assert.equal(player.progression !== undefined ? player.progression.unlockedAbilityIds.indexOf(SIGNATURE) : 0, -1);
  assert.equal(player.progression !== undefined ? player.progression.hotbarAssignments[0] : "x", "");
  assert.equal(first.persistProgression.length, 1);
  const stored = storedProgressionFromValue(storedProgressionWriteValue(first.persistProgression[0].progression));
  assert.notEqual(stored, null);
  if (stored === null) {
    return;
  }
  assert.equal(stored.branchId, "");
  assert.equal(unspentFreeStatPoints(stored.freeStatAllocations, 10), 27);
  assert.equal(stored.respecByRequestId !== undefined && stored.respecByRequestId["req-respec-m01"].ok, true);
  const restored = warriorAtInn(0, stored);
  const rejoin = addPlayer(serviceZone(), restored);
  assert.equal(rejoin.players["user-alice"].progression !== undefined ? rejoin.players["user-alice"].progression.branchId : "x", "");
  assert.equal(player.inventory !== undefined, true);
});

test("respec cost follows current level and rejects insufficient gold", () => {
  const leveled = grantTo(initializeProgression(catalog, WARRIOR), 100 + 280, "l3");
  const rich = applyMatchLoop(addPlayer(serviceZone(), warriorAtInn(150, leveled)), 5, contentHash, [
    {
      opcode: ClientOpcode.TRAINER_RESPEC,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-respec-l3a" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(rich)[0].ok, true);
  assert.equal(rich.state.players["user-alice"].gold, 0);
  const poor = applyMatchLoop(addPlayer(serviceZone(), warriorAtInn(149, leveled)), 6, contentHash, [
    {
      opcode: ClientOpcode.TRAINER_RESPEC,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-respec-l3b" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(poor)[0].ok, false);
  assert.equal(actions(poor)[0].code, "insufficient_gold");
  assert.equal(poor.state.players["user-alice"].gold, 149);
});

test("respec is rejected out of range in combat and while trading", () => {
  const progression = grantTo(initializeProgression(catalog, WARRIOR), 100, "gate");
  const far = warriorAtInn(50, progression);
  far.x = 0;
  far.y = 0;
  const range = applyMatchLoop(addPlayer(serviceZone(), far), 7, contentHash, [
    {
      opcode: ClientOpcode.TRAINER_RESPEC,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-respec-rng1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(range)[0].ok, false);
  assert.equal(actions(range)[0].code, "out_of_range");
  const combatActor = warriorAtInn(50, progression);
  combatActor.inCombat = true;
  const combat = applyMatchLoop(addPlayer(serviceZone(), combatActor), 8, contentHash, [
    {
      opcode: ClientOpcode.TRAINER_RESPEC,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-respec-cmb1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(combat)[0].ok, false);
  assert.equal(actions(combat)[0].code, "in_combat");
  const trader = addPlayer(serviceZone(), warriorAtInn(50, progression));
  trader.trades["trade-alice-1"] = liveTrade();
  const trading = applyMatchLoop(trader, 9, contentHash, [
    {
      opcode: ClientOpcode.TRAINER_RESPEC,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-respec-trd1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(trading)[0].ok, false);
  assert.equal(actions(trading)[0].code, "trading");
  const elderActor = warriorAtInn(50, progression);
  const elderNpc = content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.elder") as { x: number; y: number };
  elderActor.x = elderNpc.x;
  elderActor.y = elderNpc.y;
  const elder = applyMatchLoop(addPlayer(serviceZone(), elderActor), 10, contentHash, [
    {
      opcode: ClientOpcode.TRAINER_RESPEC,
      raw: envelope({ npcId: "npc.elder", requestId: "req-respec-eld1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(elder)[0].ok, false);
  assert.equal(actions(elder)[0].code, "invalid_service");
});

test("repeated respec request ids do not deduct gold twice", () => {
  const progression = grantTo(initializeProgression(catalog, WARRIOR), 100, "gold-id");
  const commit = memoryCommitter();
  const first = applyMatchLoop(
    addPlayer(serviceZone(), warriorAtInn(100, progression)),
    11,
    contentHash,
    [
      {
        opcode: ClientOpcode.TRAINER_RESPEC,
        raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-respec-dup1" }),
        userId: "user-alice",
      },
    ],
    undefined,
    undefined,
    commit,
  );
  assert.equal(actions(first)[0].ok, true);
  assert.equal(first.state.players["user-alice"].gold, 0);
  const second = applyMatchLoop(
    first.state,
    12,
    contentHash,
    [
      {
        opcode: ClientOpcode.TRAINER_RESPEC,
        raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-respec-dup1" }),
        userId: "user-alice",
      },
    ],
    undefined,
    undefined,
    commit,
  );
  assert.equal(actions(second)[0].ok, true);
  assert.equal(second.state.players["user-alice"].gold, 0);
});

test("match allocate spends one point and rejects combat", () => {
  const progression = grantTo(initializeProgression(catalog, WARRIOR), 100, "match-alloc");
  const ok = applyMatchLoop(addPlayer(serviceZone(), warriorAtInn(0, progression)), 13, contentHash, [
    {
      opcode: ClientOpcode.ALLOCATE_ATTRIBUTES,
      raw: envelope({ statId: "stat.intelligence", amount: 1, requestId: "req-alloc-m001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(ok)[0].ok, true);
  assert.equal(ok.state.players["user-alice"].progression !== undefined
    ? ok.state.players["user-alice"].progression.freeStatAllocations["stat.intelligence"]
    : 0, 1);
  const fighter = warriorAtInn(0, grantTo(initializeProgression(catalog, WARRIOR), 100, "match-cmb"));
  fighter.inCombat = true;
  const blocked = applyMatchLoop(addPlayer(serviceZone(), fighter), 14, contentHash, [
    {
      opcode: ClientOpcode.ALLOCATE_ATTRIBUTES,
      raw: envelope({ attributeId: "stat.strength", amount: 1, requestId: "req-alloc-m002" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(blocked)[0].ok, false);
  assert.equal(actions(blocked)[0].code, "in_combat");
});

test("match batch allocation applies atomically and does not partial-spend", () => {
  const progression = grantTo(initializeProgression(catalog, WARRIOR), 100, "match-batch");
  const ok = applyMatchLoop(addPlayer(serviceZone(), warriorAtInn(0, progression)), 15, contentHash, [
    {
      opcode: ClientOpcode.ALLOCATE_ATTRIBUTES_BATCH,
      raw: envelope({
        allocations: [
          { statId: "stat.strength", amount: 1 },
          { statId: "stat.intelligence", amount: 1 },
        ],
        requestId: "req-batch-m001",
      }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(ok)[0].ok, true);
  const spent = ok.state.players["user-alice"].progression;
  assert.equal(spent !== undefined ? spent.freeStatAllocations["stat.strength"] : 0, 1);
  assert.equal(spent !== undefined ? spent.freeStatAllocations["stat.intelligence"] : 0, 1);
  const over = applyMatchLoop(addPlayer(serviceZone(), warriorAtInn(0, progression)), 16, contentHash, [
    {
      opcode: ClientOpcode.ALLOCATE_ATTRIBUTES_BATCH,
      raw: envelope({
        allocations: [
          { statId: "stat.strength", amount: 2 },
          { statId: "stat.intelligence", amount: 2 },
        ],
        requestId: "req-batch-m002",
      }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(over)[0].ok, false);
  assert.equal(actions(over)[0].code, "insufficient_points");
  const untouched = over.state.players["user-alice"].progression;
  assert.equal(untouched !== undefined ? untouched.freeStatAllocations["stat.strength"] : 1, undefined);
  assert.equal(untouched !== undefined ? untouched.freeStatAllocations["stat.intelligence"] : 1, undefined);
});
