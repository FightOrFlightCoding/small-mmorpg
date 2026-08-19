import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCaveWipeIfNeeded,
  canJoinOwnedCave,
  chooseReconnectMatch,
  evaluateCaveEntry,
  evaluateCaveExit,
  expireCave,
  expirePartyOwnedCave,
  findOrCreateOwnedCave,
  markCaveBossDefeated,
  memoryCaveRepository,
  terminateCave,
  type CaveMatchFactory,
} from "../src/domain/cave";
import { content, contentHash } from "../src/generated/content";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import {
  consumeTransferTicket,
  issueTransferTicket,
  previewTransferTicket,
  type TransferTicketRepository,
} from "../src/domain/transfer";
import { evaluateJoinPresence } from "../src/domain/location";
import { caveLocation, emptyCaveRecord, publicWorldLocation, type CaveRecord } from "../src/domain/instance";
import { applyPlayerLeave, applyPlayerTransfer } from "../src/domain/persistence";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { itemDefinitionsFromContent } from "../src/domain/inventory";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { resolveStarterMatchId } from "../src/domain/starter_zone_registry";
import type { PartyRecord } from "../src/domain/party";

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function caveZone(): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.cave"],
    { "test.enemy.cave_boss": { id: "test.enemy.cave_boss", maxHealth: 80, tags: ["boss"] } },
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      instanceType: "party_cave",
      instanceId: "cave-1",
      ownerCharacterId: "char-alice",
      maxPlayers: 5,
      emptyTimeoutTicks: 5,
      reconnectGraceTicks: 20,
    },
  );
}

function playerAt(userId: string, characterId: string, x: number, y: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: characterId,
    name: characterId,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
  };
}

function partyOf(partyId: string, members: string[]): PartyRecord {
  return {
    partyId: partyId,
    leaderCharacterId: members[0],
    members: members.map(function (id) {
      return {
        accountUserId: "acc-" + id,
        characterId: id,
        displayName: id,
        joinedAt: 1,
        connectionState: "online",
        lastSeenAt: 1,
      };
    }),
    invites: [],
    revision: 1,
    createdAt: 1,
    lastActiveAt: 1,
    expiresAt: 999999,
    schemaVersion: 1,
    byRequestId: {},
    lootPolicy: "personal",
  };
}

function factory(running: { [id: string]: boolean }, nowMs = 1000, seq = { n: 0 }): CaveMatchFactory {
  return {
    create: function (params) {
      const id = "match-" + params.instanceId + "-" + String(seq.n);
      seq.n += 1;
      running[id] = true;
      return id;
    },
    isRunning: function (matchId: string) {
      return running[matchId] === true;
    },
    contentHash: contentHash,
    nowMs: nowMs,
    newId: function () {
      seq.n += 1;
      return "inst-" + String(seq.n);
    },
    emptyTimeoutMs: 60000,
  };
}

function memoryTickets(): TransferTicketRepository & { rows: { [id: string]: ReturnType<typeof issueTransferTicket> } } {
  const rows: { [id: string]: ReturnType<typeof issueTransferTicket> } = {};
  return {
    rows: rows,
    getTicket: function (ticketId: string) {
      return rows[ticketId] !== undefined ? rows[ticketId] : null;
    },
    putTicket: function (ticket) {
      rows[ticket.ticketId] = ticket;
    },
  };
}

test("public-world discovery prefers a running stored match", () => {
  assert.equal(resolveStarterMatchId(["match-extra"], "match-canonical", true, "match-extra"), "match-canonical");
});

test("stale public-world records fall back to listed then created ids", () => {
  assert.equal(resolveStarterMatchId(["match-live"], "match-dead", false, "match-created"), "match-live");
  assert.equal(resolveStarterMatchId([], null, false, "match-created"), "match-created");
});

test("solo cave allocation returns one instance", () => {
  const repo = memoryCaveRepository();
  const running: { [id: string]: boolean } = {};
  const first = findOrCreateOwnedCave(repo, factory(running), {
    characterId: "char-alice",
    ownerKind: "character",
    ownerId: "char-alice",
    party: null,
  });
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  const second = findOrCreateOwnedCave(repo, factory(running), {
    characterId: "char-alice",
    ownerKind: "character",
    ownerId: "char-alice",
    party: null,
  });
  assert.equal(second.ok, true);
  assert.equal(second.record?.instanceId, first.record?.instanceId);
  assert.equal(second.record?.matchId, first.record?.matchId);
});

test("party members share one cave instance and non-members are denied", () => {
  const repo = memoryCaveRepository();
  const running: { [id: string]: boolean } = {};
  const party = partyOf("p_one", ["char-alice", "char-bob"]);
  const alice = findOrCreateOwnedCave(repo, factory(running), {
    characterId: "char-alice",
    ownerKind: "party",
    ownerId: "p_one",
    party: party,
  });
  const bob = findOrCreateOwnedCave(repo, factory(running), {
    characterId: "char-bob",
    ownerKind: "party",
    ownerId: "p_one",
    party: party,
  });
  assert.equal(alice.ok, true);
  assert.equal(bob.ok, true);
  assert.equal(alice.record?.instanceId, bob.record?.instanceId);
  assert.equal(alice.record?.matchId, bob.record?.matchId);
  const outsider = canJoinOwnedCave({
    characterId: "char-eve",
    record: alice.record as CaveRecord,
    party: partyOf("p_other", ["char-eve"]),
  });
  assert.equal(outsider.ok, false);
  assert.equal(outsider.code, "not_party_member");
});

test("cave reconnect stays on a live party cave while the character is a member", () => {
  const cave = emptyCaveRecord({
    instanceId: "cave-1",
    matchId: "match-cave-1",
    ownerPartyId: "p_one",
    contentVersion: "hash",
    nowMs: 1000,
    emptyTimeoutMs: 60000,
  });
  assert.equal(
    chooseReconnectMatch({
      locationInstanceType: "party_cave",
      cave: cave,
      caveMatchRunning: true,
      characterId: "char-alice",
      party: partyOf("p_one", ["char-alice", "char-bob"]),
    }),
    "cave",
  );
});

test("cave reconnect falls back to the public world when the party is gone", () => {
  const cave = emptyCaveRecord({
    instanceId: "cave-1",
    matchId: "match-cave-1",
    ownerPartyId: "p_one",
    contentVersion: "hash",
    nowMs: 1000,
    emptyTimeoutMs: 60000,
  });
  assert.equal(
    chooseReconnectMatch({
      locationInstanceType: "party_cave",
      cave: cave,
      caveMatchRunning: true,
      characterId: "char-alice",
      party: null,
    }),
    "public_world",
  );
});

test("cave reconnect falls back to the public world when the cave match is gone", () => {
  const cave = emptyCaveRecord({
    instanceId: "cave-1",
    matchId: "match-cave-1",
    ownerPartyId: "p_one",
    contentVersion: "hash",
    nowMs: 1000,
    emptyTimeoutMs: 60000,
  });
  assert.equal(
    chooseReconnectMatch({
      locationInstanceType: "party_cave",
      cave: cave,
      caveMatchRunning: false,
      characterId: "char-alice",
      party: partyOf("p_one", ["char-alice"]),
    }),
    "public_world",
  );
});

test("concurrent owner-index writes keep a single cave", () => {
  const repo = memoryCaveRepository();
  const running: { [id: string]: boolean } = {};
  const seq = { n: 0 };
  const shared = factory(running, 1000, seq);
  const a = findOrCreateOwnedCave(repo, shared, {
    characterId: "char-alice",
    ownerKind: "character",
    ownerId: "char-alice",
    party: null,
  });
  const b = findOrCreateOwnedCave(repo, shared, {
    characterId: "char-alice",
    ownerKind: "character",
    ownerId: "char-alice",
    party: null,
  });
  assert.equal(a.record?.instanceId, b.record?.instanceId);
});

test("stale cave match records are recovered while expired caves are not", () => {
  const repo = memoryCaveRepository();
  const running: { [id: string]: boolean } = {};
  const created = findOrCreateOwnedCave(repo, factory(running, 1000), {
    characterId: "char-alice",
    ownerKind: "character",
    ownerId: "char-alice",
    party: null,
  });
  assert.equal(created.ok, true);
  const record = created.record as CaveRecord;
  running[record.matchId] = false;
  const recovered = findOrCreateOwnedCave(repo, factory(running, 2000), {
    characterId: "char-alice",
    ownerKind: "character",
    ownerId: "char-alice",
    party: null,
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.record?.instanceId, record.instanceId);
  assert.notEqual(recovered.record?.matchId, record.matchId);
  running[recovered.record?.matchId as string] = false;
  const expired = findOrCreateOwnedCave(repo, factory(running, 999999), {
    characterId: "char-alice",
    ownerKind: "character",
    ownerId: "char-alice",
    party: null,
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.code, "cave_expired");
});

test("transfer tickets reject reuse, expiry, and the wrong character", () => {
  const repo = memoryTickets();
  const ticket = issueTransferTicket({
    ticketId: "t1",
    characterId: "char-alice",
    accountUserId: "user-alice",
    originMatchId: "origin",
    destinationMatchId: "dest",
    destinationInstanceId: "cave-1",
    nowMs: 1000,
    ttlMs: 1000,
  });
  repo.putTicket(ticket);
  const expected = {
    characterId: "char-alice",
    accountUserId: "user-alice",
    destinationMatchId: "dest",
    nowMs: 1500,
  };
  const first = consumeTransferTicket(repo, "t1", expected);
  assert.equal(first.ok, true);
  const reused = consumeTransferTicket(repo, "t1", expected);
  assert.equal(reused.ok, false);
  assert.equal(reused.code, "ticket_reused");
  const fresh = issueTransferTicket({
    ticketId: "t2",
    characterId: "char-alice",
    accountUserId: "user-alice",
    originMatchId: "origin",
    destinationMatchId: "dest",
    destinationInstanceId: "cave-1",
    nowMs: 1000,
    ttlMs: 10,
  });
  assert.equal(previewTransferTicket(fresh, { ...expected, nowMs: 2000 }).code, "ticket_expired");
  const wrong = issueTransferTicket({
    ticketId: "t3",
    characterId: "char-bob",
    accountUserId: "user-bob",
    originMatchId: "origin",
    destinationMatchId: "dest",
    destinationInstanceId: "cave-1",
    nowMs: 1000,
  });
  assert.equal(previewTransferTicket(wrong, expected).code, "ticket_wrong_character");
});

test("conflicting presence is rejected unless reconnect or in-flight transfer applies", () => {
  const location = publicWorldLocation("match-a", "char-alice", "user-alice", 10, 10, 1);
  location.transferState = "issued";
  const stillOrigin = evaluateJoinPresence({
    location: location,
    joiningMatchId: "match-b",
    joiningInstanceType: "party_cave",
    hasTransferTicket: true,
    originPresenceLive: true,
    destinationCaveAlive: true,
  });
  assert.equal(stillOrigin.accept, false);
  assert.equal(stillOrigin.rejectMessage, "still_in_origin");
  location.transferState = "in_flight";
  const inflight = evaluateJoinPresence({
    location: location,
    joiningMatchId: "match-b",
    joiningInstanceType: "party_cave",
    hasTransferTicket: true,
    originPresenceLive: false,
    destinationCaveAlive: true,
  });
  assert.equal(inflight.accept, true);
  const elsewhere = evaluateJoinPresence({
    location: publicWorldLocation("match-a", "char-alice", "user-alice", 10, 10, 1),
    joiningMatchId: "match-b",
    joiningInstanceType: "public_world",
    hasTransferTicket: false,
    originPresenceLive: true,
    destinationCaveAlive: false,
  });
  assert.equal(elsewhere.accept, false);
  assert.equal(elsewhere.rejectMessage, "already_elsewhere");
});

test("disconnect in a cave can rejoin during grace and falls back after the cave is gone", () => {
  const record: CaveRecord = {
    instanceId: "cave-grace",
    zoneTemplateId: "zone.cave",
    matchId: "match-cave",
    ownerCharacterId: "char-alice",
    createdAt: 1,
    lastActiveAt: 1,
    expiresAt: 60000,
    lifecycleState: "empty_grace",
    contentVersion: contentHash,
    completionState: "none",
    schemaVersion: 1,
  };
  const location = caveLocation(record, "char-alice", "user-alice", 96, 256, 1);
  const rejoin = evaluateJoinPresence({
    location: location,
    joiningMatchId: "match-cave",
    joiningInstanceType: "party_cave",
    hasTransferTicket: false,
    originPresenceLive: false,
    destinationCaveAlive: true,
  });
  assert.equal(rejoin.accept, true);
  const stillCave = evaluateJoinPresence({
    location: location,
    joiningMatchId: "match-public",
    joiningInstanceType: "public_world",
    hasTransferTicket: false,
    originPresenceLive: false,
    destinationCaveAlive: true,
  });
  assert.equal(stillCave.accept, false);
  assert.equal(stillCave.rejectMessage, "already_elsewhere");
  const expired = evaluateJoinPresence({
    location: location,
    joiningMatchId: "match-public",
    joiningInstanceType: "public_world",
    hasTransferTicket: false,
    originPresenceLive: false,
    destinationCaveAlive: false,
  });
  assert.equal(expired.accept, true);
});

test("disconnect parks a cave player and transfer leave does not", () => {
  let state = addPlayer(caveZone(), playerAt("user-alice", "char-alice", 96, 256));
  const parked = applyPlayerLeave(state, "user-alice", 10);
  assert.equal(parked.state.players["user-alice"], undefined);
  assert.ok(parked.state.disconnected["user-alice"]);
  state = addPlayer(caveZone(), playerAt("user-alice", "char-alice", 96, 256));
  state.players["user-alice"].transferState = "issued";
  const transferred = applyPlayerLeave(state, "user-alice", 10);
  assert.equal(transferred.state.players["user-alice"], undefined);
  assert.equal(transferred.state.disconnected["user-alice"], undefined);
  const direct = applyPlayerTransfer(addPlayer(caveZone(), playerAt("user-bob", "char-bob", 96, 256)), "user-bob");
  assert.equal(direct.state.disconnected["user-bob"], undefined);
});

test("cave exit intent is queued at the exit npc", () => {
  const zone = caveZone();
  const exit = zone.npcs.find(function (npc) {
    return npc.npcId === "npc.test_cave_exit";
  });
  assert.ok(exit);
  const actor = playerAt("user-alice", "char-alice", exit.x, exit.y);
  const state = addPlayer(zone, actor);
  const result = applyMatchLoop(state, 3, contentHash, [
    {
      opcode: ClientOpcode.CAVE_EXIT,
      raw: envelope({ npcId: "npc.test_cave_exit", requestId: "req-cave-exit0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(result.transfers.length, 1);
  assert.equal(result.transfers[0].direction, "exit");
});

test("party wipe resets living players to the cave spawn", () => {
  let state = addPlayer(caveZone(), playerAt("user-alice", "char-alice", 400, 256));
  state = addPlayer(state, playerAt("user-bob", "char-bob", 420, 256));
  state.players["user-alice"].health = 0;
  state.players["user-bob"].health = 0;
  state.players["user-alice"].x = 400;
  const first = applyCaveWipeIfNeeded(state, 1, 10);
  assert.equal(first, false);
  assert.ok((state.wipeResetAtTick as number) > 1);
  const later = applyCaveWipeIfNeeded(state, state.wipeResetAtTick as number, 10);
  assert.equal(later, true);
  assert.equal(state.players["user-alice"].health, state.players["user-alice"].maxHealth);
  assert.equal(state.players["user-alice"].x, state.playerSpawnX);
});

test("boss completion is recorded once", () => {
  const state = caveZone();
  assert.equal(markCaveBossDefeated(state), true);
  assert.equal(state.completionState, "boss_defeated");
  assert.equal(markCaveBossDefeated(state), false);
});

test("empty cave instances terminate after their empty timeout", () => {
  const state = caveZone();
  const result = applyMatchLoop(state, 1, contentHash, []);
  assert.equal(result.terminate, false);
  result.state.emptyTicks = 5;
  const done = applyMatchLoop(result.state, 2, contentHash, []);
  assert.equal(done.terminate, true);
});

test("cave entry requires the public-world portal", () => {
  const portal = content.zones["zone.starter"].npcs.find(function (npc) {
    return npc.npcId === "npc.test_cave_portal";
  });
  assert.ok(portal);
  const ok = evaluateCaveEntry({
    accountUserId: "user-alice",
    characterId: "char-alice",
    health: 10,
    x: portal.x,
    y: portal.y,
    npcId: "npc.test_cave_portal",
    npcs: [{ id: portal.npcId, npcId: portal.npcId, x: portal.x, y: portal.y }],
    interactionRange: 48,
    npcById: npcDefinitionsFromContent(content.npcs),
    transferring: false,
    originInstanceType: "public_world",
    contentHash: contentHash,
    expectedContentHash: contentHash,
    party: null,
  });
  assert.equal(ok.ok, true);
  const far = evaluateCaveEntry({
    accountUserId: "user-alice",
    characterId: "char-alice",
    health: 10,
    x: 0,
    y: 0,
    npcId: "npc.test_cave_portal",
    npcs: [{ id: portal.npcId, npcId: portal.npcId, x: portal.x, y: portal.y }],
    interactionRange: 48,
    npcById: npcDefinitionsFromContent(content.npcs),
    transferring: false,
    originInstanceType: "public_world",
    contentHash: contentHash,
    expectedContentHash: contentHash,
    party: null,
  });
  assert.equal(far.code, "out_of_range");
});

test("cave exit requires the cave exit npc", () => {
  const exit = content.zones["zone.cave"].npcs[0];
  const ok = evaluateCaveExit({
    health: 10,
    x: exit.x,
    y: exit.y,
    npcId: exit.npcId,
    npcs: [{ id: exit.npcId, npcId: exit.npcId, x: exit.x, y: exit.y }],
    interactionRange: 48,
    npcById: npcDefinitionsFromContent(content.npcs),
    transferring: false,
    originInstanceType: "party_cave",
  });
  assert.equal(ok.ok, true);
});

test("terminated cave records are not reused", () => {
  const repo = memoryCaveRepository();
  const running: { [id: string]: boolean } = {};
  const seq = { n: 0 };
  const shared = factory(running, 1000, seq);
  const created = findOrCreateOwnedCave(repo, shared, {
    characterId: "char-alice",
    ownerKind: "character",
    ownerId: "char-alice",
    party: null,
  });
  terminateCave(repo, created.record as CaveRecord, 5000);
  const again = findOrCreateOwnedCave(repo, factory(running, 6000, seq), {
    characterId: "char-alice",
    ownerKind: "character",
    ownerId: "char-alice",
    party: null,
  });
  assert.equal(again.created, true);
  assert.notEqual(again.record?.instanceId, created.record?.instanceId);
  assert.equal(repo.getCave(created.record?.instanceId as string)?.lifecycleState, "terminated");
});

test("expireCave clears owner indexes", () => {
  const repo = memoryCaveRepository();
  const running: { [id: string]: boolean } = {};
  const created = findOrCreateOwnedCave(repo, factory(running), {
    characterId: "char-alice",
    ownerKind: "character",
    ownerId: "char-alice",
    party: null,
  });
  expireCave(repo, created.record as CaveRecord, 9000);
  assert.equal(repo.getOwnerIndex("character", "char-alice"), null);
});

test("expirePartyOwnedCave expires the party's cave record", () => {
  const repo = memoryCaveRepository();
  const running: { [id: string]: boolean } = {};
  const created = findOrCreateOwnedCave(repo, factory(running), {
    characterId: "char-alice",
    ownerKind: "party",
    ownerId: "p_one",
    party: partyOf("p_one", ["char-alice"]),
  });
  const released = expirePartyOwnedCave(repo, "p_one", 9000);
  assert.equal(released.released, true);
  assert.equal(repo.getCave(created.record?.instanceId as string)?.lifecycleState, "expired");
  assert.equal(repo.getOwnerIndex("party", "p_one"), null);
});
