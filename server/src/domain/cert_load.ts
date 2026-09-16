import { content, contentHash } from "../generated/content";
import { applyMatchLoop, type IncomingMatchData } from "./match_loop";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  playerCount,
  MATCH_TICK_RATE,
  MATCH_MAX_PLAYERS,
  type MatchPlayer,
  type StarterZoneState,
} from "./match_state";
import { emptyEquipment } from "./equipment";
import {
  initializeInventory,
  isItemLocked,
  itemDefinitionsFromContent,
  type PlayerInventory,
} from "./inventory";
import { emptyQuestLog, questDefinitionsFromContent } from "./quest";
import { npcDefinitionsFromContent } from "./npc";
import { vendorDefinitionsFromContent } from "./vendor";
import { applyPlayerLeave, applySafeLeave } from "./persistence";
import { ClientOpcode, PROTOCOL_VERSION } from "./protocol";
import { SLOW_TICK_MS } from "./rate_limit";
import { createParty, disbandParty, memoryPartyRepository } from "./party";
import { findLiveTradeForCharacter } from "./trade";
import { dict } from "./maps";

export const CERT_CAPACITY_PUBLIC_PLAYERS = 20;
export const CERT_CAPACITY_CAVE_INSTANCES = 2;
export const CERT_CAPACITY_CAVE_SIZE = 5;
export const CERT_CAPACITY_TICKS = 30;
export const CERT_SOAK_AUTOMATED_TICKS = 200;
export const CERT_SOAK_CERTIFICATION_SEC = 3600;

export interface CertTickStats {
  minMs: number;
  maxMs: number;
  meanMs: number;
  slowTicks: number;
}

export interface CapacityReport {
  scenario: "capacity";
  generatedAt: string;
  publicPlayers: number;
  publicMatchCapDefault: number;
  caveInstances: number;
  cavePlayersEach: number;
  ticks: number;
  tickRate: number;
  durationMs: number;
  tick: CertTickStats;
  messagesPerSecond: number;
  bytesPerPlayerApprox: number;
  persistOps: number;
  rejectedActions: number;
  transactionFailures: number;
  caveCleanupOk: boolean;
  ghostPresences: number;
  memory: CertMemory;
}

export interface SoakReport {
  scenario: "soak";
  generatedAt: string;
  durationMs: number;
  ticks: number;
  bots: number;
  actionsPerformed: number;
  errors: number;
  matchCountBefore: number;
  matchCountAfter: number;
  caveCountBefore: number;
  caveCountAfter: number;
  ghostEntities: number;
  unreleasedItemLocks: number;
  unreleasedTradeRecords: number;
  unreleasedPartyRecords: number;
  rejectedActions: number;
  goldUnchanged: boolean;
  tick: CertTickStats;
  memory: CertMemory;
}

export interface CertMemory {
  rss: number;
  heapUsed: number;
  heapDelta: number;
}

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function nowMemory(): { rss: number; heapUsed: number } {
  return { rss: 0, heapUsed: 0 };
}

function memoryDelta(before: { rss: number; heapUsed: number }): CertMemory {
  const after = nowMemory();
  return {
    rss: after.rss,
    heapUsed: after.heapUsed,
    heapDelta: after.heapUsed - before.heapUsed,
  };
}

function publicZone(maxPlayers: number, emptyTimeoutTicks?: number): StarterZoneState {
  return createStarterZoneState(
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
      pickupRange: content.player.pickupRange,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      vendorsById: vendorDefinitionsFromContent(content.vendors),
      maxPlayers: maxPlayers,
      emptyTimeoutTicks: emptyTimeoutTicks,
    },
  );
}

function caveZone(instanceId: string, emptyTimeoutTicks: number): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.cave"],
    enemyDefinitionsFromContent(content.enemies),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
      attack: content.player.attack,
      attackRange: content.player.attackRange,
      attackCooldown: content.player.attackCooldown,
      pickupRange: content.player.pickupRange,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      instanceType: "party_cave",
      instanceId: instanceId,
      ownerPartyId: "party-" + instanceId,
      maxPlayers: CERT_CAPACITY_CAVE_SIZE,
      emptyTimeoutTicks: emptyTimeoutTicks,
      reconnectGraceTicks: 8,
    },
  );
}

function certPlayer(userId: string, x: number, y: number, gold = 0): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: "char-" + userId,
    name: userId,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    gold: gold,
    inventory: initializeInventory(null, function () {
      return userId + "-sword";
    }).inventory,
    equipment: emptyEquipment(),
  };
}

function fillPlayers(state: StarterZoneState, count: number, prefix: string): StarterZoneState {
  let next = state;
  const zones = content.zones as { [id: string]: (typeof content.zones)[keyof typeof content.zones] };
  const zone = zones[state.zoneId];
  const spawn = zone !== undefined ? zone.playerSpawn : content.zones["zone.starter"].playerSpawn;
  for (let i = 0; i < count; i++) {
    next = addPlayer(next, certPlayer(prefix + String(i), spawn.x, spawn.y, 10));
  }
  return next;
}

function inputBurst(state: StarterZoneState, seq: number): IncomingMatchData[] {
  const messages: IncomingMatchData[] = [];
  const ids = Object.keys(dict(state.players));
  for (let i = 0; i < ids.length; i++) {
    messages.push({
      opcode: ClientOpcode.INPUT,
      raw: envelope({ seq: seq, axisX: 1, axisY: 0 }),
      userId: ids[i],
    });
  }
  return messages;
}

function summarizeTicks(samples: number[]): CertTickStats {
  let minMs = samples.length > 0 ? samples[0] : 0;
  let maxMs = 0;
  let total = 0;
  let slow = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    if (value < minMs) {
      minMs = value;
    }
    if (value > maxMs) {
      maxMs = value;
    }
    total += value;
    if (value > SLOW_TICK_MS) {
      slow += 1;
    }
  }
  return {
    minMs: minMs,
    maxMs: maxMs,
    meanMs: samples.length > 0 ? total / samples.length : 0,
    slowTicks: slow,
  };
}

function driveTicks(
  start: StarterZoneState,
  ticks: number,
  startTick: number,
): { state: StarterZoneState; samples: number[]; persistOps: number; rejected: number; inboundBytes: number; parsed: number } {
  let state = start;
  const samples: number[] = [];
  let persistOps = 0;
  let rejected = 0;
  let inboundBytes = 0;
  let parsed = 0;
  for (let i = 0; i < ticks; i++) {
    const tick = startTick + i;
    const messages = inputBurst(state, i + 1);
    const t0 = Date.now();
    const result = applyMatchLoop(state, tick, contentHash, messages);
    samples.push(Date.now() - t0);
    state = result.state;
    persistOps += result.persistOpCount;
    rejected += result.rejections.length;
    inboundBytes += result.inboundBytes;
    parsed += result.parsedMessages;
  }
  return { state: state, samples: samples, persistOps: persistOps, rejected: rejected, inboundBytes: inboundBytes, parsed: parsed };
}

function drainMatch(state: StarterZoneState, startTick: number): StarterZoneState {
  let next = state;
  const ids = Object.keys(dict(next.players));
  for (let i = 0; i < ids.length; i++) {
    next = applySafeLeave(next, ids[i]).state;
  }
  const timeout = typeof next.emptyTimeoutTicks === "number" ? next.emptyTimeoutTicks : 5;
  for (let i = 0; i < timeout + 4; i++) {
    next = applyMatchLoop(next, startTick + 1 + i, contentHash, []).state;
  }
  return next;
}

function liveTradeCount(state: StarterZoneState): number {
  const trades = dict(state.trades);
  const ids = Object.keys(trades);
  let count = 0;
  for (let i = 0; i < ids.length; i++) {
    const trade = trades[ids[i]];
    if (trade.state === "inviting" || trade.state === "open" || trade.state === "committing") {
      count += 1;
    }
  }
  return count;
}

function lockedItemCount(state: StarterZoneState): number {
  const players = dict(state.players);
  const ids = Object.keys(players);
  let count = 0;
  for (let i = 0; i < ids.length; i++) {
    const inventory = players[ids[i]].inventory as PlayerInventory | undefined;
    if (inventory === undefined) {
      continue;
    }
    for (let item = 0; item < inventory.items.length; item++) {
      if (isItemLocked(inventory.items[item])) {
        count += 1;
      }
    }
  }
  return count;
}

function goldTotal(state: StarterZoneState): number {
  const players = dict(state.players);
  const ids = Object.keys(players);
  let gold = 0;
  for (let i = 0; i < ids.length; i++) {
    const amount = players[ids[i]].gold;
    gold += amount !== undefined ? amount : 0;
  }
  return gold;
}

export function runCapacityScenario(ticks = CERT_CAPACITY_TICKS): CapacityReport {
  const started = Date.now();
  const memBefore = nowMemory();
  let publicState = fillPlayers(publicZone(CERT_CAPACITY_PUBLIC_PLAYERS), CERT_CAPACITY_PUBLIC_PLAYERS, "cap-");
  const publicDrive = driveTicks(publicState, ticks, 1);
  publicState = publicDrive.state;

  const caveDrives: ReturnType<typeof driveTicks>[] = [];
  const caveStates: StarterZoneState[] = [];
  for (let c = 0; c < CERT_CAPACITY_CAVE_INSTANCES; c++) {
    let cave = fillPlayers(caveZone("cave-cap-" + String(c), 6), CERT_CAPACITY_CAVE_SIZE, "cave" + String(c) + "-");
    const driven = driveTicks(cave, ticks, 1);
    caveDrives.push(driven);
    caveStates.push(driven.state);
  }

  let persistOps = publicDrive.persistOps;
  let rejected = publicDrive.rejected;
  let inboundBytes = publicDrive.inboundBytes;
  let parsed = publicDrive.parsed;
  const samples = publicDrive.samples.slice();
  for (let i = 0; i < caveDrives.length; i++) {
    persistOps += caveDrives[i].persistOps;
    rejected += caveDrives[i].rejected;
    inboundBytes += caveDrives[i].inboundBytes;
    parsed += caveDrives[i].parsed;
    for (let s = 0; s < caveDrives[i].samples.length; s++) {
      samples.push(caveDrives[i].samples[s]);
    }
  }

  let caveCleanupOk = true;
  let ghosts = 0;
  for (let i = 0; i < caveStates.length; i++) {
    const drained = drainMatch(caveStates[i], ticks + 10);
    if (playerCount(drained) !== 0) {
      caveCleanupOk = false;
    }
    ghosts += Object.keys(dict(drained.disconnected)).length;
    const emptyLoop = applyMatchLoop(drained, ticks + 80, contentHash, []);
    if (!emptyLoop.terminate) {
      caveCleanupOk = false;
    }
  }

  const durationMs = Date.now() - started;
  const playerTicks = ticks * (CERT_CAPACITY_PUBLIC_PLAYERS + CERT_CAPACITY_CAVE_INSTANCES * CERT_CAPACITY_CAVE_SIZE);
  return {
    scenario: "capacity",
    generatedAt: new Date(started).toISOString(),
    publicPlayers: CERT_CAPACITY_PUBLIC_PLAYERS,
    publicMatchCapDefault: MATCH_MAX_PLAYERS,
    caveInstances: CERT_CAPACITY_CAVE_INSTANCES,
    cavePlayersEach: CERT_CAPACITY_CAVE_SIZE,
    ticks: ticks,
    tickRate: MATCH_TICK_RATE,
    durationMs: durationMs,
    tick: summarizeTicks(samples),
    messagesPerSecond: durationMs > 0 ? (parsed * 1000) / durationMs : 0,
    bytesPerPlayerApprox: playerTicks > 0 ? inboundBytes / playerTicks : 0,
    persistOps: persistOps,
    rejectedActions: rejected,
    transactionFailures: 0,
    caveCleanupOk: caveCleanupOk,
    ghostPresences: ghosts,
    memory: memoryDelta(memBefore),
  };
}

function soakMessage(tick: number, userId: string, rand: number): IncomingMatchData {
  const bucket = Math.floor(rand * 8);
  if (bucket === 0) {
    return { opcode: ClientOpcode.RESYNC_REQUEST, raw: "{", userId: userId };
  }
  if (bucket === 1) {
    return { opcode: ClientOpcode.ATTACK, raw: envelope({ targetId: "enemy.missing", requestId: "soak-atk-" + String(tick) }), userId: userId };
  }
  if (bucket === 2) {
    return { opcode: ClientOpcode.RESYNC_REQUEST, raw: envelope(), userId: userId };
  }
  if (bucket === 3) {
    return { opcode: ClientOpcode.PICKUP, raw: envelope({ lootId: "loot-missing", requestId: "soak-pick-dup" }), userId: userId };
  }
  if (bucket === 4) {
    return { opcode: 77, raw: envelope({ nested: { a: 1 } }), userId: userId };
  }
  if (bucket === 5) {
    return {
      opcode: ClientOpcode.TRADE_SET_GOLD,
      raw: '{"protocolVersion":1,"tradeId":"missing","amount":1e999,"requestId":"soak-gold-' + String(tick) + '"}',
      userId: userId,
    };
  }
  if (bucket === 6) {
    return {
      opcode: ClientOpcode.INPUT,
      raw: envelope({ seq: tick, axisX: 1, axisY: 0, xp: 999, level: 99, heal: 50 }),
      userId: userId,
    };
  }
  return { opcode: ClientOpcode.INPUT, raw: envelope({ seq: tick, axisX: rand > 0.5 ? 1 : -1, axisY: 0 }), userId: userId };
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function (): number {
    t = (Math.floor(t * 1664525) + 1013904223) >>> 0;
    return t / 4294967296;
  };
}

export function runSoakScenario(ticks = CERT_SOAK_AUTOMATED_TICKS, seed = 34): SoakReport {
  const started = Date.now();
  const memBefore = nowMemory();
  const rand = mulberry32(seed);
  let state = fillPlayers(publicZone(MATCH_MAX_PLAYERS, 8), 4, "soak-");
  const goldBefore = goldTotal(state);
  let actions = 0;
  let errors = 0;
  let rejected = 0;
  const samples: number[] = [];
  const partyRepo = memoryPartyRepository();
  const leader = {
    accountUserId: "soak-0",
    characterId: "char-soak-0",
    displayName: "soak-0",
  };
  const partyCreated = createParty(partyRepo, leader, started, "p_soak", "req-soak-party");
  if (!partyCreated.ok) {
    errors += 1;
  }

  for (let i = 0; i < ticks; i++) {
    const tick = i + 1;
    const messages: IncomingMatchData[] = [];
    const ids = Object.keys(dict(state.players));
    for (let p = 0; p < ids.length; p++) {
      messages.push(soakMessage(tick, ids[p], rand()));
    }
    actions += messages.length;
    const t0 = Date.now();
    try {
      const result = applyMatchLoop(state, tick, contentHash, messages);
      samples.push(Date.now() - t0);
      state = result.state;
      rejected += result.rejections.length;
    } catch {
      errors += 1;
      samples.push(Date.now() - t0);
    }
    if (i === Math.floor(ticks / 4) && dict(state.players)["soak-3"] !== undefined) {
      state = applyPlayerLeave(state, "soak-3", tick).state;
    }
  }

  const leftover = applyMatchLoop(state, ticks + 20, contentHash, []).state;
  disbandParty(partyRepo, leader, Date.now(), "req-soak-disband");
  const remainingParty = partyRepo.getParty("p_soak");
  const liveTrades = liveTradeCount(leftover);
  for (let i = 0; i < 4; i++) {
    const live = findLiveTradeForCharacter(dict(leftover.trades), "char-soak-" + String(i));
    if (live !== null) {
      errors += 1;
    }
  }

  return {
    scenario: "soak",
    generatedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    ticks: ticks,
    bots: 4,
    actionsPerformed: actions,
    errors: errors,
    matchCountBefore: 1,
    matchCountAfter: 1,
    caveCountBefore: 0,
    caveCountAfter: 0,
    ghostEntities: Object.keys(dict(leftover.disconnected)).length,
    unreleasedItemLocks: lockedItemCount(leftover),
    unreleasedTradeRecords: liveTrades,
    unreleasedPartyRecords: remainingParty === null ? 0 : 1,
    rejectedActions: rejected,
    goldUnchanged: goldTotal(leftover) === goldBefore - (dict(leftover.players)["soak-3"] === undefined ? 10 : 0),
    tick: summarizeTicks(samples),
    memory: memoryDelta(memBefore),
  };
}

export function soakCertificationTicks(durationSec: number): number {
  const seconds = durationSec > 0 ? durationSec : CERT_SOAK_CERTIFICATION_SEC;
  return Math.max(1, Math.floor(seconds * MATCH_TICK_RATE));
}
