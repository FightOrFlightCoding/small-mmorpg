import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFirstDamagingHitTag,
  resetEnemyTag,
  snapshotEncounterRoster,
} from "../src/domain/enemy_tag";
import type { MatchEnemy } from "../src/domain/match_state";
import type { MatchPartyCache } from "../src/domain/party_credit";

function enemyStub(): MatchEnemy {
  return {
    id: "enemy.green_slime:0",
    enemyId: "enemy.green_slime",
    spawnX: 0,
    spawnY: 0,
    x: 10,
    y: 10,
    maxHealth: 20,
    health: 20,
    aiState: "idle",
    aggroTarget: "",
    lastAttackTick: -1,
    deadUntilTick: 0,
    damage: 1,
    moveSpeed: 40,
    aggroRadius: 80,
    attackRange: 24,
    attackCooldownSec: 1,
    leashRadius: 200,
    respawnDelaySec: 10,
    xpReward: 5,
    deathCount: 0,
  };
}

function partyOf(members: Array<{ userId: string; characterId: string }>): MatchPartyCache {
  return {
    partyId: "party.test",
    revision: 1,
    leaderCharacterId: members[0].characterId,
    lootPolicy: "personal",
    members: members.map(function (row) {
      return {
        accountUserId: row.userId,
        characterId: row.characterId,
        displayName: row.characterId,
        connectionState: "online",
      };
    }),
  };
}

test("first damaging attacker tags; a second hit does not retag", () => {
  const enemy = enemyStub();
  const first = applyFirstDamagingHitTag({
    enemy: enemy,
    attackerUserId: "user-alice",
    attackerCharacterId: "char-alice",
    tick: 8,
  });
  assert.equal(first, true);
  assert.equal(enemy.tagOwnerCharacterId, "char-alice");
  assert.equal(enemy.tagRevision, 1);
  const second = applyFirstDamagingHitTag({
    enemy: enemy,
    attackerUserId: "user-bob",
    attackerCharacterId: "char-bob",
    tick: 9,
  });
  assert.equal(second, false);
  assert.equal(enemy.tagOwnerCharacterId, "char-alice");
  assert.equal(enemy.tagRevision, 1);
});

test("party roster is snapshotted at tag time", () => {
  const enemy = enemyStub();
  const party = partyOf([
    { userId: "user-alice", characterId: "char-alice" },
    { userId: "user-bob", characterId: "char-bob" },
  ]);
  applyFirstDamagingHitTag({
    enemy: enemy,
    attackerUserId: "user-alice",
    attackerCharacterId: "char-alice",
    party: party,
    tick: 3,
  });
  assert.deepEqual(
    (enemy.encounterRoster !== undefined ? enemy.encounterRoster : []).map(function (row) {
      return row.characterId;
    }),
    ["char-alice", "char-bob"],
  );
});

test("late party join is excluded from the immutable roster", () => {
  const enemy = enemyStub();
  const party = partyOf([{ userId: "user-alice", characterId: "char-alice" }]);
  applyFirstDamagingHitTag({
    enemy: enemy,
    attackerUserId: "user-alice",
    attackerCharacterId: "char-alice",
    party: party,
    tick: 3,
  });
  party.members.push({
    accountUserId: "user-cara",
    characterId: "char-cara",
    displayName: "Cara",
    connectionState: "online",
  });
  assert.equal((enemy.encounterRoster !== undefined ? enemy.encounterRoster : []).length, 1);
  assert.equal(enemy.encounterRoster !== undefined ? enemy.encounterRoster[0].characterId : "", "char-alice");
});

test("kicked member remains in the snapshotted roster", () => {
  const party = partyOf([
    { userId: "user-alice", characterId: "char-alice" },
    { userId: "user-bob", characterId: "char-bob" },
  ]);
  const roster = snapshotEncounterRoster("user-alice", "char-alice", party);
  party.members = party.members.filter(function (row) {
    return row.characterId !== "char-bob";
  });
  assert.deepEqual(
    roster.map(function (row) {
      return row.characterId;
    }),
    ["char-alice", "char-bob"],
  );
});

test("tag reset on leash/full reset clears owner and roster and bumps revision", () => {
  const enemy = enemyStub();
  applyFirstDamagingHitTag({
    enemy: enemy,
    attackerUserId: "user-alice",
    attackerCharacterId: "char-alice",
    tick: 4,
  });
  resetEnemyTag(enemy);
  assert.equal(enemy.tagOwnerCharacterId, "");
  assert.equal((enemy.encounterRoster !== undefined ? enemy.encounterRoster : []).length, 0);
  assert.equal(enemy.tagRevision, 2);
});
