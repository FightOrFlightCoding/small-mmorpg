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
  playerCount,
  type StarterZoneState,
  buildFullState,
  buildSnapshot,
  fullStateOpcode,
  snapshotOpcode,
} from "./match_state";

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
  let next = state;

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

  if (playerCount(next) === 0) {
    next = {
      zoneId: next.zoneId,
      contentHash: next.contentHash,
      emptyTicks: next.emptyTicks + 1,
      players: next.players,
      npcs: next.npcs,
      enemies: next.enemies,
      loot: next.loot,
    };
  } else {
    next = {
      zoneId: next.zoneId,
      contentHash: next.contentHash,
      emptyTicks: 0,
      players: next.players,
      npcs: next.npcs,
      enemies: next.enemies,
      loot: next.loot,
    };
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

export function snapshotForOthers(state: StarterZoneState, tick: number, fromUserId: string): MatchOutbound {
  return {
    opcode: snapshotOpcode(),
    body: buildSnapshot(state, tick),
    broadcastOthersFrom: fromUserId,
  };
}
