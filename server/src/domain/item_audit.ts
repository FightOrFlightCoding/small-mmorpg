export const ITEM_AUDIT_LIMIT = 32;

export interface ItemMutationAudit {
  transactionId: string;
  requestId: string;
  characterId: string;
  counterparty: string;
  operationType: string;
  definitionId: string;
  instanceId: string;
  quantityBefore: number;
  quantityAfter: number;
  sourceContainer: string;
  destinationContainer: string;
  goldDelta: number;
  timestamp: number;
  result: string;
}

export function cloneItemAudit(audit: ItemMutationAudit): ItemMutationAudit {
  return {
    transactionId: audit.transactionId,
    requestId: audit.requestId,
    characterId: audit.characterId,
    counterparty: audit.counterparty,
    operationType: audit.operationType,
    definitionId: audit.definitionId,
    instanceId: audit.instanceId,
    quantityBefore: audit.quantityBefore,
    quantityAfter: audit.quantityAfter,
    sourceContainer: audit.sourceContainer,
    destinationContainer: audit.destinationContainer,
    goldDelta: audit.goldDelta,
    timestamp: audit.timestamp,
    result: audit.result,
  };
}

export function appendItemAudits(
  existing: ItemMutationAudit[] | undefined,
  next: ItemMutationAudit[],
): ItemMutationAudit[] {
  const list: ItemMutationAudit[] = [];
  if (existing !== undefined) {
    for (let i = 0; i < existing.length; i++) {
      list.push(cloneItemAudit(existing[i]));
    }
  }
  for (let n = 0; n < next.length; n++) {
    list.push(cloneItemAudit(next[n]));
  }
  if (list.length <= ITEM_AUDIT_LIMIT) {
    return list;
  }
  return list.slice(list.length - ITEM_AUDIT_LIMIT);
}

export function itemAuditFromChange(input: {
  transactionId: string;
  requestId: string;
  characterId: string;
  counterparty?: string;
  operationType: string;
  definitionId: string;
  instanceId: string;
  quantityBefore: number;
  quantityAfter: number;
  sourceContainer: string;
  destinationContainer: string;
  goldDelta: number;
  timestamp: number;
  result: string;
}): ItemMutationAudit {
  return {
    transactionId: input.transactionId,
    requestId: input.requestId,
    characterId: input.characterId,
    counterparty: input.counterparty !== undefined ? input.counterparty : "",
    operationType: input.operationType,
    definitionId: input.definitionId,
    instanceId: input.instanceId,
    quantityBefore: input.quantityBefore,
    quantityAfter: input.quantityAfter,
    sourceContainer: input.sourceContainer,
    destinationContainer: input.destinationContainer,
    goldDelta: input.goldDelta,
    timestamp: input.timestamp,
    result: input.result,
  };
}
