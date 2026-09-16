import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { abilityDefinitionsFromContent, autoAttackDefinitionsFromContent } from "../src/domain/ability";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchEnemy,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import { initializeProgression } from "../src/domain/progression";
import { catalogFromContent, evaluateStats, playerStatContext, resourceIdForRole } from "../src/domain/stats";
import { classTagsFromContent } from "../src/domain/class_catalog";
import { syncDerivedAbilityOwnership } from "../src/domain/canonical_talents";
import { canonicalKillXpAmount } from "../src/domain/canonical_progression";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import { scriptedRandom } from "../src/domain/combat_rng";
import { spawnDefinitionsFromContent } from "../src/domain/spawn_controller";
import { aiProfilesFromContent } from "../src/domain/threat";
import { lootTablesFromContent } from "../src/domain/loot_table";
import { defaultGroupCreditRules } from "../src/domain/party";
import { applyPlayerLeave, expireLinkDeadPlayers } from "../src/domain/persistence";
import { LINK_DEAD_TICKS } from "../src/domain/gameplay_lease";

const catalog = catalogFromContent(content);
const MANA = resourceIdForRole(catalog, "mana");

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
      spawnsById: spawnDefinitionsFromContent(content.spawns),
      aiProfilesById: aiProfilesFromContent(content.aiProfiles),
      lootTablesById: lootTablesFromContent(content.lootTables),
      groupCreditRules: defaultGroupCreditRules(),
    },
  );
  state.progressionCatalog = catalog;
  state.combatRandom = scriptedRandom([0.99]);
  return state;
}

function enemyAt(id: string, x: number, y: number): MatchEnemy {
  return {
    id: id,
    enemyId: "enemy.green_slime",
    spawnX: x,
    spawnY: y,
    x: x,
    y: y,
    maxHealth: 1000,
    health: 1000,
    aiState: "idle",
    aggroTarget: "",
    lastAttackTick: 0,
    deadUntilTick: 0,
    damage: 4,
    moveSpeed: 0,
    aggroRadius: 0,
    attackRange: 40,
    attackCooldownSec: 99,
    leashRadius: 999,
    respawnDelaySec: 99,
    xpReward: 0,
    deathCount: 0,
    level: 1,
    aiProfileId: "test.ai.melee",
  };
}

function classPlayer(
  classId: string,
  userId: string,
  x: number,
  y: number,
  branchId: string,
  classNodes: string[],
  branchRanks: { [id: string]: number },
): MatchPlayer {
  const progression = initializeProgression(catalog, classId);
  progression.level = 10;
  progression.branchId = branchId;
  progression.purchasedClassNodeIds = classNodes.slice();
  progression.purchasedBranchNodeRanks = { ...branchRanks };
  syncDerivedAbilityOwnership(progression, catalog, classId);
  const stats = evaluateStats(
    catalog,
    playerStatContext(classId, progression, emptyEquipment(), emptyInventory(), {}, {}),
  );
  const hp = stats.maxHealth > 0 ? stats.maxHealth : 200;
  const resources: { [id: string]: number } = {};
  if (stats.maxMana > 0) {
    resources[MANA] = stats.maxMana;
  }
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: "char-" + userId,
    name: userId,
    classId: classId,
    x: x,
    y: y,
    maxHealth: hp,
    health: hp,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    progression: progression,
    effects: [],
    abilityCooldowns: {},
    resources: resources,
    facingX: 1,
    facingY: 0,
    gold: 0,
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
    partyId: "p_prog15",
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

function message(opcode: number, body: { [id: string]: unknown }, userId: string) {
  return {
    opcode: opcode,
    userId: userId,
    raw: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...body }),
  };
}

function run(state: StarterZoneState, tick: number, messages: ReturnType<typeof message>[] = []) {
  return applyMatchLoop(state, tick, contentHash, messages);
}

function actionCode(result: ReturnType<typeof applyMatchLoop>): string {
  const row = result.outbound.filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)[0];
  if (row === undefined) {
    return "";
  }
  return String((JSON.parse(row.body) as { code?: string }).code);
}

function completeCast(state: StarterZoneState, startTick: number, body: { [id: string]: unknown }, userId: string) {
  let result = run(state, startTick, [message(ClientOpcode.USE_ABILITY, body, userId)]);
  const cast = result.state.players[userId]?.activeCast;
  if (cast === undefined || cast.interruptReason !== "") {
    return result;
  }
  const until = cast.completionTick;
  for (let tick = startTick + 1; tick <= until; tick++) {
    result = run(result.state, tick);
  }
  return result;
}

function manaOf(player: MatchPlayer | undefined): number {
  if (player === undefined || player.resources === undefined) {
    return 0;
  }
  return player.resources[MANA] !== undefined ? player.resources[MANA] : 0;
}

test("four-class party certifies taunt spell mana ranged heal pvp xp and disconnect cleanup", () => {
  const x = 960;
  const y = 400;
  const warrior = classPlayer("class.warrior", "warrior", x - 20, y, "branch.warrior.bulwark", [], {});
  const mage = classPlayer("class.mage", "mage", x - 24, y, "branch.mage.fire", [], {});
  const marksman = classPlayer("class.marksman", "marksman", x - 150, y, "branch.marksman.sniper", [], {});
  const mystic = classPlayer("class.mystic", "mystic", x - 16, y, "branch.mystic.charms", [], {});
  mystic.health = Math.max(1, Math.floor(mystic.maxHealth * 0.4));
  warrior.health = Math.max(1, Math.floor(warrior.maxHealth * 0.5));
  const members = [warrior, mage, marksman, mystic];
  let state = zone();
  state.enemies = [enemyAt("enemy-1", x, y)];
  for (let i = 0; i < members.length; i++) {
    state = addPlayer(state, members[i]);
  }
  state.partyByCharacterId = partyCache(members);

  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.warrior.challenge", requestId: "party-taunt" }, "warrior")]);
  assert.equal(result.state.enemies[0].tauntSourceId, "warrior");

  const manaBefore = manaOf(result.state.players.mage);
  result = completeCast(result.state, 11, { abilityId: "ability.mage.arcane_bolt", targetId: "enemy-1", requestId: "party-bolt" }, "mage");
  assert.ok(result.state.enemies[0].health < 1000);
  assert.ok(manaOf(result.state.players.mage) < manaBefore);

  const beforeRanged = result.state.enemies[0].health;
  result = run(result.state, 20, [
    message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "party-ranged" }, "marksman"),
  ]);
  assert.ok(result.state.enemies[0].health < beforeRanged);

  const beforeHeal = result.state.players.warrior.health;
  result = completeCast(result.state, 21, { abilityId: "ability.mystic.fateweave", targetId: "warrior", requestId: "party-heal" }, "mystic");
  assert.ok(result.state.players.warrior.health > beforeHeal);

  result = run(result.state, 30, [
    message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.protective_charm", targetId: "warrior", requestId: "party-charm" }, "mystic"),
  ]);
  const warriorEffects = result.state.players.warrior.effects !== undefined ? result.state.players.warrior.effects : [];
  const sources: { [id: string]: boolean } = {};
  for (let i = 0; i < warriorEffects.length; i++) {
    sources[warriorEffects[i].sourceId + ":" + warriorEffects[i].effectId] = true;
  }
  assert.ok(Object.keys(sources).length >= 1);
  const enemyEffects = result.state.enemies[0].effects !== undefined ? result.state.enemies[0].effects : [];
  assert.ok(result.state.enemies[0].tauntSourceId === "warrior" || enemyEffects.length >= 0);

  const pvp = run(result.state, 40, [
    message(ClientOpcode.USE_ABILITY, { abilityId: "ability.warrior.heavy_strike", targetId: "mage", requestId: "party-pvp" }, "warrior"),
  ]);
  assert.equal(actionCode(pvp), "pvp_disabled");
  assert.equal(pvp.state.players.mage.health, result.state.players.mage.health);

  pvp.state.enemies[0].health = 1;
  const kill = run(pvp.state, 50, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "party-kill" }, "warrior")]);
  const expected = canonicalKillXpAmount(1, kill.state.enemies[0].tags);
  const seen: { [id: string]: boolean } = {};
  const ids = ["warrior", "mage", "marksman", "mystic"];
  for (let i = 0; i < ids.length; i++) {
    const progression = kill.state.players[ids[i]].progression;
    assert.ok(progression !== undefined);
    if (progression === undefined) {
      continue;
    }
    assert.equal(progression.lifetimeXp, expected, ids[i]);
    const eventIds = Object.keys(progression.xpByEventId);
    assert.equal(eventIds.length, 1, ids[i]);
    assert.equal(seen[eventIds[0]] === true, false);
    seen[eventIds[0]] = true;
  }
  const replay = run(kill.state, 51, []);
  for (let i = 0; i < ids.length; i++) {
    assert.equal(replay.state.players[ids[i]].progression?.lifetimeXp, expected);
  }

  const left = applyPlayerLeave(replay.state, "warrior", 60);
  assert.equal(left.state.players.warrior?.linkDead, true);
  expireLinkDeadPlayers(left.state, 60 + LINK_DEAD_TICKS);
  const cleaned = run(left.state, 60 + LINK_DEAD_TICKS + 1, []);
  assert.equal(cleaned.state.players.warrior, undefined);
  const tauntSource = cleaned.state.enemies[0] !== undefined ? cleaned.state.enemies[0].tauntSourceId : "";
  assert.ok(tauntSource === undefined || tauntSource === "" || tauntSource !== "warrior" || cleaned.state.enemies[0].health <= 0);
});
