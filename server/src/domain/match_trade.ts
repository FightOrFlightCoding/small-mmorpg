import {
  ClientOpcode,
  actionResult,
  inventoryState,
  tradeStateMessage,
  walletState,
  type ParsedClientMessage,
} from "./protocol";
import { publicInventory, type PlayerInventory } from "./inventory";
import { dict } from "./maps";
import { type MatchPlayer, type StarterZoneState } from "./match_state";
import {
  acceptTradeInvite,
  acceptTradeRevision,
  availableGold,
  cancelReasonForTick,
  cancelTrade,
  createTradeInvite,
  declineTradeInvite,
  findLiveTradeForCharacter,
  markTradeCompleted,
  noteAbsence,
  publicTrade,
  recoverInterruptedTrade,
  removeTradeOffer,
  reservedGoldForCharacter,
  setTradeGold,
  setTradeOffer,
  unlockTradeInventories,
  type TradeActor,
  type TradeCommitter,
  type TradeDecision,
  type TradeRecord,
} from "./trade";

interface TradeOutbound {
  opcode: number;
  body: string;
  toUserId?: string;
}

export function spendableGold(state: StarterZoneState, player: MatchPlayer): number {
  const gold = player.gold !== undefined ? player.gold : 0;
  const reserved = reservedGoldForCharacter(dict(state.trades), player.characterId);
  return availableGold(gold, reserved);
}

export function isTradeOpcode(opcode: number): boolean {
  return opcode >= ClientOpcode.TRADE_INVITE && opcode <= ClientOpcode.TRADE_CANCEL;
}

export function handleTradeMessage(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: TradeOutbound[],
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistTrades: { [tradeId: string]: TradeRecord },
  skipStorageUsers: { [userId: string]: boolean },
  makeId: () => string,
  commitTrade?: TradeCommitter,
): void {
  ensureTradeMaps(state);
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const requestId = parsed.requestId as string;
  if (parsed.opcode === ClientOpcode.TRADE_INVITE) {
    handleInvite(parsed, player, state, tick, outbound, persistTrades, requestId, makeId);
    return;
  }
  const trade = tradeForRequest(state, parsed.fields.tradeId, player.characterId);
  if (trade === null) {
    const missing = actionResult("invalid_id", false, requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const actor = actorFromPlayer(player, true);
  const other = otherActor(state, trade, player.characterId);
  if (parsed.opcode === ClientOpcode.TRADE_ACCEPT_INVITE) {
    if (other === null) {
      finishDecision(cancelTrade(trade, "disconnected", requestId), state, outbound, persistInventoryByUser, persistTrades, skipStorageUsers, requestId, userId);
      return;
    }
    finishDecision(
      acceptTradeInvite({ trade: trade, actor: actor, other: other, tick: tick, nowMs: tick * 100, requestId: requestId }),
      state,
      outbound,
      persistInventoryByUser,
      persistTrades,
      skipStorageUsers,
      requestId,
      userId,
    );
    return;
  }
  if (parsed.opcode === ClientOpcode.TRADE_DECLINE_INVITE) {
    finishDecision(
      declineTradeInvite({ trade: trade, actorCharacterId: player.characterId, requestId: requestId }),
      state,
      outbound,
      persistInventoryByUser,
      persistTrades,
      skipStorageUsers,
      requestId,
      userId,
    );
    return;
  }
  if (other === null) {
    finishDecision(cancelTrade(trade, "disconnected", requestId), state, outbound, persistInventoryByUser, persistTrades, skipStorageUsers, requestId, userId);
    return;
  }
  if (parsed.opcode === ClientOpcode.TRADE_SET_OFFER) {
    const instanceId = parsed.fields.instanceId !== undefined ? parsed.fields.instanceId : "";
    const quantity = parsed.quantity !== undefined ? parsed.quantity : 0;
    finishDecision(
      setTradeOffer({
        trade: trade,
        actor: actor,
        other: other,
        instanceId: instanceId,
        quantity: quantity,
        itemsById: state.itemsById,
        requestId: requestId,
      }),
      state,
      outbound,
      persistInventoryByUser,
      persistTrades,
      skipStorageUsers,
      requestId,
      userId,
    );
    return;
  }
  if (parsed.opcode === ClientOpcode.TRADE_REMOVE_OFFER) {
    const instanceId = parsed.fields.instanceId !== undefined ? parsed.fields.instanceId : "";
    finishDecision(
      removeTradeOffer({
        trade: trade,
        actor: actor,
        other: other,
        instanceId: instanceId,
        requestId: requestId,
      }),
      state,
      outbound,
      persistInventoryByUser,
      persistTrades,
      skipStorageUsers,
      requestId,
      userId,
    );
    return;
  }
  if (parsed.opcode === ClientOpcode.TRADE_SET_GOLD) {
    const amount = parsed.amount !== undefined ? parsed.amount : -1;
    finishDecision(
      setTradeGold({ trade: trade, actor: actor, other: other, amount: amount, requestId: requestId }),
      state,
      outbound,
      persistInventoryByUser,
      persistTrades,
      skipStorageUsers,
      requestId,
      userId,
    );
    return;
  }
  if (parsed.opcode === ClientOpcode.TRADE_ACCEPT_REVISION) {
    const revision = parsed.revision !== undefined ? parsed.revision : -1;
    const decision = acceptTradeRevision({
      trade: trade,
      actor: actor,
      other: other,
      revision: revision,
      itemsById: state.itemsById,
      makeId: makeId,
      requestId: requestId,
    });
    if (decision.shouldCommit === true && decision.prepared !== undefined) {
      commitDecision(decision, state, outbound, persistInventoryByUser, persistTrades, skipStorageUsers, commitTrade, requestId, userId);
      return;
    }
    finishDecision(decision, state, outbound, persistInventoryByUser, persistTrades, skipStorageUsers, requestId, userId);
    return;
  }
  if (parsed.opcode === ClientOpcode.TRADE_CANCEL) {
    finishDecision(
      cancelTrade(trade, "cancelled", requestId),
      state,
      outbound,
      persistInventoryByUser,
      persistTrades,
      skipStorageUsers,
      requestId,
      userId,
    );
  }
}

export function tickTrades(
  state: StarterZoneState,
  tick: number,
  outbound: TradeOutbound[],
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistTrades: { [tradeId: string]: TradeRecord },
): void {
  ensureTradeMaps(state);
  const trades = dict(state.trades);
  const ids = Object.keys(trades);
  for (let i = 0; i < ids.length; i++) {
    const trade = trades[ids[i]];
    if (trade == null || trade.state === "completed" || trade.state === "cancelled") {
      continue;
    }
    const actorA = actorForParticipant(state, trade.participantA.accountUserId);
    const actorB = actorForParticipant(state, trade.participantB.accountUserId);
    let current = trade;
    if (actorA !== null) {
      current = noteAbsence(current, actorA.userId, tick, actorA.online);
    }
    if (actorB !== null) {
      current = noteAbsence(current, actorB.userId, tick, actorB.online);
    }
    state.trades = trades;
    trades[current.tradeId] = current;
    const reason = cancelReasonForTick({ trade: current, actorA: actorA, actorB: actorB, tick: tick });
    if (reason.length === 0) {
      continue;
    }
    finishDecision(
      cancelTrade(current, reason),
      state,
      outbound,
      persistInventoryByUser,
      persistTrades,
      {},
      undefined,
    );
  }
}

export function cancelTradesForUser(
  state: StarterZoneState,
  userId: string,
  reason: string,
  outbound: TradeOutbound[],
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistTrades: { [tradeId: string]: TradeRecord },
): void {
  ensureTradeMaps(state);
  const player = state.players[userId] !== undefined ? state.players[userId] : parkedPlayer(state, userId);
  if (player === undefined) {
    return;
  }
  const trade = findLiveTradeForCharacter(dict(state.trades), player.characterId);
  if (trade === null) {
    return;
  }
  if (trade.state === "committing") {
    return;
  }
  finishDecision(cancelTrade(trade, reason), state, outbound, persistInventoryByUser, persistTrades, {}, undefined);
}

export function recoverCommittingTrades(
  state: StarterZoneState,
  commitTrade: TradeCommitter,
  outbound?: TradeOutbound[],
  persistInventoryByUser?: { [userId: string]: PlayerInventory },
  persistTrades?: { [tradeId: string]: TradeRecord },
  skipStorageUsers?: { [userId: string]: boolean },
): void {
  ensureTradeMaps(state);
  const trades = dict(state.trades);
  const ids = Object.keys(trades);
  for (let i = 0; i < ids.length; i++) {
    const trade = trades[ids[i]];
    if (trade == null || trade.state !== "committing" || trade.commitSnapshot === undefined) {
      continue;
    }
    const playerA = liveOrParked(state, trade.participantA.accountUserId);
    const playerB = liveOrParked(state, trade.participantB.accountUserId);
    const snapshot = trade.commitSnapshot;
    const recovered = recoverInterruptedTrade(
      trade,
      commitTrade,
      playerA !== undefined && playerA.gold !== undefined ? playerA.gold : snapshot.goldA - snapshot.goldDeltaA,
      playerB !== undefined && playerB.gold !== undefined ? playerB.gold : snapshot.goldB - snapshot.goldDeltaB,
    );
    if (!recovered.ok) {
      continue;
    }
    applyCommitted(state, recovered.trade, recovered.inventoryA, recovered.inventoryB, recovered.goldA, recovered.goldB);
    if (persistTrades !== undefined) {
      persistTrades[recovered.trade.tradeId] = recovered.trade;
    }
    if (skipStorageUsers !== undefined) {
      skipStorageUsers[trade.participantA.accountUserId] = true;
      skipStorageUsers[trade.participantB.accountUserId] = true;
    }
    if (persistInventoryByUser !== undefined) {
      persistInventoryByUser[trade.participantA.accountUserId] = recovered.inventoryA;
      persistInventoryByUser[trade.participantB.accountUserId] = recovered.inventoryB;
    }
    if (outbound !== undefined) {
      const requestId = snapshot.requestId;
      if (playerA !== undefined) {
        pushEconomy(state, playerA, recovered.inventoryA, recovered.goldA, outbound, requestId);
      }
      if (playerB !== undefined) {
        pushEconomy(state, playerB, recovered.inventoryB, recovered.goldB, outbound, requestId);
      }
      broadcastTrade(state, recovered.trade, outbound, requestId);
    }
  }
}

function handleInvite(
  parsed: ParsedClientMessage,
  player: MatchPlayer,
  state: StarterZoneState,
  tick: number,
  outbound: TradeOutbound[],
  persistTrades: { [tradeId: string]: TradeRecord },
  requestId: string,
  makeId: () => string,
): void {
  const targetId = parsed.fields.targetId !== undefined ? parsed.fields.targetId : "";
  const target = state.players[targetId];
  if (target === undefined) {
    const missing = actionResult("invalid_target", false, requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: player.userId });
    return;
  }
  const decision = createTradeInvite({
    tradeId: makeId(),
    inviter: actorFromPlayer(player, true),
    invitee: actorFromPlayer(target, true),
    tick: tick,
    nowMs: tick * 100,
    matchId: state.matchId !== undefined ? state.matchId : "",
    requestId: requestId,
    trades: dict(state.trades),
  });
  if (!decision.ok) {
    const failed = actionResult(decision.code, false, requestId);
    outbound.push({ opcode: failed.opcode, body: failed.body, toUserId: player.userId });
    return;
  }
  storeTrade(state, decision.trade);
  persistTrades[decision.trade.tradeId] = decision.trade;
  const ok = actionResult("ok", true, requestId, { tradeId: decision.trade.tradeId });
  outbound.push({ opcode: ok.opcode, body: ok.body, toUserId: player.userId });
  broadcastTrade(state, decision.trade, outbound, requestId);
}

function commitDecision(
  decision: TradeDecision,
  state: StarterZoneState,
  outbound: TradeOutbound[],
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistTrades: { [tradeId: string]: TradeRecord },
  skipStorageUsers: { [userId: string]: boolean },
  commitTrade: TradeCommitter | undefined,
  requestId: string,
  actorUserId?: string,
): void {
  if (decision.prepared === undefined) {
    finishDecision(decision, state, outbound, persistInventoryByUser, persistTrades, skipStorageUsers, requestId, actorUserId);
    return;
  }
  storeTrade(state, decision.trade);
  persistTrades[decision.trade.tradeId] = decision.trade;
  const userA = decision.trade.participantA.accountUserId;
  const userB = decision.trade.participantB.accountUserId;
  const playerA = state.players[userA];
  const playerB = state.players[userB];
  if (playerA === undefined || playerB === undefined) {
    finishDecision(cancelTrade(decision.trade, "disconnected", requestId), state, outbound, persistInventoryByUser, persistTrades, skipStorageUsers, requestId, actorUserId);
    return;
  }
  if (commitTrade !== undefined) {
    const committed = commitTrade({
      trade: decision.trade,
      requestId: requestId,
      userA: userA,
      userB: userB,
      characterA: decision.trade.participantA.characterId,
      characterB: decision.trade.participantB.characterId,
      inventoryA: decision.prepared.inventoryA,
      inventoryB: decision.prepared.inventoryB,
      goldDeltaA: decision.prepared.goldDeltaA,
      goldDeltaB: decision.prepared.goldDeltaB,
      currentGoldA: playerA.gold !== undefined ? playerA.gold : 0,
      currentGoldB: playerB.gold !== undefined ? playerB.gold : 0,
    });
    if (!committed.ok) {
      persistTrades[decision.trade.tradeId] = decision.trade;
      const failed = actionResult(committed.code, false, requestId);
      outbound.push({ opcode: failed.opcode, body: failed.body, toUserId: playerA.userId });
      outbound.push({ opcode: failed.opcode, body: failed.body, toUserId: playerB.userId });
      broadcastTrade(state, decision.trade, outbound, requestId);
      return;
    }
    applyCommitted(state, committed.trade, committed.inventoryA, committed.inventoryB, committed.goldA, committed.goldB);
    skipStorageUsers[userA] = true;
    skipStorageUsers[userB] = true;
    persistTrades[committed.trade.tradeId] = committed.trade;
    pushEconomy(state, playerA, committed.inventoryA, committed.goldA, outbound, requestId);
    pushEconomy(state, playerB, committed.inventoryB, committed.goldB, outbound, requestId);
    const ok = actionResult("ok", true, requestId, { tradeId: committed.trade.tradeId });
    outbound.push({ opcode: ok.opcode, body: ok.body, toUserId: playerA.userId });
    outbound.push({ opcode: ok.opcode, body: ok.body, toUserId: playerB.userId });
    broadcastTrade(state, committed.trade, outbound, requestId);
    return;
  }
  const completed = markTradeCompleted(decision.trade, requestId, {
    a: {
      requestId: requestId,
      characterId: decision.trade.participantA.characterId,
      userId: userA,
      reasonType: "trade",
      reasonId: decision.trade.tradeId,
      goldDelta: decision.prepared.goldDeltaA,
      resultingBalance: decision.prepared.goldA,
      code: "ok",
      ok: true,
      metadata: {},
    },
    b: {
      requestId: requestId,
      characterId: decision.trade.participantB.characterId,
      userId: userB,
      reasonType: "trade",
      reasonId: decision.trade.tradeId,
      goldDelta: decision.prepared.goldDeltaB,
      resultingBalance: decision.prepared.goldB,
      code: "ok",
      ok: true,
      metadata: {},
    },
  });
  applyCommitted(state, completed, decision.prepared.inventoryA, decision.prepared.inventoryB, decision.prepared.goldA, decision.prepared.goldB);
  persistInventoryByUser[userA] = decision.prepared.inventoryA;
  persistInventoryByUser[userB] = decision.prepared.inventoryB;
  persistTrades[completed.tradeId] = completed;
  pushEconomy(state, playerA, decision.prepared.inventoryA, decision.prepared.goldA, outbound, requestId);
  pushEconomy(state, playerB, decision.prepared.inventoryB, decision.prepared.goldB, outbound, requestId);
  const ok = actionResult("ok", true, requestId, { tradeId: completed.tradeId });
  outbound.push({ opcode: ok.opcode, body: ok.body, toUserId: playerA.userId });
  outbound.push({ opcode: ok.opcode, body: ok.body, toUserId: playerB.userId });
  broadcastTrade(state, completed, outbound, requestId);
}

function finishDecision(
  decision: TradeDecision,
  state: StarterZoneState,
  outbound: TradeOutbound[],
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistTrades: { [tradeId: string]: TradeRecord },
  skipStorageUsers: { [userId: string]: boolean },
  requestId: string | undefined,
  actorUserId?: string,
): void {
  const previous = dict(state.trades)[decision.trade.tradeId];
  storeTrade(state, decision.trade);
  persistTrades[decision.trade.tradeId] = decision.trade;
  if (decision.trade.state === "cancelled" || decision.trade.state === "completed") {
    clearTradeIndex(state, decision.trade);
  }
  if (decision.trade.state === "cancelled") {
    unlockBoth(state, previous !== undefined ? previous : decision.trade, persistInventoryByUser);
  }
  if (decision.inventoryA !== undefined) {
    applyInventory(state, decision.trade.participantA.accountUserId, decision.inventoryA, persistInventoryByUser);
  }
  if (decision.inventoryB !== undefined) {
    applyInventory(state, decision.trade.participantB.accountUserId, decision.inventoryB, persistInventoryByUser);
  }
  const actorId = actorUserId !== undefined ? actorUserId : decision.trade.participantA.accountUserId;
  if (requestId !== undefined) {
    const result = actionResult(decision.code, decision.ok, requestId, { tradeId: decision.trade.tradeId });
    outbound.push({ opcode: result.opcode, body: result.body, toUserId: actorId });
  }
  broadcastTrade(state, decision.trade, outbound, requestId);
  void skipStorageUsers;
}

function applyCommitted(
  state: StarterZoneState,
  trade: TradeRecord,
  inventoryA: PlayerInventory,
  inventoryB: PlayerInventory,
  goldA: number,
  goldB: number,
): void {
  const playerA = liveOrParked(state, trade.participantA.accountUserId);
  const playerB = liveOrParked(state, trade.participantB.accountUserId);
  if (playerA !== undefined) {
    playerA.inventory = inventoryA;
    playerA.gold = goldA;
  }
  if (playerB !== undefined) {
    playerB.inventory = inventoryB;
    playerB.gold = goldB;
  }
  storeTrade(state, trade);
  clearTradeIndex(state, trade);
}

function applyInventory(
  state: StarterZoneState,
  userId: string,
  inventory: PlayerInventory,
  persistInventoryByUser: { [userId: string]: PlayerInventory },
): void {
  const player = liveOrParked(state, userId);
  if (player === undefined) {
    return;
  }
  player.inventory = inventory;
  persistInventoryByUser[userId] = inventory;
}

function unlockBoth(
  state: StarterZoneState,
  trade: TradeRecord,
  persistInventoryByUser: { [userId: string]: PlayerInventory },
): void {
  const playerA = liveOrParked(state, trade.participantA.accountUserId);
  const playerB = liveOrParked(state, trade.participantB.accountUserId);
  const invA = playerA !== undefined && playerA.inventory !== undefined ? playerA.inventory : undefined;
  const invB = playerB !== undefined && playerB.inventory !== undefined ? playerB.inventory : undefined;
  if (invA === undefined || invB === undefined) {
    if (invA !== undefined) {
      applyInventory(state, trade.participantA.accountUserId, unlockTradeInventories(trade, invA, invA).inventoryA, persistInventoryByUser);
    }
    if (invB !== undefined) {
      applyInventory(state, trade.participantB.accountUserId, unlockTradeInventories(trade, invB, invB).inventoryB, persistInventoryByUser);
    }
    return;
  }
  const unlocked = unlockTradeInventories(trade, invA, invB);
  applyInventory(state, trade.participantA.accountUserId, unlocked.inventoryA, persistInventoryByUser);
  applyInventory(state, trade.participantB.accountUserId, unlocked.inventoryB, persistInventoryByUser);
}

function pushEconomy(
  state: StarterZoneState,
  player: MatchPlayer,
  inventory: PlayerInventory,
  gold: number,
  outbound: TradeOutbound[],
  requestId: string,
): void {
  const inv = inventoryState(state.contentHash, publicInventory(inventory), requestId);
  outbound.push({ opcode: inv.opcode, body: inv.body, toUserId: player.userId });
  const wallet = walletState(state.contentHash, gold, requestId);
  outbound.push({ opcode: wallet.opcode, body: wallet.body, toUserId: player.userId });
}

function broadcastTrade(
  state: StarterZoneState,
  trade: TradeRecord,
  outbound: TradeOutbound[],
  requestId?: string,
): void {
  const message = tradeStateMessage(state.contentHash, publicTrade(trade), requestId);
  outbound.push({ opcode: message.opcode, body: message.body, toUserId: trade.participantA.accountUserId });
  outbound.push({ opcode: message.opcode, body: message.body, toUserId: trade.participantB.accountUserId });
}

function storeTrade(state: StarterZoneState, trade: TradeRecord): void {
  ensureTradeMaps(state);
  state.trades = dict(state.trades);
  state.tradeByCharacterId = dict(state.tradeByCharacterId);
  state.trades[trade.tradeId] = trade;
  if (trade.state !== "cancelled" && trade.state !== "completed") {
    state.tradeByCharacterId[trade.participantA.characterId] = trade.tradeId;
    state.tradeByCharacterId[trade.participantB.characterId] = trade.tradeId;
  }
}

function clearTradeIndex(state: StarterZoneState, trade: TradeRecord): void {
  state.tradeByCharacterId = dict(state.tradeByCharacterId);
  if (state.tradeByCharacterId[trade.participantA.characterId] === trade.tradeId) {
    delete state.tradeByCharacterId[trade.participantA.characterId];
  }
  if (state.tradeByCharacterId[trade.participantB.characterId] === trade.tradeId) {
    delete state.tradeByCharacterId[trade.participantB.characterId];
  }
}

function tradeForRequest(state: StarterZoneState, tradeId: string | undefined, characterId: string): TradeRecord | null {
  if (tradeId !== undefined && tradeId.length > 0) {
    const found = dict(state.trades)[tradeId];
    return found !== undefined ? found : null;
  }
  return findLiveTradeForCharacter(dict(state.trades), characterId);
}

function otherActor(state: StarterZoneState, trade: TradeRecord, characterId: string): TradeActor | null {
  const otherUser =
    trade.participantA.characterId === characterId
      ? trade.participantB.accountUserId
      : trade.participantA.accountUserId;
  return actorForParticipant(state, otherUser);
}

function actorForParticipant(state: StarterZoneState, userId: string): TradeActor | null {
  const live = state.players[userId];
  if (live !== undefined) {
    return actorFromPlayer(live, true);
  }
  const parked = parkedPlayer(state, userId);
  if (parked !== undefined) {
    return actorFromPlayer(parked, false);
  }
  return null;
}

function liveOrParked(state: StarterZoneState, userId: string): MatchPlayer | undefined {
  if (state.players[userId] !== undefined) {
    return state.players[userId];
  }
  return parkedPlayer(state, userId);
}

function parkedPlayer(state: StarterZoneState, userId: string): MatchPlayer | undefined {
  const parked = dict(state.disconnected)[userId];
  if (parked === undefined) {
    return undefined;
  }
  return parked.player;
}

function actorFromPlayer(player: MatchPlayer, online: boolean): TradeActor {
  return {
    userId: player.userId,
    characterId: player.characterId,
    displayName: player.name,
    x: player.x,
    y: player.y,
    health: player.health,
    gold: player.gold !== undefined ? player.gold : 0,
    inventory: player.inventory !== undefined ? player.inventory : { capacity: 20, items: [], pickupByRequestId: {} },
    equipment: player.equipment,
    transferState: player.transferState,
    inCombat: player.inCombat,
    activeCast: player.activeCast,
    effects: player.effects,
    online: online,
  };
}

function ensureTradeMaps(state: StarterZoneState): void {
  state.trades = dict(state.trades);
  state.tradeByCharacterId = dict(state.tradeByCharacterId);
}
