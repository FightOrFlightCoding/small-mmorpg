import assert from "node:assert/strict";
import test from "node:test";
import {
  ENTERING_TIMEOUT_MS,
  LINK_DEAD_MS,
  LINK_DEAD_TICKS,
  NAKAMA_SOCKET_PING_PERIOD_MS,
  NAKAMA_SOCKET_PONG_WAIT_MS,
  acquireGameplayLease,
  decideLeaseAcquire,
  enteringLease,
  enteringLeaseExpired,
  leaseFromStorage,
  leaseIsStale,
  leasePlayAvailableAt,
  leaseStorageValue,
  liveGameplayLease,
  markLeaseLinkDead,
  serverInstanceIdentifier,
} from "../src/domain/gameplay_lease";
import { evaluateSafeLeave } from "../src/domain/safe_leave";
import { content, contentHash } from "../src/generated/content";
import { emptyEquipment } from "../src/domain/equipment";
import { emptyInventory } from "../src/domain/inventory";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  buildSnapshot,
  createStarterZoneState,
  playerCount,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import {
  applyPlayerLeave,
  applySafeLeave,
  expireLinkDeadPlayers,
} from "../src/domain/persistence";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { validateJoinAttempt } from "../src/domain/join_validation";
import {
  handleCharacterCreate,
  handleCharacterList,
  handleCharacterSelect,
  type CharacterLifecycleDeps,
} from "../src/domain/character_lifecycle";
import { type StoredCharacter } from "../src/domain/character";
import type { CharacterRoster } from "../src/domain/character_roster";
import type { NameReservation } from "../src/domain/character_name";
import type { SelectionTicket } from "../src/domain/character_ticket";
import { type ClassDefinition } from "../src/domain/class_catalog";

function emptyZone(): StarterZoneState {
  const map: { [id: string]: { id: string; maxHealth: number } } = {};
  const ids = Object.keys(content.enemies);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    map[id] = { id: id, maxHealth: content.enemies[id as keyof typeof content.enemies].maxHealth };
  }
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    map,
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    questDefinitionsFromContent(content.quests),
  );
}

function playerAt(userId: string, name: string, x: number, y: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    derivedAttack: content.player.attack,
    gold: 0,
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

test("lease acquire is exclusive and concurrent second acquire fails", () => {
  const first = enteringLease({
    accountUserId: "user-a",
    characterId: "char-1",
    sessionId: "s1",
    socketOrPresenceId: "s1",
    matchId: "match-1",
    zoneOrInstanceId: "zone.starter",
    nowMs: 1000,
    serverInstanceIdentifier: serverInstanceIdentifier("match-1", "nakama"),
  });
  const second = enteringLease({
    accountUserId: "user-a",
    characterId: "char-2",
    sessionId: "s2",
    socketOrPresenceId: "s2",
    matchId: "match-1",
    zoneOrInstanceId: "zone.starter",
    nowMs: 1001,
    serverInstanceIdentifier: serverInstanceIdentifier("match-1", "nakama"),
  });
  const won = decideLeaseAcquire(null, first, 1000, true);
  assert.equal(won.ok, true);
  if (!won.ok) {
    return;
  }
  const lost = decideLeaseAcquire(won.lease, second, 1001, true);
  assert.equal(lost.ok, false);
  if (!lost.ok) {
    assert.equal(lost.code, "account_busy");
  }
});

test("interrupted ENTERING lease expires and can be replaced", () => {
  const entering = enteringLease({
    accountUserId: "user-a",
    characterId: "char-1",
    sessionId: "s1",
    socketOrPresenceId: "s1",
    matchId: "match-1",
    zoneOrInstanceId: "zone.starter",
    nowMs: 1000,
    serverInstanceIdentifier: "nakama|match-1",
  });
  assert.equal(enteringLeaseExpired(entering, 1000 + ENTERING_TIMEOUT_MS - 1), false);
  assert.equal(enteringLeaseExpired(entering, 1000 + ENTERING_TIMEOUT_MS), true);
  assert.equal(liveGameplayLease(entering, 1000 + ENTERING_TIMEOUT_MS), null);
  const replacement = enteringLease({
    accountUserId: "user-a",
    characterId: "char-1",
    sessionId: "s2",
    socketOrPresenceId: "s2",
    matchId: "match-2",
    zoneOrInstanceId: "zone.starter",
    nowMs: 1000 + ENTERING_TIMEOUT_MS,
    serverInstanceIdentifier: "nakama|match-2",
  });
  const decided = decideLeaseAcquire(entering, replacement, 1000 + ENTERING_TIMEOUT_MS, true);
  assert.equal(decided.ok, true);
  if (decided.ok) {
    assert.equal(decided.replacedStale, true);
    assert.equal(decided.lease.matchId, "match-2");
  }
});

test("stale lease for a missing match is repaired without waiting ten seconds", () => {
  const online = acquireGameplayLease({
    accountUserId: "user-a",
    characterId: "char-1",
    matchId: "dead-match",
    nowMs: 5000,
  });
  assert.equal(leaseIsStale(online, 5001, false), true);
  assert.equal(leaseIsStale(online, 5001, true), false);
});

test("link-dead lease stores server despawn timestamp", () => {
  const online = acquireGameplayLease({
    accountUserId: "user-a",
    characterId: "char-1",
    matchId: "match-1",
    nowMs: 2000,
  });
  const dead = markLeaseLinkDead(online, 9000);
  assert.equal(dead.state, "LINK_DEAD");
  assert.equal(dead.disconnectDetectedAt, 9000);
  assert.equal(dead.despawnAt, 9000 + LINK_DEAD_MS);
  assert.equal(leasePlayAvailableAt(dead), 9000 + LINK_DEAD_MS);
  const roundTrip = leaseFromStorage(leaseStorageValue(dead));
  assert.equal(roundTrip?.state, "LINK_DEAD");
  assert.equal(roundTrip?.despawnAt, 9000 + LINK_DEAD_MS);
});

test("legacy DISCONNECTING storage migrates to LINK_DEAD", () => {
  const parsed = leaseFromStorage({
    accountUserId: "user-a",
    characterId: "char-1",
    matchId: "match-1",
    presenceState: "DISCONNECTING",
    acquiredAt: 1,
    lastSeenAt: 2,
    playAvailableAt: 5002,
    schemaVersion: 1,
  });
  assert.equal(parsed?.state, "LINK_DEAD");
  assert.equal(parsed?.despawnAt, 5002);
});

test("unexpected disconnect keeps a link-dead entity that cannot move", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  const left = applyPlayerLeave(state, "user-alice", 5);
  assert.equal(playerCount(left.state), 1);
  assert.equal(left.state.players["user-alice"].linkDead, true);
  assert.equal(left.state.players["user-alice"].linkDeadUntilTick, 5 + LINK_DEAD_TICKS);
  const snap = JSON.parse(buildSnapshot(left.state, 5));
  assert.equal(snap.players.length, 1);
  assert.equal(snap.players[0].linkDead, true);
  const moved = applyMatchLoop(left.state, 6, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 1, axisX: 1, axisY: 0 }), userId: "user-alice" },
  ]);
  assert.equal(moved.state.players["user-alice"].x, 400);
  assert.equal(moved.state.players["user-alice"].axisX, 0);
});

test("ten-second hold starts after detection; Nakama heartbeat can delay detection", () => {
  assert.equal(LINK_DEAD_MS, 10000);
  assert.equal(NAKAMA_SOCKET_PING_PERIOD_MS, 15000);
  assert.equal(NAKAMA_SOCKET_PONG_WAIT_MS, 25000);
  assert.equal(NAKAMA_SOCKET_PING_PERIOD_MS < NAKAMA_SOCKET_PONG_WAIT_MS, true);
});

test("emptyTicks keep counting when expireLinkDeadPlayers finds nobody to despawn", () => {
  const state = emptyZone();
  state.emptyTicks = 7;
  const expired = expireLinkDeadPlayers(state, 1);
  assert.equal(expired.players.length, 0);
  assert.equal(state.emptyTicks, 7);
});

test("last link-dead despawn resets emptyTicks so empty timeout starts after despawn", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  state = applyPlayerLeave(state, "user-alice", 10).state;
  state.emptyTicks = 40;
  expireLinkDeadPlayers(state, 10 + LINK_DEAD_TICKS);
  assert.equal(playerCount(state), 0);
  assert.equal(state.emptyTicks, 0);
});

test("link-dead entity despawns on the server deadline and not before", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  state = applyPlayerLeave(state, "user-alice", 10).state;
  const before = expireLinkDeadPlayers(state, 10 + LINK_DEAD_TICKS - 1);
  assert.equal(before.players.length, 0);
  assert.equal(state.players["user-alice"] !== undefined, true);
  const after = expireLinkDeadPlayers(state, 10 + LINK_DEAD_TICKS);
  assert.equal(after.players.length, 1);
  assert.equal(state.players["user-alice"], undefined);
});

test("safe return removes the avatar immediately", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 512, 400));
  const left = applySafeLeave(state, "user-alice");
  assert.equal(left.state.players["user-alice"], undefined);
  assert.equal(JSON.parse(buildSnapshot(left.state, 3)).players.length, 0);
});

test("safe leave while in combat is rejected", () => {
  const player = playerAt("user-alice", "Alice", 400, 400);
  player.inCombat = true;
  const state = addPlayer(emptyZone(), player);
  const decision = evaluateSafeLeave(state.players["user-alice"], state);
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.code, "in_combat");
    assert.equal(decision.message, "Cannot leave safely while in combat.");
  }
  const denied = applyMatchLoop(state, 4, contentHash, [
    {
      opcode: ClientOpcode.RETURN_TO_CHARACTER_SELECT,
      raw: envelope({ requestId: "req-return0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(denied.state.players["user-alice"] !== undefined, true);
  const body = JSON.parse(denied.outbound.find((item) => item.opcode === 103)!.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, "in_combat");
});

test("safe return opcode succeeds when idle and reports departed", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  const result = applyMatchLoop(state, 8, contentHash, [
    {
      opcode: ClientOpcode.RETURN_TO_CHARACTER_SELECT,
      raw: envelope({ requestId: "req-return0002" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(result.state.players["user-alice"], undefined);
  assert.equal(result.safeLeaveUserIds.indexOf("user-alice") !== -1, true);
  const body = JSON.parse(result.outbound.find((item) => item.opcode === 103)!.body);
  assert.equal(body.ok, true);
});

test("link-dead join is rejected and empty presence does not rebind", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  state.players["user-alice"].linkDead = true;
  const meta = {
    protocolVersion: String(PROTOCOL_VERSION),
    contentHash: contentHash,
    clientVersion: "1.0.0",
    selectionTicket: "ticket-1",
  };
  const linkDead = validateJoinAttempt(state, contentHash, meta, true, "session-new", "", { linkDead: true });
  assert.equal(linkDead.accept, false);
  assert.equal(linkDead.rejectMessage, "link_dead");
  const rebound = validateJoinAttempt(state, contentHash, meta, true, "session-new", "");
  assert.equal(rebound.accept, false);
  assert.equal(rebound.rejectMessage, "already_in_match");
});

const CLASSES: { [id: string]: ClassDefinition } = {
  "class.warrior": {
    id: "class.warrior",
    startingEquipment: [{ itemId: "item.training_sword", quantity: 1 }],
    legacyMigrationDefault: true,
  },
};

class MemoryLifecycle implements CharacterLifecycleDeps {
  now = 1_700_000_000_000;
  ids: string[] = ["char-a", "ticket-1", "char-b", "ticket-2"];
  idCursor = 0;
  tokenCursor = 0;
  player = content.player;
  zone = content.zones["zone.starter"];
  classes = CLASSES;
  rosters = new Map<string, CharacterRoster>();
  legacy = new Map<string, StoredCharacter>();
  characters = new Map<string, StoredCharacter>();
  reservations = new Map<string, NameReservation>();
  selections = new Map<string, SelectionTicket>();
  leases = new Map<string, import("../src/domain/gameplay_lease").GameplayLease>();
  liveMatches = new Set<string>(["match-live"]);
  repairs: string[] = [];
  nowMs = () => this.now;
  newId = () => {
    const id = this.ids[this.idCursor] !== undefined ? this.ids[this.idCursor] : "id-" + String(this.idCursor);
    this.idCursor += 1;
    return id;
  };
  newReservationToken = () => {
    this.tokenCursor += 1;
    return "token-" + String(this.tokenCursor);
  };
  readRoster = (userId: string) => this.rosters.get(userId) ?? null;
  writeRoster = (userId: string, roster: CharacterRoster) => {
    this.rosters.set(userId, roster);
  };
  readLegacyCharacter = (userId: string) => this.legacy.get(userId) ?? null;
  readCharacter = (userId: string, characterId: string) => this.characters.get(userId + ":" + characterId) ?? null;
  writeCharacter = (userId: string, record: StoredCharacter) => {
    this.characters.set(userId + ":" + record.characterId, record);
  };
  readReservation = (canonicalName: string) => this.reservations.get(canonicalName) ?? null;
  writeReservation = (reservation: NameReservation) => {
    this.reservations.set(reservation.canonicalName, reservation);
  };
  confirmReservation = (canonicalName: string) => this.reservations.get(canonicalName) ?? null;
  readSelection = (userId: string) => this.selections.get(userId) ?? null;
  writeSelection = (userId: string, ticket: SelectionTicket) => {
    this.selections.set(userId, ticket);
  };
  readLease = (userId: string) => this.leases.get(userId) ?? null;
  writeLease = (userId: string, lease: import("../src/domain/gameplay_lease").GameplayLease | null) => {
    if (lease === null) {
      this.leases.delete(userId);
      return;
    }
    this.leases.set(userId, lease);
  };
  matchExists = (matchId: string) => this.liveMatches.has(matchId);
  logLeaseRepair = (userId: string, matchId: string, reason: string) => {
    this.repairs.push(userId + ":" + matchId + ":" + reason);
  };
}

test("character list blocks Play during link-dead countdown and after stale match repair", () => {
  const mem = new MemoryLifecycle();
  handleCharacterCreate("user-a", JSON.stringify({ name: "Scout", classId: "class.warrior" }), mem);
  const listed = handleCharacterList("user-a", mem);
  const idle = listed.characters[0];
  assert.equal(idle.playBlockedReason, "");
  mem.writeLease(
    "user-a",
    markLeaseLinkDead(
      acquireGameplayLease({ accountUserId: "user-a", characterId: idle.characterId, matchId: "match-live", nowMs: mem.now }),
      mem.now,
    ),
  );
  const blocked = handleCharacterList("user-a", mem);
  assert.equal(blocked.characters[0].playBlockedReason, "link_dead");
  assert.equal(blocked.characters[0].playAvailableAt, mem.now + LINK_DEAD_MS);
  assert.throws(() => handleCharacterSelect("user-a", JSON.stringify({ characterId: idle.characterId }), mem), /link_dead/);
  mem.writeLease(
    "user-a",
    acquireGameplayLease({ accountUserId: "user-a", characterId: idle.characterId, matchId: "dead-match", nowMs: mem.now }),
  );
  const repaired = handleCharacterList("user-a", mem);
  assert.equal(repaired.characters[0].playBlockedReason, "");
  assert.equal(mem.repairs.length > 0, true);
});

test("second character and the same character stay blocked until the lease clears", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["char-a", "char-b", "t1", "t2"];
  handleCharacterCreate("user-a", JSON.stringify({ name: "Scout", classId: "class.warrior" }), mem);
  handleCharacterCreate("user-a", JSON.stringify({ name: "Ranger", classId: "class.warrior" }), mem);
  mem.writeLease(
    "user-a",
    acquireGameplayLease({ accountUserId: "user-a", characterId: "char-a", matchId: "match-live", nowMs: mem.now }),
  );
  const listed = handleCharacterList("user-a", mem);
  const first = listed.characters.find((row) => row.characterId === "char-a");
  const second = listed.characters.find((row) => row.characterId === "char-b");
  assert.equal(first?.playBlockedReason, "account_busy");
  assert.equal(second?.playBlockedReason, "account_busy");
  assert.throws(() => handleCharacterSelect("user-a", JSON.stringify({ characterId: "char-a" }), mem), /account_busy/);
  assert.throws(() => handleCharacterSelect("user-a", JSON.stringify({ characterId: "char-b" }), mem), /account_busy/);
  mem.writeLease("user-a", null);
  const open = handleCharacterList("user-a", mem);
  assert.equal(open.characters[0].playBlockedReason, "");
  const selected = handleCharacterSelect("user-a", JSON.stringify({ characterId: "char-a" }), mem);
  assert.equal(selected.ticketId.length > 0, true);
});

test("link-dead lease can be replaced exactly at the despawn timestamp", () => {
  const dead = markLeaseLinkDead(
    acquireGameplayLease({ accountUserId: "user-a", characterId: "char-1", matchId: "match-1", nowMs: 1000 }),
    1000,
  );
  assert.equal(liveGameplayLease(dead, 1000 + LINK_DEAD_MS - 1) !== null, true);
  assert.equal(liveGameplayLease(dead, 1000 + LINK_DEAD_MS), null);
  const next = enteringLease({
    accountUserId: "user-a",
    characterId: "char-1",
    sessionId: "s2",
    socketOrPresenceId: "s2",
    matchId: "match-2",
    zoneOrInstanceId: "zone.starter",
    nowMs: 1000 + LINK_DEAD_MS,
    serverInstanceIdentifier: "nakama|match-2",
  });
  const decided = decideLeaseAcquire(dead, next, 1000 + LINK_DEAD_MS, true);
  assert.equal(decided.ok, true);
});

test("one account cannot produce two snapshot avatars", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  state = addPlayer(state, playerAt("user-alice", "Alice", 410, 400));
  assert.equal(JSON.parse(buildSnapshot(state, 1)).players.length, 1);
});
