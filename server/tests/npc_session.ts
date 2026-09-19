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

export function closeMessage(
  userId: string,
  sessionId: string,
  npcInstanceId: string,
  requestId: string,
) {
  return {
    opcode: ClientOpcode.INTERACTION_CLOSE,
    raw: envelope({
      interactionSessionId: sessionId,
      npcInstanceId: npcInstanceId,
      requestId: requestId,
    }),
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

export function vendorIdForNpc(npcInstanceId: string): string {
  if (npcInstanceId.indexOf("platform_") !== -1) {
    return "vendor.platform_kiosk";
  }
  if (npcInstanceId.indexOf("cert") !== -1) {
    return "vendor.cert_quartermaster";
  }
  return "vendor.test_general";
}

export function buyMessage(
  userId: string,
  itemId: string,
  sessionId: string,
  npcInstanceId: string,
  requestId: string,
  quantity?: number,
  extras: {
    vendorId?: string;
    stockEntryId?: string;
    preferredSlot?: number;
    expectedRevision?: number;
  } = {},
) {
  const vendorId = extras.vendorId !== undefined ? extras.vendorId : vendorIdForNpc(npcInstanceId);
  const extra: { [key: string]: unknown } = {
    vendorId: vendorId,
    stockEntryId: extras.stockEntryId !== undefined ? extras.stockEntryId : vendorId + ":" + itemId,
    interactionSessionId: sessionId,
    requestId: requestId,
  };
  if (quantity !== undefined) {
    extra.quantity = quantity;
  }
  if (extras.preferredSlot !== undefined) {
    extra.preferredSlot = extras.preferredSlot;
  }
  if (extras.expectedRevision !== undefined) {
    extra.expectedRevision = extras.expectedRevision;
  }
  return {
    opcode: ClientOpcode.VENDOR_BUY,
    raw: envelope(extra),
    userId: userId,
  };
}

export function chooseMessage(
  userId: string,
  sessionId: string,
  optionId: string,
  requestId: string,
) {
  return {
    opcode: ClientOpcode.DIALOGUE_CHOOSE,
    raw: envelope({
      interactionSessionId: sessionId,
      optionId: optionId,
      requestId: requestId,
    }),
    userId: userId,
  };
}

export function returnToSelectMessage(userId: string, requestId: string) {
  return {
    opcode: ClientOpcode.RETURN_TO_CHARACTER_SELECT,
    raw: envelope({ requestId: requestId }),
    userId: userId,
  };
}

export function resyncMessage(userId: string) {
  return {
    opcode: ClientOpcode.RESYNC_REQUEST,
    raw: envelope(),
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
  allowedOptionIds?: string[];
  availableServiceIds?: string[];
  services?: string[];
  vendorId?: string;
  currencyId?: string;
  stock?: Array<{ stockEntryId?: string; itemId: string; buyPrice: number; displayOrder?: number }>;
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
    allowedOptionIds?: string[];
    availableServiceIds?: string[];
    services?: string[];
    vendorId?: string;
    currencyId?: string;
    stock?: Array<{ stockEntryId?: string; itemId: string; buyPrice: number; displayOrder?: number }>;
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
