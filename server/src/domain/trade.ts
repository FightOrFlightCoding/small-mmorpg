import {
  acceptItemFailureCode,
  addOrStackItem,
  clearLocksByLockId,
  cloneInventory,
  emptyInventory,
  findItem,
  isItemLocked,
  itemIsTradeable,
  setItemLock,
  takeItemQuantity,
  type ItemDefinition,
  type ItemInstance,
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
import { planTwoWayTrade } from "./item_capacity";
import { LOCK_TYPE_TRADE } from "./item_lock";

export const TRADE_SCHEMA_VERSION = 1;
export const TRADE_RANGE_PX = 80;
export const TRADE_INVITE_TTL_TICKS = 300;
export const TRADE_TTL_TICKS = 1200;
export const TRADE_DISCONNECT_GRACE_TICKS = 50;
export const TRADE_OFFER_SLOTS = 20;
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
  lockId: string;
  slotIndex: number;
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
  inventoryRevisionByParticipant: { [characterId: string]: number };
  capacityKeyByParticipant: { [characterId: string]: string };
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
  linkDead?: boolean;
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
        copy.push(cloneOfferLine(lines[l], l));
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
  const inventoryRevision: { [characterId: string]: number } = {};
  const revisionSource = dict(trade.inventoryRevisionByParticipant);
  const revisionKeys = Object.keys(revisionSource);
  for (let r = 0; r < revisionKeys.length; r++) {
    inventoryRevision[revisionKeys[r]] = revisionSource[revisionKeys[r]];
  }
  const capacityKeys: { [characterId: string]: string } = {};
  const capacitySource = dict(trade.capacityKeyByParticipant);
  const capacityKeyNames = Object.keys(capacitySource);
  for (let c = 0; c < capacityKeyNames.length; c++) {
    capacityKeys[capacityKeyNames[c]] = capacitySource[capacityKeyNames[c]];
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
    inventoryRevisionByParticipant: inventoryRevision,
    capacityKeyByParticipant: capacityKeys,
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

export function publicTrade(
  trade: TradeRecord,
  itemsById?: { [id: string]: ItemDefinition },
): { [key: string]: unknown } {
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
    offers: publicOfferMap(trade, itemsById),
    goldOffers: cloneGoldMap(trade.goldOffers),
    acceptanceRevisionByParticipant: cloneGoldMap(trade.acceptanceRevisionByParticipant),
    offerSlots: TRADE_OFFER_SLOTS,
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
  if (actor.linkDead === true) {
    return "link_dead";
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
  stampBagSync(next, input.other, input.actor);
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
  slotIndex?: number;
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
  const lines = occupiedOfferLines(input.trade, input.actor.characterId);
  const existingIndex = findOfferIndex(lines, item.instanceId);
  let targetSlot = existingIndex >= 0 ? lines[existingIndex].slotIndex : firstEmptyOfferSlot(lines);
  if (input.slotIndex !== undefined) {
    if (input.slotIndex < 0 || input.slotIndex !== Math.floor(input.slotIndex) || input.slotIndex >= TRADE_OFFER_SLOTS) {
      return failOn(input.trade, "invalid_slot", input.requestId);
    }
    targetSlot = input.slotIndex;
  }
  if (targetSlot < 0 || targetSlot >= TRADE_OFFER_SLOTS) {
    return failOn(input.trade, "offer_full", input.requestId);
  }
  const occupant = offerAtSlot(lines, targetSlot);
  if (occupant !== null && occupant.instanceId !== item.instanceId && existingIndex < 0 && occupiedOfferCount(lines) >= TRADE_OFFER_SLOTS) {
    return failOn(input.trade, "offer_full", input.requestId);
  }
  const previous = existingIndex >= 0 ? lines[existingIndex] : null;
  const unchanged =
    previous !== null &&
    previous.quantity === quantity &&
    previous.slotIndex === targetSlot &&
    occupant !== null &&
    occupant.instanceId === item.instanceId;
  let workingInventory = inventory;
  if (occupant !== null && occupant.instanceId !== item.instanceId) {
    workingInventory = clearInstanceLock(workingInventory, occupant.instanceId, input.trade.tradeId);
  }
  const locked = setItemLock(workingInventory, item.instanceId, TRADE_LOCK_REASON, input.trade.tradeId, {
    lockType: LOCK_TYPE_TRADE,
    quantity: quantity,
    ownerOperation: "trade",
  });
  const next = unchanged ? cloneTradeRecord(input.trade) : bumpRevision(input.trade);
  const replaced: TradeOfferLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.instanceId === item.instanceId || line.slotIndex === targetSlot) {
      continue;
    }
    replaced.push(cloneOfferLine(line, line.slotIndex));
  }
  replaced.push({
    instanceId: item.instanceId,
    itemId: item.itemId,
    quantity: quantity,
    lockId: input.trade.tradeId,
    slotIndex: targetSlot,
  });
  next.offers[input.actor.characterId] = replaced;
  stampBagSync(next, input.actor, input.other);
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
  stampBagSync(next, input.actor, input.other);
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
  if (!both) {
    remember(next, input.requestId, true, "ok");
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
    if (isUnsafeCommitFailure(prepared.code)) {
      return cancelTrade(next, prepared.code, input.requestId);
    }
    clearAcceptances(next);
    next.state = "open";
    remember(next, input.requestId, false, prepared.code);
    return { ok: false, code: prepared.code, replay: false, trade: next };
  }
  remember(next, input.requestId, true, "ok");
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
  if (input.actorA.linkDead === true || input.actorB.linkDead === true) {
    return "link_dead";
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
    return "disconnected";
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

export function reconcileOpenTrade(input: {
  trade: TradeRecord;
  actorA: TradeActor;
  actorB: TradeActor;
}): TradeDecision | null {
  if (input.trade.state !== "open") {
    return null;
  }
  const sides: Array<{ actor: TradeActor; other: TradeActor }> = [
    { actor: input.actorA, other: input.actorB },
    { actor: input.actorB, other: input.actorA },
  ];
  let next = cloneTradeRecord(input.trade);
  let offersChanged = false;
  let capacityChanged = false;
  let inventoryA = cloneInventory(input.actorA.inventory);
  let inventoryB = cloneInventory(input.actorB.inventory);
  for (let s = 0; s < sides.length; s++) {
    const actor = sides[s].actor;
    const result = syncOffersForActor(next, actor);
    if (result.cancelCode.length > 0) {
      return cancelTrade(input.trade, result.cancelCode);
    }
    if (result.offersChanged) {
      offersChanged = true;
      next.offers[actor.characterId] = result.lines;
      if (next.participantA.characterId === actor.characterId) {
        inventoryA = result.inventory;
      } else {
        inventoryB = result.inventory;
      }
    }
    const key = inventoryCapacityKey(actor.inventory);
    const previousKey = next.capacityKeyByParticipant[actor.characterId];
    if (typeof previousKey === "string" && previousKey.length > 0 && previousKey !== key) {
      capacityChanged = true;
    }
    next.capacityKeyByParticipant[actor.characterId] = key;
    next.inventoryRevisionByParticipant[actor.characterId] = actor.inventory.revision;
  }
  if (!offersChanged && !capacityChanged) {
    return null;
  }
  next.revision = next.revision + 1;
  clearAcceptances(next);
  return {
    ok: true,
    code: "ok",
    replay: false,
    trade: next,
    inventoryA: inventoryA,
    inventoryB: inventoryB,
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
  const tradePlan = planTwoWayTrade({
    left: input.actorA.inventory,
    right: input.actorB.inventory,
    leftOffers: offerLines(input.trade, input.actorA.characterId).map(function (line) {
      return { instanceId: line.instanceId, quantity: line.quantity };
    }),
    rightOffers: offerLines(input.trade, input.actorB.characterId).map(function (line) {
      return { instanceId: line.instanceId, quantity: line.quantity };
    }),
    definitions: input.itemsById,
    leftEquipped: input.actorA.equipment !== undefined ? input.actorA.equipment.items : undefined,
    rightEquipped: input.actorB.equipment !== undefined ? input.actorB.equipment.items : undefined,
  });
  if (!tradePlan.fits) {
    return fail(tradePlan.failureCode.length > 0 ? tradePlan.failureCode : "inventory_full");
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
  const giveA = giveOffers(
    takenA.inventory,
    takenB.removed,
    input.itemsById,
    input.makeId,
    input.actorA.equipment !== undefined ? input.actorA.equipment.items : undefined,
  );
  if (!giveA.ok) {
    return fail(giveA.code);
  }
  const giveB = giveOffers(
    takenB.inventory,
    takenA.removed,
    input.itemsById,
    input.makeId,
    input.actorB.equipment !== undefined ? input.actorB.equipment.items : undefined,
  );
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
    inventoryRevisionByParticipant: {},
    capacityKeyByParticipant: {},
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
  return occupiedOfferLines(trade, characterId);
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
    item.lockType = "";
    item.lockId = "";
    item.version += 1;
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
    removed.push({
      instanceId: line.instanceId,
      itemId: item.itemId,
      quantity: line.quantity,
      lockId: line.lockId,
      slotIndex: line.slotIndex,
    });
  }
  return { ok: true, code: "ok", inventory: current, removed: removed };
}

function giveOffers(
  inventory: PlayerInventory,
  lines: TradeOfferLine[],
  itemsById: { [id: string]: ItemDefinition },
  makeId: () => string,
  equippedItems?: ReadonlyArray<ItemInstance>,
): { ok: boolean; code: string; inventory: PlayerInventory } {
  let current = cloneInventory(inventory);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const definition = itemsById[line.itemId];
    if (definition === undefined) {
      return { ok: false, code: "invalid_id", inventory: current };
    }
    const failCode = acceptItemFailureCode(current, line.itemId, line.quantity, definition, equippedItems);
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

export function offeredQuantitiesForCharacter(
  trade: TradeRecord | null | undefined,
  characterId: string,
): { [instanceId: string]: number } {
  const offered: { [instanceId: string]: number } = {};
  if (trade == null) {
    return offered;
  }
  const lines = occupiedOfferLines(trade, characterId);
  for (let i = 0; i < lines.length; i++) {
    const current = offered[lines[i].instanceId];
    offered[lines[i].instanceId] = (current !== undefined ? current : 0) + lines[i].quantity;
  }
  return offered;
}

function cloneOfferLine(line: TradeOfferLine, fallbackSlot: number): TradeOfferLine {
  const slot =
    typeof line.slotIndex === "number" && line.slotIndex >= 0 && line.slotIndex < TRADE_OFFER_SLOTS
      ? line.slotIndex
      : fallbackSlot;
  return {
    instanceId: line.instanceId,
    itemId: line.itemId,
    quantity: line.quantity,
    lockId: typeof line.lockId === "string" && line.lockId.length > 0 ? line.lockId : "",
    slotIndex: slot,
  };
}

function occupiedOfferLines(trade: TradeRecord, characterId: string): TradeOfferLine[] {
  const lines = trade.offers[characterId];
  const occupied: TradeOfferLine[] = [];
  if (!Array.isArray(lines)) {
    return occupied;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line == null || typeof line.instanceId !== "string" || line.instanceId.length === 0) {
      continue;
    }
    if (typeof line.quantity !== "number" || line.quantity < 1) {
      continue;
    }
    occupied.push(cloneOfferLine(line, occupied.length));
  }
  return occupied;
}

function occupiedOfferCount(lines: TradeOfferLine[]): number {
  return lines.length;
}

function findOfferIndex(lines: TradeOfferLine[], instanceId: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].instanceId === instanceId) {
      return i;
    }
  }
  return -1;
}

function offerAtSlot(lines: TradeOfferLine[], slotIndex: number): TradeOfferLine | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].slotIndex === slotIndex) {
      return lines[i];
    }
  }
  return null;
}

function firstEmptyOfferSlot(lines: TradeOfferLine[]): number {
  const used: { [slot: number]: boolean } = {};
  for (let i = 0; i < lines.length; i++) {
    used[lines[i].slotIndex] = true;
  }
  for (let slot = 0; slot < TRADE_OFFER_SLOTS; slot++) {
    if (used[slot] !== true) {
      return slot;
    }
  }
  return -1;
}

function publicOfferMap(
  trade: TradeRecord,
  itemsById?: { [id: string]: ItemDefinition },
): { [characterId: string]: Array<{ [key: string]: unknown }> } {
  const copy: { [characterId: string]: Array<{ [key: string]: unknown }> } = {};
  const ids = [trade.participantA.characterId, trade.participantB.characterId];
  for (let i = 0; i < ids.length; i++) {
    const characterId = ids[i];
    const occupied = occupiedOfferLines(trade, characterId);
    const slots: Array<{ [key: string]: unknown }> = [];
    for (let slot = 0; slot < TRADE_OFFER_SLOTS; slot++) {
      const line = offerAtSlot(occupied, slot);
      if (line === null) {
        slots.push({
          slotIndex: slot,
          instanceId: "",
          itemId: "",
          quantity: 0,
          lockId: "",
        });
        continue;
      }
      slots.push(publicOfferLine(line, itemsById));
    }
    copy[characterId] = slots;
  }
  return copy;
}

function publicOfferLine(
  line: TradeOfferLine,
  itemsById?: { [id: string]: ItemDefinition },
): { [key: string]: unknown } {
  const payload: { [key: string]: unknown } = {
    slotIndex: line.slotIndex,
    instanceId: line.instanceId,
    itemId: line.itemId,
    quantity: line.quantity,
    lockId: line.lockId,
  };
  const definition = itemsById !== undefined ? itemsById[line.itemId] : undefined;
  if (definition !== undefined) {
    payload.displayNameKey = definition.displayNameKey !== undefined ? definition.displayNameKey : "";
    payload.rarity = definition.rarity !== undefined ? definition.rarity : "";
    payload.iconAssetId = definition.iconAssetId !== undefined ? definition.iconAssetId : "";
    payload.maxStack = definition.maxStack;
    payload.definitionId = definition.id;
  }
  return payload;
}

function stampBagSync(trade: TradeRecord, actor: TradeActor, other: TradeActor): void {
  trade.inventoryRevisionByParticipant[actor.characterId] = actor.inventory.revision;
  trade.capacityKeyByParticipant[actor.characterId] = inventoryCapacityKey(actor.inventory);
  trade.inventoryRevisionByParticipant[other.characterId] = other.inventory.revision;
  trade.capacityKeyByParticipant[other.characterId] = inventoryCapacityKey(other.inventory);
}

function inventoryCapacityKey(inventory: PlayerInventory): string {
  const parts: string[] = [String(inventory.items.length)];
  const sorted = inventory.items.slice();
  sorted.sort(function (a, b) {
    if (a.instanceId < b.instanceId) {
      return -1;
    }
    if (a.instanceId > b.instanceId) {
      return 1;
    }
    return 0;
  });
  for (let i = 0; i < sorted.length; i++) {
    parts.push(sorted[i].instanceId + ":" + sorted[i].itemId + ":" + String(sorted[i].quantity));
  }
  return parts.join("|");
}

function syncOffersForActor(
  trade: TradeRecord,
  actor: TradeActor,
): { cancelCode: string; offersChanged: boolean; lines: TradeOfferLine[]; inventory: PlayerInventory } {
  const lines = occupiedOfferLines(trade, actor.characterId);
  const nextLines: TradeOfferLine[] = [];
  let offersChanged = false;
  let inventory = cloneInventory(actor.inventory);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const item = findItem(inventory, line.instanceId);
    if (item === null) {
      return {
        cancelCode: "unowned_item",
        offersChanged: true,
        lines: nextLines,
        inventory: inventory,
      };
    }
    if (item.quantity < line.quantity) {
      if (item.quantity < 1) {
        return {
          cancelCode: "unowned_item",
          offersChanged: true,
          lines: nextLines,
          inventory: inventory,
        };
      }
      nextLines.push({
        instanceId: line.instanceId,
        itemId: line.itemId,
        quantity: item.quantity,
        lockId: trade.tradeId,
        slotIndex: line.slotIndex,
      });
      inventory = setItemLock(inventory, item.instanceId, TRADE_LOCK_REASON, trade.tradeId, {
        lockType: LOCK_TYPE_TRADE,
        quantity: item.quantity,
        ownerOperation: "trade",
      });
      offersChanged = true;
    } else {
      nextLines.push(cloneOfferLine(line, line.slotIndex));
    }
  }
  return { cancelCode: "", offersChanged: offersChanged, lines: nextLines, inventory: inventory };
}

function isUnsafeCommitFailure(code: string): boolean {
  return (
    code === "player_dead" ||
    code === "not_in_match" ||
    code === "already_transferring" ||
    code === "out_of_range" ||
    code === "unowned_item" ||
    code === "item_equipped" ||
    code === "not_tradeable" ||
    code === "item_locked" ||
    code === "link_dead" ||
    code === "disconnected" ||
    code === "zone_transfer" ||
    code === "trade_cancelled" ||
    code === "invalid_id" ||
    code === "casting" ||
    code === "in_combat" ||
    code === "trade_restricted"
  );
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
  return emptyInventory();
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
