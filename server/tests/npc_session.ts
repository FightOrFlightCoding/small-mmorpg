import { applyMatchLoop } from "../src/domain/match_loop";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import { contentHash } from "../src/generated/content";
import type { StarterZoneState } from "../src/domain/match_state";

export function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

export function interactMessage(userId: string, npcId: string, requestId: string) {
  return {
    opcode: ClientOpcode.INTERACT,
    raw: envelope({ targetId: npcId, requestId: requestId }),
    userId: userId,
  };
}

export function acceptMessage(
  userId: string,
  questId: string,
  sessionId: string,
  npcInstanceId: string,
  requestId: string,
) {
  return {
    opcode: ClientOpcode.QUEST_ACCEPT,
    raw: envelope({
      questId: questId,
      interactionSessionId: sessionId,
      npcInstanceId: npcInstanceId,
      requestId: requestId,
    }),
    userId: userId,
  };
}

export function turnInMessage(
  userId: string,
  questId: string,
  sessionId: string,
  npcInstanceId: string,
  requestId: string,
) {
  return {
    opcode: ClientOpcode.QUEST_TURN_IN,
    raw: envelope({
      questId: questId,
      interactionSessionId: sessionId,
      npcInstanceId: npcInstanceId,
      requestId: requestId,
    }),
    userId: userId,
  };
}

export function interactionPayload(result: ReturnType<typeof applyMatchLoop>): {
  ok: boolean;
  code: string;
  requestId?: string;
  targetId?: string;
  interactionSessionId?: string;
  currentNodeId?: string;
  availableServiceIds?: string[];
  services?: string[];
} {
  const row = result.outbound.find((item) => item.opcode === ServerOpcode.INTERACTION_RESULT);
  if (row === undefined) {
    return { ok: false, code: "missing_interaction_result" };
  }
  return JSON.parse(row.body) as {
    ok: boolean;
    code: string;
    requestId?: string;
    targetId?: string;
    interactionSessionId?: string;
    currentNodeId?: string;
    availableServiceIds?: string[];
    services?: string[];
  };
}

export function openNpcSession(
  state: StarterZoneState,
  userId: string,
  npcId: string,
  tick: number,
  requestId: string,
): {
  state: StarterZoneState;
  sessionId: string;
  npcInstanceId: string;
  currentNodeId: string;
  result: ReturnType<typeof applyMatchLoop>;
} {
  const result = applyMatchLoop(state, tick, contentHash, [interactMessage(userId, npcId, requestId)]);
  const body = interactionPayload(result);
  return {
    state: result.state,
    sessionId: body.interactionSessionId !== undefined ? body.interactionSessionId : "",
    npcInstanceId: body.targetId !== undefined ? body.targetId : npcId,
    currentNodeId: body.currentNodeId !== undefined ? body.currentNodeId : "",
    result: result,
  };
}
