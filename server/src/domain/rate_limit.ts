import { ClientOpcode, isClientOpcode } from "./protocol";

export const RATE_WINDOW_TICKS = 10;
export const MAX_MESSAGES_PER_PLAYER_PER_TICK = 24;
export const SLOW_TICK_MS = 50;

export const ACTION_LIMITS = {
  input: 20,
  attack: 8,
  interact: 8,
  pickup: 8,
  inventory: 8,
  equip: 8,
  quest: 8,
  vendor: 8,
  cave: 8,
  trade: 8,
  allocate: 8,
  resync: 2,
  unknown: 8,
} as const;

export type RateAction = keyof typeof ACTION_LIMITS;

export const AUTH_RATE_WINDOW_MS = 10000;
export const AUTH_RATE_MAX = 5;
export const CHAT_RATE_WINDOW_MS = 2000;
export const CHAT_RATE_MAX = 4;
export const PARTY_RPC_RATE_WINDOW_MS = 2000;
export const PARTY_RPC_RATE_MAX = 8;

export type SessionRateKind = "auth" | "chat" | "party";

export interface PlayerActionRate {
  windowStartTick: number;
  counts: { [action: string]: number };
}

export function actionForOpcode(opcode: number): RateAction {
  if (opcode === ClientOpcode.INPUT) {
    return "input";
  }
  if (opcode === ClientOpcode.INTERACT) {
    return "interact";
  }
  if (opcode === ClientOpcode.ATTACK || opcode === ClientOpcode.USE_ABILITY || opcode === ClientOpcode.CANCEL_CAST || opcode === ClientOpcode.SET_TARGET) {
    return "attack";
  }
  if (opcode === ClientOpcode.PICKUP) {
    return "pickup";
  }
  if (opcode === ClientOpcode.DESTROY_ITEM || opcode === ClientOpcode.SPLIT_STACK || opcode === ClientOpcode.MOVE_ITEM) {
    return "inventory";
  }
  if (opcode === ClientOpcode.EQUIP) {
    return "equip";
  }
  if (opcode === ClientOpcode.QUEST_ACCEPT || opcode === ClientOpcode.QUEST_TURN_IN) {
    return "quest";
  }
  if (opcode === ClientOpcode.VENDOR_BUY || opcode === ClientOpcode.VENDOR_SELL || opcode === ClientOpcode.INN_REST) {
    return "vendor";
  }
  if (opcode === ClientOpcode.CAVE_ENTER || opcode === ClientOpcode.CAVE_EXIT) {
    return "cave";
  }
  if (
    opcode === ClientOpcode.TRADE_INVITE ||
    opcode === ClientOpcode.TRADE_ACCEPT_INVITE ||
    opcode === ClientOpcode.TRADE_DECLINE_INVITE ||
    opcode === ClientOpcode.TRADE_SET_OFFER ||
    opcode === ClientOpcode.TRADE_REMOVE_OFFER ||
    opcode === ClientOpcode.TRADE_SET_GOLD ||
    opcode === ClientOpcode.TRADE_ACCEPT_REVISION ||
    opcode === ClientOpcode.TRADE_CANCEL
  ) {
    return "trade";
  }
  if (opcode === ClientOpcode.ALLOCATE_ATTRIBUTES || opcode === ClientOpcode.ASSIGN_HOTBAR || opcode === ClientOpcode.UNLOCK_ABILITY || opcode === ClientOpcode.RELEASE_RESPAWN) {
    return "allocate";
  }
  if (opcode === ClientOpcode.RESYNC_REQUEST) {
    return "resync";
  }
  if (isClientOpcode(opcode)) {
    return "unknown";
  }
  return "unknown";
}

export function emptyActionRates(): { [userId: string]: PlayerActionRate } {
  return {};
}

export function cloneActionRates(
  rates: { [userId: string]: PlayerActionRate } | null | undefined,
): { [userId: string]: PlayerActionRate } {
  const copy: { [userId: string]: PlayerActionRate } = {};
  if (rates === null || rates === undefined || typeof rates !== "object" || Array.isArray(rates)) {
    return copy;
  }
  const ids = Object.keys(rates);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const row = rates[id];
    if (row == null) {
      continue;
    }
    const counts: { [action: string]: number } = {};
    const sourceCounts =
      row.counts !== null && row.counts !== undefined && typeof row.counts === "object" && !Array.isArray(row.counts)
        ? row.counts
        : {};
    const keys = Object.keys(sourceCounts);
    for (let k = 0; k < keys.length; k++) {
      counts[keys[k]] = sourceCounts[keys[k]];
    }
    copy[id] = {
      windowStartTick: row.windowStartTick,
      counts: counts,
    };
  }
  return copy;
}

export function consumeActionRate(
  rates: { [userId: string]: PlayerActionRate },
  userId: string,
  action: RateAction,
  tick: number,
): boolean {
  let window = rates[userId];
  if (window == null || tick - window.windowStartTick >= RATE_WINDOW_TICKS) {
    window = { windowStartTick: tick, counts: {} };
    rates[userId] = window;
  }
  const current = window.counts[action] !== undefined ? window.counts[action] : 0;
  if (current >= ACTION_LIMITS[action]) {
    return false;
  }
  window.counts[action] = current + 1;
  return true;
}

interface SessionWindow {
  start: number;
  count: number;
}

function sessionLimit(kind: SessionRateKind): { windowMs: number; max: number } {
  if (kind === "auth") {
    return { windowMs: AUTH_RATE_WINDOW_MS, max: AUTH_RATE_MAX };
  }
  if (kind === "chat") {
    return { windowMs: CHAT_RATE_WINDOW_MS, max: CHAT_RATE_MAX };
  }
  return { windowMs: PARTY_RPC_RATE_WINDOW_MS, max: PARTY_RPC_RATE_MAX };
}

function createSessionRateEngine(): {
  consume(kind: SessionRateKind, key: string, nowMs: number): boolean;
  reset(): void;
} {
  // Replace the whole map on each write so Nakama's frozen-object VM can mutate counters.
  let windows: { [key: string]: SessionWindow } = {};

  return {
    consume: function (kind: SessionRateKind, key: string, nowMs: number): boolean {
      const limit = sessionLimit(kind);
      const slot = kind + ":" + key;
      const current = windows;
      const existing = current[slot];
      const next: { [key: string]: SessionWindow } = {};
      const ids = Object.keys(current);
      for (let i = 0; i < ids.length; i++) {
        next[ids[i]] = { start: current[ids[i]].start, count: current[ids[i]].count };
      }
      if (existing === undefined || nowMs - existing.start >= limit.windowMs) {
        next[slot] = { start: nowMs, count: 1 };
        windows = next;
        return true;
      }
      if (existing.count >= limit.max) {
        return false;
      }
      next[slot] = { start: existing.start, count: existing.count + 1 };
      windows = next;
      return true;
    },
    reset: function (): void {
      windows = {};
    },
  };
}

const sessionRates = createSessionRateEngine();

export function consumeSessionRate(kind: SessionRateKind, key: string, nowMs: number): boolean {
  if (key.length === 0) {
    return true;
  }
  return sessionRates.consume(kind, key, nowMs);
}

export function resetSessionRates(): void {
  sessionRates.reset();
}

export function authRateKey(kind: "email" | "device", identity: string): string {
  const trimmed = identity.replace(/^\s+|\s+$/g, "").toLowerCase();
  return kind + ":" + trimmed;
}
