import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { validateJoinAttempt } from "../src/domain/join_validation";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  EMPTY_MATCH_TIMEOUT_TICKS,
  MATCH_MAX_PLAYERS,
  MATCH_TICK_RATE,
  STARTER_ZONE_ID,
  STARTER_ZONE_LABEL,
  STARTER_ZONE_MODULE,
  addPlayer,
  buildFullState,
  createStarterZoneState,
  playerCount,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";

function enemiesById() {
  const map: { [id: string]: { id: string; maxHealth: number } } = {};
  const ids = Object.keys(content.enemies);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    map[id] = { id: id, maxHealth: content.enemies[id as keyof typeof content.enemies].maxHealth };
  }
  return map;
}

function emptyZone(): StarterZoneState {
  return createStarterZoneState(contentHash, content.zones["zone.starter"], enemiesById(), {
    id: content.player.id,
    maxHealth: content.player.maxHealth,
    moveSpeed: content.player.moveSpeed,
    interactionRange: content.player.interactionRange,
  }, questDefinitionsFromContent(content.quests));
}

function player(userId: string, name: string): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    x: content.zones["zone.starter"].playerSpawn.x,
    y: content.zones["zone.starter"].playerSpawn.y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
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

test("starter zone match constants", () => {
  assert.equal(STARTER_ZONE_MODULE, "starter_zone");
  assert.equal(STARTER_ZONE_LABEL, "zone.starter");
  assert.equal(STARTER_ZONE_ID, "zone.starter");
  assert.equal(MATCH_TICK_RATE, 10);
  assert.equal(MATCH_MAX_PLAYERS, 8);
  assert.equal(EMPTY_MATCH_TIMEOUT_TICKS, 300);
});

test("alice and bob appear in the same full state", () => {
  let state = emptyZone();
  state = addPlayer(state, player("user-alice", "Alice"));
  state = addPlayer(state, player("user-bob", "Bob"));
  const body = JSON.parse(buildFullState(state, 12, "user-alice"));
  assert.equal(body.protocolVersion, PROTOCOL_VERSION);
  assert.equal(body.contentHash, contentHash);
  assert.equal(body.tick, 12);
  assert.equal(body.zoneId, "zone.starter");
  assert.equal(body.selfId, "user-alice");
  assert.equal(body.players.length, 2);
  assert.equal(body.players[0].userId, "user-alice");
  assert.equal(body.players[1].userId, "user-bob");
  assert.equal(body.npcs.length, 5);
  assert.equal(body.npcs[0].npcId, "npc.elder");
  assert.equal(body.enemies.length, 1);
  assert.equal(body.enemies[0].enemyId, "enemy.green_slime");
  assert.deepEqual(body.loot, []);
  assert.deepEqual(body.quests, []);
  assert.equal(playerCount(state), 2);
});

test("join rejects protocol and content mismatches", () => {
  const state = emptyZone();
  const proto = validateJoinAttempt(state, contentHash, { protocolVersion: "2", contentHash: contentHash }, false);
  assert.equal(proto.accept, false);
  assert.equal(proto.rejectMessage, "protocol_mismatch");
  const hash = validateJoinAttempt(
    state,
    contentHash,
    {
      protocolVersion: "1",
      contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    false,
  );
  assert.equal(hash.accept, false);
  assert.equal(hash.rejectMessage, "content_mismatch");
  const ok = validateJoinAttempt(
    state,
    contentHash,
    { protocolVersion: "1", contentHash: contentHash, selectionTicket: "ticket-1" },
    false,
  );
  assert.equal(ok.accept, true);
});

test("join requires a selection ticket and rejects character id injection", () => {
  const state = emptyZone();
  const missing = validateJoinAttempt(state, contentHash, { protocolVersion: "1", contentHash: contentHash }, false);
  assert.equal(missing.accept, false);
  assert.equal(missing.rejectMessage, "selection_required");
  const forged = validateJoinAttempt(
    state,
    contentHash,
    { protocolVersion: "1", contentHash: contentHash, selectionTicket: "ticket-1", characterId: "char-other" },
    false,
  );
  assert.equal(forged.accept, false);
  assert.equal(forged.rejectMessage, "stat_injection:characterId");
});

test("join rejects client-supplied save versions", () => {
  const state = emptyZone();
  const forged = validateJoinAttempt(
    state,
    contentHash,
    { protocolVersion: "1", contentHash: contentHash, schemaVersion: "0" },
    false,
  );
  assert.equal(forged.accept, false);
  assert.equal(forged.rejectMessage, "stat_injection:schemaVersion");
});

test("join rejects a second session for the same account", () => {
  const state = addPlayer(emptyZone(), player("user-alice", "Alice"));
  const meta = { protocolVersion: "1", contentHash: contentHash };
  const duplicate = validateJoinAttempt(state, contentHash, meta, true, "session-new", "session-user-alice");
  assert.equal(duplicate.accept, false);
  assert.equal(duplicate.rejectMessage, "already_in_match");
	const sameSession = validateJoinAttempt(state, contentHash, meta, true, "session-user-alice", "session-user-alice");
	assert.equal(sameSession.accept, true);
	const reconnectWithoutPresence = validateJoinAttempt(state, contentHash, meta, true, "session-new", "");
	assert.equal(reconnectWithoutPresence.accept, true);
});

test("join rejects when the match is full", () => {
  let state = emptyZone();
  for (let i = 0; i < MATCH_MAX_PLAYERS; i++) {
    state = addPlayer(state, player("user-" + String(i), "P" + String(i)));
  }
  const full = validateJoinAttempt(
    state,
    contentHash,
    { protocolVersion: "1", contentHash: contentHash, selectionTicket: "ticket-1" },
    false,
  );
  assert.equal(full.accept, false);
  assert.equal(full.rejectMessage, "match_full");
});

test("resync returns a fresh full state without moving the player", () => {
  let state = addPlayer(emptyZone(), player("user-alice", "Alice"));
  const before = state.players["user-alice"];
  const result = applyMatchLoop(state, 44, contentHash, [
    { opcode: ClientOpcode.RESYNC_REQUEST, raw: envelope(), userId: "user-alice" },
  ]);
  assert.equal(result.terminate, false);
  const full = result.outbound.filter((item) => item.opcode === ServerOpcode.FULL_STATE);
  assert.equal(full.length, 1);
  const body = JSON.parse(full[0].body);
  assert.equal(body.tick, 44);
  assert.equal(body.selfId, "user-alice");
  assert.equal(body.contentHash, contentHash);
  assert.equal(result.state.players["user-alice"].x, before.x);
  assert.equal(result.state.players["user-alice"].y, before.y);
});

test("idle input does not change position and snapshots include lastProcessedSeq", () => {
  let state = addPlayer(emptyZone(), player("user-alice", "Alice"));
  const before = state.players["user-alice"];
  const result = applyMatchLoop(state, 3, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 1, axisX: 0, axisY: 0 }), userId: "user-alice" },
  ]);
  assert.equal(result.state.players["user-alice"].x, before.x);
  assert.equal(result.state.players["user-alice"].y, before.y);
  assert.equal(result.state.players["user-alice"].lastProcessedSeq, 1);
  const snap = result.outbound.filter((item) => item.opcode === ServerOpcode.SNAPSHOT);
  assert.equal(snap.length, 1);
  const body = JSON.parse(snap[0].body);
  assert.equal(body.tick, 3);
  assert.equal(body.players[0].lastProcessedSeq, 1);
  assert.equal(body.players[0].x, before.x);
});

test("malformed payloads do not crash the match", () => {
  let state = addPlayer(emptyZone(), player("user-alice", "Alice"));
  const result = applyMatchLoop(state, 5, contentHash, [
    { opcode: ClientOpcode.RESYNC_REQUEST, raw: "{not-json", userId: "user-alice" },
    { opcode: 999, raw: envelope(), userId: "user-alice" },
    { opcode: ClientOpcode.RESYNC_REQUEST, raw: envelope(), userId: "user-alice" },
  ]);
  assert.equal(result.terminate, false);
  assert.equal(playerCount(result.state), 1);
  assert.equal(result.outbound.length, 4);
  assert.equal(result.outbound[0].opcode, ServerOpcode.SYSTEM_MESSAGE);
  assert.equal(JSON.parse(result.outbound[0].body).code, "malformed_json");
  assert.equal(JSON.parse(result.outbound[1].body).code, "unknown_opcode");
  assert.equal(result.outbound[2].opcode, ServerOpcode.FULL_STATE);
  assert.equal(result.outbound[3].opcode, ServerOpcode.SNAPSHOT);
});

test("empty match shuts down after the documented timeout", () => {
  let state = emptyZone();
  for (let i = 1; i < EMPTY_MATCH_TIMEOUT_TICKS; i++) {
    const step = applyMatchLoop(state, i, contentHash, []);
    assert.equal(step.terminate, false);
    state = step.state;
  }
  const last = applyMatchLoop(state, EMPTY_MATCH_TIMEOUT_TICKS, contentHash, []);
  assert.equal(last.terminate, true);
  assert.equal(last.state.emptyTicks, EMPTY_MATCH_TIMEOUT_TICKS);
});

test("occupied match does not time out", () => {
  let state = addPlayer(emptyZone(), player("user-alice", "Alice"));
  for (let i = 0; i < EMPTY_MATCH_TIMEOUT_TICKS + 5; i++) {
    const step = applyMatchLoop(state, i, contentHash, []);
    assert.equal(step.terminate, false);
    state = step.state;
  }
  assert.equal(state.emptyTicks, 0);
});

test("parseClientMessage remains usable for join-time content checks", () => {
  const parsed = parseClientMessage(
    ClientOpcode.RESYNC_REQUEST,
    envelope({ contentHash: contentHash }),
    contentHash,
  );
  assert.equal(isProtocolError(parsed), false);
});
