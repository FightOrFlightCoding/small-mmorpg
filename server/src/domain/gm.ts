import { addOrStackItem, consumeItem, type ItemDefinition } from "./inventory";
import { CAVE_ZONE_ID } from "./instance";
import { dict } from "./maps";
import {
  MATCH_TICK_RATE,
  PLAYER_HALF_EXTENT,
  STARTER_ZONE_ID,
  type MatchEnemy,
  type MatchPlayer,
  type StarterZoneState,
} from "./match_state";
import { depenetrate } from "./movement";
import { cloneProgression, grantXp } from "./progression";
import {
  QUEST_STATUS_ACCEPTED,
  QUEST_STATUS_COMPLETED,
  cloneQuestLog,
  createAcceptedProgress,
  type QuestDefinition,
} from "./quest";
import { activateSpawn } from "./spawn_controller";
import { killEnemy, type CombatEvent } from "./combat";
import { cancelTrade, cloneTradeRecord, findLiveTradeForCharacter } from "./trade";

export const GM_COLLECTION = "gm";
export const GM_ALLOWLIST_KEY = "allowlist";
export const GM_RECENT_KEY = "recent";
export const GM_AUDIT_COLLECTION = "gm_audit";
export const GM_AUDIT_KEY = "a";
export const GM_SIGNAL_KEY = "r";
export const GM_PERMISSION_READ = 0;
export const GM_PERMISSION_WRITE = 0;
export const GM_SCHEMA_VERSION = 1;
export const GM_REASON_MAX = 240;
export const SYSTEMS_LAB_ZONE_ID = "test.zone.systems_lab";

export const GM_COMMANDS = [
  "inspect_character",
  "teleport_character",
  "repair_invalid_location",
  "grant_test_item",
  "remove_test_item",
  "grant_test_gold",
  "grant_test_xp",
  "reset_attribute_allocation",
  "reset_skill_allocation",
  "set_quest_state",
  "reset_quest",
  "spawn_enemy",
  "kill_enemy",
  "open_cave",
  "inspect_party",
  "cancel_trade",
  "view_recent_transaction_audit",
] as const;

export type GmCommandName = (typeof GM_COMMANDS)[number];

export interface GmAllowlist {
  schemaVersion: number;
  enabled: boolean;
  userIds: string[];
  customIds: string[];
  emails: string[];
}

export interface GmAccount {
  userId: string;
  customId?: string;
  email?: string;
}

export interface GmCommandRequest {
  command: GmCommandName;
  reason: string;
  characterId: string;
  requestId: string;
  x?: number;
  y?: number;
  itemId?: string;
  quantity?: number;
  amount?: number;
  questId?: string;
  status?: string;
  stageIndex?: number;
  spawnId?: string;
  enemyInstanceId?: string;
  zoneTemplateId?: string;
  tradeId?: string;
}

export interface GmAuditRecord {
  administratorUser: string;
  targetCharacter: string;
  command: string;
  reason: string;
  timestamp: number;
  result: string;
  requestId: string;
  schemaVersion: number;
}

export interface GmApplyResult {
  ok: boolean;
  code: string;
  result: { [key: string]: unknown };
  persistInventory: boolean;
  persistProgression: boolean;
  persistQuests: boolean;
  goldDelta: number;
  repairLocation: boolean;
}

export function emptyGmAllowlist(): GmAllowlist {
  return {
    schemaVersion: GM_SCHEMA_VERSION,
    enabled: false,
    userIds: [],
    customIds: [],
    emails: [],
  };
}

export function parseGmAllowlist(value: { [key: string]: unknown } | null | undefined): GmAllowlist {
  const empty = emptyGmAllowlist();
  if (value === null || value === undefined) {
    return empty;
  }
  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : GM_SCHEMA_VERSION,
    enabled: value.enabled === true,
    userIds: stringArray(value.userIds),
    customIds: stringArray(value.customIds),
    emails: stringArray(value.emails),
  };
}

export function isGmAuthorized(allowlist: GmAllowlist, account: GmAccount): boolean {
  if (allowlist.enabled !== true) {
    return false;
  }
  if (allowlist.userIds.indexOf(account.userId) !== -1) {
    return true;
  }
  const customId = account.customId !== undefined ? account.customId : "";
  if (customId.length > 0 && allowlist.customIds.indexOf(customId) !== -1) {
    return true;
  }
  const email = account.email !== undefined ? account.email : "";
  if (email.length > 0 && allowlist.emails.indexOf(email) !== -1) {
    return true;
  }
  return false;
}

export function gmRequestFromMatchSignal(data: { [key: string]: unknown }): GmCommandRequest {
  const copy: { [key: string]: unknown } = {};
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== "type" && keys[i] !== "administratorUser") {
      copy[keys[i]] = data[keys[i]];
    }
  }
  return parseGmCommandPayload(JSON.stringify(copy));
}

export function parseGmCommandPayload(payload: string): GmCommandRequest {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    throw new Error("malformed_json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("malformed_json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("malformed_json");
  }
  const data = parsed as { [key: string]: unknown };
  const allowed = [
    "command",
    "reason",
    "characterId",
    "requestId",
    "x",
    "y",
    "itemId",
    "quantity",
    "amount",
    "questId",
    "status",
    "stageIndex",
    "spawnId",
    "enemyInstanceId",
    "zoneTemplateId",
    "tradeId",
  ];
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    if (allowed.indexOf(keys[i]) === -1) {
      throw new Error("unknown_field:" + keys[i]);
    }
  }
  const command = data.command;
  if (typeof command !== "string" || GM_COMMANDS.indexOf(command as GmCommandName) === -1) {
    throw new Error("unknown_command");
  }
  const reason = data.reason;
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("reason_required");
  }
  if (reason.length > GM_REASON_MAX || reason.indexOf("token=") !== -1) {
    throw new Error("invalid_reason");
  }
  const characterId = data.characterId;
  if (typeof characterId !== "string" || characterId.length === 0) {
    throw new Error("character_missing");
  }
  const request: GmCommandRequest = {
    command: command as GmCommandName,
    reason: reason.trim(),
    characterId: characterId,
    requestId: typeof data.requestId === "string" && data.requestId.length > 0 ? data.requestId : "gm-req",
  };
  if (typeof data.x === "number") {
    request.x = data.x;
  }
  if (typeof data.y === "number") {
    request.y = data.y;
  }
  if (typeof data.itemId === "string") {
    request.itemId = data.itemId;
  }
  if (typeof data.quantity === "number") {
    request.quantity = data.quantity;
  }
  if (typeof data.amount === "number") {
    request.amount = data.amount;
  }
  if (typeof data.questId === "string") {
    request.questId = data.questId;
  }
  if (typeof data.status === "string") {
    request.status = data.status;
  }
  if (typeof data.stageIndex === "number") {
    request.stageIndex = data.stageIndex;
  }
  if (typeof data.spawnId === "string") {
    request.spawnId = data.spawnId;
  }
  if (typeof data.enemyInstanceId === "string") {
    request.enemyInstanceId = data.enemyInstanceId;
  }
  if (typeof data.zoneTemplateId === "string") {
    request.zoneTemplateId = data.zoneTemplateId;
  }
  if (typeof data.tradeId === "string") {
    request.tradeId = data.tradeId;
  }
  return request;
}

export function makeGmAudit(input: {
  administratorUser: string;
  targetCharacter: string;
  command: string;
  reason: string;
  timestamp: number;
  result: string;
  requestId: string;
}): GmAuditRecord {
  return {
    administratorUser: input.administratorUser,
    targetCharacter: input.targetCharacter,
    command: input.command,
    reason: input.reason,
    timestamp: input.timestamp,
    result: input.result,
    requestId: input.requestId,
    schemaVersion: GM_SCHEMA_VERSION,
  };
}

export function resolveGmZoneTemplateId(
  requested: string | undefined,
  zones: { [id: string]: unknown },
): string {
  if (requested !== undefined && requested.length > 0 && zones[requested] !== undefined) {
    return requested;
  }
  if (zones[SYSTEMS_LAB_ZONE_ID] !== undefined) {
    return SYSTEMS_LAB_ZONE_ID;
  }
  return CAVE_ZONE_ID;
}

export function applyGmToMatch(
  state: StarterZoneState,
  player: MatchPlayer,
  request: GmCommandRequest,
  nowMs: number,
  tick: number,
  items: { [id: string]: ItemDefinition },
  quests: { [id: string]: QuestDefinition },
  startingAbilities: string[],
): GmApplyResult {
  const empty = emptyApply("ok");
  if (request.command === "inspect_character") {
    empty.result = inspectPlayer(player);
    return empty;
  }
  if (request.command === "teleport_character") {
    const x = request.x;
    const y = request.y;
    if (typeof x !== "number" || typeof y !== "number") {
      return emptyApply("invalid_position");
    }
    const clamped = depenetrate(x, y, PLAYER_HALF_EXTENT, state.collisions, state.walkableBounds);
    player.x = clamped.x;
    player.y = clamped.y;
    empty.result = { x: player.x, y: player.y };
    return empty;
  }
  if (request.command === "repair_invalid_location") {
    player.x = state.playerSpawnX;
    player.y = state.playerSpawnY;
    empty.repairLocation = true;
    empty.result = { zoneTemplateId: STARTER_ZONE_ID, x: player.x, y: player.y };
    return empty;
  }
  if (request.command === "grant_test_item") {
    return grantItem(player, request, items, nowMs);
  }
  if (request.command === "remove_test_item") {
    return removeItem(player, request);
  }
  if (request.command === "grant_test_gold") {
    const amount = request.amount !== undefined ? request.amount : 0;
    if (!(amount > 0) || amount !== Math.floor(amount)) {
      return emptyApply("invalid_amount");
    }
    empty.goldDelta = amount;
    empty.result = { goldDelta: amount };
    return empty;
  }
  if (request.command === "grant_test_xp") {
    return grantAdminXp(player, request, state);
  }
  if (request.command === "reset_attribute_allocation") {
    return resetAttributes(player);
  }
  if (request.command === "reset_skill_allocation") {
    return resetSkills(player, startingAbilities);
  }
  if (request.command === "set_quest_state") {
    return setQuest(player, request, quests);
  }
  if (request.command === "reset_quest") {
    return resetQuest(player, request);
  }
  if (request.command === "spawn_enemy") {
    const spawnId = request.spawnId !== undefined ? request.spawnId : "";
    if (spawnId.length === 0) {
      return emptyApply("invalid_spawn");
    }
    const created = activateSpawn(state, spawnId, state.enemiesById !== undefined ? state.enemiesById : {});
    empty.result = { spawned: created.length, spawnId: spawnId };
    if (created.length === 0) {
      empty.code = "spawn_inactive";
    }
    return empty;
  }
  if (request.command === "kill_enemy") {
    const enemy = findEnemy(state, request.enemyInstanceId);
    if (enemy === null) {
      return emptyApply("invalid_target");
    }
    const events: CombatEvent[] = [];
    killEnemy(enemy, tick, player.userId, MATCH_TICK_RATE, events);
    empty.result = { enemyId: enemy.id };
    return empty;
  }
  if (request.command === "open_cave") {
    player.transferState = "issued";
    empty.result = { zoneTemplateId: request.zoneTemplateId !== undefined ? request.zoneTemplateId : SYSTEMS_LAB_ZONE_ID };
    return empty;
  }
  if (request.command === "inspect_party") {
    const cache = state.partyByCharacterId !== undefined ? state.partyByCharacterId[player.characterId] : undefined;
    empty.result = { party: cache !== undefined ? cache : null };
    return empty;
  }
  if (request.command === "cancel_trade") {
    return cancelPlayerTrade(state, player, request);
  }
  if (request.command === "view_recent_transaction_audit") {
    empty.result = { gold: player.gold !== undefined ? player.gold : 0 };
    return empty;
  }
  return emptyApply("unknown_command");
}

function emptyApply(code: string): GmApplyResult {
  return {
    ok: code === "ok" || code === "spawn_inactive",
    code: code,
    result: {},
    persistInventory: false,
    persistProgression: false,
    persistQuests: false,
    goldDelta: 0,
    repairLocation: false,
  };
}

function inspectPlayer(player: MatchPlayer): { [key: string]: unknown } {
  return {
    characterId: player.characterId,
    userId: player.userId,
    name: player.name,
    classId: player.classId !== undefined ? player.classId : "",
    x: player.x,
    y: player.y,
    health: player.health,
    maxHealth: player.maxHealth,
    gold: player.gold !== undefined ? player.gold : 0,
    level: player.progression !== undefined ? player.progression.level : 1,
  };
}

function grantItem(
  player: MatchPlayer,
  request: GmCommandRequest,
  items: { [id: string]: ItemDefinition },
  nowMs: number,
): GmApplyResult {
  const itemId = request.itemId !== undefined ? request.itemId : "";
  const definition = items[itemId];
  if (definition === undefined) {
    return emptyApply("unknown_item");
  }
  if (player.inventory === undefined) {
    return emptyApply("inventory_missing");
  }
  const quantity = request.quantity !== undefined && request.quantity > 0 ? Math.floor(request.quantity) : 1;
  player.inventory = addOrStackItem(player.inventory, itemId, quantity, request.requestId, definition, {
    sourceType: "admin",
    sourceId: request.requestId,
    createdAt: nowMs,
  });
  const result = emptyApply("ok");
  result.persistInventory = true;
  result.result = { itemId: itemId, quantity: quantity };
  return result;
}

function removeItem(player: MatchPlayer, request: GmCommandRequest): GmApplyResult {
  const itemId = request.itemId !== undefined ? request.itemId : "";
  if (player.inventory === undefined) {
    return emptyApply("inventory_missing");
  }
  const quantity = request.quantity !== undefined && request.quantity > 0 ? Math.floor(request.quantity) : 1;
  const next = consumeItem(player.inventory, itemId, quantity);
  if (next === null) {
    return emptyApply("item_missing");
  }
  player.inventory = next;
  const result = emptyApply("ok");
  result.persistInventory = true;
  result.result = { itemId: itemId, quantity: quantity };
  return result;
}

function grantAdminXp(player: MatchPlayer, request: GmCommandRequest, state: StarterZoneState): GmApplyResult {
  if (player.progression === undefined) {
    return emptyApply("progression_missing");
  }
  const amount = request.amount !== undefined ? request.amount : 0;
  if (!(amount >= 0) || amount !== Math.floor(amount)) {
    return emptyApply("invalid_amount");
  }
  if (state.progressionCatalog === undefined) {
    return emptyApply("progression_missing");
  }
  const granted = grantXp(
    player.progression,
    state.progressionCatalog,
    player.classId !== undefined ? player.classId : "",
    {
      characterId: player.characterId,
      amount: amount,
      reasonType: "admin",
      reasonId: request.requestId,
      eventId: "gm:" + request.requestId,
    },
  );
  player.progression = granted.progression;
  const result = emptyApply(granted.code);
  result.persistProgression = granted.changed || granted.replay;
  result.result = { amount: amount, replay: granted.replay, levelsGained: granted.levelsGained };
  return result;
}

function resetAttributes(player: MatchPlayer): GmApplyResult {
  if (player.progression === undefined) {
    return emptyApply("progression_missing");
  }
  const next = cloneProgression(player.progression);
  const allocated = dict(next.allocatedAttributes);
  const keys = Object.keys(allocated);
  let refund = 0;
  for (let i = 0; i < keys.length; i++) {
    refund += allocated[keys[i]];
  }
  next.unspentAttributePoints += refund;
  next.allocatedAttributes = {};
  player.progression = next;
  const result = emptyApply("ok");
  result.persistProgression = true;
  result.result = { refunded: refund };
  return result;
}

function resetSkills(player: MatchPlayer, startingAbilities: string[]): GmApplyResult {
  if (player.progression === undefined) {
    return emptyApply("progression_missing");
  }
  const next = cloneProgression(player.progression);
  next.unlockedAbilityIds = startingAbilities.slice();
  if (next.hotbar !== undefined) {
    const kept: string[] = [];
    for (let i = 0; i < next.hotbar.length; i++) {
      if (startingAbilities.indexOf(next.hotbar[i]) !== -1) {
        kept.push(next.hotbar[i]);
      }
    }
    next.hotbar = kept;
  }
  player.progression = next;
  const result = emptyApply("ok");
  result.persistProgression = true;
  result.result = { unlocked: startingAbilities };
  return result;
}

function setQuest(
  player: MatchPlayer,
  request: GmCommandRequest,
  quests: { [id: string]: QuestDefinition },
): GmApplyResult {
  const questId = request.questId !== undefined ? request.questId : "";
  const definition = quests[questId];
  if (definition === undefined) {
    return emptyApply("unknown_quest");
  }
  const log = cloneQuestLog(player.questLog);
  const progress = createAcceptedProgress(definition);
  if (request.status === QUEST_STATUS_COMPLETED) {
    progress.status = QUEST_STATUS_COMPLETED;
  } else {
    progress.status = QUEST_STATUS_ACCEPTED;
  }
  if (request.stageIndex !== undefined && request.stageIndex >= 0) {
    progress.stageIndex = Math.floor(request.stageIndex);
  }
  log.quests[questId] = progress;
  player.questLog = log;
  const result = emptyApply("ok");
  result.persistQuests = true;
  result.result = { questId: questId, status: progress.status };
  return result;
}

function resetQuest(player: MatchPlayer, request: GmCommandRequest): GmApplyResult {
  const questId = request.questId !== undefined ? request.questId : "";
  const log = cloneQuestLog(player.questLog);
  delete log.quests[questId];
  player.questLog = log;
  const result = emptyApply("ok");
  result.persistQuests = true;
  result.result = { questId: questId };
  return result;
}

function findEnemy(state: StarterZoneState, enemyInstanceId: string | undefined): MatchEnemy | null {
  if (enemyInstanceId === undefined || enemyInstanceId.length === 0) {
    return null;
  }
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].id === enemyInstanceId) {
      return state.enemies[i];
    }
  }
  return null;
}

function cancelPlayerTrade(state: StarterZoneState, player: MatchPlayer, request: GmCommandRequest): GmApplyResult {
  const trades = dict(state.trades);
  const found =
    request.tradeId !== undefined && request.tradeId.length > 0
      ? trades[request.tradeId]
      : findLiveTradeForCharacter(trades, player.characterId);
  if (found === undefined || found === null) {
    return emptyApply("trade_missing");
  }
  const decision = cancelTrade(found, "cancelled", request.requestId);
  state.trades = dict(state.trades);
  state.trades[decision.trade.tradeId] = cloneTradeRecord(decision.trade);
  const result = emptyApply(decision.code);
  result.ok = decision.ok;
  result.result = { tradeId: decision.trade.tradeId, state: decision.trade.state };
  return result;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] === "string" && value[i].length > 0) {
      out.push(value[i]);
    }
  }
  return out;
}
