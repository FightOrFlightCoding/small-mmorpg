export const JOURNAL_SCHEMA_VERSION = 1;

export const JOURNAL_PREPARING = "PREPARING";
export const JOURNAL_RESERVED = "RESERVED";
export const JOURNAL_COMMITTING = "COMMITTING";
export const JOURNAL_COMMITTED = "COMMITTED";
export const JOURNAL_COMPENSATING = "COMPENSATING";
export const JOURNAL_COMPENSATED = "COMPENSATED";
export const JOURNAL_FAILED = "FAILED";

export type ItemJournalState =
  | typeof JOURNAL_PREPARING
  | typeof JOURNAL_RESERVED
  | typeof JOURNAL_COMMITTING
  | typeof JOURNAL_COMMITTED
  | typeof JOURNAL_COMPENSATING
  | typeof JOURNAL_COMPENSATED
  | typeof JOURNAL_FAILED;

export interface ItemJournalRecord {
  transactionId: string;
  requestId: string;
  operationType: string;
  participants: string[];
  sourceSnapshots: { [characterId: string]: unknown };
  destinationPlans: { [characterId: string]: unknown };
  state: ItemJournalState;
  createdAt: number;
  updatedAt: number;
  failureCode: string;
  recoveryStatus: string;
  schemaVersion: number;
}

export interface ItemJournalStore {
  getByRequestId(requestId: string): ItemJournalRecord | undefined;
  getByTransactionId(transactionId: string): ItemJournalRecord | undefined;
  put(record: ItemJournalRecord): void;
}

export function emptyJournalRecord(
  transactionId: string,
  requestId: string,
  operationType: string,
  participants: string[],
  nowMs: number,
): ItemJournalRecord {
  return {
    transactionId: transactionId,
    requestId: requestId,
    operationType: operationType,
    participants: copyStrings(participants),
    sourceSnapshots: {},
    destinationPlans: {},
    state: JOURNAL_PREPARING,
    createdAt: nowMs,
    updatedAt: nowMs,
    failureCode: "",
    recoveryStatus: "",
    schemaVersion: JOURNAL_SCHEMA_VERSION,
  };
}

export function cloneJournalRecord(record: ItemJournalRecord): ItemJournalRecord {
  return {
    transactionId: record.transactionId,
    requestId: record.requestId,
    operationType: record.operationType,
    participants: copyStrings(record.participants),
    sourceSnapshots: cloneUnknownMap(record.sourceSnapshots),
    destinationPlans: cloneUnknownMap(record.destinationPlans),
    state: record.state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    failureCode: record.failureCode,
    recoveryStatus: record.recoveryStatus,
    schemaVersion: record.schemaVersion,
  };
}

export function memoryJournalStore(seed?: ItemJournalRecord[]): ItemJournalStore {
  const byRequest: { [requestId: string]: ItemJournalRecord } = {};
  const byTxn: { [transactionId: string]: ItemJournalRecord } = {};
  if (seed !== undefined) {
    for (let i = 0; i < seed.length; i++) {
      const copied = cloneJournalRecord(seed[i]);
      byRequest[copied.requestId] = copied;
      byTxn[copied.transactionId] = copied;
    }
  }
  return {
    getByRequestId: function (requestId: string): ItemJournalRecord | undefined {
      const record = byRequest[requestId];
      return record !== undefined ? cloneJournalRecord(record) : undefined;
    },
    getByTransactionId: function (transactionId: string): ItemJournalRecord | undefined {
      const record = byTxn[transactionId];
      return record !== undefined ? cloneJournalRecord(record) : undefined;
    },
    put: function (record: ItemJournalRecord): void {
      const copied = cloneJournalRecord(record);
      byRequest[copied.requestId] = copied;
      byTxn[copied.transactionId] = copied;
    },
  };
}

export function journalIsTerminal(state: ItemJournalState): boolean {
  return state === JOURNAL_COMMITTED || state === JOURNAL_COMPENSATED || state === JOURNAL_FAILED;
}

export function journalNeedsRecovery(state: ItemJournalState): boolean {
  return state === JOURNAL_COMMITTING || state === JOURNAL_COMPENSATING || state === JOURNAL_RESERVED;
}

function copyStrings(values: readonly string[]): string[] {
  const list: string[] = [];
  for (let i = 0; i < values.length; i++) {
    list.push(values[i]);
  }
  return list;
}

function cloneUnknownMap(source: { [key: string]: unknown }): { [key: string]: unknown } {
  const copy: { [key: string]: unknown } = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = source[keys[i]];
  }
  return copy;
}
