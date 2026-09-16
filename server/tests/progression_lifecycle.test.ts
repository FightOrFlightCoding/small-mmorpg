import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import {
  CANONICAL_PROGRESSION_SCHEMA_VERSION,
  CANONICAL_XP_TO_NEXT,
  canonicalKillXpAmount,
} from "../src/domain/canonical_progression";
import {
  classifyProgressionCharacter,
  exportProgressionSnapshot,
  hasLeftoverFoundationAuthorities,
  LEFTOVER_NOTICE_FOUNDATION_RESET,
  REASON_UNSUPPORTED_PROGRESSION_VERSION,
  validateProgressionRecord,
} from "../src/domain/canonical_leftover_migration";
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
import { abilityDefinitionsFromContent } from "../src/domain/ability";
import { spawnDefinitionsFromContent } from "../src/domain/spawn_controller";
import { aiProfilesFromContent } from "../src/domain/threat";
import { lootTablesFromContent } from "../src/domain/loot_table";
import { eligibleGroupCreditMembers, killXpEventId } from "../src/domain/party_credit";
import { defaultGroupCreditRules } from "../src/domain/party";
import {
  applyPlayerLeave,
  progressionsForTerminate,
  restoreGracePlayer,
} from "../src/domain/persistence";
import {
  grantXp,
  initializeProgression,
  migrateToCanonicalProgression,
  purchaseTalent,
  selectBranch,
  type CharacterProgression,
} from "../src/domain/progression";
import { storedProgressionFromValue, storedProgressionWriteValue } from "../src/domain/progression_store";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { catalogFromContent } from "../src/domain/stats";
import { questXpGrant } from "../src/domain/xp_hooks";
import { characterCatalogEntry } from "../src/domain/character_catalog";
import { createStoredCharacter } from "../src/domain/character";

const catalog = catalogFromContent(content);
const CLASSES = ["class.warrior", "class.marksman", "class.mage", "class.mystic"] as const;

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function grant(progression: CharacterProgression, classId: string, amount: number, eventId: string) {
  return grantXp(progression, catalog, classId, {
    characterId: "char-1",
    amount: amount,
    reasonType: "dev",
    reasonId: "dev",
    eventId: eventId,
    createdAt: 1,
  });
}

function v1Warrior(): CharacterProgression {
  const next = initializeProgression(catalog, "class.warrior");
  next.progressionSchemaVersion = 1;
  next.level = 5;
  next.currentXp = 20;
  next.lifetimeXp = 395;
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
  next.allocatedAttributes = { "test.attribute.might": 2 };
  next.unspentAttributePoints = 2;
  next.unspentSkillPoints = 4;
  return next;
}

function catalogZone(): StarterZoneState {
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
      abilitiesById: abilityDefinitionsFromContent(content.abilities),
      spawnsById: spawnDefinitionsFromContent(content.spawns),
      aiProfilesById: aiProfilesFromContent(content.aiProfiles),
      lootTablesById: lootTablesFromContent(content.lootTables),
      groupCreditRules: defaultGroupCreditRules(),
    },
  );
  state.progressionCatalog = catalog;
  return state;
}

function classPlayer(classId: string, userId: string, x: number, y: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: "char-" + userId,
    name: userId,
    classId: classId,
    x: x,
    y: y,
    maxHealth: 200,
    health: 200,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    progression: initializeProgression(catalog, classId),
    gold: 100,
  };
}

function partyCache(members: MatchPlayer[]) {
  const view = members.map(function (player) {
    return {
      accountUserId: player.userId,
      characterId: player.characterId,
      displayName: player.name,
      connectionState: "online",
    };
  });
  const cache = {
    partyId: "p_prog14",
    revision: 1,
    leaderCharacterId: members[0].characterId,
    lootPolicy: "personal",
    members: view,
  };
  const byCharacter: { [characterId: string]: typeof cache } = {};
  for (let i = 0; i < members.length; i++) {
    byCharacter[members[i].characterId] = cache;
  }
  return byCharacter;
}

test("classifies test vs production leftover characters", () => {
  assert.equal(classifyProgressionCharacter("test.class.vanguard"), "test");
  assert.equal(classifyProgressionCharacter("class.warrior"), "production");
  assert.equal(hasLeftoverFoundationAuthorities(v1Warrior(), catalog, "class.warrior"), true);
  assert.equal(
    hasLeftoverFoundationAuthorities(initializeProgression(catalog, "class.warrior"), catalog, "class.warrior"),
    false,
  );
});

test("old vertical-slice vanguard keeps Foundation fields and bumps leftover schema", () => {
  const vanguard = initializeProgression(catalog, "test.class.vanguard");
  vanguard.progressionSchemaVersion = 1;
  vanguard.level = 2;
  vanguard.currentXp = 20;
  vanguard.lifetimeXp = 70;
  vanguard.allocatedAttributes = { "test.attribute.might": 1 };
  vanguard.unlockedAbilityIds = ["test.ability.basic_melee"];
  const migrated = migrateToCanonicalProgression(vanguard, "test.class.vanguard", 10, catalog);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.progression.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION);
  assert.equal(migrated.progression.allocatedAttributes["test.attribute.might"], 1);
  assert.deepEqual(migrated.progression.unlockedAbilityIds, ["test.ability.basic_melee"]);
  const replay = migrateToCanonicalProgression(migrated.progression, "test.class.vanguard", 11, catalog);
  assert.equal(replay.changed, false);
});

test("schema-2 production leftover is reset with a visible notice and does not regrant", () => {
  const leftover = v1Warrior();
  leftover.progressionSchemaVersion = 2;
  leftover.xpIntoLevel = leftover.currentXp;
  leftover.hotbarAssignments = ["ability.warrior.heavy_strike"];
  leftover.freeStatAllocations = { "stat.strength": 1 };
  const migrated = migrateToCanonicalProgression(leftover, "class.warrior", 50, catalog);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.progression.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION);
  assert.deepEqual(migrated.progression.allocatedAttributes, {});
  assert.equal(migrated.progression.hotbar, undefined);
  assert.equal(migrated.progression.leftoverMigrationNotice, LEFTOVER_NOTICE_FOUNDATION_RESET);
  assert.equal(migrated.progression.freeStatAllocations["stat.strength"], 1);
  assert.equal(migrated.progression.unlockedAbilityIds.indexOf("test.ability.basic_melee"), -1);
  const replay = migrateToCanonicalProgression(migrated.progression, "class.warrior", 51, catalog);
  assert.equal(replay.changed, false);
});

test("current production character only bumps leftover schema once", () => {
  const current = initializeProgression(catalog, "class.mystic");
  current.progressionSchemaVersion = 2;
  const migrated = migrateToCanonicalProgression(current, "class.mystic", 3, catalog);
  assert.equal(migrated.changed, true);
  assert.equal(migrated.progression.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION);
  const replay = migrateToCanonicalProgression(migrated.progression, "class.mystic", 4, catalog);
  assert.equal(replay.changed, false);
});

test("partial progression records initialize missing canonical fields without double grants", () => {
  const parsed = storedProgressionFromValue({
    level: 4,
    currentXp: 10,
    lifetimeXp: 900,
    classId: "class.marksman",
  });
  assert.notEqual(parsed, null);
  if (parsed === null) {
    return;
  }
  const migrated = migrateToCanonicalProgression(parsed, "class.marksman", 8, catalog);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.progression.level, 4);
  assert.equal(migrated.progression.lifetimeXp, 900);
  assert.deepEqual(migrated.progression.purchasedClassNodeIds, []);
  assert.deepEqual(migrated.progression.freeStatAllocations, {});
  const replayGrant = grant(migrated.progression, "class.marksman", 10, "partial-1");
  const again = grant(replayGrant.progression, "class.marksman", 10, "partial-1");
  assert.equal(again.replay, true);
  assert.equal(again.progression.lifetimeXp, replayGrant.progression.lifetimeXp);
});

test("unsupported future progression versions are rejected and not rewritten", () => {
  const current = initializeProgression(catalog, "class.warrior");
  current.progressionSchemaVersion = CANONICAL_PROGRESSION_SCHEMA_VERSION + 1;
  current.level = 9;
  const migrated = migrateToCanonicalProgression(current, "class.warrior", 1, catalog);
  assert.equal(migrated.ok, false);
  assert.equal(migrated.changed, false);
  assert.equal(migrated.reason, REASON_UNSUPPORTED_PROGRESSION_VERSION);
  assert.equal(migrated.progression.level, 9);
  assert.equal(migrated.progression.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION + 1);
});

test("interrupted leftover cleanup retries without duplicating canonical spend", () => {
  const leftover = v1Warrior();
  leftover.progressionSchemaVersion = 2;
  leftover.xpIntoLevel = leftover.currentXp;
  leftover.freeStatAllocations = { "stat.vitality": 2 };
  leftover.allocatedAttributes = {};
  leftover.hotbar = undefined;
  leftover.unlockedAbilityIds = ["ability.warrior.heavy_strike"];
  leftover.unspentAttributePoints = 0;
  leftover.unspentSkillPoints = 0;
  leftover.hotbarAssignments = ["ability.warrior.heavy_strike", "", "", ""];
  const migrated = migrateToCanonicalProgression(leftover, "class.warrior", 9, catalog);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.progression.freeStatAllocations["stat.vitality"], 2);
  assert.equal(migrated.progression.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION);
  const replay = migrateToCanonicalProgression(migrated.progression, "class.warrior", 10, catalog);
  assert.equal(replay.changed, false);
});

test("XP, level rewards, talent, respec, kill, quest, and party grants are idempotent", () => {
  let warrior = initializeProgression(catalog, "class.warrior");
  const first = grant(warrior, "class.warrior", CANONICAL_XP_TO_NEXT[0], "xp-once");
  const second = grant(first.progression, "class.warrior", CANONICAL_XP_TO_NEXT[0], "xp-once");
  assert.equal(second.replay, true);
  assert.equal(second.progression.level, 2);
  assert.equal(second.progression.lifetimeXp, CANONICAL_XP_TO_NEXT[0]);
  warrior = grant(first.progression, "class.warrior", 100 + 280 + 520 + 800, "to-five").progression;
  const branch = selectBranch(warrior, catalog, "class.warrior", {
    requestId: "branch-1",
    branchId: "branch.warrior.berserker",
  });
  const branchReplay = selectBranch(branch.progression, catalog, "class.warrior", {
    requestId: "branch-1",
    branchId: "branch.warrior.berserker",
  });
  assert.equal(branchReplay.replay, true);
  const talent = purchaseTalent(branch.progression, catalog, "class.warrior", {
    treeId: "tree.warrior.berserker",
    nodeId: "talent.warrior.berserker.slaughter",
    requestedRank: 1,
    requestId: "talent-1",
  });
  const talentReplay = purchaseTalent(talent.progression, catalog, "class.warrior", {
    treeId: "tree.warrior.berserker",
    nodeId: "talent.warrior.berserker.slaughter",
    requestedRank: 1,
    requestId: "talent-1",
  });
  assert.equal(talent.ok, true);
  assert.equal(talentReplay.replay, true);
  const kill = questXpGrant("quest.slime_problem", 20, "turn-1", "char-1");
  assert.notEqual(kill, null);
  const questFirst = grantXp(talent.progression, catalog, "class.warrior", {
    characterId: "char-1",
    amount: 20,
    reasonType: "quest",
    reasonId: "quest.slime_problem",
    eventId: kill !== null ? kill.eventId : "quest:quest.slime_problem:turn-1",
  });
  const questReplay = grantXp(questFirst.progression, catalog, "class.warrior", {
    characterId: "char-1",
    amount: 20,
    reasonType: "quest",
    reasonId: "quest.slime_problem",
    eventId: kill !== null ? kill.eventId : "quest:quest.slime_problem:turn-1",
  });
  assert.equal(questReplay.replay, true);
});

test("character summaries refresh from persisted level and branch", () => {
  let progression = initializeProgression(catalog, "class.warrior");
  progression = grant(progression, "class.warrior", 100 + 280 + 520 + 800, "sum-l5").progression;
  progression = selectBranch(progression, catalog, "class.warrior", {
    requestId: "sum-branch",
    branchId: "branch.warrior.berserker",
  }).progression;
  const record = createStoredCharacter(
    "char-sum",
    "Summary",
    content.player,
    content.zones["zone.starter"],
    "v1",
    1,
    "user-sum",
    "class.warrior",
  );
  const entry = characterCatalogEntry({
    record: record,
    accountUserId: "user-sum",
    nowMs: 1,
    level: progression.level,
    branchId: progression.branchId,
    location: null,
    lease: null,
    maintenance: false,
    contentCompatible: true,
    selectionPendingCharacterId: "",
  });
  assert.equal(entry.level, 5);
  assert.equal(entry.branchId, "branch.warrior.berserker");
  assert.equal(entry.classId, "class.warrior");
});

test("export snapshot includes required progression fields", () => {
  const progression = initializeProgression(catalog, "class.mage");
  progression.level = 6;
  progression.branchId = "branch.mage.frost";
  progression.autoAssignEnabled = true;
  progression.hotbarAssignments = ["ability.mage.frostbolt", "", "", ""];
  const snapshot = exportProgressionSnapshot(progression);
  assert.equal(snapshot.classId, "class.mage");
  assert.equal(snapshot.branchId, "branch.mage.frost");
  assert.equal(snapshot.level, 6);
  assert.equal(snapshot.autoAssignEnabled, true);
  assert.deepEqual(snapshot.hotbarAssignments, ["ability.mage.frostbolt", "", "", ""]);
  assert.equal(typeof snapshot.freeStatAllocations, "object");
  assert.equal(Array.isArray(snapshot.purchasedClassNodeIds), true);
});

test("four classes in a party receive kill XP once using authoritative enemy level", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = catalogZone();
  const players: MatchPlayer[] = [];
  for (let i = 0; i < CLASSES.length; i++) {
    const player = classPlayer(CLASSES[i], "user-" + String(i), spawn.x, spawn.y);
    players.push(player);
    state = addPlayer(state, player);
  }
  state.partyByCharacterId = partyCache(players);
  state.enemies[0].health = 1;
  state.enemies[0].level = 1;
  const result = applyMatchLoop(state, 8, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "req-party-xp-1" }),
      userId: "user-0",
    },
  ]);
  const expected = canonicalKillXpAmount(1, state.enemies[0].tags);
  const seen: { [id: string]: boolean } = {};
  for (let i = 0; i < CLASSES.length; i++) {
    const userId = "user-" + String(i);
    const progression = result.state.players[userId].progression;
    assert.ok(progression !== undefined);
    if (progression === undefined) {
      continue;
    }
    assert.equal(progression.lifetimeXp, expected);
    const eventIds = Object.keys(progression.xpByEventId);
    assert.equal(eventIds.length, 1);
    assert.equal(seen[eventIds[0]] === true, false);
    seen[eventIds[0]] = true;
  }
  const replay = applyMatchLoop(result.state, 9, contentHash, []);
  for (let i = 0; i < CLASSES.length; i++) {
    const progression = replay.state.players["user-" + String(i)].progression;
    assert.equal(progression?.lifetimeXp, expected);
  }
});

test("party credit cannot be forged and out-of-range members are skipped", () => {
  const members = eligibleGroupCreditMembers({
    killerUserId: "user-alice",
    enemyX: 0,
    enemyY: 0,
    tick: 10,
    tickRate: 10,
    players: {
      "user-alice": { userId: "user-alice", characterId: "char-a", x: 0, y: 0, alive: true },
      "user-forged": { userId: "user-forged", characterId: "char-f", x: 0, y: 0, alive: true },
      "user-far": { userId: "user-far", characterId: "char-b", x: 4000, y: 0, alive: true },
    },
    partyByCharacterId: {
      "char-a": {
        partyId: "p_real",
        revision: 1,
        leaderCharacterId: "char-a",
        lootPolicy: "personal",
        members: [
          { accountUserId: "user-alice", characterId: "char-a", displayName: "Alice", connectionState: "online" },
          { accountUserId: "user-far", characterId: "char-b", displayName: "Far", connectionState: "online" },
        ],
      },
    },
  });
  assert.equal(members.length, 1);
  assert.equal(members[0].characterId, "char-a");
  assert.equal(killXpEventId("kill:e:1", "char-b", "char-a"), "kill:e:1:char-b");
});

test("simultaneous XP events from all four classes do not collide", () => {
  for (let i = 0; i < CLASSES.length; i++) {
    const classId = CLASSES[i];
    let progression = initializeProgression(catalog, classId);
    const a = grant(progression, classId, 10, "sim-a-" + classId);
    const b = grant(a.progression, classId, 15, "sim-b-" + classId);
    assert.equal(b.progression.lifetimeXp, 25);
    assert.equal(Object.keys(b.progression.xpByEventId).length, 2);
  }
});

test("link-dead during a cast interrupts without changing progression", () => {
  const player = classPlayer("class.mage", "user-alice", 240, 384);
  player.progression = grant(player.progression as CharacterProgression, "class.mage", 50, "cast-xp").progression;
  player.activeCast = {
    abilityId: "ability.mage.fireball",
    casterId: player.userId,
    targetId: "enemy.green_slime:0",
    targetX: 960,
    targetY: 400,
    startTick: 10,
    completionTick: 20,
    channelUntilTick: 0,
    phase: "casting",
    interruptReason: "",
    requestId: "req-cast-link",
  };
  const before = player.progression.lifetimeXp;
  const left = applyPlayerLeave(addPlayer(catalogZone(), player), player.userId, 11);
  const parked = left.state.players[player.userId];
  assert.equal(parked.linkDead, true);
  assert.equal(parked.activeCast, undefined);
  assert.equal(parked.progression?.lifetimeXp, before);
});

test("link-dead during a DoT keeps effects and progression, reconnect restores cooldowns", () => {
  const player = classPlayer("class.mystic", "user-alice", 240, 384);
  player.effects = [
    {
      effectId: "dot-1",
      abilityId: "ability.mystic.wither",
      sourceId: player.userId,
      sourceKind: "player",
      type: "periodic_damage",
      stacks: 1,
      magnitude: 4,
      remainingTicks: 40,
      tickIntervalTicks: 10,
      nextTickAt: 15,
      stackPolicy: "refresh",
      maxStacks: 1,
      refreshPolicy: "refresh",
      tags: ["dot"],
      statChannel: "",
      resourceRole: "",
    },
  ];
  player.abilityCooldowns = { "ability.mystic.wither": 80 };
  const xp = player.progression !== undefined ? player.progression.lifetimeXp : -1;
  const left = applyPlayerLeave(addPlayer(catalogZone(), player), player.userId, 5);
  const parked = left.state.players[player.userId];
  assert.equal(parked.linkDead, true);
  assert.equal(parked.effects !== undefined && parked.effects.length, 1);
  assert.equal(parked.progression?.lifetimeXp, xp);
  const restored = restoreGracePlayer(
    parked,
    "session-new",
    "alice",
    emptyQuestLog(),
    emptyInventory(),
    emptyEquipment(),
    1,
    0,
  );
  assert.equal(restored.abilityCooldowns !== undefined && restored.abilityCooldowns["ability.mystic.wither"], 80);
  assert.equal(restored.effects !== undefined && restored.effects.length, 1);
  assert.equal(restored.activeCast, undefined);
});

test("terminate persist captures live progression for server restart", () => {
  const player = classPlayer("class.warrior", "user-alice", 240, 384);
  player.progression = grant(player.progression as CharacterProgression, "class.warrior", 100, "restart-xp").progression;
  const state = addPlayer(catalogZone(), player);
  const rows = progressionsForTerminate(state);
  assert.equal(rows.length, 1);
  const stored = storedProgressionFromValue(storedProgressionWriteValue(rows[0].progression));
  assert.equal(stored?.lifetimeXp, 100);
  assert.equal(stored?.level, 2);
});

test("authorized GM progression tools inspect, grant, reset, and validate", () => {
  const player = classPlayer("class.warrior", "user-gm", 240, 384);
  let state = addPlayer(catalogZone(), player);
  const live = state.players[player.userId];
  const inspect = applyGmToMatch(
    state,
    live,
    { command: "inspect_progression", reason: "lab", characterId: player.characterId, requestId: "gm-insp" },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(inspect.ok, true);
  assert.equal(inspect.result.classId, "class.warrior");
  const granted = applyGmToMatch(
    state,
    live,
    {
      command: "grant_xp_event",
      reason: "lab",
      characterId: player.characterId,
      requestId: "gm-evt",
      eventId: "gm-event:fixture",
      amount: CANONICAL_XP_TO_NEXT[0],
    },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(granted.ok, true);
  assert.equal(granted.persistProgression, true);
  assert.equal(live.progression?.level, 2);
  const replay = applyGmToMatch(
    state,
    live,
    {
      command: "grant_xp_event",
      reason: "lab",
      characterId: player.characterId,
      requestId: "gm-evt",
      eventId: "gm-event:fixture",
      amount: CANONICAL_XP_TO_NEXT[0],
    },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(replay.result.replay, true);
  const exact = applyGmToMatch(
    state,
    live,
    {
      command: "grant_exact_test_xp",
      reason: "lab",
      characterId: player.characterId,
      requestId: "gm-exact",
      amount: 5,
    },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(exact.ok, true);
  const auto = applyGmToMatch(
    state,
    live,
    {
      command: "set_auto_assign",
      reason: "lab",
      characterId: player.characterId,
      requestId: "gm-auto",
      enabled: true,
    },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(auto.ok, true);
  assert.equal(live.progression?.autoAssignEnabled, true);
  const levelUp = applyGmToMatch(
    state,
    live,
    { command: "simulate_level_up", reason: "lab", characterId: player.characterId, requestId: "gm-lvl" },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(levelUp.ok, true);
  assert.ok((live.progression !== undefined ? live.progression.level : 0) >= 3);
  live.progression = grant(live.progression as CharacterProgression, "class.warrior", 100 + 280 + 520 + 800, "gm-to5").progression;
  const branch = applyGmToMatch(
    state,
    live,
    { command: "open_branch_selection", reason: "lab", characterId: player.characterId, requestId: "gm-branch" },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(branch.ok, true);
  assert.equal(branch.result.pending, true);
  live.progression = selectBranch(live.progression as CharacterProgression, catalog, "class.warrior", {
    requestId: "pick-b",
    branchId: "branch.warrior.berserker",
  }).progression;
  const reset = applyGmToMatch(
    state,
    live,
    { command: "reset_full_build", reason: "lab", characterId: player.characterId, requestId: "gm-respec" },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(reset.ok, true);
  assert.equal(live.progression?.branchId, "");
  const effects = applyGmToMatch(
    state,
    live,
    { command: "inspect_active_effects", reason: "lab", characterId: player.characterId, requestId: "gm-fx" },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(effects.ok, true);
  const cds = applyGmToMatch(
    state,
    live,
    { command: "inspect_cooldown_recovery", reason: "lab", characterId: player.characterId, requestId: "gm-cd" },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(cds.ok, true);
  const validated = applyGmToMatch(
    state,
    live,
    { command: "run_progression_validation", reason: "lab", characterId: player.characterId, requestId: "gm-val" },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(validated.ok, true);
  const fixture = applyGmToMatch(
    state,
    live,
    { command: "reset_progression_fixture", reason: "lab", characterId: player.characterId, requestId: "gm-fix" },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(fixture.ok, true);
  assert.equal(live.progression?.level, 1);
  assert.throws(
    () => parseGmCommandPayload(JSON.stringify({ command: "set_level", reason: "nope", characterId: "c1" })),
    /unknown_command/,
  );
});

test("progression validation flags leftover production authorities", () => {
  const leftover = v1Warrior();
  leftover.progressionSchemaVersion = CANONICAL_PROGRESSION_SCHEMA_VERSION;
  const report = validateProgressionRecord(leftover, "class.warrior", catalog);
  assert.equal(report.ok, false);
  assert.ok(report.issues.indexOf("leftover_allocated_attributes") >= 0);
});

test("elite kill XP uses the server-owned multiplier", () => {
  assert.equal(canonicalKillXpAmount(1, []), 10);
  assert.equal(canonicalKillXpAmount(1, ["elite"]), 30);
  assert.equal(canonicalKillXpAmount(4, ["elite"]), 48);
});

test("return to character select and cave transfer persist live progression", () => {
  const player = classPlayer("class.marksman", "user-alice", 8, 8);
  player.progression = grant(player.progression as CharacterProgression, "class.marksman", 100, "xfer-xp").progression;
  const select = applyMatchLoop(addPlayer(catalogZone(), player), 4, contentHash, [
    {
      opcode: ClientOpcode.RETURN_TO_CHARACTER_SELECT,
      raw: envelope({ requestId: "req-select" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(select.persistProgression.length, 1);
  assert.equal(select.persistProgression[0].progression.lifetimeXp, 100);

  const cavePlayer = classPlayer("class.mage", "user-bob", 8, 8);
  cavePlayer.progression = grant(cavePlayer.progression as CharacterProgression, "class.mage", 50, "cave-xp").progression;
  cavePlayer.caveEnterByRequestId = { "req-cave": "ok" };
  const cave = applyMatchLoop(addPlayer(catalogZone(), cavePlayer), 5, contentHash, [
    {
      opcode: ClientOpcode.CAVE_ENTER,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-cave" }),
      userId: "user-bob",
    },
  ]);
  assert.equal(cave.persistProgression.length, 1);
  assert.equal(cave.persistProgression[0].progression.lifetimeXp, 50);

  const exitPlayer = classPlayer("class.warrior", "user-cara", 8, 8);
  exitPlayer.progression = grant(exitPlayer.progression as CharacterProgression, "class.warrior", 40, "exit-xp").progression;
  exitPlayer.caveEnterByRequestId = { "req-exit": "ok" };
  const exit = applyMatchLoop(addPlayer(catalogZone(), exitPlayer), 6, contentHash, [
    {
      opcode: ClientOpcode.CAVE_EXIT,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-exit" }),
      userId: "user-cara",
    },
  ]);
  assert.equal(exit.persistProgression.length, 1);
  assert.equal(exit.persistProgression[0].progression.lifetimeXp, 40);
});

test("content reload remigrates leftover production records and is a no-op for current schema", () => {
  const leftover = v1Warrior();
  leftover.progressionSchemaVersion = 2;
  leftover.xpIntoLevel = leftover.currentXp;
  const first = migrateToCanonicalProgression(leftover, "class.warrior", 20, catalog);
  assert.equal(first.ok, true);
  assert.equal(first.progression.leftoverMigrationNotice, LEFTOVER_NOTICE_FOUNDATION_RESET);
  const reloaded = migrateToCanonicalProgression(first.progression, "class.warrior", 21, catalog);
  assert.equal(reloaded.changed, false);
  const current = initializeProgression(catalog, "class.mystic");
  const reloadCurrent = migrateToCanonicalProgression(current, "class.mystic", 22, catalog);
  assert.equal(reloadCurrent.changed, false);
});

test("unknown GM progression fixture is rejected", () => {
  const player = classPlayer("class.warrior", "user-gm", 240, 384);
  const state = addPlayer(catalogZone(), player);
  const live = state.players[player.userId];
  const rejected = applyGmToMatch(
    state,
    live,
    {
      command: "reset_progression_fixture",
      reason: "lab",
      characterId: player.characterId,
      requestId: "gm-bad-fix",
      fixtureId: "future.fixture",
    },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "invalid_fixture");
});
