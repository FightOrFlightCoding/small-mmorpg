export const WALLET_CURRENCY_GOLD = "gold";

export interface GoldMutationInput {
  characterId: string;
  currentGold: number;
  delta: number;
  reasonType: string;
  reasonId: string;
  requestId: string;
  metadata?: { [key: string]: unknown };
}

export interface GoldMutationRecord {
  ok: boolean;
  code: string;
  delta: number;
  resultingBalance: number;
}

export interface GoldLedger {
  mutationByRequestId: { [requestId: string]: GoldMutationRecord };
}

export interface GoldMutationResult {
  ok: boolean;
  code: string;
  replay: boolean;
  gold: number;
  goldDelta: number;
  characterId: string;
  reasonType: string;
  reasonId: string;
  requestId: string;
  resultingBalance: number;
  metadata: { [key: string]: unknown };
}

export function publicWallet(gold: number): { [key: string]: unknown } {
  return { gold: gold < 0 ? 0 : gold };
}

export function goldFromWallet(wallet: { [key: string]: number } | undefined): number {
  if (wallet === undefined) {
    return 0;
  }
  const value = wallet[WALLET_CURRENCY_GOLD];
  if (typeof value !== "number" || !isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

export function emptyGoldLedger(): GoldLedger {
  return { mutationByRequestId: {} };
}

export function applyGoldMutation(input: GoldMutationInput, ledger?: GoldLedger): GoldMutationResult {
  const metadata = cloneMetadata(input.metadata);
  if (ledger !== undefined) {
    const previous = ledger.mutationByRequestId[input.requestId];
    if (previous !== undefined) {
      return {
        ok: previous.ok,
        code: previous.code,
        replay: true,
        gold: previous.resultingBalance,
        goldDelta: previous.ok ? previous.delta : 0,
        characterId: input.characterId,
        reasonType: input.reasonType,
        reasonId: input.reasonId,
        requestId: input.requestId,
        resultingBalance: previous.resultingBalance,
        metadata: metadata,
      };
    }
  }
  if (typeof input.delta !== "number" || !isFinite(input.delta) || input.delta !== Math.floor(input.delta)) {
    return failGold(input, "invalid_amount", metadata);
  }
  const current = input.currentGold < 0 ? 0 : input.currentGold;
  const next = current + input.delta;
  if (next < 0) {
    const failed = failGold(input, "insufficient_gold", metadata);
    rememberGold(ledger, input.requestId, {
      ok: false,
      code: "insufficient_gold",
      delta: input.delta,
      resultingBalance: current,
    });
    return failed;
  }
  rememberGold(ledger, input.requestId, {
    ok: true,
    code: "ok",
    delta: input.delta,
    resultingBalance: next,
  });
  return {
    ok: true,
    code: "ok",
    replay: false,
    gold: next,
    goldDelta: input.delta,
    characterId: input.characterId,
    reasonType: input.reasonType,
    reasonId: input.reasonId,
    requestId: input.requestId,
    resultingBalance: next,
    metadata: metadata,
  };
}

function failGold(
  input: GoldMutationInput,
  code: string,
  metadata: { [key: string]: unknown },
): GoldMutationResult {
  const current = input.currentGold < 0 ? 0 : input.currentGold;
  return {
    ok: false,
    code: code,
    replay: false,
    gold: current,
    goldDelta: 0,
    characterId: input.characterId,
    reasonType: input.reasonType,
    reasonId: input.reasonId,
    requestId: input.requestId,
    resultingBalance: current,
    metadata: metadata,
  };
}

function rememberGold(ledger: GoldLedger | undefined, requestId: string, record: GoldMutationRecord): void {
  if (ledger === undefined) {
    return;
  }
  ledger.mutationByRequestId[requestId] = {
    ok: record.ok,
    code: record.code,
    delta: record.delta,
    resultingBalance: record.resultingBalance,
  };
}

function cloneMetadata(metadata: { [key: string]: unknown } | undefined): { [key: string]: unknown } {
  const copy: { [key: string]: unknown } = {};
  if (metadata === undefined) {
    return copy;
  }
  const keys = Object.keys(metadata);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = metadata[keys[i]];
  }
  return copy;
}
