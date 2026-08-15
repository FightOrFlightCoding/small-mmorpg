import {
  ClientOpcode,
  actionResult,
  interactionResult,
  isProtocolError,
  parseClientMessage,
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

export interface MatchOutbound {
  opcode: number;
  body: string;
  toUserId?: string;
  broadcastOthersFrom?: string;
}

export interface MatchLoopResult {
  state: StarterZoneState;
  terminate: boolean;
  outbound: MatchOutbound[];
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

  for (let i = 0; i < messages.length; i++) {
    const incoming = messages[i];
    const parsed = parseClientMessage(incoming.opcode, incoming.raw, expectedContentHash);
    if (isProtocolError(parsed)) {
      const sys = systemMessage(parsed.code, parsed.message);
      outbound.push({ opcode: sys.opcode, body: sys.body, toUserId: incoming.userId });
      continue;
    }
    handleValidated(parsed, incoming.userId, next, tick, outbound);
  }

  simulateMovement(next, 1 / MATCH_TICK_RATE);

  if (playerCount(next) === 0) {
    next.emptyTicks = next.emptyTicks + 1;
  } else {
    next.emptyTicks = 0;
    outbound.push({
      opcode: snapshotOpcode(),
      body: buildSnapshot(next, tick),
    });
  }

  return {
    state: next,
    terminate: playerCount(next) === 0 && next.emptyTicks >= EMPTY_MATCH_TIMEOUT_TICKS,
    outbound: outbound,
  };
}

function handleValidated(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
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
    const result = interactionResult("not_implemented", false);
    outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
    return;
  }
  const result = actionResult("not_implemented", false, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
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
