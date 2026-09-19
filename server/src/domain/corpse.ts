import { distance } from "./movement";
import {
  cloneInventory,
  effectiveMaxStack,
  emptyInventory,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import { applyCapacityPlan, planCapacity, type IncomingStack } from "./item_capacity";
import {
  ITEM_ERROR_INVENTORY_FULL,
  ITEM_ERROR_INVALID_SLOT,
  ITEM_ERROR_STACK_INCOMPATIBLE,
  staleRevisionCode,
} from "./item_errors";
import { beginAcquisitionIntent, completeAcquisitionIntent } from "./item_txn";
import { applyGoldMutation, emptyGoldLedger, type GoldLedger } from "./wallet";
import { TX_REASON_LOOT } from "./transaction";
import { defaultGroupCreditRules, type GroupCreditRules } from "./party";
import {
  cloneEncounterPresence,
  cloneEncounterRoster,
  type EncounterPresence,
  type EncounterRosterMember,
} from "./enemy_tag";
import type { LootDrop } from "./loot";
import { dict } from "./maps";

export const CORPSE_PRIVATE_SEC = 60;
export const CORPSE_EXPIRE_SEC = 300;
export const ERROR_LOOT_ITEM_NO_LONGER_AVAILABLE = "loot_item_no_longer_available";
export const ERROR_NOT_ELIGIBLE = "not_eligible";
export const ERROR_CORPSE_MISSING = "invalid_target";

export type CorpseEntryState =
  | "PRIVATE_AVAILABLE"
  | "ROLL_PENDING"
  | "CLAIMING"
  | "AWARDED_PENDING_PICKUP"
  | "PUBLIC_AVAILABLE"
  | "CLAIMED"
  | "EXPIRED";

export type CorpseContainerState = "ACTIVE" | "EXPIRED" | "REMOVED";

export interface DeathEligibleMember {
  characterId: string;
  userId: string;
}

export interface CorpseItemEntry {
  entryId: string;
  itemId: string;
  quantity: number;
  instanceId: string;
  state: CorpseEntryState;
  reservedToCharacterId: string;
  claimedByCharacterId: string;
}

export interface GoldShareRecord {
  characterId: string;
  userId: string;
  amount: number;
  completed: boolean;
  persisted: boolean;
  requestId: string;
}

export interface GoldDistributionRecord {
  requestId: string;
  recipients: GoldShareRecord[];
  complete: boolean;
}

export interface CorpseClaimRecord {
  ok: boolean;
  code: string;
  kind: "item" | "gold" | "open" | "close" | "loot_all";
  inventory?: PlayerInventory;
  gold?: number;
  goldDelta?: number;
  goldShares?: GoldShareRecord[];
  lootAll?: LootAllEntryResult[];
}

export interface LootAllEntryResult {
  entryId: string;
  kind: "item" | "gold";
  code: string;
  claimed: boolean;
}

export interface CorpseLootContainer {
  corpseId: string;
  enemyInstanceId: string;
  enemyId: string;
  zoneId: string;
  matchId: string;
  x: number;
  y: number;
  tagOwnerCharacterId: string;
  tagOwnerUserId: string;
  tagPartyId: string;
  encounterRoster: EncounterRosterMember[];
  deathEligibleRoster: DeathEligibleMember[];
  items: CorpseItemEntry[];
  goldAmount: number;
  goldState: CorpseEntryState;
  goldDistribution?: GoldDistributionRecord;
  privateUntilTick: number;
  expiresAtTick: number;
  publicTransitionDone: boolean;
  revision: number;
  state: CorpseContainerState;
  createdTick: number;
  viewerUserIds: string[];
  claimByRequestId: { [requestId: string]: CorpseClaimRecord };
}

export interface GeneratedLootPile {
  items: Array<{ itemId: string; quantity: number; instanceId: string }>;
  gold: number;
}

export function corpsePrivateTicks(tickRate: number): number {
  return Math.round(CORPSE_PRIVATE_SEC * tickRate);
}

export function corpseExpireTicks(tickRate: number): number {
  return Math.round(CORPSE_EXPIRE_SEC * tickRate);
}

export function splitGeneratedStacks(
  itemId: string,
  quantity: number,
  definition: ItemDefinition | undefined,
  newId: () => string,
): Array<{ itemId: string; quantity: number; instanceId: string }> {
  const list: Array<{ itemId: string; quantity: number; instanceId: string }> = [];
  if (quantity < 1 || itemId.length === 0) {
    return list;
  }
  const maxStack = definition !== undefined ? effectiveMaxStack(definition) : 1;
  let remaining = quantity;
  while (remaining > 0) {
    const take = remaining > maxStack ? maxStack : remaining;
    list.push({ itemId: itemId, quantity: take, instanceId: newId() });
    remaining -= take;
  }
  return list;
}

export function generateCorpseLoot(
  drops: ReadonlyArray<LootDrop>,
  itemsById: { [id: string]: ItemDefinition },
  newId: () => string,
): GeneratedLootPile {
  const items: Array<{ itemId: string; quantity: number; instanceId: string }> = [];
  let gold = 0;
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    if (drop.kind === "gold") {
      gold += drop.quantity > 0 ? drop.quantity : 0;
      continue;
    }
    if (typeof drop.itemId !== "string" || drop.itemId.length === 0) {
      continue;
    }
    const stacks = splitGeneratedStacks(drop.itemId, drop.quantity > 0 ? drop.quantity : 1, itemsById[drop.itemId], newId);
    for (let s = 0; s < stacks.length; s++) {
      items.push(stacks[s]);
    }
  }
  return { items: items, gold: gold };
}

export function rarityRank(rarity: string): number {
  if (rarity === "rarity.poor") {
    return 0;
  }
  if (rarity === "rarity.common") {
    return 1;
  }
  if (rarity === "rarity.uncommon") {
    return 2;
  }
  if (rarity === "rarity.rare") {
    return 3;
  }
  if (rarity === "rarity.epic") {
    return 4;
  }
  if (rarity === "rarity.legendary") {
    return 5;
  }
  return 1;
}

export function qualifiesForNeedGreed(definition: ItemDefinition | undefined, partySize: number): boolean {
  if (definition === undefined || partySize < 2) {
    return false;
  }
  if (definition.questItem === true) {
    return false;
  }
  return rarityRank(definition.rarity !== undefined ? definition.rarity : "rarity.common") >= 2;
}

export function buildDeathEligibleRoster(input: {
  roster: ReadonlyArray<EncounterRosterMember>;
  presence: { [characterId: string]: EncounterPresence } | undefined;
  players: { [userId: string]: { userId: string; characterId: string; x: number; y: number; health: number; lastDeathTick?: number } };
  disconnected: { [userId: string]: { player: { userId: string; characterId: string; x: number; y: number; health: number; lastDeathTick?: number } } };
  enemyX: number;
  enemyY: number;
  tick: number;
  tickRate: number;
  rules?: GroupCreditRules;
}): DeathEligibleMember[] {
  const rules = input.rules !== undefined ? input.rules : defaultGroupCreditRules();
  const eligible: DeathEligibleMember[] = [];
  const presence = dict(input.presence);
  for (let i = 0; i < input.roster.length; i++) {
    const member = input.roster[i];
    const live = findParticipant(input.players, input.disconnected, member.userId, member.characterId);
    const row = presence[member.characterId];
    if (live === null && (row === undefined || row.departedMatch === true)) {
      continue;
    }
    const x = live !== null ? live.x : row !== undefined ? row.lastX : 0;
    const y = live !== null ? live.y : row !== undefined ? row.lastY : 0;
    const health = live !== null ? live.health : 0;
    const lastDeathTick =
      live !== null && live.lastDeathTick !== undefined
        ? live.lastDeathTick
        : row !== undefined
          ? row.lastDeathTick
          : -1;
    if (!inCreditRange(x, y, input.enemyX, input.enemyY, rules.rangePx) && !recentlyDead(health, lastDeathTick, input.tick, input.tickRate, rules.recentlyActiveAfterDeathMs)) {
      continue;
    }
    eligible.push({ characterId: member.characterId, userId: member.userId });
  }
  eligible.sort(function (a, b) {
    if (a.characterId < b.characterId) {
      return -1;
    }
    if (a.characterId > b.characterId) {
      return 1;
    }
    return 0;
  });
  return eligible;
}

export function createCorpse(input: {
  corpseId: string;
  enemyInstanceId: string;
  enemyId: string;
  zoneId: string;
  matchId: string;
  x: number;
  y: number;
  tick: number;
  tickRate: number;
  tagOwnerCharacterId: string;
  tagOwnerUserId: string;
  tagPartyId: string;
  encounterRoster: EncounterRosterMember[];
  deathEligibleRoster: DeathEligibleMember[];
  loot: GeneratedLootPile;
  itemsById: { [id: string]: ItemDefinition };
  newId: () => string;
}): CorpseLootContainer {
  const partyTagged = input.tagPartyId.length > 0 && input.encounterRoster.length >= 2;
  const eligibleCount = input.deathEligibleRoster.length;
  const items: CorpseItemEntry[] = [];
  for (let i = 0; i < input.loot.items.length; i++) {
    const stack = input.loot.items[i];
    const definition = input.itemsById[stack.itemId];
    const rolling =
      partyTagged &&
      qualifiesForNeedGreed(definition, input.encounterRoster.length) &&
      eligibleCount >= 2;
    items.push({
      entryId: input.newId(),
      itemId: stack.itemId,
      quantity: stack.quantity,
      instanceId: stack.instanceId,
      state: rolling ? "ROLL_PENDING" : "PRIVATE_AVAILABLE",
      reservedToCharacterId: "",
      claimedByCharacterId: "",
    });
  }
  const gold = input.loot.gold > 0 ? input.loot.gold : 0;
  return {
    corpseId: input.corpseId,
    enemyInstanceId: input.enemyInstanceId,
    enemyId: input.enemyId,
    zoneId: input.zoneId,
    matchId: input.matchId,
    x: input.x,
    y: input.y,
    tagOwnerCharacterId: input.tagOwnerCharacterId,
    tagOwnerUserId: input.tagOwnerUserId,
    tagPartyId: input.tagPartyId,
    encounterRoster: cloneEncounterRoster(input.encounterRoster),
    deathEligibleRoster: cloneEligible(input.deathEligibleRoster),
    items: items,
    goldAmount: gold,
    goldState: gold > 0 ? "PRIVATE_AVAILABLE" : "CLAIMED",
    privateUntilTick: input.tick + corpsePrivateTicks(input.tickRate),
    expiresAtTick: input.tick + corpseExpireTicks(input.tickRate),
    publicTransitionDone: false,
    revision: 1,
    state: "ACTIVE",
    createdTick: input.tick,
    viewerUserIds: [],
    claimByRequestId: {},
  };
}

export function corpseIsEmpty(corpse: CorpseLootContainer): boolean {
  if (corpse.goldAmount > 0 && corpse.goldState !== "CLAIMED" && corpse.goldState !== "EXPIRED") {
    return false;
  }
  for (let i = 0; i < corpse.items.length; i++) {
    const state = corpse.items[i].state;
    if (state !== "CLAIMED" && state !== "EXPIRED") {
      return false;
    }
  }
  return true;
}

export function tickCorpses(
  corpses: CorpseLootContainer[],
  tick: number,
  goldLedger?: GoldLedger,
  goldByUser?: { [userId: string]: number },
): {
  corpses: CorpseLootContainer[];
  removed: string[];
  updated: string[];
  goldByUser: { [userId: string]: number };
} {
  const next: CorpseLootContainer[] = [];
  const removed: string[] = [];
  const updated: string[] = [];
  let nextGold = dict(goldByUser);
  for (let i = 0; i < corpses.length; i++) {
    const corpse = cloneCorpse(corpses[i]);
    if (corpse.state === "REMOVED") {
      removed.push(corpse.corpseId);
      continue;
    }
    let changed = false;
    if (tick >= corpse.expiresAtTick && corpse.state === "ACTIVE") {
      expireCorpse(corpse);
      changed = true;
    } else if (tick >= corpse.privateUntilTick && corpse.publicTransitionDone !== true && corpse.state === "ACTIVE") {
      applyPublicTransition(corpse);
      changed = true;
    }
    if (corpse.goldDistribution !== undefined && corpse.goldDistribution.complete !== true) {
      nextGold = retryGoldDistribution(corpse, goldLedger, nextGold);
      changed = true;
    }
    if (corpseIsEmpty(corpse) && corpse.state === "ACTIVE") {
      corpse.state = "REMOVED";
      corpse.revision += 1;
      changed = true;
    }
    if (corpse.state === "REMOVED" || corpse.state === "EXPIRED") {
      if (changed) {
        updated.push(corpse.corpseId);
      }
      removed.push(corpse.corpseId);
      continue;
    }
    next.push(corpse);
    if (changed) {
      updated.push(corpse.corpseId);
    }
  }
  return { corpses: next, removed: removed, updated: updated, goldByUser: nextGold };
}

export function resolvePendingRollsAtPublicBoundary(corpse: CorpseLootContainer): void {
  for (let i = 0; i < corpse.items.length; i++) {
    const entry = corpse.items[i];
    if (entry.state === "ROLL_PENDING") {
      entry.state = "PUBLIC_AVAILABLE";
      entry.reservedToCharacterId = "";
    }
  }
}

export function applyPublicTransition(corpse: CorpseLootContainer): void {
  resolvePendingRollsAtPublicBoundary(corpse);
  for (let i = 0; i < corpse.items.length; i++) {
    const entry = corpse.items[i];
    if (entry.state === "PRIVATE_AVAILABLE") {
      entry.state = "PUBLIC_AVAILABLE";
    }
  }
  if (corpse.goldState === "PRIVATE_AVAILABLE" && corpse.goldAmount > 0 && (corpse.goldDistribution === undefined || corpse.goldDistribution.complete !== true)) {
    corpse.goldState = "PUBLIC_AVAILABLE";
  }
  corpse.publicTransitionDone = true;
  corpse.revision += 1;
}

export function expireCorpse(corpse: CorpseLootContainer): void {
  for (let i = 0; i < corpse.items.length; i++) {
    if (corpse.items[i].state !== "CLAIMED") {
      corpse.items[i].state = "EXPIRED";
    }
  }
  if (corpse.goldState !== "CLAIMED") {
    corpse.goldState = "EXPIRED";
    corpse.goldAmount = 0;
  }
  corpse.viewerUserIds = [];
  corpse.state = "EXPIRED";
  corpse.revision += 1;
}

export function findCorpse(corpses: ReadonlyArray<CorpseLootContainer>, corpseId: string): CorpseLootContainer | null {
  for (let i = 0; i < corpses.length; i++) {
    if (corpses[i].corpseId === corpseId) {
      return corpses[i];
    }
  }
  return null;
}

export function openCorpseWindow(input: {
  corpses: CorpseLootContainer[];
  corpseId: string;
  userId: string;
  characterId: string;
  playerHealth: number;
  playerX: number;
  playerY: number;
  pickupRange: number;
  requestId: string;
}): { ok: boolean; code: string; replay: boolean; corpse: CorpseLootContainer | null } {
  const corpse = findCorpse(input.corpses, input.corpseId);
  if (corpse === null || corpse.state !== "ACTIVE") {
    return { ok: false, code: ERROR_CORPSE_MISSING, replay: false, corpse: null };
  }
  const previous = corpse.claimByRequestId[input.requestId];
  if (previous !== undefined) {
    return { ok: previous.ok, code: previous.code, replay: true, corpse: corpse };
  }
  if (input.playerHealth <= 0) {
    return rememberCorpseResult(corpse, input.requestId, false, "player_dead", "open");
  }
  if (distance(input.playerX, input.playerY, corpse.x, corpse.y) > input.pickupRange) {
    return rememberCorpseResult(corpse, input.requestId, false, "out_of_range", "open");
  }
  addViewer(corpse, input.userId);
  return rememberCorpseResult(corpse, input.requestId, true, "ok", "open");
}

export function closeCorpseWindow(corpses: CorpseLootContainer[], corpseId: string, userId: string, requestId: string): void {
  const corpse = findCorpse(corpses, corpseId);
  if (corpse === null) {
    return;
  }
  corpse.viewerUserIds = corpse.viewerUserIds.filter(function (id) {
    return id !== userId;
  });
  corpse.claimByRequestId[requestId] = { ok: true, code: "ok", kind: "close" };
}

export function claimCorpseItem(input: {
  corpse: CorpseLootContainer;
  entryId: string;
  userId: string;
  characterId: string;
  playerHealth: number;
  playerX: number;
  playerY: number;
  pickupRange: number;
  inventory: PlayerInventory | undefined;
  equippedItems?: ReadonlyArray<ItemInstance>;
  itemsById: { [id: string]: ItemDefinition };
  requestId: string;
  expectedRevision?: number;
  preferredSlot?: number;
  tick?: number;
  nowMs?: number;
}): { ok: boolean; code: string; replay: boolean; persist: boolean; inventory: PlayerInventory; corpse: CorpseLootContainer } {
  const previous = input.corpse.claimByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      ok: previous.ok,
      code: previous.code,
      replay: true,
      persist: false,
      inventory: previous.inventory !== undefined ? cloneInventory(previous.inventory) : cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory()),
      corpse: input.corpse,
    };
  }
  const inventory = cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory());
  const stale = staleRevisionCode(inventory.revision, input.expectedRevision);
  if (stale.length > 0) {
    return failItemClaim(input.corpse, inventory, input.requestId, stale);
  }
  if (input.playerHealth <= 0) {
    return failItemClaim(input.corpse, inventory, input.requestId, "player_dead");
  }
  const entry = findEntry(input.corpse, input.entryId);
  if (entry !== null) {
    const claimedAccess = itemAccessCode(input.corpse, entry, input.characterId);
    if (claimedAccess === ERROR_LOOT_ITEM_NO_LONGER_AVAILABLE) {
      return failItemClaim(input.corpse, inventory, input.requestId, claimedAccess);
    }
  }
  if (input.corpse.state !== "ACTIVE") {
    return failItemClaim(input.corpse, inventory, input.requestId, ERROR_CORPSE_MISSING);
  }
  if (distance(input.playerX, input.playerY, input.corpse.x, input.corpse.y) > input.pickupRange) {
    return failItemClaim(input.corpse, inventory, input.requestId, "out_of_range");
  }
  if (entry === null) {
    return failItemClaim(input.corpse, inventory, input.requestId, ERROR_CORPSE_MISSING);
  }
  const access = itemAccessCode(input.corpse, entry, input.characterId);
  if (access.length > 0) {
    return failItemClaim(input.corpse, inventory, input.requestId, access);
  }
  const definition = input.itemsById[entry.itemId];
  if (definition === undefined) {
    return failItemClaim(input.corpse, inventory, input.requestId, "invalid_id");
  }
  const incoming: IncomingStack = {
    itemId: entry.itemId,
    quantity: entry.quantity,
    instanceId: entry.instanceId,
    preferredSlot: input.preferredSlot,
    sourceType: "loot",
    sourceId: input.corpse.corpseId,
  };
  const plan = planCapacity({
    inventory: inventory,
    incoming: [incoming],
    definitions: input.itemsById,
    equippedItems: input.equippedItems,
    operationMode: "acquire",
    preferredStrict: input.preferredSlot !== undefined,
    nowMs: input.nowMs,
  });
  if (!plan.fits) {
    let code = plan.failureCode.length > 0 ? plan.failureCode : ITEM_ERROR_INVENTORY_FULL;
    if (input.preferredSlot !== undefined && code === ITEM_ERROR_STACK_INCOMPATIBLE) {
      code = ITEM_ERROR_INVALID_SLOT;
    }
    return failItemClaim(input.corpse, inventory, input.requestId, code);
  }
  entry.state = "CLAIMING";
  const nowMs = input.nowMs !== undefined ? input.nowMs : 0;
  const started = beginAcquisitionIntent({
    inventory: inventory,
    requestId: input.requestId,
    characterId: input.characterId,
    definitionId: entry.itemId,
    instanceId: entry.instanceId,
    quantity: entry.quantity,
    sourceId: entry.entryId,
    nowMs: nowMs,
    newIds: function () {
      return entry.instanceId;
    },
  });
  if (started.replay) {
    entry.state = "CLAIMED";
    entry.claimedByCharacterId = input.characterId;
    input.corpse.revision += 1;
    return succeedItemClaim(input.corpse, started.inventory, input.requestId, true);
  }
  const granted = applyCapacityPlan(started.inventory, plan, []);
  granted.persistReason = "loot";
  const completed = completeAcquisitionIntent(granted, started.intent, nowMs);
  entry.state = "CLAIMED";
  entry.claimedByCharacterId = input.characterId;
  input.corpse.revision += 1;
  if (corpseIsEmpty(input.corpse)) {
    input.corpse.state = "REMOVED";
  }
  return succeedItemClaim(input.corpse, completed, input.requestId, false);
}

export function planGoldShares(corpse: CorpseLootContainer, requestId: string): GoldDistributionRecord {
  const recipients = cloneEligible(corpse.deathEligibleRoster);
  const count = recipients.length;
  const gold = corpse.goldAmount;
  const shares: GoldShareRecord[] = [];
  if (count <= 0 || gold <= 0) {
    return { requestId: requestId, recipients: shares, complete: true };
  }
  const base = Math.floor(gold / count);
  let remainder = gold % count;
  const ordered = remainderOrder(corpse, recipients);
  for (let i = 0; i < ordered.length; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) {
      remainder -= 1;
    }
    shares.push({
      characterId: ordered[i].characterId,
      userId: ordered[i].userId,
      amount: base + extra,
      completed: false,
      persisted: false,
      requestId: goldShareRequestId(corpse.corpseId, ordered[i].characterId),
    });
  }
  return { requestId: requestId, recipients: shares, complete: false };
}

export function claimCorpseGold(input: {
  corpse: CorpseLootContainer;
  userId: string;
  characterId: string;
  playerHealth: number;
  playerX: number;
  playerY: number;
  pickupRange: number;
  requestId: string;
  goldByUser: { [userId: string]: number };
  goldLedger?: GoldLedger;
}): {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  shares: GoldShareRecord[];
  goldByUser: { [userId: string]: number };
} {
  const previous = input.corpse.claimByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      ok: previous.ok,
      code: previous.code,
      replay: true,
      persist: false,
      shares: previous.goldShares !== undefined ? previous.goldShares : [],
      goldByUser: input.goldByUser,
    };
  }
  if (input.playerHealth <= 0) {
    return failGoldClaim(input.corpse, input.requestId, "player_dead", input.goldByUser);
  }
  if (
    input.corpse.goldAmount <= 0 ||
    input.corpse.goldState === "CLAIMED" ||
    input.corpse.goldState === "EXPIRED" ||
    input.corpse.goldState === "CLAIMING"
  ) {
    return failGoldClaim(input.corpse, input.requestId, ERROR_LOOT_ITEM_NO_LONGER_AVAILABLE, input.goldByUser);
  }
  if (input.corpse.state !== "ACTIVE") {
    return failGoldClaim(input.corpse, input.requestId, ERROR_CORPSE_MISSING, input.goldByUser);
  }
  if (distance(input.playerX, input.playerY, input.corpse.x, input.corpse.y) > input.pickupRange) {
    return failGoldClaim(input.corpse, input.requestId, "out_of_range", input.goldByUser);
  }
  const publicPhase = input.corpse.publicTransitionDone === true || input.corpse.goldState === "PUBLIC_AVAILABLE";
  if (!publicPhase && !isDeathEligible(input.corpse, input.characterId)) {
    return failGoldClaim(input.corpse, input.requestId, ERROR_NOT_ELIGIBLE, input.goldByUser);
  }
  input.corpse.goldState = "CLAIMING";
  if (publicPhase) {
    const publicShare: GoldShareRecord = {
      characterId: input.characterId,
      userId: input.userId,
      amount: input.corpse.goldAmount,
      completed: false,
      persisted: false,
      requestId: goldShareRequestId(input.corpse.corpseId, input.characterId),
    };
    input.corpse.goldDistribution = { requestId: input.requestId, recipients: [publicShare], complete: false };
  } else if (input.corpse.goldDistribution === undefined) {
    input.corpse.goldDistribution = planGoldShares(input.corpse, input.requestId);
  }
  const goldByUser = applyGoldDistribution(input.corpse, input.goldByUser, input.goldLedger);
  input.corpse.claimByRequestId[input.requestId] = {
    ok: true,
    code: "ok",
    kind: "gold",
    goldShares: input.corpse.goldDistribution !== undefined ? input.corpse.goldDistribution.recipients : [],
    goldDelta: input.corpse.goldAmount,
  };
  input.corpse.revision += 1;
  if (corpseIsEmpty(input.corpse)) {
    input.corpse.state = "REMOVED";
  }
  return {
    ok: true,
    code: "ok",
    replay: false,
    persist: true,
    shares: input.corpse.goldDistribution !== undefined ? input.corpse.goldDistribution.recipients : [],
    goldByUser: goldByUser,
  };
}

export function lootAllCorpse(input: {
  corpse: CorpseLootContainer;
  userId: string;
  characterId: string;
  playerHealth: number;
  playerX: number;
  playerY: number;
  pickupRange: number;
  inventory: PlayerInventory | undefined;
  equippedItems?: ReadonlyArray<ItemInstance>;
  itemsById: { [id: string]: ItemDefinition };
  requestId: string;
  expectedRevision?: number;
  goldByUser: { [userId: string]: number };
  goldLedger?: GoldLedger;
  nowMs?: number;
}): {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  inventory: PlayerInventory;
  goldByUser: { [userId: string]: number };
  results: LootAllEntryResult[];
} {
  const previous = input.corpse.claimByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      ok: previous.ok,
      code: previous.code,
      replay: true,
      persist: false,
      inventory: previous.inventory !== undefined ? cloneInventory(previous.inventory) : cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory()),
      goldByUser: input.goldByUser,
      results: previous.lootAll !== undefined ? previous.lootAll : [],
    };
  }
  let inventory = cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory());
  const stale = staleRevisionCode(inventory.revision, input.expectedRevision);
  if (stale.length > 0) {
    input.corpse.claimByRequestId[input.requestId] = { ok: false, code: stale, kind: "loot_all", lootAll: [] };
    return { ok: false, code: stale, replay: false, persist: false, inventory: inventory, goldByUser: input.goldByUser, results: [] };
  }
  if (input.playerHealth <= 0) {
    return failLootAll(input.corpse, inventory, input.requestId, "player_dead", input.goldByUser);
  }
  if (input.corpse.state !== "ACTIVE") {
    return failLootAll(input.corpse, inventory, input.requestId, ERROR_CORPSE_MISSING, input.goldByUser);
  }
  if (distance(input.playerX, input.playerY, input.corpse.x, input.corpse.y) > input.pickupRange) {
    return failLootAll(input.corpse, inventory, input.requestId, "out_of_range", input.goldByUser);
  }
  const results: LootAllEntryResult[] = [];
  let goldByUser = input.goldByUser;
  let persist = false;
  const goldAccess = goldAccessCode(input.corpse, input.characterId);
  if (goldAccess.length === 0 && input.corpse.goldAmount > 0) {
    const gold = claimCorpseGold({
      corpse: input.corpse,
      userId: input.userId,
      characterId: input.characterId,
      playerHealth: input.playerHealth,
      playerX: input.playerX,
      playerY: input.playerY,
      pickupRange: input.pickupRange,
      requestId: input.requestId + ":gold",
      goldByUser: goldByUser,
      goldLedger: input.goldLedger,
    });
    goldByUser = gold.goldByUser;
    persist = persist || gold.persist;
    results.push({ entryId: "gold", kind: "gold", code: gold.code, claimed: gold.ok });
  } else if (input.corpse.goldAmount > 0) {
    results.push({ entryId: "gold", kind: "gold", code: goldAccess.length > 0 ? goldAccess : "ok", claimed: false });
  }
  for (let i = 0; i < input.corpse.items.length; i++) {
    const entry = input.corpse.items[i];
    const skip = lootAllSkipCode(entry, input.characterId);
    if (skip.length > 0) {
      results.push({ entryId: entry.entryId, kind: "item", code: skip, claimed: false });
      continue;
    }
    const access = itemAccessCode(input.corpse, entry, input.characterId);
    if (access.length > 0) {
      results.push({ entryId: entry.entryId, kind: "item", code: access, claimed: false });
      continue;
    }
    const claimed = claimCorpseItem({
      corpse: input.corpse,
      entryId: entry.entryId,
      userId: input.userId,
      characterId: input.characterId,
      playerHealth: input.playerHealth,
      playerX: input.playerX,
      playerY: input.playerY,
      pickupRange: input.pickupRange,
      inventory: inventory,
      equippedItems: input.equippedItems,
      itemsById: input.itemsById,
      requestId: input.requestId + ":item:" + entry.entryId,
      nowMs: input.nowMs,
    });
    if (claimed.ok) {
      inventory = claimed.inventory;
      persist = true;
      results.push({ entryId: entry.entryId, kind: "item", code: "ok", claimed: true });
    } else {
      results.push({
        entryId: entry.entryId,
        kind: "item",
        code: claimed.code === ITEM_ERROR_INVENTORY_FULL || claimed.code === ITEM_ERROR_INVALID_SLOT ? claimed.code : claimed.code,
        claimed: false,
      });
    }
  }
  input.corpse.claimByRequestId[input.requestId] = {
    ok: true,
    code: "ok",
    kind: "loot_all",
    inventory: cloneInventory(inventory),
    lootAll: results,
  };
  input.corpse.revision += 1;
  return {
    ok: true,
    code: "ok",
    replay: false,
    persist: persist,
    inventory: inventory,
    goldByUser: goldByUser,
    results: results,
  };
}

export function publicCorpses(corpses: ReadonlyArray<CorpseLootContainer>): { [key: string]: unknown }[] {
  const list: { [key: string]: unknown }[] = [];
  for (let i = 0; i < corpses.length; i++) {
    const corpse = corpses[i];
    if (corpse.state !== "ACTIVE") {
      continue;
    }
    list.push({
      id: corpse.corpseId,
      enemyInstanceId: corpse.enemyInstanceId,
      enemyId: corpse.enemyId,
      x: corpse.x,
      y: corpse.y,
      privateUntilTick: corpse.privateUntilTick,
      expiresAtTick: corpse.expiresAtTick,
      revision: corpse.revision,
    });
  }
  return list;
}

export function corpseStateForViewer(corpse: CorpseLootContainer, characterId: string, tick: number): { [key: string]: unknown } {
  const entries: { [key: string]: unknown }[] = [];
  for (let i = 0; i < corpse.items.length; i++) {
    const entry = corpse.items[i];
    entries.push({
      entryId: entry.entryId,
      itemId: entry.itemId,
      quantity: entry.quantity,
      state: entry.state,
      reservedToSelf: entry.reservedToCharacterId.length > 0 && entry.reservedToCharacterId === characterId,
      claimed: entry.state === "CLAIMED",
    });
  }
  return {
    corpseId: corpse.corpseId,
    enemyInstanceId: corpse.enemyInstanceId,
    enemyId: corpse.enemyId,
    x: corpse.x,
    y: corpse.y,
    goldAmount: corpse.goldAmount,
    goldState: corpse.goldState,
    items: entries,
    privateUntilTick: corpse.privateUntilTick,
    expiresAtTick: corpse.expiresAtTick,
    public: corpse.publicTransitionDone === true,
    eligible: isDeathEligible(corpse, characterId) || corpse.publicTransitionDone === true,
    revision: corpse.revision,
    state: corpse.state,
    tick: tick,
  };
}

export function cloneCorpses(corpses: ReadonlyArray<CorpseLootContainer> | undefined): CorpseLootContainer[] {
  const list: CorpseLootContainer[] = [];
  const source = Array.isArray(corpses) ? corpses : [];
  for (let i = 0; i < source.length; i++) {
    list.push(cloneCorpse(source[i]));
  }
  return list;
}

export function cloneCorpse(corpse: CorpseLootContainer): CorpseLootContainer {
  const items: CorpseItemEntry[] = [];
  for (let i = 0; i < corpse.items.length; i++) {
    const entry = corpse.items[i];
    items.push({
      entryId: entry.entryId,
      itemId: entry.itemId,
      quantity: entry.quantity,
      instanceId: entry.instanceId,
      state: entry.state,
      reservedToCharacterId: entry.reservedToCharacterId,
      claimedByCharacterId: entry.claimedByCharacterId,
    });
  }
  const claims: { [requestId: string]: CorpseClaimRecord } = {};
  const claimIds = Object.keys(corpse.claimByRequestId);
  for (let c = 0; c < claimIds.length; c++) {
    const record = corpse.claimByRequestId[claimIds[c]];
    claims[claimIds[c]] = {
      ok: record.ok,
      code: record.code,
      kind: record.kind,
      inventory: record.inventory !== undefined ? cloneInventory(record.inventory) : undefined,
      gold: record.gold,
      goldDelta: record.goldDelta,
      goldShares: cloneShares(record.goldShares),
      lootAll: cloneLootAll(record.lootAll),
    };
  }
  return {
    corpseId: corpse.corpseId,
    enemyInstanceId: corpse.enemyInstanceId,
    enemyId: corpse.enemyId,
    zoneId: corpse.zoneId,
    matchId: corpse.matchId,
    x: corpse.x,
    y: corpse.y,
    tagOwnerCharacterId: corpse.tagOwnerCharacterId,
    tagOwnerUserId: corpse.tagOwnerUserId,
    tagPartyId: corpse.tagPartyId,
    encounterRoster: cloneEncounterRoster(corpse.encounterRoster),
    deathEligibleRoster: cloneEligible(corpse.deathEligibleRoster),
    items: items,
    goldAmount: corpse.goldAmount,
    goldState: corpse.goldState,
    goldDistribution: cloneDistribution(corpse.goldDistribution),
    privateUntilTick: corpse.privateUntilTick,
    expiresAtTick: corpse.expiresAtTick,
    publicTransitionDone: corpse.publicTransitionDone === true,
    revision: corpse.revision,
    state: corpse.state,
    createdTick: corpse.createdTick,
    viewerUserIds: corpse.viewerUserIds.slice(),
    claimByRequestId: claims,
  };
}

function applyGoldDistribution(
  corpse: CorpseLootContainer,
  goldByUser: { [userId: string]: number },
  goldLedger?: GoldLedger,
): { [userId: string]: number } {
  const distribution = corpse.goldDistribution;
  if (distribution === undefined) {
    return goldByUser;
  }
  const ledger = goldLedger !== undefined ? goldLedger : emptyGoldLedger();
  const nextGold = dict(goldByUser);
  let remaining = 0;
  let complete = true;
  for (let i = 0; i < distribution.recipients.length; i++) {
    const share = distribution.recipients[i];
    if (share.completed) {
      continue;
    }
    if (share.amount <= 0) {
      share.completed = true;
      share.persisted = true;
      continue;
    }
    const current = nextGold[share.userId] !== undefined ? nextGold[share.userId] : 0;
    const granted = applyGoldMutation(
      {
        characterId: share.characterId,
        currentGold: current,
        delta: share.amount,
        reasonType: TX_REASON_LOOT,
        reasonId: corpse.corpseId,
        requestId: share.requestId,
      },
      ledger,
    );
    if (granted.ok) {
      nextGold[share.userId] = granted.gold;
      share.completed = true;
    } else {
      complete = false;
      remaining += share.amount;
    }
  }
  for (let r = 0; r < distribution.recipients.length; r++) {
    if (distribution.recipients[r].completed !== true) {
      complete = false;
    }
  }
  distribution.complete = complete;
  if (complete) {
    corpse.goldAmount = 0;
    corpse.goldState = "CLAIMED";
  } else {
    corpse.goldAmount = remaining;
  }
  return nextGold;
}

function retryGoldDistribution(
  corpse: CorpseLootContainer,
  goldLedger: GoldLedger | undefined,
  goldByUser: { [userId: string]: number },
): { [userId: string]: number } {
  if (corpse.goldDistribution === undefined) {
    return goldByUser;
  }
  return applyGoldDistribution(corpse, goldByUser, goldLedger);
}

function remainderOrder(corpse: CorpseLootContainer, recipients: DeathEligibleMember[]): DeathEligibleMember[] {
  const owner = corpse.tagOwnerCharacterId;
  const rest: DeathEligibleMember[] = [];
  let ownerRow: DeathEligibleMember | null = null;
  for (let i = 0; i < recipients.length; i++) {
    if (recipients[i].characterId === owner) {
      ownerRow = recipients[i];
    } else {
      rest.push(recipients[i]);
    }
  }
  rest.sort(function (a, b) {
    if (a.characterId < b.characterId) {
      return -1;
    }
    if (a.characterId > b.characterId) {
      return 1;
    }
    return 0;
  });
  const ordered: DeathEligibleMember[] = [];
  if (ownerRow !== null) {
    ordered.push(ownerRow);
  }
  for (let r = 0; r < rest.length; r++) {
    ordered.push(rest[r]);
  }
  return ordered;
}

function goldShareRequestId(corpseId: string, characterId: string): string {
  const raw = "cg-" + corpseId + "-" + characterId;
  return raw.length <= 64 ? raw : raw.slice(0, 64);
}

function itemAccessCode(corpse: CorpseLootContainer, entry: CorpseItemEntry, characterId: string): string {
  if (entry.state === "CLAIMED" || entry.state === "EXPIRED" || entry.state === "CLAIMING") {
    return ERROR_LOOT_ITEM_NO_LONGER_AVAILABLE;
  }
  if (entry.state === "ROLL_PENDING") {
    return "roll_pending";
  }
  if (entry.state === "AWARDED_PENDING_PICKUP" && entry.reservedToCharacterId !== characterId) {
    return ERROR_NOT_ELIGIBLE;
  }
  if (entry.state === "PRIVATE_AVAILABLE" && !isDeathEligible(corpse, characterId)) {
    return ERROR_NOT_ELIGIBLE;
  }
  return "";
}

function goldAccessCode(corpse: CorpseLootContainer, characterId: string): string {
  if (
    corpse.goldAmount <= 0 ||
    corpse.goldState === "CLAIMED" ||
    corpse.goldState === "EXPIRED" ||
    corpse.goldState === "CLAIMING"
  ) {
    return ERROR_LOOT_ITEM_NO_LONGER_AVAILABLE;
  }
  if (corpse.goldState === "PRIVATE_AVAILABLE" && !isDeathEligible(corpse, characterId)) {
    return ERROR_NOT_ELIGIBLE;
  }
  return "";
}

function lootAllSkipCode(entry: CorpseItemEntry, characterId: string): string {
  if (entry.state === "ROLL_PENDING") {
    return "roll_pending";
  }
  if (entry.state === "AWARDED_PENDING_PICKUP" && entry.reservedToCharacterId !== characterId) {
    return "reserved";
  }
  if (entry.state === "CLAIMED" || entry.state === "EXPIRED") {
    return ERROR_LOOT_ITEM_NO_LONGER_AVAILABLE;
  }
  return "";
}

function isDeathEligible(corpse: CorpseLootContainer, characterId: string): boolean {
  for (let i = 0; i < corpse.deathEligibleRoster.length; i++) {
    if (corpse.deathEligibleRoster[i].characterId === characterId) {
      return true;
    }
  }
  return false;
}

function findEntry(corpse: CorpseLootContainer, entryId: string): CorpseItemEntry | null {
  for (let i = 0; i < corpse.items.length; i++) {
    if (corpse.items[i].entryId === entryId) {
      return corpse.items[i];
    }
  }
  return null;
}

function addViewer(corpse: CorpseLootContainer, userId: string): void {
  for (let i = 0; i < corpse.viewerUserIds.length; i++) {
    if (corpse.viewerUserIds[i] === userId) {
      return;
    }
  }
  corpse.viewerUserIds.push(userId);
}

function rememberCorpseResult(
  corpse: CorpseLootContainer,
  requestId: string,
  ok: boolean,
  code: string,
  kind: CorpseClaimRecord["kind"],
): { ok: boolean; code: string; replay: boolean; corpse: CorpseLootContainer | null } {
  corpse.claimByRequestId[requestId] = { ok: ok, code: code, kind: kind };
  return { ok: ok, code: code, replay: false, corpse: corpse };
}

function failItemClaim(
  corpse: CorpseLootContainer,
  inventory: PlayerInventory,
  requestId: string,
  code: string,
): { ok: boolean; code: string; replay: boolean; persist: boolean; inventory: PlayerInventory; corpse: CorpseLootContainer } {
  corpse.claimByRequestId[requestId] = { ok: false, code: code, kind: "item", inventory: cloneInventory(inventory) };
  return { ok: false, code: code, replay: false, persist: false, inventory: inventory, corpse: corpse };
}

function succeedItemClaim(
  corpse: CorpseLootContainer,
  inventory: PlayerInventory,
  requestId: string,
  replay: boolean,
): { ok: boolean; code: string; replay: boolean; persist: boolean; inventory: PlayerInventory; corpse: CorpseLootContainer } {
  corpse.claimByRequestId[requestId] = { ok: true, code: "ok", kind: "item", inventory: cloneInventory(inventory) };
  return { ok: true, code: "ok", replay: replay, persist: !replay, inventory: inventory, corpse: corpse };
}

function failGoldClaim(
  corpse: CorpseLootContainer,
  requestId: string,
  code: string,
  goldByUser: { [userId: string]: number },
): {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  shares: GoldShareRecord[];
  goldByUser: { [userId: string]: number };
} {
  corpse.claimByRequestId[requestId] = { ok: false, code: code, kind: "gold" };
  return { ok: false, code: code, replay: false, persist: false, shares: [], goldByUser: goldByUser };
}

function failLootAll(
  corpse: CorpseLootContainer,
  inventory: PlayerInventory,
  requestId: string,
  code: string,
  goldByUser: { [userId: string]: number },
): {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  inventory: PlayerInventory;
  goldByUser: { [userId: string]: number };
  results: LootAllEntryResult[];
} {
  corpse.claimByRequestId[requestId] = { ok: false, code: code, kind: "loot_all", lootAll: [] };
  return { ok: false, code: code, replay: false, persist: false, inventory: inventory, goldByUser: goldByUser, results: [] };
}

function cloneEligible(list: ReadonlyArray<DeathEligibleMember>): DeathEligibleMember[] {
  const next: DeathEligibleMember[] = [];
  for (let i = 0; i < list.length; i++) {
    next.push({ characterId: list[i].characterId, userId: list[i].userId });
  }
  return next;
}

function cloneShares(list: GoldShareRecord[] | undefined): GoldShareRecord[] | undefined {
  if (list === undefined) {
    return undefined;
  }
  const next: GoldShareRecord[] = [];
  for (let i = 0; i < list.length; i++) {
    next.push({
      characterId: list[i].characterId,
      userId: list[i].userId,
      amount: list[i].amount,
      completed: list[i].completed === true,
      persisted: list[i].persisted === true,
      requestId: list[i].requestId,
    });
  }
  return next;
}

function cloneLootAll(list: LootAllEntryResult[] | undefined): LootAllEntryResult[] | undefined {
  if (list === undefined) {
    return undefined;
  }
  const next: LootAllEntryResult[] = [];
  for (let i = 0; i < list.length; i++) {
    next.push({
      entryId: list[i].entryId,
      kind: list[i].kind,
      code: list[i].code,
      claimed: list[i].claimed === true,
    });
  }
  return next;
}

function cloneDistribution(distribution: GoldDistributionRecord | undefined): GoldDistributionRecord | undefined {
  if (distribution === undefined) {
    return undefined;
  }
  return {
    requestId: distribution.requestId,
    recipients: cloneShares(distribution.recipients) as GoldShareRecord[],
    complete: distribution.complete === true,
  };
}

function findParticipant(
  players: { [userId: string]: { userId: string; characterId: string; x: number; y: number; health: number; lastDeathTick?: number } },
  disconnected: { [userId: string]: { player: { userId: string; characterId: string; x: number; y: number; health: number; lastDeathTick?: number } } },
  userId: string,
  characterId: string,
): { userId: string; characterId: string; x: number; y: number; health: number; lastDeathTick?: number } | null {
  const live = players[userId];
  if (live !== undefined && live.characterId === characterId) {
    return live;
  }
  const parked = disconnected[userId];
  if (parked !== undefined && parked.player.characterId === characterId) {
    return parked.player;
  }
  return null;
}

function inCreditRange(x: number, y: number, enemyX: number, enemyY: number, rangePx: number): boolean {
  const range = rangePx > 0 ? rangePx : 512;
  const dx = x - enemyX;
  const dy = y - enemyY;
  return dx * dx + dy * dy <= range * range;
}

function recentlyDead(
  health: number,
  lastDeathTick: number,
  tick: number,
  tickRate: number,
  recentlyActiveMs: number,
): boolean {
  if (health > 0) {
    return false;
  }
  if (lastDeathTick < 0) {
    return false;
  }
  const rate = tickRate > 0 ? tickRate : 10;
  const windowTicks = Math.ceil((recentlyActiveMs / 1000) * rate);
  return tick - lastDeathTick <= windowTicks;
}

export function cloneEncounterPresenceForCorpse(presence: { [characterId: string]: EncounterPresence } | undefined): {
  [characterId: string]: EncounterPresence;
} {
  return cloneEncounterPresence(presence);
}
