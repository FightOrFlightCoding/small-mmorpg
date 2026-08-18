import {
  acceptItemFailureCode,
  addOrStackItem,
  clearLocksByLockId,
  cloneInventory,
  findItem,
  isItemLocked,
  itemIsTradeable,
  setItemLock,
  takeItemQuantity,
  type ItemDefinition,
  type PlayerInventory,
} from "./inventory";
import { dict } from "./maps";
import { equippedInstanceIds, type PlayerEquipment } from "./equipment";
import {
  TX_REASON_TRADE,
  type TransactionAuditEvent,
} from "./transaction";
import { applyGoldMutation, type GoldLedger } from "./wallet";
import type { ActiveCast } from "./ability";
import { hasControlTag, type ActiveEffect } from "./effects";

export const TRADE_SCHEMA_VERSION = 1;
export const TRADE_RANGE_PX = 80;
export const TRADE_INVITE_TTL_TICKS = 300;
export const TRADE_TTL_TICKS = 1200;
export const TRADE_DISCONNECT_GRACE_TICKS = 50;
export const TRADE_LOCK_REASON = "trade";
export const TRADE_COLLECTION = "trade";
export const TRADE_KEY = "t";
export const PLAYER_TRADE_KEY = "trade";
export const TRADE_AUDIT_KEY = "trade_audit";
export const TRADE_PERMISSION_READ = 1;
export const TRADE_PERMISSION_WRITE = 0;

export type TradeState = "inviting" | "open" | "committing" | "completed" | "cancelled";

export interface TradeParticipant {
  characterId: string;
  accountUserId: string;
  displayName: string;
}

export interface TradeOfferLine {
  instanceId: string;
  itemId: string;
  quantity: number;
}

export interface TradeRequestRecord {
  ok: boolean;
  code: string;
}

export interface TradeCommitSnapshot {
  inventoryA: PlayerInventory;
  inventoryB: PlayerInventory;
  goldA: number;
  goldB: number;
  goldDeltaA: number;
  goldDeltaB: number;
  requestId: string;
}

export interface TradeRecord {
  tradeId: string;
  participantA: TradeParticipant;
  participantB: TradeParticipant;
  state: TradeState;
  revision: number;
  offers: { [characterId: string]: TradeOfferLine[] };
  goldOffers: { [characterId: string]: number };
  acceptanceRevisionByParticipant: { [characterId: string]: number };
  createdAt: number;
  expiresAt: number;
  createdAtTick: number;
  expiresAtTick: number;
  inviteExpiresAtTick: number;
  matchId: string;
  schemaVersion: number;
  byRequestId: { [requestId: string]: TradeRequestRecord };
  commitRequestId?: string;
  cancelReason?: string;
  commitSnapshot?: TradeCommitSnapshot;
  audits?: { [characterId: string]: TransactionAuditEvent };
  absentSinceTick?: { [userId: string]: number };
}

export interface TradeActor {
  userId: string;
  characterId: string;
  displayName: string;
  x: number;
  y: number;
  health: number;
  gold: number;
  inventory: PlayerInventory;
  equipment?: PlayerEquipment;
  transferState?: string;
  inCombat?: boolean;
  activeCast?: ActiveCast;
  effects?: ActiveEffect[];
  online: boolean;
}

export interface TradeDecision {
  ok: boolean;
  code: string;
  replay: boolean;
  trade: TradeRecord;
  inventoryA?: PlayerInventory;
  inventoryB?: PlayerInventory;
  shouldCommit?: boolean;
  prepared?: TradePrepareResult;
}

export interface TradePrepareResult {
  ok: boolean;
  code: string;
  inventoryA: PlayerInventory;
  inventoryB: PlayerInventory;
  goldA: number;
  goldB: number;
  goldDeltaA: number;
  goldDeltaB: number;
}

export interface TradeCommitRequest {
  trade: TradeRecord;
  requestId: string;
  userA: string;
  userB: string;
  characterA: string;
  characterB: string;
  inventoryA: PlayerInventory;
  inventoryB: PlayerInventory;
  goldDeltaA: number;
  goldDeltaB: number;
  currentGoldA: number;
  currentGoldB: number;
}

export interface TradeCommitResult {
  ok: boolean;
  code: string;
  replay: boolean;
  goldA: number;
  goldB: number;
  inventoryA: PlayerInventory;
  inventoryB: PlayerInventory;
  trade: TradeRecord;
  audits: { a: TransactionAuditEvent; b: TransactionAuditEvent };
}

export type TradeCommitter = (request: TradeCommitRequest) => TradeCommitResult;

export function emptyTrades(): { [tradeId: string]: TradeRecord } {
  return {};
}

export function cloneTradeRecord(trade: TradeRecord): TradeRecord {
  const offers: { [characterId: string]: TradeOfferLine[] } = {};
  const offerSource = dict(trade.offers);
  const offerKeys = Object.keys(offerSource);
  for (let i = 0; i < offerKeys.length; i++) {
    const key = offerKeys[i];
    const lines = offerSource[key];
    const copy: TradeOfferLine[] = [];
    if (Array.isArray(lines)) {
      for (let l = 0; l < lines.length; l++) {
        copy.push({
          instanceId: lines[l].instanceId,
          itemId: lines[l].itemId,
          quantity: lines[l].quantity,
        });
      }
    }
    offers[key] = copy;
  }
  const goldOffers: { [characterId: string]: number } = {};
  const goldSource = dict(trade.goldOffers);
  const goldKeys = Object.keys(goldSource);
  for (let g = 0; g < goldKeys.length; g++) {
    goldOffers[goldKeys[g]] = goldSource[goldKeys[g]];
  }
  const acceptance: { [characterId: string]: number } = {};
  const acceptSource = dict(trade.acceptanceRevisionByParticipant);
  const acceptKeys = Object.keys(acceptSource);
  for (let a = 0; a < acceptKeys.length; a++) {
    acceptance[acceptKeys[a]] = acceptSource[acceptKeys[a]];
  }
  const byRequestId: { [requestId: string]: TradeRequestRecord } = {};
  const reqSource = dict(trade.byRequestId);
  const reqKeys = Object.keys(reqSource);
  for (let r = 0; r < reqKeys.length; r++) {
    const rec = reqSource[reqKeys[r]];
    if (rec == null) {
      continue;
    }
    byRequestId[reqKeys[r]] = { ok: rec.ok === true, code: rec.code };
  }
  const next: TradeRecord = {
    tradeId: trade.tradeId,
    participantA: {
      characterId: trade.participantA.characterId,
      accountUserId: trade.participantA.accountUserId,
      displayName: trade.participantA.displayName,
    },
    participantB: {
      characterId: trade.participantB.characterId,
      accountUserId: trade.participantB.accountUserId,
      displayName: trade.participantB.displayName,
    },
    state: trade.state,
    revision: trade.revision,
    offers: offers,
    goldOffers: goldOffers,
    acceptanceRevisionByParticipant: acceptance,
    createdAt: trade.createdAt,
    expiresAt: trade.expiresAt,
    createdAtTick: trade.createdAtTick,
    expiresAtTick: trade.expiresAtTick,
    inviteExpiresAtTick: trade.inviteExpiresAtTick,
    matchId: trade.matchId,
    schemaVersion: TRADE_SCHEMA_VERSION,
    byRequestId: byRequestId,
  };
  if (trade.commitRequestId !== undefined) {
    next.commitRequestId = trade.commitRequestId;
  }
  if (trade.cancelReason !== undefined) {
    next.cancelReason = trade.cancelReason;
  }
  if (trade.commitSnapshot !== undefined) {
    next.commitSnapshot = {
      inventoryA: cloneInventory(trade.commitSnapshot.inventoryA),
      inventoryB: cloneInventory(trade.commitSnapshot.inventoryB),
      goldA: trade.commitSnapshot.goldA,
      goldB: trade.commitSnapshot.goldB,
      goldDeltaA: trade.commitSnapshot.goldDeltaA,
      goldDeltaB: trade.commitSnapshot.goldDeltaB,
      requestId: trade.commitSnapshot.requestId,
    };
  }
  if (trade.audits !== undefined) {
    next.audits = dict(trade.audits);
  }
  if (trade.absentSinceTick !== undefined) {
    next.absentSinceTick = dict(trade.absentSinceTick);
  }
  return next;
}

export function cloneTrades(trades: { [tradeId: string]: TradeRecord } | null | undefined): {
  [tradeId: string]: TradeRecord;
} {
  const copy: { [tradeId: string]: TradeRecord } = {};
  const source = dict(trades);
  const ids = Object.keys(source);
  for (let i = 0; i < ids.length; i++) {
    const trade = source[ids[i]];
    if (trade == null) {
      continue;
    }
    copy[ids[i]] = cloneTradeRecord(trade);
  }
  return copy;
}

export function publicTrade(trade: TradeRecord): { [key: string]: unknown } {
  return {
    tradeId: trade.tradeId,
    participantA: {
      characterId: trade.participantA.characterId,
      accountUserId: trade.participantA.accountUserId,
      displayName: trade.participantA.displayName,
    },
    participantB: {
      characterId: trade.participantB.characterId,
      accountUserId: trade.participantB.accountUserId,
      displayName: trade.participantB.displayName,
    },
    state: trade.state,
    revision: trade.revision,
    offers: cloneOfferMap(trade.offers),
    goldOffers: cloneGoldMap(trade.goldOffers),
    acceptanceRevisionByParticipant: cloneGoldMap(trade.acceptanceRevisionByParticipant),
    createdAt: trade.createdAt,
    expiresAt: trade.expiresAt,
    cancelReason: trade.cancelReason !== undefined ? trade.cancelReason : "",
  };
}

export function reservedGoldForCharacter(
  trades: { [tradeId: string]: TradeRecord },
  characterId: string,
): number {
  let reserved = 0;
  const ids = Object.keys(trades);
  for (let i = 0; i < ids.length; i++) {
    const trade = trades[ids[i]];
    if (trade == null) {
      continue;
    }
    if (trade.state !== "open" && trade.state !== "committing" && trade.state !== "inviting") {
      continue;
    }
    if (!isParticipant(trade, characterId)) {
      continue;
    }
    const offered = trade.goldOffers[characterId];
    if (typeof offered === "number" && offered > reserved) {
      reserved = offered;
    }
  }
  return reserved;
}

export function availableGold(gold: number, reserved: number): number {
  const next = gold - reserved;
  return next < 0 ? 0 : next;
}

export function findLiveTradeForCharacter(
  trades: { [tradeId: string]: TradeRecord },
  characterId: string,
): TradeRecord | null {
  const ids = Object.keys(trades);
  for (let i = 0; i < ids.length; i++) {
    const trade = trades[ids[i]];
    if (trade == null) {
      continue;
    }
    if (trade.state === "completed" || trade.state === "cancelled") {
      continue;
    }
    if (isParticipant(trade, characterId)) {
      return trade;
    }
  }
  return null;
}

export function actorRestricted(actor: TradeActor): string {
  if (!actor.online) {
    return "not_in_match";
  }
  if (actor.health <= 0) {
    return "player_dead";
  }
  if (actor.transferState === "issued" || actor.transferState === "pending") {
    return "already_transferring";
  }
  if (actor.inCombat === true) {
    return "in_combat";
  }
  if (actor.activeCast !== undefined && actor.activeCast !== null) {
    return "casting";
  }
  if (hasControlTag(actor.effects, "stun")) {
    return "trade_restricted";
  }
  return "";
}

export function createTradeInvite(input: {
  tradeId: string;
  inviter: TradeActor;
  invitee: TradeActor;
  tick: number;
  nowMs: number;
  matchId: string;
  requestId: string;
  trades: { [tradeId: string]: TradeRecord };
}): TradeDecision {
  const prior = replayRequest(input.trades, input.requestId);
  if (prior !== null) {
    return prior;
  }
  const sameCharacter =
    input.inviter.characterId === input.invitee.characterId || input.inviter.userId === input.invitee.userId;
  if (sameCharacter) {
    return failNew("invalid_target", emptyInvitePlaceholder(input));
  }
  const inviterBusy = findLiveTradeForCharacter(input.trades, input.inviter.characterId);
  if (inviterBusy !== null) {
    return failNew("already_trading", emptyInvitePlaceholder(input));
  }
  const inviteeBusy = findLiveTradeForCharacter(input.trades, input.invitee.characterId);
  if (inviteeBusy !== null) {
    return failNew("already_trading", emptyInvitePlaceholder(input));
  }
  const inviterCode = actorRestricted(input.inviter);
  if (inviterCode.length > 0) {
    return failNew(inviterCode, emptyInvitePlaceholder(input));
  }
  const inviteeCode = actorRestricted(input.invitee);
  if (inviteeCode.length > 0) {
    return failNew(inviteeCode, emptyInvitePlaceholder(input));
  }
  const rangeCode = rangeFailure(input.inviter, input.invitee);
  if (rangeCode.length > 0) {
    return failNew(rangeCode, emptyInvitePlaceholder(input));
  }
  const trade = newTrade(input);
  remember(trade, input.requestId, true, "ok");
  return { ok: true, code: "ok", replay: false, trade: trade };
}

export function acceptTradeInvite(input: {
  trade: TradeRecord;
  actor: TradeActor;
  other: TradeActor;
  tick: number;
  nowMs: number;
  requestId: string;
}): TradeDecision {
  const replayed = replayOnTrade(input.trade, input.requestId);
  if (replayed !== null) {
    return replayed;
  }
  if (input.trade.state === "cancelled" || input.trade.state === "completed") {
    return failOn(input.trade, "trade_cancelled", input.requestId);
  }
  if (input.trade.participantB.characterId !== input.actor.characterId) {
    return failOn(input.trade, "invalid_target", input.requestId);
  }
  if (input.trade.state !== "inviting") {
    return failOn(input.trade, "already_trading", input.requestId);
  }
  if (input.tick > input.trade.inviteExpiresAtTick) {
    return cancelTrade(input.trade, "invite_expired", input.requestId);
  }
  const selfCode = actorRestricted(input.actor);
  if (selfCode.length > 0) {
    return failOn(input.trade, selfCode, input.requestId);
  }
  const otherCode = actorRestricted(input.other);
  if (otherCode.length > 0) {
    return failOn(input.trade, otherCode, input.requestId);
  }
  const rangeCode = rangeFailure(input.actor, input.other);
  if (rangeCode.length > 0) {
    return failOn(input.trade, rangeCode, input.requestId);
  }
  const next = cloneTradeRecord(input.trade);
  next.state = "open";
  next.revision = 1;
  next.expiresAtTick = input.tick + TRADE_TTL_TICKS;
  next.expiresAt = input.nowMs + TRADE_TTL_TICKS * 100;
  clearAcceptances(next);
  remember(next, input.requestId, true, "ok");
  return { ok: true, code: "ok", replay: false, trade: next };
}

export function declineTradeInvite(input: {
  trade: TradeRecord;
  actorCharacterId: string;
  requestId: string;
}): TradeDecision {
  const replayed = replayOnTrade(input.trade, input.requestId);
  if (replayed !== null) {
    return replayed;
  }
  if (!isParticipant(input.trade, input.actorCharacterId)) {
    return failOn(input.trade, "invalid_target", input.requestId);
  }
  if (input.trade.state !== "inviting") {
    return failOn(input.trade, "invalid_id", input.requestId);
  }
  return cancelTrade(input.trade, "declined", input.requestId);
}

export function setTradeOffer(input: {
  trade: TradeRecord;
  actor: TradeActor;
  other: TradeActor;
  instanceId: string;
  quantity: number;
  itemsById: { [id: string]: ItemDefinition };
  requestId: string;
}): TradeDecision {
  const replayed = replayOnTrade(input.trade, input.requestId);
  if (replayed !== null) {
    return replayed;
  }
  const ready = requireOpen(input.trade, input.actor, input.other, input.requestId);
  if (ready !== null) {
    return ready;
  }
  const inventory = cloneInventory(input.actor.inventory);
  const item = findItem(inventory, input.instanceId);
  if (item === null) {
    return failOn(input.trade, "unowned_item", input.requestId);
  }
  const equipped = equippedInstanceIds(input.actor.equipment);
  if (equipped.indexOf(item.instanceId) !== -1) {
    return failOn(input.trade, "item_equipped", input.requestId);
  }
  if (isItemLocked(item) && (item.lockReason !== TRADE_LOCK_REASON || item.lockId !== input.trade.tradeId)) {
    return failOn(input.trade, "item_locked", input.requestId);
  }
  const definition = input.itemsById[item.itemId];
  if (definition === undefined) {
    return failOn(input.trade, "invalid_id", input.requestId);
  }
  if (!itemIsTradeable(definition)) {
    return failOn(input.trade, "not_tradeable", input.requestId);
  }
  const quantity = input.quantity > 0 ? input.quantity : item.quantity;
  if (quantity < 1 || quantity !== Math.floor(quantity) || quantity > item.quantity) {
    return failOn(input.trade, "invalid_amount", input.requestId);
  }
  const locked = setItemLock(inventory, item.instanceId, TRADE_LOCK_REASON, input.trade.tradeId);
  const next = bumpRevision(input.trade);
  const lines = offerLines(next, input.actor.characterId);
  const replaced: TradeOfferLine[] = [];
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].instanceId === item.instanceId) {
      replaced.push({ instanceId: item.instanceId, itemId: item.itemId, quantity: quantity });
      found = true;
    } else {
      replaced.push(lines[i]);
    }
  }
  if (!found) {
    replaced.push({ instanceId: item.instanceId, itemId: item.itemId, quantity: quantity });
  }
  next.offers[input.actor.characterId] = replaced;
  remember(next, input.requestId, true, "ok");
  const inventories = inventoriesForActor(input.trade, input.actor, input.other, locked);
  return {
    ok: true,
    code: "ok",
    replay: false,
    trade: next,
    inventoryA: inventories.inventoryA,
    inventoryB: inventories.inventoryB,
  };
}

export function removeTradeOffer(input: {
  trade: TradeRecord;
  actor: TradeActor;
  other: TradeActor;
  instanceId: string;
  requestId: string;
}): TradeDecision {
  const replayed = replayOnTrade(input.trade, input.requestId);
  if (replayed !== null) {
    return replayed;
  }
  const ready = requireOpen(input.trade, input.actor, input.other, input.requestId);
  if (ready !== null) {
    return ready;
  }
  const lines = offerLines(input.trade, input.actor.characterId);
  const kept: TradeOfferLine[] = [];
  let removed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].instanceId === input.instanceId) {
      removed = true;
      continue;
    }
    kept.push(lines[i]);
  }
  if (!removed) {
    return failOn(input.trade, "invalid_id", input.requestId);
  }
  const unlocked = clearInstanceLock(input.actor.inventory, input.instanceId, input.trade.tradeId);
  const next = bumpRevision(input.trade);
  next.offers[input.actor.characterId] = kept;
  remember(next, input.requestId, true, "ok");
  const inventories = inventoriesForActor(input.trade, input.actor, input.other, unlocked);
  return {
    ok: true,
    code: "ok",
    replay: false,
    trade: next,
    inventoryA: inventories.inventoryA,
    inventoryB: inventories.inventoryB,
  };
}

export function setTradeGold(input: {
  trade: TradeRecord;
  actor: TradeActor;
  other: TradeActor;
  amount: number;
  requestId: string;
}): TradeDecision {
  const replayed = replayOnTrade(input.trade, input.requestId);
  if (replayed !== null) {
    return replayed;
  }
  const ready = requireOpen(input.trade, input.actor, input.other, input.requestId);
  if (ready !== null) {
    return ready;
  }
  if (input.amount < 0 || input.amount !== Math.floor(input.amount)) {
    return failOn(input.trade, "invalid_amount", input.requestId);
  }
  if (input.actor.gold < input.amount) {
    return failOn(input.trade, "insufficient_gold", input.requestId);
  }
  const next = bumpRevision(input.trade);
  next.goldOffers[input.actor.characterId] = input.amount;
  remember(next, input.requestId, true, "ok");
  return { ok: true, code: "ok", replay: false, trade: next };
}

export function acceptTradeRevision(input: {
  trade: TradeRecord;
  actor: TradeActor;
  other: TradeActor;
  revision: number;
  itemsById: { [id: string]: ItemDefinition };
  makeId: () => string;
  requestId: string;
}): TradeDecision {
  const replayed = replayOnTrade(input.trade, input.requestId);
  if (replayed !== null) {
    if (
      input.trade.state === "committing" &&
      input.trade.commitSnapshot !== undefined &&
      input.trade.commitRequestId === input.requestId
    ) {
      const snap = input.trade.commitSnapshot;
      return {
        ok: true,
        code: "ok",
        replay: true,
        trade: cloneTradeRecord(input.trade),
        shouldCommit: true,
        prepared: {
          ok: true,
          code: "ok",
          inventoryA: snap.inventoryA,
          inventoryB: snap.inventoryB,
          goldA: snap.goldA,
          goldB: snap.goldB,
          goldDeltaA: snap.goldDeltaA,
          goldDeltaB: snap.goldDeltaB,
        },
        inventoryA: snap.inventoryA,
        inventoryB: snap.inventoryB,
      };
    }
    return replayed;
  }
  if (input.trade.state === "completed") {
    remember(input.trade, input.requestId, true, "ok");
    return { ok: true, code: "ok", replay: true, trade: cloneTradeRecord(input.trade) };
  }
  const ready = requireOpen(input.trade, input.actor, input.other, input.requestId);
  if (ready !== null) {
    return ready;
  }
  if (input.revision !== input.trade.revision) {
    return failOn(input.trade, "revision_mismatch", input.requestId);
  }
  const next = cloneTradeRecord(input.trade);
  next.acceptanceRevisionByParticipant[input.actor.characterId] = input.revision;
  const acceptedA = next.acceptanceRevisionByParticipant[next.participantA.characterId];
  const acceptedB = next.acceptanceRevisionByParticipant[next.participantB.characterId];
  const both =
    acceptedA === next.revision && acceptedB === next.revision && next.revision > 0;
  remember(next, input.requestId, true, "ok");
  if (!both) {
    return { ok: true, code: "ok", replay: false, trade: next };
  }
  const prepared = prepareTradeCommit({
    trade: next,
    actorA: input.trade.participantA.characterId === input.actor.characterId ? input.actor : input.other,
    actorB: input.trade.participantB.characterId === input.actor.characterId ? input.actor : input.other,
    itemsById: input.itemsById,
    makeId: input.makeId,
  });
  if (!prepared.ok) {
    return cancelTrade(next, prepared.code, input.requestId);
  }
  next.state = "committing";
  next.commitRequestId = input.requestId;
  next.commitSnapshot = {
    inventoryA: prepared.inventoryA,
    inventoryB: prepared.inventoryB,
    goldA: prepared.goldA,
    goldB: prepared.goldB,
    goldDeltaA: prepared.goldDeltaA,
    goldDeltaB: prepared.goldDeltaB,
    requestId: input.requestId,
  };
  return {
    ok: true,
    code: "ok",
    replay: false,
    trade: next,
    shouldCommit: true,
    prepared: prepared,
    inventoryA: prepared.inventoryA,
    inventoryB: prepared.inventoryB,
  };
}

export function cancelTrade(trade: TradeRecord, reason: string, requestId?: string): TradeDecision {
  if (trade.state === "completed") {
    return { ok: true, code: "ok", replay: true, trade: cloneTradeRecord(trade) };
  }
  if (trade.state === "committing") {
    if (requestId !== undefined) {
      const replayed = replayOnTrade(trade, requestId);
      if (replayed !== null) {
        return replayed;
      }
      return failOn(trade, "already_trading", requestId);
    }
    return { ok: false, code: "already_trading", replay: false, trade: cloneTradeRecord(trade) };
  }
  if (trade.state === "cancelled") {
    if (requestId !== undefined) {
      const replayed = replayOnTrade(trade, requestId);
      if (replayed !== null) {
        return replayed;
      }
    }
    return { ok: true, code: "ok", replay: true, trade: cloneTradeRecord(trade) };
  }
  const next = cloneTradeRecord(trade);
  next.state = "cancelled";
  next.cancelReason = reason;
  const success = reason === "declined" || reason === "cancelled";
  if (requestId !== undefined) {
    remember(next, requestId, true, success ? "ok" : reason);
  }
  return {
    ok: success,
    code: success ? "ok" : reason,
    replay: false,
    trade: next,
  };
}

export function cancelReasonForTick(input: {
  trade: TradeRecord;
  actorA: TradeActor | null;
  actorB: TradeActor | null;
  tick: number;
}): string {
  if (input.trade.state === "completed" || input.trade.state === "cancelled" || input.trade.state === "committing") {
    return "";
  }
  if (input.trade.state === "inviting" && input.tick > input.trade.inviteExpiresAtTick) {
    return "invite_expired";
  }
  if (input.tick > input.trade.expiresAtTick) {
    return "trade_expired";
  }
  if (input.actorA === null || input.actorB === null) {
    return "disconnected";
  }
  if (input.actorA.health <= 0 || input.actorB.health <= 0) {
    return "player_dead";
  }
  if (
    input.actorA.transferState === "issued" ||
    input.actorA.transferState === "pending" ||
    input.actorB.transferState === "issued" ||
    input.actorB.transferState === "pending"
  ) {
    return "zone_transfer";
  }
  if (rangeFailure(input.actorA, input.actorB).length > 0) {
    return "out_of_range";
  }
  if (input.actorA.inCombat === true || input.actorB.inCombat === true) {
    return "in_combat";
  }
  if (!input.actorA.online || !input.actorB.online) {
    const absents = dict(input.trade.absentSinceTick);
    const aId = input.actorA.userId;
    const bId = input.actorB.userId;
    const sinceA = !input.actorA.online ? (typeof absents[aId] === "number" ? absents[aId] : input.tick) : 0;
    const sinceB = !input.actorB.online ? (typeof absents[bId] === "number" ? absents[bId] : input.tick) : 0;
    if (!input.actorA.online && input.tick - sinceA >= TRADE_DISCONNECT_GRACE_TICKS) {
      return "disconnected";
    }
    if (!input.actorB.online && input.tick - sinceB >= TRADE_DISCONNECT_GRACE_TICKS) {
      return "disconnected";
    }
  }
  return "";
}

export function noteAbsence(trade: TradeRecord, userId: string, tick: number, present: boolean): TradeRecord {
  const next = cloneTradeRecord(trade);
  const absents = dict(next.absentSinceTick);
  if (present) {
    delete absents[userId];
  } else if (typeof absents[userId] !== "number") {
    absents[userId] = tick;
  }
  next.absentSinceTick = absents;
  return next;
}

export function unlockTradeInventories(
  trade: TradeRecord,
  inventoryA: PlayerInventory,
  inventoryB: PlayerInventory,
): { inventoryA: PlayerInventory; inventoryB: PlayerInventory } {
  return {
    inventoryA: clearLocksByLockId(inventoryA, trade.tradeId),
    inventoryB: clearLocksByLockId(inventoryB, trade.tradeId),
  };
}

export function prepareTradeCommit(input: {
  trade: TradeRecord;
  actorA: TradeActor;
  actorB: TradeActor;
  itemsById: { [id: string]: ItemDefinition };
  makeId: () => string;
}): TradePrepareResult {
  const fail = function (code: string): TradePrepareResult {
    return {
      ok: false,
      code: code,
      inventoryA: cloneInventory(input.actorA.inventory),
      inventoryB: cloneInventory(input.actorB.inventory),
      goldA: input.actorA.gold,
      goldB: input.actorB.gold,
      goldDeltaA: 0,
      goldDeltaB: 0,
    };
  };
  if (input.trade.state !== "open" && input.trade.state !== "committing") {
    return fail("invalid_id");
  }
  const aCode = actorRestricted(input.actorA);
  if (aCode.length > 0) {
    return fail(aCode);
  }
  const bCode = actorRestricted(input.actorB);
  if (bCode.length > 0) {
    return fail(bCode);
  }
  if (rangeFailure(input.actorA, input.actorB).length > 0) {
    return fail("out_of_range");
  }
  const acceptedA = input.trade.acceptanceRevisionByParticipant[input.actorA.characterId];
  const acceptedB = input.trade.acceptanceRevisionByParticipant[input.actorB.characterId];
  if (acceptedA !== input.trade.revision || acceptedB !== input.trade.revision) {
    return fail("revision_mismatch");
  }
  const goldAOffer = goldOffer(input.trade, input.actorA.characterId);
  const goldBOffer = goldOffer(input.trade, input.actorB.characterId);
  if (input.actorA.gold < goldAOffer || input.actorB.gold < goldBOffer) {
    return fail("insufficient_gold");
  }
  const takenA = takeOffers(
    input.actorA.inventory,
    offerLines(input.trade, input.actorA.characterId),
    input.trade.tradeId,
    equippedInstanceIds(input.actorA.equipment),
    input.itemsById,
  );
  if (!takenA.ok) {
    return fail(takenA.code);
  }
  const takenB = takeOffers(
    input.actorB.inventory,
    offerLines(input.trade, input.actorB.characterId),
    input.trade.tradeId,
    equippedInstanceIds(input.actorB.equipment),
    input.itemsById,
  );
  if (!takenB.ok) {
    return fail(takenB.code);
  }
  const giveA = giveOffers(takenA.inventory, takenB.removed, input.itemsById, input.makeId);
  if (!giveA.ok) {
    return fail(giveA.code);
  }
  const giveB = giveOffers(takenB.inventory, takenA.removed, input.itemsById, input.makeId);
  if (!giveB.ok) {
    return fail(giveB.code);
  }
  const goldDeltaA = -goldAOffer + goldBOffer;
  const goldDeltaB = -goldBOffer + goldAOffer;
  const goldA = input.actorA.gold + goldDeltaA;
  const goldB = input.actorB.gold + goldDeltaB;
  if (goldA < 0 || goldB < 0) {
    return fail("insufficient_gold");
  }
  return {
    ok: true,
    code: "ok",
    inventoryA: clearLocksByLockId(giveA.inventory, input.trade.tradeId),
    inventoryB: clearLocksByLockId(giveB.inventory, input.trade.tradeId),
    goldA: goldA,
    goldB: goldB,
    goldDeltaA: goldDeltaA,
    goldDeltaB: goldDeltaB,
  };
}

export function markTradeCompleted(
  trade: TradeRecord,
  requestId: string,
  audits: { a: TransactionAuditEvent; b: TransactionAuditEvent },
): TradeRecord {
  const next = cloneTradeRecord(trade);
  next.state = "completed";
  next.commitRequestId = requestId;
  next.audits = {};
  next.audits[next.participantA.characterId] = audits.a;
  next.audits[next.participantB.characterId] = audits.b;
  remember(next, requestId, true, "ok");
  return next;
}

export function recoverInterruptedTrade(
  trade: TradeRecord,
  commit: TradeCommitter,
  currentGoldA: number,
  currentGoldB: number,
): TradeCommitResult {
  if (trade.state === "completed") {
    return replayCompleted(trade, currentGoldA, currentGoldB);
  }
  if (trade.state !== "committing" || trade.commitSnapshot === undefined) {
    return {
      ok: false,
      code: "invalid_id",
      replay: false,
      goldA: currentGoldA,
      goldB: currentGoldB,
      inventoryA: cloneInventory(emptySideInventory(trade, "a")),
      inventoryB: cloneInventory(emptySideInventory(trade, "b")),
      trade: cloneTradeRecord(trade),
      audits: missingAudits(trade),
    };
  }
  const snapshot = trade.commitSnapshot;
  return commit({
    trade: trade,
    requestId: snapshot.requestId,
    userA: trade.participantA.accountUserId,
    userB: trade.participantB.accountUserId,
    characterA: trade.participantA.characterId,
    characterB: trade.participantB.characterId,
    inventoryA: snapshot.inventoryA,
    inventoryB: snapshot.inventoryB,
    goldDeltaA: snapshot.goldDeltaA,
    goldDeltaB: snapshot.goldDeltaB,
    currentGoldA: currentGoldA,
    currentGoldB: currentGoldB,
  });
}

export function memoryTradeCommitter(options?: { failOnce?: boolean; failTimes?: number; ledger?: GoldLedger }): TradeCommitter {
  const ledger: GoldLedger = options !== undefined && options.ledger !== undefined ? options.ledger : { mutationByRequestId: {} };
  const completed: { [tradeId: string]: TradeCommitResult } = {};
  let remainingFails =
    options !== undefined && typeof options.failTimes === "number"
      ? options.failTimes
      : options !== undefined && options.failOnce === true
        ? 1
        : 0;
  return function (request: TradeCommitRequest): TradeCommitResult {
    const prior = completed[request.trade.tradeId];
    if (prior !== undefined) {
      return {
        ok: true,
        code: "ok",
        replay: true,
        goldA: prior.goldA,
        goldB: prior.goldB,
        inventoryA: cloneInventory(prior.inventoryA),
        inventoryB: cloneInventory(prior.inventoryB),
        trade: cloneTradeRecord(prior.trade),
        audits: prior.audits,
      };
    }
    if (request.trade.state === "completed") {
      return replayCompleted(request.trade, request.currentGoldA, request.currentGoldB);
    }
    if (remainingFails > 0) {
      remainingFails -= 1;
      return {
        ok: false,
        code: "persist_failed",
        replay: false,
        goldA: request.currentGoldA,
        goldB: request.currentGoldB,
        inventoryA: cloneInventory(request.inventoryA),
        inventoryB: cloneInventory(request.inventoryB),
        trade: cloneTradeRecord(request.trade),
        audits: missingAudits(request.trade),
      };
    }
    const goldA = applyGoldMutation(
      {
        characterId: request.characterA,
        currentGold: request.currentGoldA,
        delta: request.goldDeltaA,
        reasonType: TX_REASON_TRADE,
        reasonId: request.trade.tradeId,
        requestId: request.requestId + ":a",
        metadata: { source: "trade", role: "a" },
      },
      ledger,
    );
    const goldB = applyGoldMutation(
      {
        characterId: request.characterB,
        currentGold: request.currentGoldB,
        delta: request.goldDeltaB,
        reasonType: TX_REASON_TRADE,
        reasonId: request.trade.tradeId,
        requestId: request.requestId + ":b",
        metadata: { source: "trade", role: "b" },
      },
      ledger,
    );
    if (!goldA.ok || !goldB.ok) {
      return {
        ok: false,
        code: !goldA.ok ? goldA.code : goldB.code,
        replay: false,
        goldA: request.currentGoldA,
        goldB: request.currentGoldB,
        inventoryA: cloneInventory(request.inventoryA),
        inventoryB: cloneInventory(request.inventoryB),
        trade: cloneTradeRecord(request.trade),
        audits: missingAudits(request.trade),
      };
    }
    const audits = {
      a: auditFrom(request, "a", goldA.goldDelta, goldA.resultingBalance),
      b: auditFrom(request, "b", goldB.goldDelta, goldB.resultingBalance),
    };
    const completedTrade = markTradeCompleted(request.trade, request.requestId, audits);
    const result: TradeCommitResult = {
      ok: true,
      code: "ok",
      replay: false,
      goldA: goldA.resultingBalance,
      goldB: goldB.resultingBalance,
      inventoryA: cloneInventory(request.inventoryA),
      inventoryB: cloneInventory(request.inventoryB),
      trade: completedTrade,
      audits: audits,
    };
    completed[request.trade.tradeId] = result;
    return result;
  };
}

function newTrade(input: {
  tradeId: string;
  inviter: TradeActor;
  invitee: TradeActor;
  tick: number;
  nowMs: number;
  matchId: string;
}): TradeRecord {
  const offers: { [characterId: string]: TradeOfferLine[] } = {};
  offers[input.inviter.characterId] = [];
  offers[input.invitee.characterId] = [];
  const goldOffers: { [characterId: string]: number } = {};
  goldOffers[input.inviter.characterId] = 0;
  goldOffers[input.invitee.characterId] = 0;
  const acceptance: { [characterId: string]: number } = {};
  acceptance[input.inviter.characterId] = 0;
  acceptance[input.invitee.characterId] = 0;
  return {
    tradeId: input.tradeId,
    participantA: {
      characterId: input.inviter.characterId,
      accountUserId: input.inviter.userId,
      displayName: input.inviter.displayName,
    },
    participantB: {
      characterId: input.invitee.characterId,
      accountUserId: input.invitee.userId,
      displayName: input.invitee.displayName,
    },
    state: "inviting",
    revision: 0,
    offers: offers,
    goldOffers: goldOffers,
    acceptanceRevisionByParticipant: acceptance,
    createdAt: input.nowMs,
    expiresAt: input.nowMs + TRADE_INVITE_TTL_TICKS * 100,
    createdAtTick: input.tick,
    expiresAtTick: input.tick + TRADE_INVITE_TTL_TICKS,
    inviteExpiresAtTick: input.tick + TRADE_INVITE_TTL_TICKS,
    matchId: input.matchId,
    schemaVersion: TRADE_SCHEMA_VERSION,
    byRequestId: {},
  };
}

function emptyInvitePlaceholder(input: {
  tradeId: string;
  inviter: TradeActor;
  invitee: TradeActor;
  tick: number;
  nowMs: number;
  matchId: string;
}): TradeRecord {
  return newTrade(input);
}

function requireOpen(
  trade: TradeRecord,
  actor: TradeActor,
  other: TradeActor,
  requestId: string,
): TradeDecision | null {
  if (trade.state === "cancelled") {
    return failOn(trade, "trade_cancelled", requestId);
  }
  if (trade.state === "completed") {
    return failOn(trade, "already_completed", requestId);
  }
  if (trade.state !== "open") {
    return failOn(trade, "invalid_id", requestId);
  }
  if (!isParticipant(trade, actor.characterId)) {
    return failOn(trade, "invalid_target", requestId);
  }
  const selfCode = actorRestricted(actor);
  if (selfCode.length > 0) {
    return failOn(trade, selfCode, requestId);
  }
  const otherCode = actorRestricted(other);
  if (otherCode.length > 0) {
    return failOn(trade, otherCode, requestId);
  }
  const rangeCode = rangeFailure(actor, other);
  if (rangeCode.length > 0) {
    return failOn(trade, rangeCode, requestId);
  }
  return null;
}

function bumpRevision(trade: TradeRecord): TradeRecord {
  const next = cloneTradeRecord(trade);
  next.revision = next.revision + 1;
  clearAcceptances(next);
  return next;
}

function clearAcceptances(trade: TradeRecord): void {
  trade.acceptanceRevisionByParticipant[trade.participantA.characterId] = 0;
  trade.acceptanceRevisionByParticipant[trade.participantB.characterId] = 0;
}

function offerLines(trade: TradeRecord, characterId: string): TradeOfferLine[] {
  const lines = trade.offers[characterId];
  return Array.isArray(lines) ? lines : [];
}

function goldOffer(trade: TradeRecord, characterId: string): number {
  const amount = trade.goldOffers[characterId];
  return typeof amount === "number" && amount > 0 ? amount : 0;
}

function isParticipant(trade: TradeRecord, characterId: string): boolean {
  return trade.participantA.characterId === characterId || trade.participantB.characterId === characterId;
}

function rangeFailure(a: TradeActor, b: TradeActor): string {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  if (dx * dx + dy * dy > TRADE_RANGE_PX * TRADE_RANGE_PX) {
    return "out_of_range";
  }
  return "";
}

function remember(trade: TradeRecord, requestId: string, ok: boolean, code: string): void {
  trade.byRequestId[requestId] = { ok: ok, code: code };
}

function replayOnTrade(trade: TradeRecord, requestId: string): TradeDecision | null {
  const prior = trade.byRequestId[requestId];
  if (prior === undefined) {
    return null;
  }
  return {
    ok: prior.ok,
    code: prior.code,
    replay: true,
    trade: cloneTradeRecord(trade),
  };
}

function replayRequest(
  trades: { [tradeId: string]: TradeRecord },
  requestId: string,
): TradeDecision | null {
  const ids = Object.keys(trades);
  for (let i = 0; i < ids.length; i++) {
    const trade = trades[ids[i]];
    if (trade == null) {
      continue;
    }
    const found = replayOnTrade(trade, requestId);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function failNew(code: string, trade: TradeRecord): TradeDecision {
  return { ok: false, code: code, replay: false, trade: trade };
}

function failOn(trade: TradeRecord, code: string, requestId: string): TradeDecision {
  const next = cloneTradeRecord(trade);
  remember(next, requestId, false, code);
  return { ok: false, code: code, replay: false, trade: next };
}

function inventoriesForActor(
  trade: TradeRecord,
  actor: TradeActor,
  other: TradeActor,
  actorInventory: PlayerInventory,
): { inventoryA: PlayerInventory; inventoryB: PlayerInventory } {
  if (trade.participantA.characterId === actor.characterId) {
    return { inventoryA: actorInventory, inventoryB: cloneInventory(other.inventory) };
  }
  return { inventoryA: cloneInventory(other.inventory), inventoryB: actorInventory };
}

function clearInstanceLock(inventory: PlayerInventory, instanceId: string, tradeId: string): PlayerInventory {
  const next = cloneInventory(inventory);
  const item = findItem(next, instanceId);
  if (item === null) {
    return next;
  }
  if (item.lockId === tradeId) {
    item.lockReason = "";
    item.lockId = "";
  }
  return next;
}

function takeOffers(
  inventory: PlayerInventory,
  lines: TradeOfferLine[],
  tradeId: string,
  equipped: ReadonlyArray<string>,
  itemsById: { [id: string]: ItemDefinition },
): { ok: boolean; code: string; inventory: PlayerInventory; removed: TradeOfferLine[] } {
  let current = cloneInventory(inventory);
  const removed: TradeOfferLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const item = findItem(current, line.instanceId);
    if (item === null) {
      return { ok: false, code: "unowned_item", inventory: current, removed: removed };
    }
    if (equipped.indexOf(item.instanceId) !== -1) {
      return { ok: false, code: "item_equipped", inventory: current, removed: removed };
    }
    if (!isItemLocked(item) || item.lockReason !== TRADE_LOCK_REASON || item.lockId !== tradeId) {
      return { ok: false, code: "item_locked", inventory: current, removed: removed };
    }
    if (item.quantity < line.quantity) {
      return { ok: false, code: "invalid_amount", inventory: current, removed: removed };
    }
    const definition = itemsById[item.itemId];
    if (definition === undefined || !itemIsTradeable(definition)) {
      return { ok: false, code: "not_tradeable", inventory: current, removed: removed };
    }
    const next = takeItemQuantity(current, line.instanceId, line.quantity);
    if (next === null) {
      return { ok: false, code: "unowned_item", inventory: current, removed: removed };
    }
    current = next;
    removed.push({ instanceId: line.instanceId, itemId: item.itemId, quantity: line.quantity });
  }
  return { ok: true, code: "ok", inventory: current, removed: removed };
}

function giveOffers(
  inventory: PlayerInventory,
  lines: TradeOfferLine[],
  itemsById: { [id: string]: ItemDefinition },
  makeId: () => string,
): { ok: boolean; code: string; inventory: PlayerInventory } {
  let current = cloneInventory(inventory);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const definition = itemsById[line.itemId];
    if (definition === undefined) {
      return { ok: false, code: "invalid_id", inventory: current };
    }
    const failCode = acceptItemFailureCode(current, line.itemId, line.quantity, definition);
    if (failCode.length > 0) {
      return { ok: false, code: failCode, inventory: current };
    }
    current = addOrStackItem(current, line.itemId, line.quantity, makeId(), definition, {
      sourceType: "trade",
      sourceId: line.instanceId,
    });
  }
  return { ok: true, code: "ok", inventory: current };
}

function cloneOfferMap(offers: { [characterId: string]: TradeOfferLine[] }): { [characterId: string]: TradeOfferLine[] } {
  const copy: { [characterId: string]: TradeOfferLine[] } = {};
  const source = dict(offers);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const lines = source[keys[i]];
    const next: TradeOfferLine[] = [];
    if (Array.isArray(lines)) {
      for (let l = 0; l < lines.length; l++) {
        next.push({
          instanceId: lines[l].instanceId,
          itemId: lines[l].itemId,
          quantity: lines[l].quantity,
        });
      }
    }
    copy[keys[i]] = next;
  }
  return copy;
}

function cloneGoldMap(values: { [characterId: string]: number }): { [characterId: string]: number } {
  const copy: { [characterId: string]: number } = {};
  const source = dict(values);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = source[keys[i]];
  }
  return copy;
}

function replayCompleted(trade: TradeRecord, goldA: number, goldB: number): TradeCommitResult {
  const snapshot = trade.commitSnapshot;
  return {
    ok: true,
    code: "ok",
    replay: true,
    goldA: snapshot !== undefined ? snapshot.goldA : goldA,
    goldB: snapshot !== undefined ? snapshot.goldB : goldB,
    inventoryA: snapshot !== undefined ? cloneInventory(snapshot.inventoryA) : cloneInventory(emptySideInventory(trade, "a")),
    inventoryB: snapshot !== undefined ? cloneInventory(snapshot.inventoryB) : cloneInventory(emptySideInventory(trade, "b")),
    trade: cloneTradeRecord(trade),
    audits: trade.audits !== undefined
      ? {
          a: trade.audits[trade.participantA.characterId],
          b: trade.audits[trade.participantB.characterId],
        }
      : missingAudits(trade),
  };
}

function emptySideInventory(_trade: TradeRecord, _side: "a" | "b"): PlayerInventory {
  return cloneInventory({ capacity: 20, items: [], pickupByRequestId: {} });
}

function missingAudits(trade: TradeRecord): { a: TransactionAuditEvent; b: TransactionAuditEvent } {
  return {
    a: {
      requestId: trade.commitRequestId !== undefined ? trade.commitRequestId : "",
      characterId: trade.participantA.characterId,
      userId: trade.participantA.accountUserId,
      reasonType: TX_REASON_TRADE,
      reasonId: trade.tradeId,
      goldDelta: 0,
      resultingBalance: 0,
      code: "persist_failed",
      ok: false,
      metadata: {},
    },
    b: {
      requestId: trade.commitRequestId !== undefined ? trade.commitRequestId : "",
      characterId: trade.participantB.characterId,
      userId: trade.participantB.accountUserId,
      reasonType: TX_REASON_TRADE,
      reasonId: trade.tradeId,
      goldDelta: 0,
      resultingBalance: 0,
      code: "persist_failed",
      ok: false,
      metadata: {},
    },
  };
}

function auditFrom(
  request: TradeCommitRequest,
  side: "a" | "b",
  goldDelta: number,
  resultingBalance: number,
): TransactionAuditEvent {
  return {
    requestId: request.requestId,
    characterId: side === "a" ? request.characterA : request.characterB,
    userId: side === "a" ? request.userA : request.userB,
    reasonType: TX_REASON_TRADE,
    reasonId: request.trade.tradeId,
    goldDelta: goldDelta,
    resultingBalance: resultingBalance,
    code: "ok",
    ok: true,
    metadata: { source: "trade", side: side },
  };
}
