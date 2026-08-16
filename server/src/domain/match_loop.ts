import {
  ClientOpcode,
  actionResult,
  combatEvent,
  equipmentState,
  interactionResult,
  inventoryState,
  isProtocolError,
  parseClientMessage,
  questState,
  systemMessage,
  type ParsedClientMessage,
} from "./protocol";
import {
  EMPTY_MATCH_TIMEOUT_TICKS,
  MATCH_TICK_RATE,
  playerCount,
  type StarterZoneState,
  buildFullState,
  buildSnapshot,
  cloneStarterZoneState,
  fullStateOpcode,
  snapshotOpcode,
} from "./match_state";
import { intendedDelta, resolveMove } from "./movement";
import { resolveInteraction } from "./interaction";
import { applyQuestAccept, cloneQuestLog, publicQuestPayloads, type QuestLog } from "./quest";
import { applyPlayerAttack, type CombatEvent } from "./combat";
import { simulateCombatants } from "./enemy_ai";
import { publicInventory, type PlayerInventory } from "./inventory";
import {
  applyEquip,
  cloneEquipment,
  derivedAttack,
  emptyEquipment,
  publicDerived,
  publicEquipment,
  reconcileEquipment,
  type InventoryOwner,
  type PlayerEquipment,
} from "./equipment";
import { applyPickup, expireLoot, lootExpireTicks, spawnGuaranteedLoot } from "./loot";

export interface MatchOutbound {
  opcode: number;
  body: string;
  toUserId?: string;
  broadcastOthersFrom?: string;
}

export interface QuestPersist {
  userId: string;
  log: QuestLog;
}

export interface InventoryPersist {
  userId: string;
  inventory: PlayerInventory;
}

export interface EquipmentPersist {
  userId: string;
  equipment: PlayerEquipment;
}

export interface MatchLoopResult {
  state: StarterZoneState;
  terminate: boolean;
  outbound: MatchOutbound[];
  persistQuests: QuestPersist[];
  persistInventories: InventoryPersist[];
  persistEquipment: EquipmentPersist[];
}

export interface IncomingMatchData {
  opcode: number;
  raw: string;
  userId: string;
}

export function applyMatchLoop(
  state: StarterZoneState,
  tick: number,
  expectedContentHash: string,
  messages: IncomingMatchData[],
  newId?: () => string,
): MatchLoopResult {
  const outbound: MatchOutbound[] = [];
  const next = cloneStarterZoneState(state);
  const persistByUser: { [userId: string]: QuestLog } = {};
  const persistInventoryByUser: { [userId: string]: PlayerInventory } = {};
  const persistEquipmentByUser: { [userId: string]: PlayerEquipment } = {};
  const combatEvents: CombatEvent[] = [];
  const makeId = newId !== undefined ? newId : sequentialIdFactory(tick);
  reconcileAllEquipment(next, persistEquipmentByUser);

  for (let i = 0; i < messages.length; i++) {
    const incoming = messages[i];
    const parsed = parseClientMessage(incoming.opcode, incoming.raw, expectedContentHash);
    if (isProtocolError(parsed)) {
      const sys = systemMessage(parsed.code, parsed.message);
      outbound.push({ opcode: sys.opcode, body: sys.body, toUserId: incoming.userId });
      continue;
    }
    handleValidated(
      parsed,
      incoming.userId,
      next,
      tick,
      outbound,
      persistByUser,
      persistInventoryByUser,
      persistEquipmentByUser,
      combatEvents,
    );
  }

  simulateMovement(next, 1 / MATCH_TICK_RATE);
  simulateCombatants(next, tick, 1 / MATCH_TICK_RATE, MATCH_TICK_RATE, combatEvents);
  spawnLootFromDeaths(next, tick, combatEvents, makeId);
  next.loot = expireLoot(next.loot, tick);
  pushCombatEvents(outbound, tick, combatEvents);

  if (playerCount(next) === 0) {
    next.emptyTicks = next.emptyTicks + 1;
  } else {
    next.emptyTicks = 0;
    outbound.push({
      opcode: snapshotOpcode(),
      body: buildSnapshot(next, tick),
    });
  }

  const persistQuests: QuestPersist[] = [];
  const persistIds = Object.keys(persistByUser);
  for (let j = 0; j < persistIds.length; j++) {
    const userId = persistIds[j];
    persistQuests.push({ userId: userId, log: persistByUser[userId] });
  }
  const persistInventories: InventoryPersist[] = [];
  const inventoryIds = Object.keys(persistInventoryByUser);
  for (let k = 0; k < inventoryIds.length; k++) {
    const userId = inventoryIds[k];
    persistInventories.push({ userId: userId, inventory: persistInventoryByUser[userId] });
  }
  const persistEquipment: EquipmentPersist[] = [];
  const equipmentIds = Object.keys(persistEquipmentByUser);
  for (let e = 0; e < equipmentIds.length; e++) {
    const userId = equipmentIds[e];
    persistEquipment.push({ userId: userId, equipment: persistEquipmentByUser[userId] });
  }

  return {
    state: next,
    terminate: playerCount(next) === 0 && next.emptyTicks >= EMPTY_MATCH_TIMEOUT_TICKS,
    outbound: outbound,
    persistQuests: persistQuests,
    persistInventories: persistInventories,
    persistEquipment: persistEquipment,
  };
}

function handleValidated(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistByUser: { [userId: string]: QuestLog },
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
  combatEvents: CombatEvent[],
): void {
  if (parsed.opcode === ClientOpcode.RESYNC_REQUEST) {
    outbound.push({
      opcode: fullStateOpcode(),
      body: buildFullState(state, tick, userId),
      toUserId: userId,
    });
    return;
  }
  if (parsed.opcode === ClientOpcode.INPUT) {
    applyInput(state, userId, parsed.seq as number, parsed.axisX as number, parsed.axisY as number);
    return;
  }
  if (parsed.opcode === ClientOpcode.INTERACT) {
    handleInteract(parsed, userId, state, outbound);
    return;
  }
  if (parsed.opcode === ClientOpcode.QUEST_ACCEPT) {
    handleQuestAccept(parsed, userId, state, outbound, persistByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.ATTACK) {
    handleAttack(parsed, userId, state, tick, outbound, combatEvents);
    return;
  }
  if (parsed.opcode === ClientOpcode.PICKUP) {
    handlePickup(parsed, userId, state, outbound, persistInventoryByUser, persistEquipmentByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.EQUIP) {
    handleEquip(parsed, userId, state, outbound, persistEquipmentByUser);
    return;
  }
  const result = actionResult("not_implemented", false, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handleInteract(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  outbound: MatchOutbound[],
): void {
  const targetId = parsed.fields.targetId;
  const player = state.players[userId];
  if (player === undefined) {
    const missing = interactionResult("player_missing", false, parsed.requestId, targetId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const decision = resolveInteraction({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    targetId: targetId,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
  });
  const result = interactionResult(decision.code, decision.ok, parsed.requestId, targetId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handleQuestAccept(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  outbound: MatchOutbound[],
  persistByUser: { [userId: string]: QuestLog },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const outcome = applyQuestAccept({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    questLog: player.questLog,
    questId: parsed.fields.questId,
    requestId: parsed.requestId as string,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
    questsById: state.questsById,
  });
  player.questLog = outcome.log;
  if (outcome.persist) {
    persistByUser[userId] = cloneQuestLog(outcome.log);
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    const quests = questState(
      state.contentHash,
      publicQuestPayloads(player.questLog, state.questsById),
      parsed.requestId,
    );
    outbound.push({ opcode: quests.opcode, body: quests.body, toUserId: userId });
  }
}

function handleAttack(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  combatEvents: CombatEvent[],
): void {
  const decision = applyPlayerAttack(
    {
      player: state.players[userId],
      targetId: parsed.fields.targetId,
      requestId: parsed.requestId as string,
      tick: tick,
      enemies: state.enemies,
      attack: playerAttack(state, userId),
      attackRange: state.playerAttackRange,
      attackCooldownSec: state.playerAttackCooldownSec,
      tickRate: MATCH_TICK_RATE,
    },
    combatEvents,
  );
  const result = actionResult(decision.code, decision.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handlePickup(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  outbound: MatchOutbound[],
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const outcome = applyPickup({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    inventory: player.inventory,
    lootId: parsed.fields.lootId,
    requestId: parsed.requestId as string,
    loot: state.loot,
    pickupRange: state.pickupRange,
    itemsById: state.itemsById,
  });
  player.inventory = outcome.inventory;
  state.loot = outcome.loot;
  if (outcome.persist) {
    persistInventoryByUser[userId] = outcome.inventory;
  }
  refreshDerivedFromInventory(state, userId, persistEquipmentByUser);
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    const inventory = inventoryState(
      state.contentHash,
      publicInventory(player.inventory),
      parsed.requestId,
    );
    outbound.push({ opcode: inventory.opcode, body: inventory.body, toUserId: userId });
  }
}

function handleEquip(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  outbound: MatchOutbound[],
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const unequip = parsed.fields.instanceId === undefined;
  const outcome = applyEquip({
    playerHealth: player.health,
    userId: userId,
    instanceId: parsed.fields.instanceId !== undefined ? parsed.fields.instanceId : "",
    slot: parsed.fields.slot,
    requestId: parsed.requestId as string,
    equipment: player.equipment !== undefined ? player.equipment : emptyEquipment(),
    inventory: player.inventory,
    itemsById: state.itemsById,
    baseAttack: state.playerAttack,
    owners: inventoryOwners(state),
    unequip: unequip,
  });
  player.equipment = outcome.equipment;
  player.derivedAttack = outcome.derivedAttack;
  if (outcome.persist) {
    persistEquipmentByUser[userId] = cloneEquipment(outcome.equipment);
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    const equipment = equipmentState(
      state.contentHash,
      publicEquipment(player.equipment),
      publicDerived(player.derivedAttack),
      parsed.requestId,
    );
    outbound.push({ opcode: equipment.opcode, body: equipment.body, toUserId: userId });
  }
}

function playerAttack(state: StarterZoneState, userId: string): number {
  const player = state.players[userId];
  if (player === undefined) {
    return state.playerAttack;
  }
  if (player.derivedAttack !== undefined) {
    return player.derivedAttack;
  }
  return derivedAttack(
    state.playerAttack,
    player.equipment !== undefined ? player.equipment : emptyEquipment(),
    player.inventory,
    state.itemsById,
  );
}

function refreshDerivedFromInventory(
  state: StarterZoneState,
  userId: string,
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    return;
  }
  const current = player.equipment !== undefined ? player.equipment : emptyEquipment();
  const reconciled = reconcileEquipment(current, player.inventory);
  player.equipment = reconciled.equipment;
  player.derivedAttack = derivedAttack(
    state.playerAttack,
    reconciled.equipment,
    player.inventory,
    state.itemsById,
  );
  if (reconciled.persist) {
    persistEquipmentByUser[userId] = cloneEquipment(reconciled.equipment);
  }
}

function inventoryOwners(state: StarterZoneState): InventoryOwner[] {
  const owners: InventoryOwner[] = [];
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    owners.push({ userId: id, inventory: state.players[id].inventory });
  }
  return owners;
}

function reconcileAllEquipment(
  state: StarterZoneState,
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
): void {
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    refreshDerivedFromInventory(state, ids[i], persistEquipmentByUser);
  }
}

function spawnLootFromDeaths(
  state: StarterZoneState,
  tick: number,
  events: CombatEvent[],
  newId: () => string,
): void {
  const expireTicks = lootExpireTicks(MATCH_TICK_RATE);
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== "death" || event.targetKind !== "enemy") {
      continue;
    }
    const enemy = findEnemyById(state, event.targetId);
    if (enemy === null) {
      continue;
    }
    const drops = state.enemyLootById[enemy.enemyId];
    state.loot = spawnGuaranteedLoot(
      state.loot,
      drops,
      event.x !== undefined ? event.x : enemy.x,
      event.y !== undefined ? event.y : enemy.y,
      tick,
      expireTicks,
      newId,
    );
  }
}

function findEnemyById(state: StarterZoneState, enemyId: string) {
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].id === enemyId) {
      return state.enemies[i];
    }
  }
  return null;
}

function sequentialIdFactory(tick: number): () => string {
  let n = 0;
  return function () {
    n += 1;
    return "id-" + String(tick) + "-" + String(n);
  };
}

function pushCombatEvents(outbound: MatchOutbound[], tick: number, events: CombatEvent[]): void {
  if (events.length === 0) {
    return;
  }
  const payload: { [key: string]: unknown }[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const row: { [key: string]: unknown } = {
      type: event.type,
      sourceId: event.sourceId,
      sourceKind: event.sourceKind,
      targetId: event.targetId,
      targetKind: event.targetKind,
    };
    if (event.damage !== undefined) {
      row.damage = event.damage;
    }
    if (event.remainingHealth !== undefined) {
      row.remainingHealth = event.remainingHealth;
    }
    if (event.x !== undefined) {
      row.x = event.x;
    }
    if (event.y !== undefined) {
      row.y = event.y;
    }
    if (event.respawnDelaySec !== undefined) {
      row.respawnDelaySec = event.respawnDelaySec;
    }
    payload.push(row);
  }
  const message = combatEvent(tick, payload);
  outbound.push({ opcode: message.opcode, body: message.body });
}

function applyInput(state: StarterZoneState, userId: string, seq: number, axisX: number, axisY: number): void {
  const player = state.players[userId];
  if (player === undefined) {
    return;
  }
  if (seq <= player.lastProcessedSeq) {
    return;
  }
  player.lastProcessedSeq = seq;
  if (player.health <= 0) {
    player.axisX = 0;
    player.axisY = 0;
    return;
  }
  player.axisX = axisX;
  player.axisY = axisY;
}

function simulateMovement(state: StarterZoneState, dt: number): void {
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    if (player.health <= 0) {
      continue;
    }
    const delta = intendedDelta(player.axisX, player.axisY, state.moveSpeed, dt);
    const next = resolveMove(
      player.x,
      player.y,
      delta.x,
      delta.y,
      state.playerHalfExtent,
      state.collisions,
      state.walkableBounds,
    );
    player.x = next.x;
    player.y = next.y;
  }
}

export function snapshotForOthers(state: StarterZoneState, tick: number, fromUserId: string): MatchOutbound {
  return {
    opcode: snapshotOpcode(),
    body: buildSnapshot(state, tick),
    broadcastOthersFrom: fromUserId,
  };
}
