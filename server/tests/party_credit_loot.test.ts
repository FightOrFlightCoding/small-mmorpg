import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { PLAYER_RESPAWN_DELAY_SEC } from "../src/domain/combat";
import {
  MATCH_TICK_RATE,
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import { abilityDefinitionsFromContent } from "../src/domain/ability";
import { spawnDefinitionsFromContent } from "../src/domain/spawn_controller";
import { aiProfilesFromContent } from "../src/domain/threat";
import { applyEnemyDeathSideEffects, lootTablesFromContent } from "../src/domain/loot_table";
import { eligibleGroupCreditMembers, splitKillXp } from "../src/domain/party_credit";
import { assignPartyLoot } from "../src/domain/party_loot";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { initializeProgression } from "../src/domain/progression";
import { catalogFromContent } from "../src/domain/stats";
import { defaultGroupCreditRules } from "../src/domain/party";

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
      respawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
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
  state.progressionCatalog = catalogFromContent(content);
  return state;
}

function playerAt(userId: string, name: string, x: number, y: number): MatchPlayer {
  const classId = Object.keys(content.classes)[0];
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    classId: classId,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    progression: initializeProgression(catalogFromContent(content), classId),
  };
}

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function withParty(state: StarterZoneState, userIds: string[]): StarterZoneState {
  const members = [];
  for (let i = 0; i < userIds.length; i++) {
    const player = state.players[userIds[i]];
    members.push({
      accountUserId: player.userId,
      characterId: player.characterId,
      displayName: player.name,
      connectionState: "online",
    });
  }
  const cache = {
    partyId: "p_test",
    revision: 1,
    leaderCharacterId: state.players[userIds[0]].characterId,
    lootPolicy: "personal",
    members: members,
  };
  state.partyByCharacterId = {};
  for (let i = 0; i < userIds.length; i++) {
    state.partyByCharacterId[state.players[userIds[i]].characterId] = cache;
  }
  return state;
}

test("group kill credit grants full xp to in-range party members and skips out-of-range", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", spawn.x + 20, spawn.y));
  state = addPlayer(state, playerAt("user-cara", "Cara", spawn.x + 4000, spawn.y));
  state = withParty(state, ["user-alice", "user-bob", "user-cara"]);
  state.enemies[0].health = 1;
  const kill = applyMatchLoop(state, 8, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "req-party-xp1" }),
      userId: "user-alice",
    },
  ]);
  const reward = content.enemies["enemy.green_slime"].xpReward;
  assert.equal(kill.state.players["user-alice"].progression?.currentXp, reward);
  assert.equal(kill.state.players["user-bob"].progression?.currentXp, reward);
  assert.equal(kill.state.players["user-cara"].progression?.currentXp, 0);
});

test("group quest credit applies party-share objectives to eligible members", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const herald = content.zones["zone.starter"].npcs.find(function (npc) {
    return npc.npcId === "npc.test_herald";
  });
  assert.ok(herald);
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", herald.x, herald.y));
  state = withParty(state, ["user-alice", "user-bob"]);
  state = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.test.party_kill", requestId: "req-pkill-a1" }),
      userId: "user-alice",
    },
  ]).state;
  state = applyMatchLoop(state, 3, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.test.party_kill", requestId: "req-pkill-b1" }),
      userId: "user-bob",
    },
  ]).state;
  state.players["user-alice"].x = spawn.x;
  state.players["user-alice"].y = spawn.y;
  state.players["user-bob"].x = spawn.x;
  state.players["user-bob"].y = spawn.y;
  state.enemies[0].health = 1;
  const kill = applyMatchLoop(state, 8, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "req-pkill-hit" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(kill.state.players["user-alice"].questLog.quests["quest.test.party_kill"].objectives[0].current, 1);
  assert.equal(kill.state.players["user-bob"].questLog.quests["quest.test.party_kill"].objectives[0].current, 1);
});

test("personal loot grants independently and server-assigned picks one member", () => {
  const pebble = content.items["item.test_pebble"];
  assert.ok(pebble);
  const aliceInv = emptyInventory();
  const bobInv = emptyInventory();
  const assignment = assignPartyLoot({
    eventId: "kill:test:1",
    policy: "personal",
    drops: [{ itemId: "item.test_pebble", quantity: 1 }],
    eligible: [
      { userId: "user-alice", characterId: "char-a" },
      { userId: "user-bob", characterId: "char-b" },
    ],
    inventories: { "user-alice": aliceInv, "user-bob": bobInv },
    itemsById: itemDefinitionsFromContent(content.items),
    newId: function () {
      return "loot-1";
    },
  });
  assert.equal(assignment?.policy, "personal");
  assert.equal(assignment?.grants.length, 2);
  assert.equal(assignment?.grants[0].code, "ok");
  assert.equal(assignment?.grants[1].code, "ok");
  const once = assignPartyLoot({
    eventId: "kill:test:2",
    policy: "server_assigned",
    drops: [{ itemId: "item.test_pebble", quantity: 1 }],
    eligible: [
      { userId: "user-alice", characterId: "char-a" },
      { userId: "user-bob", characterId: "char-b" },
    ],
    inventories: { "user-alice": emptyInventory(), "user-bob": emptyInventory() },
    itemsById: itemDefinitionsFromContent(content.items),
    newId: function () {
      return "loot-2";
    },
  });
  assert.equal(once?.policy, "server_assigned");
  assert.equal(once?.grants.length, 1);
  assert.equal(once?.grants[0].code, "ok");
  assert.ok(once?.assignedUserId === "user-alice" || once?.assignedUserId === "user-bob");
});

test("duplicate death events do not repeat party loot or xp", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.enemies[0].health = 1;
  const kill = applyMatchLoop(state, 8, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "req-dup-xp1" }),
      userId: "user-alice",
    },
  ]);
  const xp = kill.state.players["user-alice"].progression?.currentXp;
  applyEnemyDeathSideEffects(kill.state, [
    {
      type: "death",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: kill.state.enemies[0].id,
      targetKind: "enemy",
      remainingHealth: 0,
      x: spawn.x,
      y: spawn.y,
    },
  ], 9, MATCH_TICK_RATE, function () {
    return "dup-id";
  });
  assert.equal(kill.state.players["user-alice"].progression?.currentXp, xp);
  assert.equal(kill.state.loot.length, 1);
});

test("eligibility helper rejects out-of-range members", () => {
  const members = eligibleGroupCreditMembers({
    killerUserId: "user-alice",
    enemyX: 0,
    enemyY: 0,
    tick: 10,
    tickRate: 10,
    players: {
      "user-alice": {
        userId: "user-alice",
        characterId: "char-a",
        x: 0,
        y: 0,
        alive: true,
      },
      "user-bob": {
        userId: "user-bob",
        characterId: "char-b",
        x: 4000,
        y: 0,
        alive: true,
      },
    },
    partyByCharacterId: {
      "char-a": {
        partyId: "p_test",
        revision: 1,
        leaderCharacterId: "char-a",
        lootPolicy: "personal",
        members: [
          { accountUserId: "user-alice", characterId: "char-a", displayName: "Alice", connectionState: "online" },
          { accountUserId: "user-bob", characterId: "char-b", displayName: "Bob", connectionState: "online" },
        ],
      },
      "char-b": {
        partyId: "p_test",
        revision: 1,
        leaderCharacterId: "char-a",
        lootPolicy: "personal",
        members: [
          { accountUserId: "user-alice", characterId: "char-a", displayName: "Alice", connectionState: "online" },
          { accountUserId: "user-bob", characterId: "char-b", displayName: "Bob", connectionState: "online" },
        ],
      },
    },
  });
  assert.deepEqual(members.map(function (row) { return row.userId; }), ["user-alice"]);
  assert.equal(splitKillXp(10, 2, "split"), 5);
  assert.equal(splitKillXp(10, 2, "full"), 10);
});
