import { findNpc, resolveInteraction, type InteractionNpc } from "./interaction";
import {
  addOrStackItem,
  acceptItemFailureCode,
  cloneInventory,
  emptyInventory,
  findItem,
  isItemLocked,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import { findNpcService, type NpcDefinition } from "./npc";
import type { QuestLog } from "./quest";
import { applyGoldMutation, WALLET_CURRENCY_GOLD } from "./wallet";
import { staleRevisionCode } from "./item_errors";

export const VENDOR_MAX_QUANTITY = 99;
export const VENDOR_CURRENCY_GOLD = WALLET_CURRENCY_GOLD;

export interface VendorStockEntry {
  itemId: string;
  buyPrice: number;
  classRequirements?: ReadonlyArray<string>;
  levelRequirement?: number;
}

export interface VendorDefinition {
  id: string;
  currencyId: string;
  stock: ReadonlyArray<VendorStockEntry>;
  sellMultiplier: number;
}

export interface VendorShopStock {
  itemId: string;
  buyPrice: number;
}

export interface VendorShopPresentation {
  vendorId: string;
  currencyId: string;
  stock: VendorShopStock[];
}

export interface VendorTradeInput {
  playerHealth: number;
  playerX: number;
  playerY: number;
  gold: number;
  inventory: PlayerInventory | undefined;
  npcId: string;
  requestId: string;
  npcs: ReadonlyArray<InteractionNpc>;
  interactionRange: number;
  npcById: { [id: string]: NpcDefinition };
  vendorsById: { [id: string]: VendorDefinition };
  itemsById: { [id: string]: ItemDefinition };
  equippedInstanceIds: ReadonlyArray<string>;
  equippedItems?: ReadonlyArray<ItemInstance>;
  classId?: string;
  playerLevel?: number;
  questLog?: QuestLog;
  zoneId?: string;
  inParty?: boolean;
  newId: () => string;
  tick?: number;
  expectedRevision?: number;
}

export interface VendorBuyInput extends VendorTradeInput {
  itemId: string;
  quantity: number;
}

export interface VendorSellInput extends VendorTradeInput {
  instanceId: string;
  quantity: number;
}

export interface VendorTradeOutcome {
  ok: boolean;
  code: string;
  persist: boolean;
  replay: boolean;
  inventory: PlayerInventory;
  gold: number;
  goldDelta: number;
  metadata: { [key: string]: unknown };
}

export function vendorDefinitionsFromContent(vendors: {
  [id: string]: {
    id: string;
    currencyId?: string;
    stock: ReadonlyArray<{
      itemId: string;
      buyPrice: number;
      classRequirements?: ReadonlyArray<string>;
      levelRequirement?: number;
    }>;
    sellMultiplier: number;
  };
}): { [id: string]: VendorDefinition } {
  const map: { [id: string]: VendorDefinition } = {};
  const ids = Object.keys(vendors);
  for (let i = 0; i < ids.length; i++) {
    const entry = vendors[ids[i]];
    const stock: VendorStockEntry[] = [];
    for (let s = 0; s < entry.stock.length; s++) {
      const row = entry.stock[s];
      const copied: VendorStockEntry = { itemId: row.itemId, buyPrice: row.buyPrice };
      if (row.classRequirements !== undefined) {
        copied.classRequirements = row.classRequirements.slice();
      }
      if (row.levelRequirement !== undefined) {
        copied.levelRequirement = row.levelRequirement;
      }
      stock.push(copied);
    }
    const currencyId = entry.currencyId !== undefined && entry.currencyId.length > 0 ? entry.currencyId : VENDOR_CURRENCY_GOLD;
    map[ids[i]] = { id: entry.id, currencyId: currencyId, stock: stock, sellMultiplier: entry.sellMultiplier };
  }
  return map;
}

export function vendorShopPresentation(
  npcDef: NpcDefinition | undefined,
  vendorsById: { [id: string]: VendorDefinition },
): VendorShopPresentation | undefined {
  const service = findNpcService(npcDef, "vendor");
  if (service === null || service.vendorId === undefined) {
    return undefined;
  }
  const vendor = vendorsById[service.vendorId];
  if (vendor === undefined || vendor == null) {
    return undefined;
  }
  const stock: VendorShopStock[] = [];
  const rows = Array.isArray(vendor.stock) ? vendor.stock : [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row == null || row.itemId === undefined) {
      continue;
    }
    stock.push({ itemId: row.itemId, buyPrice: row.buyPrice });
  }
  return {
    vendorId: vendor.id,
    currencyId: vendor.currencyId,
    stock: stock,
  };
}

export function applyVendorBuy(input: VendorBuyInput): VendorTradeOutcome {
  const inventory = cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory());
  const previous = priorVendor(inventory, input.requestId);
  if (previous !== undefined) {
    return {
      ok: previous.ok,
      code: previous.code,
      persist: false,
      replay: true,
      inventory: inventory,
      gold: input.gold,
      goldDelta: 0,
      metadata: {},
    };
  }
  const stale = staleRevisionCode(inventory.revision, input.expectedRevision);
  if (stale.length > 0) {
    return failTrade(stale, inventory, input.gold);
  }
  const access = authorizeVendor(input, "vendor");
  if (!access.ok) {
    return failTrade(access.code, inventory, input.gold);
  }
  const quantity = input.quantity;
  if (
    typeof quantity !== "number" ||
    !isFinite(quantity) ||
    quantity !== Math.floor(quantity) ||
    quantity < 1 ||
    quantity > VENDOR_MAX_QUANTITY
  ) {
    return failTrade("invalid_amount", inventory, input.gold);
  }
  const vendor = access.vendor;
  if (vendor.currencyId !== VENDOR_CURRENCY_GOLD) {
    return failTrade("invalid_id", inventory, input.gold);
  }
  const stock = findStock(vendor, input.itemId);
  if (stock === null) {
    return failTrade("invalid_id", inventory, input.gold);
  }
  const itemDef = input.itemsById[input.itemId];
  if (itemDef === undefined) {
    return failTrade("invalid_id", inventory, input.gold);
  }
  const level = input.playerLevel !== undefined ? input.playerLevel : 1;
  const classId = input.classId !== undefined ? input.classId : "";
  const classReqs = stock.classRequirements !== undefined ? stock.classRequirements : [];
  if (classReqs.length > 0 && classReqs.indexOf(classId) === -1) {
    return failTrade("class_restricted", inventory, input.gold);
  }
  const itemClassReqs = itemDef.classRequirements !== undefined ? itemDef.classRequirements : [];
  if (itemClassReqs.length > 0 && itemClassReqs.indexOf(classId) === -1) {
    return failTrade("class_restricted", inventory, input.gold);
  }
  if (stock.levelRequirement !== undefined && level < stock.levelRequirement) {
    return failTrade("level_too_low", inventory, input.gold);
  }
  if (itemDef.levelRequirement !== undefined && level < itemDef.levelRequirement) {
    return failTrade("level_too_low", inventory, input.gold);
  }
  const price = stock.buyPrice * quantity;
  if (input.gold < price) {
    return failTrade("insufficient_gold", inventory, input.gold);
  }
  const failCode = acceptItemFailureCode(inventory, input.itemId, quantity, itemDef, input.equippedItems);
  if (failCode.length > 0) {
    return failTrade(failCode, inventory, input.gold);
  }
  const nextInventory = addOrStackItem(inventory, input.itemId, quantity, input.newId(), itemDef, {
    sourceType: "vendor",
    sourceId: vendor.id,
    createdAt: 0,
  });
  rememberVendor(nextInventory, input.requestId, "ok", input.itemId, quantity, input.tick);
  const gold = applyGoldMutation({
    characterId: "",
    currentGold: input.gold,
    delta: -price,
    reasonType: "vendor",
    reasonId: vendor.id,
    requestId: input.requestId,
    metadata: { source: "vendor_buy", itemId: input.itemId, quantity: quantity, price: price },
  });
  if (!gold.ok) {
    return failTrade(gold.code, inventory, input.gold);
  }
  return {
    ok: true,
    code: "ok",
    persist: true,
    replay: false,
    inventory: nextInventory,
    gold: gold.resultingBalance,
    goldDelta: gold.goldDelta,
    metadata: gold.metadata,
  };
}

export function applyVendorSell(input: VendorSellInput): VendorTradeOutcome {
  const inventory = cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory());
  const previous = priorVendor(inventory, input.requestId);
  if (previous !== undefined) {
    return {
      ok: previous.ok,
      code: previous.code,
      persist: false,
      replay: true,
      inventory: inventory,
      gold: input.gold,
      goldDelta: 0,
      metadata: {},
    };
  }
  const stale = staleRevisionCode(inventory.revision, input.expectedRevision);
  if (stale.length > 0) {
    return failTrade(stale, inventory, input.gold);
  }
  const access = authorizeVendor(input, "vendor");
  if (!access.ok) {
    return failTrade(access.code, inventory, input.gold);
  }
  const item = findItem(inventory, input.instanceId);
  if (item === null) {
    return failTrade("invalid_id", inventory, input.gold);
  }
  if (isItemLocked(item)) {
    return failTrade("item_locked", inventory, input.gold);
  }
  if (input.equippedInstanceIds.indexOf(item.instanceId) !== -1) {
    return failTrade("item_locked", inventory, input.gold);
  }
  const itemDef = input.itemsById[item.itemId];
  if (itemDef === undefined) {
    return failTrade("invalid_id", inventory, input.gold);
  }
  if (itemDef.tradeable === false) {
    return failTrade("unsellable", inventory, input.gold);
  }
  const sellValue = itemDef.sellValue !== undefined ? itemDef.sellValue : 0;
  if (sellValue <= 0) {
    return failTrade("unsellable", inventory, input.gold);
  }
  const quantity = input.quantity > 0 ? input.quantity : item.quantity;
  if (quantity < 1 || quantity !== Math.floor(quantity) || quantity > item.quantity) {
    return failTrade("invalid_id", inventory, input.gold);
  }
  const unitPrice = Math.floor(sellValue * access.vendor.sellMultiplier);
  if (unitPrice <= 0) {
    return failTrade("unsellable", inventory, input.gold);
  }
  if (quantity >= item.quantity) {
    inventory.items = inventory.items.filter((entry) => entry.instanceId !== item.instanceId);
  } else {
    item.quantity -= quantity;
  }
  rememberVendor(inventory, input.requestId, "ok", input.instanceId, quantity, input.tick);
  const goldDelta = unitPrice * quantity;
  const gold = applyGoldMutation({
    characterId: "",
    currentGold: input.gold,
    delta: goldDelta,
    reasonType: "vendor",
    reasonId: access.vendor.id,
    requestId: input.requestId,
    metadata: { source: "vendor_sell", instanceId: input.instanceId, itemId: item.itemId, quantity: quantity, price: goldDelta },
  });
  if (!gold.ok) {
    return failTrade(gold.code, cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory()), input.gold);
  }
  return {
    ok: true,
    code: "ok",
    persist: true,
    replay: false,
    inventory: inventory,
    gold: gold.resultingBalance,
    goldDelta: gold.goldDelta,
    metadata: gold.metadata,
  };
}

function authorizeVendor(
  input: VendorTradeInput,
  serviceType: string,
): { ok: true; vendor: VendorDefinition } | { ok: false; code: string } {
  const decision = resolveInteraction({
    playerHealth: input.playerHealth,
    playerX: input.playerX,
    playerY: input.playerY,
    targetId: input.npcId,
    npcs: input.npcs,
    interactionRange: input.interactionRange,
    zoneId: input.zoneId,
    playerLevel: input.playerLevel,
    classId: input.classId,
    questLog: input.questLog,
    npcById: input.npcById,
    inParty: input.inParty,
    requiredService: serviceType,
  });
  if (!decision.ok) {
    return { ok: false, code: decision.code };
  }
  const npc = findNpc(input.npcs, input.npcId);
  if (npc === null) {
    return { ok: false, code: "invalid_target" };
  }
  const npcDef = input.npcById[npc.npcId];
  const service = findNpcService(npcDef, serviceType);
  if (service === null || service.vendorId === undefined) {
    return { ok: false, code: "invalid_service" };
  }
  const vendor = input.vendorsById[service.vendorId];
  if (vendor === undefined) {
    return { ok: false, code: "invalid_id" };
  }
  if (vendor.currencyId !== VENDOR_CURRENCY_GOLD) {
    return { ok: false, code: "invalid_id" };
  }
  return { ok: true, vendor: vendor };
}

function priorVendor(inventory: PlayerInventory, requestId: string): { ok: boolean; code: string } | undefined {
  if (inventory.mutationByRequestId === undefined) {
    return undefined;
  }
  const record = inventory.mutationByRequestId[requestId];
  if (record === undefined) {
    return undefined;
  }
  return { ok: record.ok, code: record.code };
}

function findStock(vendor: VendorDefinition, itemId: string): VendorStockEntry | null {
  for (let i = 0; i < vendor.stock.length; i++) {
    if (vendor.stock[i].itemId === itemId) {
      return vendor.stock[i];
    }
  }
  return null;
}

function rememberVendor(
  inventory: PlayerInventory,
  requestId: string,
  code: string,
  instanceId: string,
  quantity: number,
  tick: number | undefined,
): void {
  if (inventory.mutationByRequestId === undefined) {
    inventory.mutationByRequestId = {};
  }
  inventory.mutationByRequestId[requestId] = { ok: code === "ok", code: code, instanceId: instanceId, quantity: quantity };
  if (tick === undefined) {
    return;
  }
  const ticks: { [requestId: string]: number } = {};
  if (inventory.mutationRequestTicks != null) {
    const keys = Object.keys(inventory.mutationRequestTicks);
    for (let i = 0; i < keys.length; i++) {
      ticks[keys[i]] = inventory.mutationRequestTicks[keys[i]];
    }
  }
  ticks[requestId] = tick;
  inventory.mutationRequestTicks = ticks;
}

function failTrade(code: string, inventory: PlayerInventory, gold: number): VendorTradeOutcome {
  return {
    ok: false,
    code: code,
    persist: false,
    replay: false,
    inventory: inventory,
    gold: gold,
    goldDelta: 0,
    metadata: {},
  };
}
