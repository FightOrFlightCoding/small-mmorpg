import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { emptyEquipment } from "../src/domain/equipment";
import {
  addOrStackItem,
  applyDestroyItem,
  consumeItem,
  emptyInventory,
  isItemLocked,
  itemDefinitionsFromContent,
  makeInstance,
  setItemLock,
  type PlayerInventory,
} from "../src/domain/inventory";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { applyPlayerLeave } from "../src/domain/persistence";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import {
  TRADE_INVITE_TTL_TICKS,
  TRADE_LOCK_REASON,
  TRADE_OFFER_SLOTS,
  TRADE_RANGE_PX,
  acceptTradeInvite,
  acceptTradeRevision,
  availableGold,
  cancelReasonForTick,
  cancelTrade,
  createTradeInvite,
  declineTradeInvite,
  findLiveTradeForCharacter,
  memoryTradeCommitter,
  prepareTradeCommit,
  publicTrade,
  reconcileOpenTrade,
  recoverInterruptedTrade,
  removeTradeOffer,
  reservedGoldForCharacter,
  setTradeGold,
  setTradeOffer,
  unlockTradeInventories,
  type TradeActor,
  type TradeRecord,
} from "../src/domain/trade";

const itemsById = itemDefinitionsFromContent(content.items);

function ids(prefix: string): () => string {
  let n = 0;
  return function () {
    n += 1;
    return prefix + "-" + String(n);
  };
}

function withItem(itemId: string, instanceId: string, quantity = 1, capacity = 20): PlayerInventory {
  return addOrStackItem(emptyInventory(capacity), itemId, quantity, instanceId, itemsById[itemId]);
}

function actor(input: {
  userId: string;
  name: string;
  inventory: PlayerInventory;
  gold?: number;
  x?: number;
  y?: number;
  health?: number;
  online?: boolean;
  transferState?: string;
  inCombat?: boolean;
  linkDead?: boolean;
}): TradeActor {
  return {
    userId: input.userId,
    characterId: "char-" + input.userId,
    displayName: input.name,
    x: input.x !== undefined ? input.x : 0,
    y: input.y !== undefined ? input.y : 0,
    health: input.health !== undefined ? input.health : 100,
    gold: input.gold !== undefined ? input.gold : 50,
    inventory: input.inventory,
    equipment: emptyEquipment(),
    transferState: input.transferState,
    inCombat: input.inCombat,
    online: input.online !== undefined ? input.online : true,
    linkDead: input.linkDead,
  };
}

function openTrade(aliceInv?: PlayerInventory, bobInv?: PlayerInventory): {
  trade: TradeRecord;
  alice: TradeActor;
  bob: TradeActor;
} {
  const alice = actor({
    userId: "alice",
    name: "Alice",
    inventory: aliceInv !== undefined ? aliceInv : withItem("item.test_pebble", "pebble-a", 5),
  });
  const bob = actor({
    userId: "bob",
    name: "Bob",
    inventory: bobInv !== undefined ? bobInv : withItem("item.test_potion", "potion-b", 2),
    x: 10,
  });
  const invited = createTradeInvite({
    tradeId: "trade-1",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1000,
    matchId: "match-1",
    requestId: "request-invite-1",
    trades: {},
  });
  assert.equal(invited.ok, true);
  const accepted = acceptTradeInvite({
    trade: invited.trade,
    actor: bob,
    other: alice,
    tick: 2,
    nowMs: 1100,
    requestId: "request-accept-1",
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.trade.state, "open");
  return { trade: accepted.trade, alice: alice, bob: bob };
}

test("invite creates an inviting trade between nearby living players", () => {
  const alice = actor({ userId: "alice", name: "Alice", inventory: emptyInventory() });
  const bob = actor({ userId: "bob", name: "Bob", inventory: emptyInventory(), x: 20 });
  const result = createTradeInvite({
    tradeId: "trade-invite",
    inviter: alice,
    invitee: bob,
    tick: 10,
    nowMs: 5000,
    matchId: "match-1",
    requestId: "rid-invite",
    trades: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.trade.state, "inviting");
  assert.equal(result.trade.participantA.characterId, "char-alice");
  assert.equal(result.trade.participantB.characterId, "char-bob");
  assert.equal(result.trade.revision, 0);
});

test("accept invite opens a trade between both participants", () => {
  const alice = actor({ userId: "alice", name: "Alice", inventory: emptyInventory() });
  const bob = actor({ userId: "bob", name: "Bob", inventory: emptyInventory(), x: 12 });
  const invited = createTradeInvite({
    tradeId: "trade-accept",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1,
    matchId: "m",
    requestId: "rid-i",
    trades: {},
  });
  const accepted = acceptTradeInvite({
    trade: invited.trade,
    actor: bob,
    other: alice,
    tick: 2,
    nowMs: 100,
    requestId: "rid-a",
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.trade.state, "open");
  assert.equal(accepted.trade.participantA.characterId, "char-alice");
  assert.equal(accepted.trade.participantB.characterId, "char-bob");
});

test("decline cancels an invite", () => {
  const alice = actor({ userId: "alice", name: "Alice", inventory: emptyInventory() });
  const bob = actor({ userId: "bob", name: "Bob", inventory: emptyInventory(), x: 8 });
  const invited = createTradeInvite({
    tradeId: "trade-decline",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1,
    matchId: "m",
    requestId: "rid-i",
    trades: {},
  });
  const declined = declineTradeInvite({
    trade: invited.trade,
    actorCharacterId: bob.characterId,
    requestId: "rid-d",
  });
  assert.equal(declined.ok, true);
  assert.equal(declined.trade.state, "cancelled");
  assert.equal(declined.trade.cancelReason, "declined");
});

test("same character cannot trade with itself", () => {
  const alice = actor({ userId: "alice", name: "Alice", inventory: emptyInventory() });
  const result = createTradeInvite({
    tradeId: "trade-self",
    inviter: alice,
    invitee: alice,
    tick: 1,
    nowMs: 1,
    matchId: "m",
    requestId: "rid-self",
    trades: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_target");
});

test("valid item and gold trade commits exactly once", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 3,
    itemsById: itemsById,
    requestId: "rid-offer-a",
  });
  assert.equal(offered.ok, true);
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  const gold = setTradeGold({
    trade: offered.trade,
    actor: session.bob,
    other: session.alice,
    amount: 12,
    requestId: "rid-gold-b",
  });
  assert.equal(gold.ok, true);
  const acceptA = acceptTradeRevision({
    trade: gold.trade,
    actor: session.alice,
    other: session.bob,
    revision: gold.trade.revision,
    itemsById: itemsById,
    makeId: ids("new"),
    requestId: "rid-acc-a",
  });
  assert.equal(acceptA.ok, true);
  assert.equal(acceptA.shouldCommit, undefined);
  const acceptB = acceptTradeRevision({
    trade: acceptA.trade,
    actor: session.bob,
    other: session.alice,
    revision: acceptA.trade.revision,
    itemsById: itemsById,
    makeId: ids("new"),
    requestId: "rid-acc-b",
  });
  assert.equal(acceptB.ok, true);
  assert.equal(acceptB.shouldCommit, true);
  assert.ok(acceptB.prepared !== undefined);
  const committer = memoryTradeCommitter();
  const first = committer({
    trade: acceptB.trade,
    requestId: "rid-acc-b",
    userA: session.alice.userId,
    userB: session.bob.userId,
    characterA: session.alice.characterId,
    characterB: session.bob.characterId,
    inventoryA: acceptB.prepared !== undefined ? acceptB.prepared.inventoryA : session.alice.inventory,
    inventoryB: acceptB.prepared !== undefined ? acceptB.prepared.inventoryB : session.bob.inventory,
    goldDeltaA: acceptB.prepared !== undefined ? acceptB.prepared.goldDeltaA : 0,
    goldDeltaB: acceptB.prepared !== undefined ? acceptB.prepared.goldDeltaB : 0,
    currentGoldA: session.alice.gold,
    currentGoldB: session.bob.gold,
  });
  assert.equal(first.ok, true);
  assert.equal(first.trade.state, "completed");
  assert.equal(first.goldA, 62);
  assert.equal(first.goldB, 38);
  assert.equal(first.audits.a.ok, true);
  assert.equal(first.audits.b.ok, true);
  assert.equal(first.audits.a.reasonType, "trade");
  let alicePebbles = 0;
  let bobPebbles = 0;
  for (let i = 0; i < first.inventoryA.items.length; i++) {
    if (first.inventoryA.items[i].itemId === "item.test_pebble") {
      alicePebbles += first.inventoryA.items[i].quantity;
    }
  }
  for (let j = 0; j < first.inventoryB.items.length; j++) {
    if (first.inventoryB.items[j].itemId === "item.test_pebble") {
      bobPebbles += first.inventoryB.items[j].quantity;
    }
  }
  assert.equal(alicePebbles, 2);
  assert.equal(bobPebbles, 3);
  const duplicate = committer({
    trade: first.trade,
    requestId: "rid-acc-b",
    userA: session.alice.userId,
    userB: session.bob.userId,
    characterA: session.alice.characterId,
    characterB: session.bob.characterId,
    inventoryA: first.inventoryA,
    inventoryB: first.inventoryB,
    goldDeltaA: 12,
    goldDeltaB: -12,
    currentGoldA: first.goldA,
    currentGoldB: first.goldB,
  });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.replay, true);
  assert.equal(duplicate.goldA, 62);
  assert.equal(duplicate.goldB, 38);
});

test("offer change clears both acceptances", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-o1",
  });
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  const acceptA = acceptTradeRevision({
    trade: offered.trade,
    actor: session.alice,
    other: session.bob,
    revision: offered.trade.revision,
    itemsById: itemsById,
    makeId: ids("n"),
    requestId: "rid-a1",
  });
  assert.equal(acceptA.trade.acceptanceRevisionByParticipant[session.alice.characterId], offered.trade.revision);
  const changed = setTradeGold({
    trade: acceptA.trade,
    actor: session.alice,
    other: session.bob,
    amount: 5,
    requestId: "rid-gold",
  });
  assert.equal(changed.trade.revision, offered.trade.revision + 1);
  assert.equal(changed.trade.acceptanceRevisionByParticipant[session.alice.characterId], 0);
  assert.equal(changed.trade.acceptanceRevisionByParticipant[session.bob.characterId], 0);
});

test("accepting a different revision is rejected", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-o",
  });
  const result = acceptTradeRevision({
    trade: offered.trade,
    actor: session.alice,
    other: session.bob,
    revision: offered.trade.revision - 1,
    itemsById: itemsById,
    makeId: ids("n"),
    requestId: "rid-bad-rev",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "revision_mismatch");
});

test("unowned item cannot be offered", () => {
  const session = openTrade();
  const result = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "missing",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-unowned",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "unowned_item");
});

test("non-tradeable item cannot be offered", () => {
  const session = openTrade(withItem("item.test_pebble", "pebble-a", 2), emptyInventory());
  const blocked = itemDefinitionsFromContent(content.items);
  blocked["item.test_pebble"] = {
    id: blocked["item.test_pebble"].id,
    maxStack: blocked["item.test_pebble"].maxStack,
    tradeable: false,
  };
  const result = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: blocked,
    requestId: "rid-gel",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "not_tradeable");
});

test("item locked by another reason cannot be offered", () => {
  const locked = setItemLock(withItem("item.test_pebble", "pebble-a", 2), "pebble-a", "quest", "q1");
  const session = openTrade(locked, emptyInventory());
  const result = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-lock",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "item_locked");
});

test("insufficient gold is rejected at offer and commit", () => {
  const session = openTrade();
  session.alice.gold = 4;
  const gold = setTradeGold({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    amount: 10,
    requestId: "rid-gold",
  });
  assert.equal(gold.ok, false);
  assert.equal(gold.code, "insufficient_gold");
  const prepared = prepareTradeCommit({
    trade: session.trade,
    actorA: session.alice,
    actorB: session.bob,
    itemsById: itemsById,
    makeId: ids("n"),
  });
  session.trade.goldOffers[session.alice.characterId] = 10;
  session.trade.acceptanceRevisionByParticipant[session.alice.characterId] = session.trade.revision;
  session.trade.acceptanceRevisionByParticipant[session.bob.characterId] = session.trade.revision;
  const commitPrep = prepareTradeCommit({
    trade: session.trade,
    actorA: session.alice,
    actorB: session.bob,
    itemsById: itemsById,
    makeId: ids("n"),
  });
  assert.equal(commitPrep.ok, false);
  assert.equal(commitPrep.code, "insufficient_gold");
  assert.equal(prepared.ok, false);
});

test("full receiving inventory blocks commit", () => {
  const aliceInv = withItem("item.test_pebble", "pebble-a", 1, 1);
  const bobInv = withItem("item.test_potion", "potion-b", 1, 1);
  const session = openTrade(aliceInv, bobInv);
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-full",
  });
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  session.trade = offered.trade;
  session.trade.acceptanceRevisionByParticipant[session.alice.characterId] = session.trade.revision;
  session.trade.acceptanceRevisionByParticipant[session.bob.characterId] = session.trade.revision;
  const prepared = prepareTradeCommit({
    trade: session.trade,
    actorA: session.alice,
    actorB: session.bob,
    itemsById: itemsById,
    makeId: ids("n"),
  });
  assert.equal(prepared.ok, false);
  assert.equal(prepared.code, "inventory_full");
});

test("one-for-one swap succeeds when both inventories are full", () => {
  const aliceInv = withItem("item.test_pebble", "pebble-a", 1, 1);
  const bobInv = withItem("item.test_potion", "potion-b", 1, 1);
  const session = openTrade(aliceInv, bobInv);
  const offerA = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-sa",
  });
  session.alice.inventory = offerA.inventoryA !== undefined ? offerA.inventoryA : session.alice.inventory;
  const offerB = setTradeOffer({
    trade: offerA.trade,
    actor: session.bob,
    other: session.alice,
    instanceId: "potion-b",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-sb",
  });
  session.bob.inventory = offerB.inventoryB !== undefined ? offerB.inventoryB : session.bob.inventory;
  offerB.trade.acceptanceRevisionByParticipant[session.alice.characterId] = offerB.trade.revision;
  offerB.trade.acceptanceRevisionByParticipant[session.bob.characterId] = offerB.trade.revision;
  const prepared = prepareTradeCommit({
    trade: offerB.trade,
    actorA: session.alice,
    actorB: session.bob,
    itemsById: itemsById,
    makeId: ids("n"),
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.inventoryA.items[0].itemId, "item.test_potion");
  assert.equal(prepared.inventoryB.items[0].itemId, "item.test_pebble");
});

test("offered items are locked against destroy", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 2,
    itemsById: itemsById,
    requestId: "rid-lock-offer",
  });
  const lockedInv = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  const pebble = lockedInv.items[0];
  assert.equal(isItemLocked(pebble), true);
  assert.equal(pebble.lockReason, TRADE_LOCK_REASON);
  const destroyed = applyDestroyItem({
    playerHealth: 100,
    inventory: lockedInv,
    equippedInstanceIds: [],
    instanceId: "pebble-a",
    requestId: "rid-destroy",
    itemsById: itemsById,
  });
  assert.equal(destroyed.ok, false);
  assert.equal(destroyed.code, "item_locked");
});

test("remove offer unlocks the instance", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-o",
  });
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  const removed = removeTradeOffer({
    trade: offered.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    requestId: "rid-r",
  });
  assert.equal(removed.ok, true);
  const unlocked = removed.inventoryA !== undefined ? removed.inventoryA : session.alice.inventory;
  assert.equal(isItemLocked(unlocked.items[0]), false);
});

test("cancel unlocks offered items", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-o",
  });
  const cancelled = cancelTrade(offered.trade, "cancelled", "rid-c");
  assert.equal(cancelled.ok, true);
  const unlocked = unlockTradeInventories(
    cancelled.trade,
    offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory,
    session.bob.inventory,
  );
  assert.equal(isItemLocked(unlocked.inventoryA.items[0]), false);
});

test("death, range, transfer, and timeout cancel a live trade", () => {
  const session = openTrade();
  session.alice.health = 0;
  assert.equal(
    cancelReasonForTick({ trade: session.trade, actorA: session.alice, actorB: session.bob, tick: 10 }),
    "player_dead",
  );
  session.alice.health = 100;
  session.bob.x = TRADE_RANGE_PX + 40;
  assert.equal(
    cancelReasonForTick({ trade: session.trade, actorA: session.alice, actorB: session.bob, tick: 10 }),
    "out_of_range",
  );
  session.bob.x = 8;
  session.alice.transferState = "pending";
  assert.equal(
    cancelReasonForTick({ trade: session.trade, actorA: session.alice, actorB: session.bob, tick: 10 }),
    "zone_transfer",
  );
  session.alice.transferState = "idle";
  assert.equal(
    cancelReasonForTick({
      trade: session.trade,
      actorA: session.alice,
      actorB: session.bob,
      tick: session.trade.expiresAtTick + 1,
    }),
    "trade_expired",
  );
});

test("disconnect beyond grace cancels the trade", () => {
  const session = openTrade();
  session.bob.online = false;
  session.trade.absentSinceTick = { bob: 5 };
  assert.equal(
    cancelReasonForTick({
      trade: session.trade,
      actorA: session.alice,
      actorB: session.bob,
      tick: 5,
    }),
    "disconnected",
  );
});

test("invite expiry cancels before accept", () => {
  const alice = actor({ userId: "alice", name: "Alice", inventory: emptyInventory() });
  const bob = actor({ userId: "bob", name: "Bob", inventory: emptyInventory(), x: 4 });
  const invited = createTradeInvite({
    tradeId: "trade-exp",
    inviter: alice,
    invitee: bob,
    tick: 1,
    nowMs: 1,
    matchId: "m",
    requestId: "rid-i",
    trades: {},
  });
  assert.equal(
    cancelReasonForTick({
      trade: invited.trade,
      actorA: alice,
      actorB: bob,
      tick: 1 + TRADE_INVITE_TTL_TICKS + 1,
    }),
    "invite_expired",
  );
});

test("already trading blocks a second invite", () => {
  const session = openTrade();
  const trades: { [id: string]: TradeRecord } = {};
  trades[session.trade.tradeId] = session.trade;
  assert.ok(findLiveTradeForCharacter(trades, session.alice.characterId) !== null);
  const third = actor({ userId: "carol", name: "Carol", inventory: emptyInventory(), x: 4 });
  const second = createTradeInvite({
    tradeId: "trade-2",
    inviter: session.alice,
    invitee: third,
    tick: 8,
    nowMs: 8,
    matchId: "m",
    requestId: "rid-2",
    trades: trades,
  });
  assert.equal(second.ok, false);
  assert.equal(second.code, "already_trading");
});

test("reserved gold reduces spendable balance", () => {
  const session = openTrade();
  session.trade.goldOffers[session.alice.characterId] = 20;
  const trades: { [id: string]: TradeRecord } = {};
  trades[session.trade.tradeId] = session.trade;
  assert.equal(reservedGoldForCharacter(trades, session.alice.characterId), 20);
  assert.equal(availableGold(50, 20), 30);
});

test("recovery retries an interrupted completion without duplicating items", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 5,
    itemsById: itemsById,
    requestId: "rid-o",
  });
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  offered.trade.acceptanceRevisionByParticipant[session.alice.characterId] = offered.trade.revision;
  offered.trade.acceptanceRevisionByParticipant[session.bob.characterId] = offered.trade.revision;
  const prepared = prepareTradeCommit({
    trade: offered.trade,
    actorA: session.alice,
    actorB: session.bob,
    itemsById: itemsById,
    makeId: ids("n"),
  });
  assert.equal(prepared.ok, true);
  offered.trade.state = "committing";
  offered.trade.commitSnapshot = {
    inventoryA: prepared.inventoryA,
    inventoryB: prepared.inventoryB,
    goldA: prepared.goldA,
    goldB: prepared.goldB,
    goldDeltaA: prepared.goldDeltaA,
    goldDeltaB: prepared.goldDeltaB,
    requestId: "rid-commit",
  };
  const committer = memoryTradeCommitter({ failOnce: true });
  const failed = recoverInterruptedTrade(offered.trade, committer, session.alice.gold, session.bob.gold);
  assert.equal(failed.ok, false);
  assert.equal(failed.code, "persist_failed");
  const recovered = recoverInterruptedTrade(offered.trade, committer, session.alice.gold, session.bob.gold);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.replay, false);
  assert.equal(recovered.trade.state, "completed");
  const again = recoverInterruptedTrade(recovered.trade, committer, recovered.goldA, recovered.goldB);
  assert.equal(again.ok, true);
  assert.equal(again.replay, true);
  let bobPebbles = 0;
  for (let i = 0; i < recovered.inventoryB.items.length; i++) {
    if (recovered.inventoryB.items[i].itemId === "item.test_pebble") {
      bobPebbles += recovered.inventoryB.items[i].quantity;
    }
  }
  assert.equal(bobPebbles, 5);
  assert.equal(recovered.inventoryA.items.length, 0);
});

test("duplicate accept requestId after mutual accept does not mutate again", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-o",
  });
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  const acceptA = acceptTradeRevision({
    trade: offered.trade,
    actor: session.alice,
    other: session.bob,
    revision: offered.trade.revision,
    itemsById: itemsById,
    makeId: ids("n"),
    requestId: "rid-aa",
  });
  const acceptB = acceptTradeRevision({
    trade: acceptA.trade,
    actor: session.bob,
    other: session.alice,
    revision: acceptA.trade.revision,
    itemsById: itemsById,
    makeId: ids("n"),
    requestId: "rid-ab",
  });
  assert.equal(acceptB.shouldCommit, true);
  const replay = acceptTradeRevision({
    trade: acceptB.trade,
    actor: session.bob,
    other: session.alice,
    revision: acceptB.trade.revision,
    itemsById: itemsById,
    makeId: ids("n"),
    requestId: "rid-ab",
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.replay, true);
});

test("committing trades are not cancelled by death and player cancel is rejected", () => {
  const session = openTrade();
  session.trade.state = "committing";
  session.alice.health = 0;
  assert.equal(
    cancelReasonForTick({ trade: session.trade, actorA: session.alice, actorB: session.bob, tick: 10 }),
    "",
  );
  const cancelled = cancelTrade(session.trade, "cancelled", "rid-cancel1");
  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.code, "already_trading");
  assert.equal(cancelled.trade.state, "committing");
});

test("consume of a locked stack fails without consuming unlocked stacks of the same item", () => {
  let inventory = withItem("item.test_pebble", "pebble-lock", 2);
  inventory = setItemLock(inventory, "pebble-lock", TRADE_LOCK_REASON, "trade-1");
  assert.equal(consumeItem(inventory, "item.test_pebble", 1), null);
  assert.equal(inventory.items[0].quantity, 2);
});

function emptyZone(): StarterZoneState {
  const zone = createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
      attack: content.player.attack,
      attackRange: content.player.attackRange,
      attackCooldown: content.player.attackCooldown,
    },
    questDefinitionsFromContent(content.quests),
    itemsById,
  );
  zone.matchId = "match-trade-1";
  return zone;
}

function playerAt(userId: string, name: string, x: number, inventory: PlayerInventory, gold = 50): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    x: x,
    y: 0,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: inventory,
    gold: gold,
  };
}

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function tradeMsg(userId: string, opcode: number, extra: { [key: string]: unknown }) {
  return { opcode: opcode, raw: envelope(extra), userId: userId };
}

function actionBodies(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound.filter((item) => item.opcode === ServerOpcode.ACTION_RESULT).map((item) => JSON.parse(item.body));
}

function twoPlayers(): StarterZoneState {
  let state = emptyZone();
  state = addPlayer(state, playerAt("alice", "Alice", 0, withItem("item.test_pebble", "pebble-a", 5)));
  state = addPlayer(state, playerAt("bob", "Bob", 10, withItem("item.test_potion", "potion-b", 2)));
  return state;
}

function makeIds(): () => string {
  return ids("tradeid");
}

test("match loop invite decline and death cancel", () => {
  let state = twoPlayers();
  const invited = applyMatchLoop(
    state,
    2,
    contentHash,
    [tradeMsg("alice", ClientOpcode.TRADE_INVITE, { targetId: "bob", requestId: "rid-inv0001" })],
    makeIds(),
  );
  const okInvite = actionBodies(invited).find((body) => body.code === "ok");
  assert.ok(okInvite !== undefined);
  const tradeId = String(okInvite.tradeId);
  assert.equal(invited.state.trades !== undefined && invited.state.trades[tradeId] !== undefined, true);
  assert.equal(invited.state.trades[tradeId].state, "inviting");
  const declined = applyMatchLoop(
    invited.state,
    3,
    contentHash,
    [tradeMsg("bob", ClientOpcode.TRADE_DECLINE_INVITE, { tradeId: tradeId, requestId: "rid-dec0001" })],
    makeIds(),
  );
  assert.equal(declined.state.trades[tradeId].state, "cancelled");
  state = twoPlayers();
  const second = applyMatchLoop(
    state,
    2,
    contentHash,
    [tradeMsg("alice", ClientOpcode.TRADE_INVITE, { targetId: "bob", requestId: "rid-inv0002" })],
    makeIds(),
  );
  const secondId = String(actionBodies(second).find((body) => body.code === "ok").tradeId);
  const accepted = applyMatchLoop(
    second.state,
    3,
    contentHash,
    [tradeMsg("bob", ClientOpcode.TRADE_ACCEPT_INVITE, { tradeId: secondId, requestId: "rid-acc0001" })],
    makeIds(),
  );
  assert.equal(accepted.state.trades[secondId].state, "open");
  accepted.state.players["alice"].health = 0;
  const afterDeath = applyMatchLoop(accepted.state, 4, contentHash, [], makeIds());
  assert.equal(afterDeath.state.trades[secondId].state, "cancelled");
  assert.equal(afterDeath.state.trades[secondId].cancelReason, "player_dead");
});

test("match loop item and gold trade commits once and recovers persist failure", () => {
  let state = twoPlayers();
  const committer = memoryTradeCommitter({ failTimes: 2 });
  const invited = applyMatchLoop(
    state,
    2,
    contentHash,
    [tradeMsg("alice", ClientOpcode.TRADE_INVITE, { targetId: "bob", requestId: "rid-inv0003" })],
    makeIds(),
    undefined,
    undefined,
    committer,
  );
  const tradeId = String(actionBodies(invited).find((body) => body.code === "ok").tradeId);
  let next = applyMatchLoop(
    invited.state,
    3,
    contentHash,
    [tradeMsg("bob", ClientOpcode.TRADE_ACCEPT_INVITE, { tradeId: tradeId, requestId: "rid-acc0002" })],
    makeIds(),
    undefined,
    undefined,
    committer,
  ).state;
  next = applyMatchLoop(
    next,
    4,
    contentHash,
    [
      tradeMsg("alice", ClientOpcode.TRADE_SET_OFFER, {
        tradeId: tradeId,
        instanceId: "pebble-a",
        quantity: 3,
        requestId: "rid-off0001",
      }),
    ],
    makeIds(),
    undefined,
    undefined,
    committer,
  ).state;
  next = applyMatchLoop(
    next,
    5,
    contentHash,
    [tradeMsg("bob", ClientOpcode.TRADE_SET_GOLD, { tradeId: tradeId, amount: 12, requestId: "rid-gld0001" })],
    makeIds(),
    undefined,
    undefined,
    committer,
  ).state;
  const firstAccept = applyMatchLoop(
    next,
    6,
    contentHash,
    [
      tradeMsg("alice", ClientOpcode.TRADE_ACCEPT_REVISION, {
        tradeId: tradeId,
        revision: next.trades[tradeId].revision,
        requestId: "rid-aa00001",
      }),
    ],
    makeIds(),
    undefined,
    undefined,
    committer,
  );
  const secondAccept = applyMatchLoop(
    firstAccept.state,
    7,
    contentHash,
    [
      tradeMsg("bob", ClientOpcode.TRADE_ACCEPT_REVISION, {
        tradeId: tradeId,
        revision: firstAccept.state.trades[tradeId].revision,
        requestId: "rid-ab00001",
      }),
    ],
    makeIds(),
    undefined,
    undefined,
    committer,
  );
  assert.equal(secondAccept.state.trades[tradeId].state, "committing");
  const recovered = applyMatchLoop(secondAccept.state, 8, contentHash, [], makeIds(), undefined, undefined, committer);
  assert.equal(recovered.state.trades[tradeId].state, "completed");
  assert.equal(recovered.state.players["alice"].gold, 62);
  assert.equal(recovered.state.players["bob"].gold, 38);
  const duplicate = applyMatchLoop(
    recovered.state,
    9,
    contentHash,
    [
      tradeMsg("bob", ClientOpcode.TRADE_ACCEPT_REVISION, {
        tradeId: tradeId,
        revision: recovered.state.trades[tradeId].revision,
        requestId: "rid-ab00001",
      }),
    ],
    makeIds(),
    undefined,
    undefined,
    committer,
  );
  assert.equal(duplicate.state.players["alice"].gold, 62);
  assert.equal(duplicate.state.players["bob"].gold, 38);
  let bobPebbles = 0;
  const bobItems = duplicate.state.players["bob"].inventory !== undefined ? duplicate.state.players["bob"].inventory.items : [];
  for (let i = 0; i < bobItems.length; i++) {
    if (bobItems[i].itemId === "item.test_pebble") {
      bobPebbles += bobItems[i].quantity;
    }
  }
  assert.equal(bobPebbles, 3);
});

test("match loop disconnect beyond grace cancels an open trade", () => {
  let state = twoPlayers();
  const invited = applyMatchLoop(
    state,
    2,
    contentHash,
    [tradeMsg("alice", ClientOpcode.TRADE_INVITE, { targetId: "bob", requestId: "rid-inv0004" })],
    makeIds(),
  );
  const tradeId = String(actionBodies(invited).find((body) => body.code === "ok").tradeId);
  const accepted = applyMatchLoop(
    invited.state,
    3,
    contentHash,
    [tradeMsg("bob", ClientOpcode.TRADE_ACCEPT_INVITE, { tradeId: tradeId, requestId: "rid-acc0003" })],
    makeIds(),
  );
  const left = applyPlayerLeave(accepted.state, "bob", 4);
  const cancelled = applyMatchLoop(left.state, 5, contentHash, [], makeIds());
  assert.equal(cancelled.state.trades[tradeId].state, "cancelled");
  assert.equal(cancelled.state.trades[tradeId].cancelReason, "link_dead");
});

test("match loop player removal cancels an open trade as disconnected", () => {
  let state = twoPlayers();
  const invited = applyMatchLoop(
    state,
    2,
    contentHash,
    [tradeMsg("alice", ClientOpcode.TRADE_INVITE, { targetId: "bob", requestId: "rid-inv0004b" })],
    makeIds(),
  );
  const tradeId = String(actionBodies(invited).find((body) => body.code === "ok").tradeId);
  const accepted = applyMatchLoop(
    invited.state,
    3,
    contentHash,
    [tradeMsg("bob", ClientOpcode.TRADE_ACCEPT_INVITE, { tradeId: tradeId, requestId: "rid-acc0003b" })],
    makeIds(),
  );
  delete accepted.state.players["bob"];
  const cancelled = applyMatchLoop(accepted.state, 5, contentHash, [], makeIds());
  assert.equal(cancelled.state.trades[tradeId].state, "cancelled");
  assert.equal(cancelled.state.trades[tradeId].cancelReason, "disconnected");
});

test("match loop transfer cancels an open trade", () => {
  let state = twoPlayers();
  const invited = applyMatchLoop(
    state,
    2,
    contentHash,
    [tradeMsg("alice", ClientOpcode.TRADE_INVITE, { targetId: "bob", requestId: "rid-inv0005" })],
    makeIds(),
  );
  const tradeId = String(actionBodies(invited).find((body) => body.code === "ok").tradeId);
  const accepted = applyMatchLoop(
    invited.state,
    3,
    contentHash,
    [tradeMsg("bob", ClientOpcode.TRADE_ACCEPT_INVITE, { tradeId: tradeId, requestId: "rid-acc0004" })],
    makeIds(),
  );
  accepted.state.players["alice"].transferState = "issued";
  const transferred = applyMatchLoop(accepted.state, 4, contentHash, [], makeIds());
  assert.equal(transferred.state.trades[tradeId].state, "cancelled");
  assert.equal(transferred.state.trades[tradeId].cancelReason, "zone_transfer");
});

function bagOfStacks(count: number, itemId = "item.test_pebble"): PlayerInventory {
  const inventory = emptyInventory(30);
  for (let i = 0; i < count; i++) {
    inventory.items.push(makeInstance("stack-" + String(i), itemId, 1, i));
  }
  inventory.revision = 1;
  return inventory;
}

test("twenty offer slots are accepted and the twenty-first is rejected", () => {
  const session = openTrade(bagOfStacks(21), emptyInventory(30));
  let trade = session.trade;
  for (let i = 0; i < TRADE_OFFER_SLOTS; i++) {
    const offered = setTradeOffer({
      trade: trade,
      actor: session.alice,
      other: session.bob,
      instanceId: "stack-" + String(i),
      quantity: 1,
      itemsById: itemsById,
      requestId: "rid-slot-" + String(i),
      slotIndex: i,
    });
    assert.equal(offered.ok, true);
    trade = offered.trade;
    session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  }
  assert.equal(trade.offers[session.alice.characterId].length, TRADE_OFFER_SLOTS);
  const extra = setTradeOffer({
    trade: trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "stack-20",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-slot-21",
  });
  assert.equal(extra.ok, false);
  assert.equal(extra.code, "offer_full");
  const published = publicTrade(trade, itemsById);
  const aliceOffers = published.offers as { [id: string]: Array<{ [key: string]: unknown }> };
  assert.equal(published.offerSlots, TRADE_OFFER_SLOTS);
  assert.equal(aliceOffers[session.alice.characterId].length, TRADE_OFFER_SLOTS);
  assert.equal(aliceOffers[session.alice.characterId][0].lockId, "trade-1");
  assert.equal(aliceOffers[session.alice.characterId][0].slotIndex, 0);
});

test("full-stack and partial-stack offers lock the source without moving ownership", () => {
  const session = openTrade();
  const partial = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 2,
    itemsById: itemsById,
    requestId: "rid-partial",
  });
  assert.equal(partial.ok, true);
  const locked = partial.inventoryA !== undefined ? partial.inventoryA : session.alice.inventory;
  assert.equal(locked.items[0].quantity, 5);
  assert.equal(locked.items[0].lockQuantity, 2);
  assert.equal(isItemLocked(locked.items[0]), true);
  let bobHas = false;
  for (let i = 0; i < session.bob.inventory.items.length; i++) {
    if (session.bob.inventory.items[i].instanceId === "pebble-a") {
      bobHas = true;
    }
  }
  assert.equal(bobHas, false);
  session.alice.inventory = locked;
  const full = setTradeOffer({
    trade: partial.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 5,
    itemsById: itemsById,
    requestId: "rid-full-stack",
  });
  assert.equal(full.ok, true);
  assert.equal(full.trade.offers[session.alice.characterId][0].quantity, 5);
  const stillAlice = full.inventoryA !== undefined ? full.inventoryA : locked;
  assert.equal(stillAlice.items[0].quantity, 5);
  assert.equal(stillAlice.items[0].instanceId, "pebble-a");
});

test("inventory capacity mutation clears acceptances while preserving valid offers", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-mut-o",
  });
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  const acceptA = acceptTradeRevision({
    trade: offered.trade,
    actor: session.alice,
    other: session.bob,
    revision: offered.trade.revision,
    itemsById: itemsById,
    makeId: ids("n"),
    requestId: "rid-mut-a",
  });
  assert.equal(acceptA.trade.acceptanceRevisionByParticipant[session.alice.characterId], offered.trade.revision);
  session.alice.inventory.items.push(makeInstance("extra-1", "item.test_potion", 1, 8));
  session.alice.inventory.revision += 1;
  const synced = reconcileOpenTrade({
    trade: acceptA.trade,
    actorA: session.alice,
    actorB: session.bob,
  });
  assert.ok(synced !== null);
  assert.equal(synced !== null && synced.trade.acceptanceRevisionByParticipant[session.alice.characterId], 0);
  assert.equal(synced !== null && synced.trade.acceptanceRevisionByParticipant[session.bob.characterId], 0);
  assert.equal(synced !== null && synced.trade.offers[session.alice.characterId][0].instanceId, "pebble-a");
  assert.equal(synced !== null && synced.trade.state, "open");
});

test("source quantity recovery reduces the offer and clears acceptance", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 4,
    itemsById: itemsById,
    requestId: "rid-qty-o",
  });
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  offered.trade.acceptanceRevisionByParticipant[session.alice.characterId] = offered.trade.revision;
  offered.trade.acceptanceRevisionByParticipant[session.bob.characterId] = offered.trade.revision;
  session.alice.inventory.items[0].quantity = 2;
  session.alice.inventory.revision += 1;
  const synced = reconcileOpenTrade({
    trade: offered.trade,
    actorA: session.alice,
    actorB: session.bob,
  });
  assert.ok(synced !== null);
  assert.equal(synced !== null && synced.trade.offers[session.alice.characterId][0].quantity, 2);
  assert.equal(synced !== null && synced.trade.acceptanceRevisionByParticipant[session.alice.characterId], 0);
});

test("invalidated source item cancels the trade and releases locks", () => {
  const session = openTrade();
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-inv-o",
  });
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  session.alice.inventory.items = [];
  session.alice.inventory.revision += 1;
  const synced = reconcileOpenTrade({
    trade: offered.trade,
    actorA: session.alice,
    actorB: session.bob,
  });
  assert.ok(synced !== null);
  assert.equal(synced !== null && synced.trade.state, "cancelled");
  assert.equal(synced !== null && synced.trade.cancelReason, "unowned_item");
});

test("commit failure for full bags keeps the trade open and clears acceptances", () => {
  const aliceInv = withItem("item.test_pebble", "pebble-a", 1, 1);
  const bobInv = withItem("item.test_potion", "potion-b", 1, 1);
  const session = openTrade(aliceInv, bobInv);
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-keep-o",
  });
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  const acceptA = acceptTradeRevision({
    trade: offered.trade,
    actor: session.alice,
    other: session.bob,
    revision: offered.trade.revision,
    itemsById: itemsById,
    makeId: ids("n"),
    requestId: "rid-keep-a",
  });
  const acceptB = acceptTradeRevision({
    trade: acceptA.trade,
    actor: session.bob,
    other: session.alice,
    revision: acceptA.trade.revision,
    itemsById: itemsById,
    makeId: ids("n"),
    requestId: "rid-keep-b",
  });
  assert.equal(acceptB.ok, false);
  assert.equal(acceptB.code, "inventory_full");
  assert.equal(acceptB.shouldCommit, undefined);
  assert.equal(acceptB.trade.state, "open");
  assert.equal(acceptB.trade.acceptanceRevisionByParticipant[session.alice.characterId], 0);
  assert.equal(acceptB.trade.acceptanceRevisionByParticipant[session.bob.characterId], 0);
  assert.equal(acceptB.trade.offers[session.alice.characterId][0].instanceId, "pebble-a");
});

test("outgoing items free space so a full bag can still receive", () => {
  const aliceInv = withItem("item.test_pebble", "pebble-a", 1, 30);
  for (let i = 1; i < 30; i++) {
    aliceInv.items.push(makeInstance("alice-fill-" + String(i), "item.training_sword", 1, i));
  }
  const bobInv = withItem("item.test_potion", "potion-b", 1, 30);
  for (let i = 1; i < 30; i++) {
    bobInv.items.push(makeInstance("bob-fill-" + String(i), "item.training_sword", 1, i));
  }
  const session = openTrade(aliceInv, bobInv);
  const offerA = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-free-a",
  });
  session.alice.inventory = offerA.inventoryA !== undefined ? offerA.inventoryA : session.alice.inventory;
  const offerB = setTradeOffer({
    trade: offerA.trade,
    actor: session.bob,
    other: session.alice,
    instanceId: "potion-b",
    quantity: 1,
    itemsById: itemsById,
    requestId: "rid-free-b",
  });
  session.bob.inventory = offerB.inventoryB !== undefined ? offerB.inventoryB : session.bob.inventory;
  offerB.trade.acceptanceRevisionByParticipant[session.alice.characterId] = offerB.trade.revision;
  offerB.trade.acceptanceRevisionByParticipant[session.bob.characterId] = offerB.trade.revision;
  const prepared = prepareTradeCommit({
    trade: offerB.trade,
    actorA: session.alice,
    actorB: session.bob,
    itemsById: itemsById,
    makeId: ids("n"),
  });
  assert.equal(prepared.ok, true);
});

test("stack merge during trade fits a full receiving bag", () => {
  const aliceInv = withItem("item.test_pebble", "pebble-a", 5, 30);
  const bobInv = withItem("item.test_pebble", "pebble-b", 10, 30);
  for (let i = 1; i < 30; i++) {
    bobInv.items.push(makeInstance("bob-block-" + String(i), "item.test_potion", 1, i));
  }
  const session = openTrade(aliceInv, bobInv);
  const offered = setTradeOffer({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    instanceId: "pebble-a",
    quantity: 5,
    itemsById: itemsById,
    requestId: "rid-merge-o",
  });
  session.alice.inventory = offered.inventoryA !== undefined ? offered.inventoryA : session.alice.inventory;
  offered.trade.acceptanceRevisionByParticipant[session.alice.characterId] = offered.trade.revision;
  offered.trade.acceptanceRevisionByParticipant[session.bob.characterId] = offered.trade.revision;
  const prepared = prepareTradeCommit({
    trade: offered.trade,
    actorA: session.alice,
    actorB: session.bob,
    itemsById: itemsById,
    makeId: ids("n"),
  });
  assert.equal(prepared.ok, true);
  let bobPebbles = 0;
  for (let i = 0; i < prepared.inventoryB.items.length; i++) {
    if (prepared.inventoryB.items[i].itemId === "item.test_pebble") {
      bobPebbles += prepared.inventoryB.items[i].quantity;
    }
  }
  assert.equal(bobPebbles, 15);
});

test("link-dead participants cancel an open trade", () => {
  const session = openTrade();
  session.bob.linkDead = true;
  session.bob.online = true;
  assert.equal(
    cancelReasonForTick({ trade: session.trade, actorA: session.alice, actorB: session.bob, tick: 10 }),
    "link_dead",
  );
});

test("changed gold after reservation is rejected at commit without transferring", () => {
  const session = openTrade();
  const gold = setTradeGold({
    trade: session.trade,
    actor: session.alice,
    other: session.bob,
    amount: 20,
    requestId: "rid-gold-later",
  });
  gold.trade.acceptanceRevisionByParticipant[session.alice.characterId] = gold.trade.revision;
  gold.trade.acceptanceRevisionByParticipant[session.bob.characterId] = gold.trade.revision;
  session.alice.gold = 5;
  const prepared = prepareTradeCommit({
    trade: gold.trade,
    actorA: session.alice,
    actorB: session.bob,
    itemsById: itemsById,
    makeId: ids("n"),
  });
  assert.equal(prepared.ok, false);
  assert.equal(prepared.code, "insufficient_gold");
  assert.equal(prepared.goldDeltaA, 0);
  assert.equal(prepared.inventoryA.items[0].instanceId, "pebble-a");
});

test("match loop rejects a twenty-first offer and link-dead cancels", () => {
  let state = twoPlayers();
  const invited = applyMatchLoop(
    state,
    2,
    contentHash,
    [tradeMsg("alice", ClientOpcode.TRADE_INVITE, { targetId: "bob", requestId: "rid-inv0020" })],
    makeIds(),
  );
  const tradeId = String(actionBodies(invited).find((body) => body.code === "ok").tradeId);
  let next = applyMatchLoop(
    invited.state,
    3,
    contentHash,
    [tradeMsg("bob", ClientOpcode.TRADE_ACCEPT_INVITE, { tradeId: tradeId, requestId: "rid-acc0020" })],
    makeIds(),
  ).state;
  const aliceInv = bagOfStacks(21);
  next.players["alice"].inventory = aliceInv;
  for (let i = 0; i < TRADE_OFFER_SLOTS; i++) {
    next = applyMatchLoop(
      next,
      4 + i * 2,
      contentHash,
      [
        tradeMsg("alice", ClientOpcode.TRADE_SET_OFFER, {
          tradeId: tradeId,
          instanceId: "stack-" + String(i),
          quantity: 1,
          slotIndex: i,
          requestId: "rid-off20-" + String(i).padStart(2, "0"),
        }),
      ],
      makeIds(),
    ).state;
  }
  const overflow = applyMatchLoop(
    next,
    50,
    contentHash,
    [
      tradeMsg("alice", ClientOpcode.TRADE_SET_OFFER, {
        tradeId: tradeId,
        instanceId: "stack-20",
        quantity: 1,
        requestId: "rid-off20-xx",
      }),
    ],
    makeIds(),
  );
  const failed = actionBodies(overflow).find((body) => body.code === "offer_full");
  assert.ok(failed !== undefined);
  overflow.state.players["bob"].linkDead = true;
  const afterLink = applyMatchLoop(overflow.state, 51, contentHash, [], makeIds());
  assert.equal(afterLink.state.trades[tradeId].state, "cancelled");
  assert.equal(afterLink.state.trades[tradeId].cancelReason, "link_dead");
});
