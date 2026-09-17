import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import {
  CANONICAL_MAX_OWNED_ACTIVES,
  CANONICAL_RESPEC_GOLD_PER_LEVEL,
  CANONICAL_STAT_IDS,
  CANONICAL_TOTAL_XP_TO_10,
  CANONICAL_XP_TO_NEXT,
  unspentFreeStatPoints,
} from "../src/domain/canonical_progression";
import { allocateFreeStatBatch } from "../src/domain/canonical_leveling";
import { applyCanonicalTalentPurchase, countOwnedActives } from "../src/domain/canonical_talents";
import { CANONICAL_SOURCE_EQUIPMENT, evaluateCanonicalSnapshot } from "../src/domain/canonical_stats";
import { exportProgressionSnapshot } from "../src/domain/canonical_leftover_migration";
import { assembleAccountExport } from "../src/domain/account_export";
import { applyGmToMatch, parseGmCommandPayload } from "../src/domain/gm";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import { abilityDefinitionsFromContent, autoAttackDefinitionsFromContent } from "../src/domain/ability";
import { classTagsFromContent } from "../src/domain/class_catalog";
import {
  applyTrainerRespec,
  autoAssignUnspentPoints,
  grantXp,
  initializeProgression,
  purchaseTalent,
  selectBranch,
  setAutoAssign,
  type CharacterProgression,
} from "../src/domain/progression";
import { storedProgressionFromValue, storedProgressionWriteValue } from "../src/domain/progression_store";
import { applyPlayerLeave, progressionsForTerminate, restoreGracePlayer } from "../src/domain/persistence";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { catalogFromContent } from "../src/domain/stats";
import {
  handleCharacterCreate,
  handleCharacterPurge,
  handleCharacterRestore,
  handleCharacterSoftDelete,
  type CharacterLifecycleDeps,
} from "../src/domain/character_lifecycle";
import type { CharacterRoster } from "../src/domain/character_roster";
import { SOFT_DELETE_RETENTION_MS } from "../src/domain/character_roster";
import type { StoredCharacter } from "../src/domain/character";
import type { NameReservation } from "../src/domain/character_name";
import type { SelectionTicket } from "../src/domain/character_ticket";
import { runAccountDeletionSaga, emptyDeletionJob, type AccountDeletionDeps } from "../src/domain/account_deletion";
import { CHARACTER_STATUS_ACTIVE, CHARACTER_STATUS_SOFT_DELETED } from "../src/domain/character_catalog";

const catalog = catalogFromContent(content);

const CLASSES = [
  {
    classId: "class.warrior",
    basic: "ability.warrior.heavy_strike",
    classTree: "tree.warrior.class",
    classNodes: ["talent.warrior.heavy_strike_r2", "talent.warrior.conditioning"],
    branchA: "branch.warrior.bulwark",
    branchB: "branch.warrior.berserker",
    treeB: "tree.warrior.berserker",
    spendB: [
      "talent.warrior.berserker.frenzy_r2",
      "talent.warrior.berserker.slaughter",
      "talent.warrior.berserker.bloodlust",
      "talent.warrior.berserker.whirlwind",
    ],
    t3: "talent.warrior.berserker.bloodthirst",
    capstone: "ability.warrior.berserk",
  },
  {
    classId: "class.mage",
    basic: "ability.mage.arcane_bolt",
    classTree: "tree.mage.class",
    classNodes: ["talent.mage.arcane_bolt_r2", "talent.mage.ward"],
    branchA: "branch.mage.frost",
    branchB: "branch.mage.fire",
    treeB: "tree.mage.fire",
    spendB: [
      "talent.mage.fire.fireball_r2",
      "talent.mage.fire.afterburn",
      "talent.mage.fire.flame_wave",
      "talent.mage.fire.detonation",
    ],
    t3: "talent.mage.fire.second_spark",
    capstone: "ability.mage.meteor",
  },
  {
    classId: "class.marksman",
    basic: "ability.marksman.aimed_shot",
    classTree: "tree.marksman.class",
    classNodes: ["talent.marksman.aimed_shot_r2", "talent.marksman.deadly_aim"],
    branchA: "branch.marksman.skirmisher",
    branchB: "branch.marksman.sniper",
    treeB: "tree.marksman.sniper",
    spendB: [
      "talent.marksman.sniper.snipe_r2",
      "talent.marksman.sniper.weak_spot",
      "talent.marksman.sniper.piercing_shot",
      "talent.marksman.sniper.killer_instinct",
    ],
    t3: "talent.marksman.sniper.snipers_nest",
    capstone: "ability.marksman.coup_de_grace",
  },
  {
    classId: "class.mystic",
    basic: "ability.mystic.fateweave",
    classTree: "tree.mystic.class",
    classNodes: ["talent.mystic.fateweave_r2", "talent.mystic.compassion"],
    branchA: "branch.mystic.curses",
    branchB: "branch.mystic.charms",
    treeB: "tree.mystic.charms",
    spendB: [
      "talent.mystic.charms.protective_charm_r2",
      "talent.mystic.charms.battle_blessing",
      "talent.mystic.charms.blessing",
      "talent.mystic.charms.mending_ward",
    ],
    t3: "talent.mystic.charms.overflow",
    capstone: "ability.mystic.benediction",
  },
] as const;

function xpTo(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += CANONICAL_XP_TO_NEXT[i - 1];
  }
  return total;
}

function grantTo(progression: CharacterProgression, classId: string, level: number, eventId: string): CharacterProgression {
  const need = xpTo(level);
  const amount = need > progression.lifetimeXp ? need - progression.lifetimeXp : 0;
  if (amount <= 0) {
    return progression;
  }
  return grantXp(progression, catalog, classId, {
    characterId: "char-" + classId,
    amount: amount,
    reasonType: "admin",
    reasonId: "journey",
    eventId: eventId,
  }).progression;
}

function buy(progression: CharacterProgression, classId: string, treeId: string, nodeId: string, requestId: string): CharacterProgression {
  const result = purchaseTalent(progression, catalog, classId, {
    treeId: treeId,
    nodeId: nodeId,
    requestedRank: 1,
    requestId: requestId,
  });
  assert.equal(result.ok, true, classId + " " + nodeId + " " + result.code);
  return result.progression;
}

function zone(): StarterZoneState {
  const state = createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    content.player,
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      abilitiesById: abilityDefinitionsFromContent(content.abilities),
      autoAttacksById: autoAttackDefinitionsFromContent(content.autoAttacks),
      classTags: classTagsFromContent(content.classes),
    },
  );
  state.progressionCatalog = catalog;
  return state;
}

function playerOf(classId: string, progression: CharacterProgression): MatchPlayer {
  return {
    userId: "user-" + classId,
    sessionId: "session-" + classId,
    username: classId,
    characterId: "char-" + classId,
    name: classId,
    classId: classId,
    x: 240,
    y: 384,
    maxHealth: 200,
    health: 200,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    progression: progression,
    gold: 5000,
  };
}

test("complete functional journey for every production class via authorized server tools", () => {
  for (let i = 0; i < CLASSES.length; i++) {
    const spec = CLASSES[i];
    let progression = initializeProgression(catalog, spec.classId);
    const classDef = catalog.classes[spec.classId];
    const l1 = evaluateCanonicalSnapshot({
      classId: spec.classId,
      level: 1,
      baseStats: classDef.baseStats !== undefined ? classDef.baseStats : {},
      automaticGrowth: classDef.automaticGrowth !== undefined ? classDef.automaticGrowth : {},
      freeStatAllocations: {},
      usesMana: classDef.resourceType !== "resource.none",
      modifiers: [],
    });
    let baseSum = 0;
    for (let s = 0; s < CANONICAL_STAT_IDS.length; s++) {
      baseSum += l1.stats[CANONICAL_STAT_IDS[s]];
    }
    assert.equal(baseSum, 34, spec.classId);
    assert.equal(progression.level, 1);
    assert.equal(progression.unlockedAbilityIds.indexOf(spec.basic), -1);

    let state = addPlayer(zone(), playerOf(spec.classId, progression));
    const spawn = content.zones["zone.starter"].enemies[0];
    state.enemies[0].x = spawn.x;
    state.enemies[0].y = spawn.y;
    state.players["user-" + spec.classId].x = spawn.x - 20;
    state.players["user-" + spec.classId].y = spawn.y;
    const attacked = applyMatchLoop(state, 5, contentHash, [
      {
        opcode: ClientOpcode.ATTACK,
        userId: "user-" + spec.classId,
        raw: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, targetId: state.enemies[0].id, requestId: spec.classId + "-aa" }),
      },
    ]);
    assert.ok(attacked.state.enemies[0].health <= state.enemies[0].health);

    const live = attacked.state.players["user-" + spec.classId];
    const gm = applyGmToMatch(
      attacked.state,
      live,
      parseGmCommandPayload(
        JSON.stringify({
          command: "simulate_level_up",
          reason: "cert journey",
          characterId: "char-" + spec.classId,
          requestId: spec.classId + "-gm-l2",
        }),
      ),
      1,
      6,
      itemDefinitionsFromContent(content.items),
      questDefinitionsFromContent(content.quests),
      [],
    );
    assert.equal(gm.ok, true, spec.classId + " gm " + gm.code);
    progression = live.progression as CharacterProgression;
    assert.equal(progression.level, 2);
    assert.ok(progression.unlockedAbilityIds.indexOf(spec.basic) >= 0);

    progression = grantTo(progression, spec.classId, 4, spec.classId + "-l4");
    progression = buy(progression, spec.classId, spec.classTree, spec.classNodes[0], spec.classId + "-c1");
    progression = buy(progression, spec.classId, spec.classTree, spec.classNodes[1], spec.classId + "-c2");
    const thirdId = classDef.classTreeId !== undefined ? catalog.talentTrees[classDef.classTreeId].nodeIds[2] : spec.classNodes[0];
    const third = purchaseTalent(progression, catalog, spec.classId, {
      treeId: spec.classTree,
      nodeId: thirdId,
      requestedRank: 1,
      requestId: spec.classId + "-c3",
    });
    assert.equal(third.ok, false);

    progression = grantTo(progression, spec.classId, 5, spec.classId + "-l5");
    const firstBranch = selectBranch(progression, catalog, spec.classId, { branchId: spec.branchA, requestId: spec.classId + "-ba" });
    assert.equal(firstBranch.ok, true);
    progression = firstBranch.progression;
    const spentBeforeSwitch = allocateFreeStatBatch(progression, [{ statId: "stat.vitality", amount: 3 }]);
    assert.equal(spentBeforeSwitch.ok, true);
    const switchRespec = applyTrainerRespec(progression, catalog, {
      requestId: spec.classId + "-switch",
      trainerId: "npc.test_innkeeper",
      characterId: "char-" + spec.classId,
      classId: spec.classId,
      timestamp: 1,
    });
    assert.equal(switchRespec.ok, true);
    progression = switchRespec.progression;
    assert.equal(progression.branchId, "");
    assert.equal(unspentFreeStatPoints(progression.freeStatAllocations, progression.level), 3 * (progression.level - 1));
    const secondBranch = selectBranch(progression, catalog, spec.classId, { branchId: spec.branchB, requestId: spec.classId + "-bb" });
    assert.equal(secondBranch.ok, true);
    progression = secondBranch.progression;
    assert.ok(progression.unlockedAbilityIds.indexOf(catalog.branches[spec.branchB].signatureAbilityId) >= 0);

    for (let n = 0; n < spec.spendB.length - 1; n++) {
      progression = grantTo(progression, spec.classId, 5 + n, spec.classId + "-bn-" + String(n));
      progression = buy(progression, spec.classId, spec.treeB, spec.spendB[n], spec.classId + "-t-" + spec.spendB[n]);
    }
    progression = grantTo(progression, spec.classId, 8, spec.classId + "-l8");
    const early = applyCanonicalTalentPurchase(progression, catalog, spec.classId, {
      treeId: spec.treeB,
      nodeId: spec.t3,
      requestedRank: 1,
      requestId: spec.classId + "-t3-early",
    });
    assert.equal(early.ok, false);
    assert.equal(early.code, "level_restricted");
    progression = buy(
      progression,
      spec.classId,
      spec.treeB,
      spec.spendB[spec.spendB.length - 1],
      spec.classId + "-t-" + spec.spendB[spec.spendB.length - 1],
    );
    progression = grantTo(progression, spec.classId, 9, spec.classId + "-l9");
    progression = buy(progression, spec.classId, spec.treeB, spec.t3, spec.classId + "-t3");
    progression = grantTo(progression, spec.classId, 10, spec.classId + "-l10");
    assert.equal(progression.level, 10);
    assert.ok(progression.unlockedAbilityIds.indexOf(spec.capstone) >= 0);
    const actives = countOwnedActives(
      catalog,
      spec.classId,
      progression.level,
      progression.branchId,
      progression.purchasedClassNodeIds,
      progression.purchasedBranchNodeRanks,
    );
    assert.ok(actives <= CANONICAL_MAX_OWNED_ACTIVES, spec.classId + " actives " + String(actives));
    const dump: Array<{ statId: string; amount: number }> = [{ statId: CANONICAL_STAT_IDS[0], amount: 27 }];
    const spent = allocateFreeStatBatch(progression, dump);
    assert.equal(spent.ok, true, spec.classId + " " + spent.code);
    assert.equal(unspentFreeStatPoints(progression.freeStatAllocations, 10), 0);

    const withGear = evaluateCanonicalSnapshot({
      classId: spec.classId,
      level: 10,
      baseStats: classDef.baseStats !== undefined ? classDef.baseStats : {},
      automaticGrowth: classDef.automaticGrowth !== undefined ? classDef.automaticGrowth : {},
      freeStatAllocations: progression.freeStatAllocations,
      usesMana: classDef.resourceType !== "resource.none",
      modifiers: [{ sourceId: "gear-vitality", sourceKind: CANONICAL_SOURCE_EQUIPMENT, channel: "stat.vitality", op: "add", value: 5 }],
    });
    const withoutGear = evaluateCanonicalSnapshot({
      classId: spec.classId,
      level: 10,
      baseStats: classDef.baseStats !== undefined ? classDef.baseStats : {},
      automaticGrowth: classDef.automaticGrowth !== undefined ? classDef.automaticGrowth : {},
      freeStatAllocations: progression.freeStatAllocations,
      usesMana: classDef.resourceType !== "resource.none",
      modifiers: [],
    });
    assert.equal(withGear.hpMax, withoutGear.hpMax + 50);

    const trainer = applyTrainerRespec(progression, catalog, {
      requestId: spec.classId + "-trainer",
      trainerId: "npc.test_innkeeper",
      characterId: "char-" + spec.classId,
      classId: spec.classId,
      timestamp: 2,
    });
    assert.equal(trainer.ok, true);
    assert.equal(trainer.goldCost, CANONICAL_RESPEC_GOLD_PER_LEVEL * 10);
    progression = trainer.progression;
    assert.equal(progression.branchId, "");
    assert.equal(progression.purchasedClassNodeIds.length, 0);
    assert.equal(unspentFreeStatPoints(progression.freeStatAllocations, 10), 27);
    const rebuilt = selectBranch(progression, catalog, spec.classId, { branchId: spec.branchB, requestId: spec.classId + "-rebuild" });
    assert.equal(rebuilt.ok, true);
    progression = rebuilt.progression;
    progression = buy(progression, spec.classId, spec.classTree, spec.classNodes[0], spec.classId + "-rebuild-c1");
    const rebuiltDump = allocateFreeStatBatch(progression, [{ statId: "stat.vitality", amount: 27 }]);
    assert.equal(rebuiltDump.ok, true);

    const stored = storedProgressionWriteValue(progression);
    const reloaded = storedProgressionFromValue(stored);
    assert.ok(reloaded !== null);
    if (reloaded !== null) {
      assert.equal(reloaded.level, 10);
      assert.equal(reloaded.branchId, spec.branchB);
      assert.equal(reloaded.lifetimeXp, CANONICAL_TOTAL_XP_TO_10);
    }
  }

  let auto = initializeProgression(catalog, "class.warrior");
  auto = setAutoAssign(auto, { requestId: "auto-on", enabled: true }).progression;
  auto = grantTo(auto, "class.warrior", 10, "auto-l10");
  auto = autoAssignUnspentPoints(auto, catalog, "class.warrior", { requestId: "auto-spend" }).progression;
  assert.equal(unspentFreeStatPoints(auto.freeStatAllocations, 10), 0);
  assert.ok((auto.freeStatAllocations["stat.strength"] !== undefined ? auto.freeStatAllocations["stat.strength"] : 0) > 0);

  let state = addPlayer(zone(), playerOf("class.warrior", auto));
  const left = applyPlayerLeave(state, "user-class.warrior", 20);
  const parked = left.state.players["user-class.warrior"];
  assert.equal(parked !== undefined && parked.linkDead === true, true);
  const restored = restoreGracePlayer(parked, "session-2", "warrior", emptyQuestLog(), emptyInventory(), emptyEquipment(), 0, 0);
  assert.equal(restored.progression?.level, 10);
  assert.equal(restored.progression?.lifetimeXp, auto.lifetimeXp);

  const terminated = progressionsForTerminate(addPlayer(zone(), playerOf("class.warrior", auto)));
  assert.equal(terminated.length, 1);
  assert.equal(terminated[0].progression.level, 10);

  const snapshot = exportProgressionSnapshot(auto);
  const exported = assembleAccountExport({
    accountUserId: "user-journey",
    exportedAt: 1,
    characters: [{ characterId: "char-class.warrior", classId: "class.warrior", progressionExport: snapshot }],
  });
  const characters = exported.characters as Array<{ progressionExport: { level: number } }>;
  assert.equal(characters[0].progressionExport.level, 10);
});

test("soft-delete restore purge and email reuse isolate progression", () => {
  const mem = memoryLifecycle();
  mem.ids = ["char-keep"];
  const created = handleCharacterCreate("user-old", JSON.stringify({ name: "Keepme", classId: "class.mage" }), mem);
  const key = "user-old:" + created.characterId;
  let progression = mem.progressions.get(key) as CharacterProgression;
  progression = grantTo(progression, "class.mage", 10, "soft-l10");
  mem.progressions.set(key, progression);
  const deleted = handleCharacterSoftDelete(
    "user-old",
    JSON.stringify({ characterId: created.characterId, confirmationName: "Keepme" }),
    mem,
  );
  assert.equal(deleted.status, CHARACTER_STATUS_SOFT_DELETED);
  const restored = handleCharacterRestore("user-old", JSON.stringify({ characterId: created.characterId }), mem);
  assert.equal(restored.status, CHARACTER_STATUS_ACTIVE);
  assert.equal(mem.progressions.get(key)?.level, 10);
  handleCharacterSoftDelete("user-old", JSON.stringify({ characterId: created.characterId, confirmationName: "Keepme" }), mem);
  mem.now += SOFT_DELETE_RETENTION_MS + 1;
  handleCharacterPurge("user-old", JSON.stringify({ characterId: created.characterId }), mem);
  assert.equal(mem.progressions.get(key), undefined);

  const world = {
    gold: 0,
    characters: [created.characterId],
    purged: [] as string[],
    progressions: { [created.characterId]: true } as { [id: string]: boolean },
    emailIndex: "user-old",
    nakamaDeleted: false,
    job: null as ReturnType<typeof emptyDeletionJob> | null,
  };
  const job = emptyDeletionJob({
    deletionJobId: "del-1",
    accountUserId: "user-old",
    idempotencyKey: "del-1",
    statusToken: "tok-1",
    emailHeld: "reuse@example.com",
    emailLookupHash: "hash-reuse",
    nowMs: 1,
  });
  world.job = job;
  const deps: AccountDeletionDeps = {
    nowMs: () => 1,
    readJob: () => world.job,
    writeJob: (next) => {
      world.job = next;
    },
    writeAccountStatus: () => undefined,
    invalidateChallenges: () => undefined,
    cancelTrades: () => undefined,
    leaveParties: () => undefined,
    clearCaves: () => undefined,
    clearTransfers: () => undefined,
    clearSelection: () => undefined,
    clearLease: () => undefined,
    listCharacterIds: () => world.characters,
    purgeCharacter: (_userId, characterId) => {
      world.purged.push(characterId);
      delete world.progressions[characterId];
    },
    wipeGold: () => {
      world.gold = 0;
    },
    removeEmailIndex: () => {
      world.emailIndex = "";
    },
    removePendingEmailChange: () => undefined,
    removeVerificationRecords: () => undefined,
    removePasswordResetRecords: () => undefined,
    removeSupportRecovery: () => undefined,
    removeAccountSettings: () => undefined,
    removeInviteBindings: () => undefined,
    revokeSessions: () => undefined,
    disconnectSockets: () => undefined,
    deleteNakamaAccount: () => {
      world.nakamaDeleted = true;
    },
    sendDeletedEmail: () => undefined,
  };
  runAccountDeletionSaga({ job: job, deps: deps });
  assert.equal(world.progressions[created.characterId], undefined);
  assert.equal(world.emailIndex, "");
  mem.ids = ["char-new"];
  mem.idCursor = 0;
  const reused = handleCharacterCreate("user-new", JSON.stringify({ name: "Newone", classId: "class.mage" }), mem);
  const fresh = mem.progressions.get("user-new:" + reused.characterId);
  assert.equal(fresh?.level, 1);
  assert.equal(fresh?.lifetimeXp, 0);
  assert.notEqual(reused.characterId, created.characterId);
});

function memoryLifecycle(): CharacterLifecycleDeps & {
  ids: string[];
  idCursor: number;
  now: number;
  rosters: Map<string, CharacterRoster>;
  characters: Map<string, StoredCharacter>;
  reservations: Map<string, NameReservation>;
  selections: Map<string, SelectionTicket>;
  progressions: Map<string, CharacterProgression>;
} {
  const mem: ReturnType<typeof memoryLifecycle> = {
    ids: [],
    idCursor: 0,
    now: 1_700_000_000_000,
    rosters: new Map(),
    characters: new Map(),
    reservations: new Map(),
    selections: new Map(),
    progressions: new Map(),
    nowMs: () => mem.now,
    newId: function () {
      const id = mem.ids[mem.idCursor] !== undefined ? mem.ids[mem.idCursor] : "char-" + String(mem.idCursor + 1);
      mem.idCursor += 1;
      return id;
    },
    newReservationToken: () => "token",
    player: content.player,
    zone: content.zones["zone.starter"],
    classes: {
      "class.warrior": { id: "class.warrior", startingEquipment: [], legacyMigrationDefault: true },
      "class.mage": { id: "class.mage", startingEquipment: [] },
      "class.marksman": { id: "class.marksman", startingEquipment: [] },
      "class.mystic": { id: "class.mystic", startingEquipment: [] },
    },
    readRoster: (userId) => mem.rosters.get(userId) ?? null,
    writeRoster: (userId, roster) => {
      mem.rosters.set(userId, roster);
    },
    readLegacyCharacter: () => null,
    readCharacter: (userId, characterId) => mem.characters.get(userId + ":" + characterId) ?? null,
    writeCharacter: (userId, record) => {
      mem.characters.set(userId + ":" + record.characterId, record);
    },
    deleteCharacterRecord: (userId, characterId) => {
      mem.characters.delete(userId + ":" + characterId);
    },
    readReservation: (name) => mem.reservations.get(name) ?? null,
    writeReservation: (reservation) => {
      mem.reservations.set(reservation.canonicalName, reservation);
    },
    confirmReservation: (name) => mem.reservations.get(name) ?? null,
    deleteReservation: (name) => {
      mem.reservations.delete(name);
    },
    readSelection: (userId) => mem.selections.get(userId) ?? null,
    writeSelection: (userId, ticket) => {
      mem.selections.set(userId, ticket);
    },
    initializeNewCharacterGameplay: (_userId, record) => {
      const classId = record.classId !== undefined ? record.classId : "";
      const created = initializeProgression(catalog, classId);
      created.schemaVersion = 1;
      mem.progressions.set(_userId + ":" + record.characterId, created);
    },
    readProgression: (userId, characterId) => mem.progressions.get(userId + ":" + characterId) ?? null,
    writeProgression: (userId, characterId, progression) => {
      mem.progressions.set(userId + ":" + characterId, progression);
    },
    progressionCatalog: catalog,
    applyPurgeStep: (userId, record, step) => {
      if (step === "progression") {
        mem.progressions.delete(userId + ":" + record.characterId);
      }
    },
  };
  return mem;
}
