import {
  ClientOpcode,
  actionResult,
  combatEvent,
  interactionResult,
  isProtocolError,
  parseClientMessage,
  questState,
  systemMessage,
  type ParsedClientMessage,
} from "./protocol";
import {
  EMPTY_MATCH_TIMEOUT_TICKS,
  MATCH_TICK_RATE,
  playerCount,
  type StarterZoneState,
  buildFullState,
  buildSnapshot,
  cloneStarterZoneState,
  fullStateOpcode,
  snapshotOpcode,
} from "./match_state";
import { intendedDelta, resolveMove } from "./movement";
import { resolveInteraction } from "./interaction";
import { applyQuestAccept, cloneQuestLog, publicQuestPayloads, type QuestLog } from "./quest";
import { applyPlayerAttack, type CombatEvent } from "./combat";
import { simulateCombatants } from "./enemy_ai";

export interface MatchOutbound {
  opcode: number;
  body: string;
  toUserId?: string;
  broadcastOthersFrom?: string;
}

export interface QuestPersist {
  userId: string;
  log: QuestLog;
}

export interface MatchLoopResult {
  state: StarterZoneState;
  terminate: boolean;
  outbound: MatchOutbound[];
  persistQuests: QuestPersist[];
}

export interface IncomingMatchData {
  opcode: number;
  raw: string;
  userId: string;
}

export function applyMatchLoop(
  state: StarterZoneState,
  tick: number,
  expectedContentHash: string,
  messages: IncomingMatchData[],
): MatchLoopResult {
  const outbound: MatchOutbound[] = [];
  const next = cloneStarterZoneState(state);
  const persistByUser: { [userId: string]: QuestLog } = {};
  const combatEvents: CombatEvent[] = [];

  for (let i = 0; i < messages.length; i++) {
    const incoming = messages[i];
    const parsed = parseClientMessage(incoming.opcode, incoming.raw, expectedContentHash);
    if (isProtocolError(parsed)) {
      const sys = systemMessage(parsed.code, parsed.message);
      outbound.push({ opcode: sys.opcode, body: sys.body, toUserId: incoming.userId });
      continue;
    }
    handleValidated(parsed, incoming.userId, next, tick, outbound, persistByUser, combatEvents);
  }

  simulateMovement(next, 1 / MATCH_TICK_RATE);
  simulateCombatants(next, tick, 1 / MATCH_TICK_RATE, MATCH_TICK_RATE, combatEvents);
  pushCombatEvents(outbound, tick, combatEvents);

  if (playerCount(next) === 0) {
    next.emptyTicks = next.emptyTicks + 1;
  } else {
    next.emptyTicks = 0;
    outbound.push({
      opcode: snapshotOpcode(),
      body: buildSnapshot(next, tick),
    });
  }

  const persistQuests: QuestPersist[] = [];
  const persistIds = Object.keys(persistByUser);
  for (let j = 0; j < persistIds.length; j++) {
    const userId = persistIds[j];
    persistQuests.push({ userId: userId, log: persistByUser[userId] });
  }

  return {
    state: next,
    terminate: playerCount(next) === 0 && next.emptyTicks >= EMPTY_MATCH_TIMEOUT_TICKS,
    outbound: outbound,
    persistQuests: persistQuests,
  };
}

function handleValidated(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistByUser: { [userId: string]: QuestLog },
  combatEvents: CombatEvent[],
): void {
  if (parsed.opcode === ClientOpcode.RESYNC_REQUEST) {
    outbound.push({
      opcode: fullStateOpcode(),
      body: buildFullState(state, tick, userId),
      toUserId: userId,
    });
    return;
  }
  if (parsed.opcode === ClientOpcode.INPUT) {
    applyInput(state, userId, parsed.seq as number, parsed.axisX as number, parsed.axisY as number);
    return;
  }
  if (parsed.opcode === ClientOpcode.INTERACT) {
    handleInteract(parsed, userId, state, outbound);
    return;
  }
  if (parsed.opcode === ClientOpcode.QUEST_ACCEPT) {
    handleQuestAccept(parsed, userId, state, outbound, persistByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.ATTACK) {
    handleAttack(parsed, userId, state, tick, outbound, combatEvents);
    return;
  }
  const result = actionResult("not_implemented", false, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handleInteract(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  outbound: MatchOutbound[],
): void {
  const targetId = parsed.fields.targetId;
  const player = state.players[userId];
  if (player === undefined) {
    const missing = interactionResult("player_missing", false, parsed.requestId, targetId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const decision = resolveInteraction({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    targetId: targetId,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
  });
  const result = interactionResult(decision.code, decision.ok, parsed.requestId, targetId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handleQuestAccept(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  outbound: MatchOutbound[],
  persistByUser: { [userId: string]: QuestLog },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const outcome = applyQuestAccept({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    questLog: player.questLog,
    questId: parsed.fields.questId,
    requestId: parsed.requestId as string,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
    questsById: state.questsById,
  });
  player.questLog = outcome.log;
  if (outcome.persist) {
    persistByUser[userId] = cloneQuestLog(outcome.log);
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    const quests = questState(
      state.contentHash,
      publicQuestPayloads(player.questLog, state.questsById),
      parsed.requestId,
    );
    outbound.push({ opcode: quests.opcode, body: quests.body, toUserId: userId });
  }
}

function handleAttack(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  combatEvents: CombatEvent[],
): void {
  const decision = applyPlayerAttack(
    {
      player: state.players[userId],
      targetId: parsed.fields.targetId,
      requestId: parsed.requestId as string,
      tick: tick,
      enemies: state.enemies,
      attack: state.playerAttack,
      attackRange: state.playerAttackRange,
      attackCooldownSec: state.playerAttackCooldownSec,
      tickRate: MATCH_TICK_RATE,
    },
    combatEvents,
  );
  const result = actionResult(decision.code, decision.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function pushCombatEvents(outbound: MatchOutbound[], tick: number, events: CombatEvent[]): void {
  if (events.length === 0) {
    return;
  }
  const payload: { [key: string]: unknown }[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const row: { [key: string]: unknown } = {
      type: event.type,
      sourceId: event.sourceId,
      sourceKind: event.sourceKind,
      targetId: event.targetId,
      targetKind: event.targetKind,
    };
    if (event.damage !== undefined) {
      row.damage = event.damage;
    }
    if (event.remainingHealth !== undefined) {
      row.remainingHealth = event.remainingHealth;
    }
    if (event.x !== undefined) {
      row.x = event.x;
    }
    if (event.y !== undefined) {
      row.y = event.y;
    }
    if (event.respawnDelaySec !== undefined) {
      row.respawnDelaySec = event.respawnDelaySec;
    }
    payload.push(row);
  }
  const message = combatEvent(tick, payload);
  outbound.push({ opcode: message.opcode, body: message.body });
}

function applyInput(state: StarterZoneState, userId: string, seq: number, axisX: number, axisY: number): void {
  const player = state.players[userId];
  if (player === undefined) {
    return;
  }
  if (seq <= player.lastProcessedSeq) {
    return;
  }
  player.lastProcessedSeq = seq;
  if (player.health <= 0) {
    player.axisX = 0;
    player.axisY = 0;
    return;
  }
  player.axisX = axisX;
  player.axisY = axisY;
}

function simulateMovement(state: StarterZoneState, dt: number): void {
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    if (player.health <= 0) {
      continue;
    }
    const delta = intendedDelta(player.axisX, player.axisY, state.moveSpeed, dt);
    const next = resolveMove(
      player.x,
      player.y,
      delta.x,
      delta.y,
      state.playerHalfExtent,
      state.collisions,
      state.walkableBounds,
    );
    player.x = next.x;
    player.y = next.y;
  }
}

export function snapshotForOthers(state: StarterZoneState, tick: number, fromUserId: string): MatchOutbound {
  return {
    opcode: snapshotOpcode(),
    body: buildSnapshot(state, tick),
    broadcastOthersFrom: fromUserId,
  };
}
