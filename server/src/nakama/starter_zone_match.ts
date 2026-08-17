import { content, contentHash } from "../generated/content";
import { readCharacter, writeCharacterCheckpoint } from "./character_store";
import { readQuests, writeQuests } from "./quest_store";
import { readInventory, writeInventoryOnce } from "./inventory_store";
import { readEquipment, writeEquipment } from "./equipment_store";
import { loadWalletRef } from "./wallet_ref_store";
import { SAVE_SCHEMA_VERSION } from "../domain/save_schema";
import { commitQuestReward, commitTransaction, readGold } from "./quest_reward_store";
import { TX_REASON_EQUIPMENT, TX_REASON_LOOT } from "../domain/transaction";
import { validateJoinAttempt } from "../domain/join_validation";
import { applyMatchLoop, snapshotForOthers, type IncomingMatchData, type EquipmentPersist, type InventoryPersist } from "../domain/match_loop";
import { PLAYER_RESPAWN_DELAY_SEC } from "../domain/combat";
import { questDefinitionsFromContent } from "../domain/quest";
import { initializeInventoryFromStacks, itemDefinitionsFromContent, INVENTORY_CAPACITY } from "../domain/inventory";
import {
  derivedAttack,
  equipmentSlotsFromContent,
  loadEquipment,
} from "../domain/equipment";
import {
  MATCH_TICK_RATE,
  STARTER_ZONE_LABEL,
  addPlayer,
  buildFullState,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  fullStateOpcode,
  type MatchPlayer,
  type StarterZoneState,
} from "../domain/match_state";
import { dict } from "../domain/maps";
import {
  applyPlayerLeave,
  bindJoiningSession,
  checkpointsForTerminate,
  joinHealth,
  restoreGracePlayer,
  takeGracePlayer,
  type PositionCheckpoint,
} from "../domain/persistence";
import { migrateLegacyCharacterIntoRoster } from "../domain/character_lifecycle";
import { invalidateTicket, validateJoinSelection } from "../domain/character_ticket";
import { classDefinitionsFromContent, classEquipmentTagsFromContent, classTagsFromContent, startingEquipmentForClass } from "../domain/class_catalog";
import { characterLifecycleDeps } from "./character_lifecycle_deps";
import { readSelection, writeSelection } from "./selection_store";
import { catalogFromContent, syncCombatStatsFromPipeline } from "../domain/stats";
import { initializeProgression } from "../domain/progression";
import { abilityDefinitionsFromContent, prepareJoinedPlayerAbilities } from "../domain/ability";
import { spawnDefinitionsFromContent } from "../domain/spawn_controller";
import { aiProfilesFromContent } from "../domain/threat";
import { lootTablesFromContent } from "../domain/loot_table";
import { readProgression, writeProgression, writeProgressionOnce } from "./progression_store";

export interface StarterMatchRuntimeState {
  zone: StarterZoneState;
  presences: { [userId: string]: nkruntime.Presence };
}

export function matchInit(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _params: { [key: string]: any },
): { state: StarterMatchRuntimeState; tickRate: number; label: string } {
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
      respawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
      pickupRange: content.player.pickupRange,
      basicAbilityId: content.player.basicAbilityId,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      equipmentSlotsByTag: equipmentSlotsFromContent(content.equipmentSlots),
      classEquipmentTags: classEquipmentTagsFromContent(content.classes),
      inventoryCapacity:
        typeof content.player.inventoryCapacity === "number" ? content.player.inventoryCapacity : INVENTORY_CAPACITY,
      abilitiesById: abilityDefinitionsFromContent(content.abilities),
      basicAbilityId: content.player.basicAbilityId,
      classTags: classTagsFromContent(content.classes),
      spawnsById: spawnDefinitionsFromContent(content.spawns),
      aiProfilesById: aiProfilesFromContent(content.aiProfiles),
      lootTablesById: lootTablesFromContent(content.lootTables),
    },
  );
  zone.progressionCatalog = catalogFromContent(content);
  logger.info("starter_zone init label=%s content_hash=%s", STARTER_ZONE_LABEL, contentHash);
  return {
    state: persistable({ zone: zone, presences: {} }),
    tickRate: MATCH_TICK_RATE,
    label: STARTER_ZONE_LABEL,
  };
}

export function matchJoinAttempt(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: StarterMatchRuntimeState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any },
): { state: StarterMatchRuntimeState; accept: boolean; rejectMessage?: string } {
  state = hydrateRuntime(state);
  const meta: { [key: string]: string } = {};
  const keys = Object.keys(dict(metadata));
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    meta[key] = String(metadata[key]);
  }
  const alreadyJoined = Object.prototype.hasOwnProperty.call(state.zone.players, presence.userId);
  const existing = state.presences[presence.userId];
  const gate = validateJoinAttempt(
    state.zone,
    contentHash,
    meta,
    alreadyJoined,
    presence.sessionId,
    existing !== undefined ? existing.sessionId : "",
  );
  if (!gate.accept) {
    logger.info("starter_zone join rejected user_id=%s reason=%s", presence.userId, gate.rejectMessage);
    return { state: persistable(state), accept: false, rejectMessage: gate.rejectMessage };
  }
  const alreadySameSession =
    alreadyJoined && (existing === undefined || existing.sessionId === presence.sessionId || existing.sessionId === "");
  if (alreadySameSession) {
    return { state: persistable(state), accept: true };
  }
  try {
    const deps = characterLifecycleDeps(nk);
    migrateLegacyCharacterIntoRoster(presence.userId, deps);
    const ticket = readSelection(nk, presence.userId);
    const presented = meta.selectionTicket !== undefined ? meta.selectionTicket : "";
    const selectedId = ticket !== null ? ticket.characterId : "";
    const character = selectedId.length > 0 ? readCharacter(nk, presence.userId, selectedId) : null;
    const selected = validateJoinSelection(presented, ticket, presence.userId, character, Date.now());
    if (!selected.ok) {
      logger.info("starter_zone join rejected user_id=%s reason=%s", presence.userId, selected.reason);
      return { state: persistable(state), accept: false, rejectMessage: selected.reason };
    }
    if (character === null) {
      logger.info("starter_zone join rejected user_id=%s reason=character_missing", presence.userId);
      return { state: persistable(state), accept: false, rejectMessage: "character_missing" };
    }
    readInventory(nk, presence.userId, character.characterId);
    readEquipment(nk, presence.userId, character.characterId);
    readQuests(nk, presence.userId, character.characterId);
    readProgression(nk, presence.userId, character.characterId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "save_incompatible";
    logger.info("starter_zone join rejected user_id=%s reason=%s", presence.userId, reason);
    return { state: persistable(state), accept: false, rejectMessage: reason };
  }
  return { state: persistable(state), accept: true };
}

export function matchJoin(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  presences: nkruntime.Presence[],
): { state: StarterMatchRuntimeState } {
  state = hydrateRuntime(state);
  let zone = state.zone;
  const nextPresences: { [userId: string]: nkruntime.Presence } = {};
  const existing = Object.keys(state.presences);
  for (let i = 0; i < existing.length; i++) {
    nextPresences[existing[i]] = state.presences[existing[i]];
  }

  const joined: nkruntime.Presence[] = [];
  for (let i = 0; i < presences.length; i++) {
    const presence = presences[i];
    nextPresences[presence.userId] = presence;
    let character;
    try {
      const ticket = readSelection(nk, presence.userId);
      const characterId = ticket !== null ? ticket.characterId : "";
      character = characterId.length > 0 ? readCharacter(nk, presence.userId, characterId) : readCharacter(nk, presence.userId);
      if (character === null) {
        dispatcher.matchKick([presence]);
        delete nextPresences[presence.userId];
        continue;
      }
      loadWalletRef(nk, presence.userId);
    } catch (error) {
      logger.info(
        "starter_zone join rejected user_id=%s reason=%s",
        presence.userId,
        error instanceof Error ? error.message : "save_incompatible",
      );
      dispatcher.matchKick([presence]);
      delete nextPresences[presence.userId];
      continue;
    }
    const existingLive = zone.players[presence.userId];
    if (existingLive !== undefined) {
      bindJoiningSession(existingLive, presence.sessionId, presence.username);
      joined.push(presence);
      logger.info("starter_zone session resume user_id=%s", presence.userId);
      continue;
    }
    const ticket = readSelection(nk, presence.userId);
    if (ticket !== null && !ticket.invalidated) {
      writeSelection(nk, presence.userId, invalidateTicket(ticket, Date.now()));
    }
    let inventory!: ReturnType<typeof loadPlayerInventory>;
    let loadedEquipment!: ReturnType<typeof loadEquipment>;
    let gold!: number;
    let questLog!: ReturnType<typeof readQuests>;
    let progression!: ReturnType<typeof loadPlayerProgression>;
    try {
      inventory = loadPlayerInventory(nk, presence.userId, character);
      loadedEquipment = loadEquipment(readEquipment(nk, presence.userId, character.characterId), inventory);
      gold = readGold(nk, presence.userId);
      questLog = readQuests(nk, presence.userId, character.characterId);
      progression = loadPlayerProgression(nk, presence.userId, character);
    } catch (error) {
      logger.info(
        "starter_zone join rejected user_id=%s reason=%s",
        presence.userId,
        error instanceof Error ? error.message : "save_incompatible",
      );
      dispatcher.matchKick([presence]);
      delete nextPresences[presence.userId];
      continue;
    }
    if (loadedEquipment.persist) {
      writeEquipment(nk, presence.userId, loadedEquipment.equipment, character.characterId);
      logger.info("starter_zone reconcile equipment user_id=%s", presence.userId);
    }
    const classId = character.classId !== undefined && character.classId.length > 0 ? character.classId : "";
    const derived = derivedAttack(
      content.player.attack,
      loadedEquipment.equipment,
      inventory,
      zone.itemsById,
    );
    const parked = takeGracePlayer(zone, presence.userId, tick);
    let player: MatchPlayer;
    if (parked !== null) {
      player = restoreGracePlayer(
        parked,
        presence.sessionId,
        presence.username,
        questLog,
        inventory,
        loadedEquipment.equipment,
        derived,
        gold,
      );
      if (player.progression === undefined) {
        player.progression = progression.progression;
      }
      if (player.classId === undefined || player.classId.length === 0) {
        player.classId = classId;
      }
      applyJoinDerived(zone, player);
    } else {
      player = {
        userId: presence.userId,
        sessionId: presence.sessionId,
        username: presence.username,
        characterId: character.characterId,
        name: character.name,
        classId: classId,
        x: character.position.x,
        y: character.position.y,
        maxHealth: content.player.maxHealth,
        health: joinHealth(content.player.maxHealth),
        lastProcessedSeq: 0,
        axisX: 0,
        axisY: 0,
        questLog: questLog,
        inventory: inventory,
        equipment: loadedEquipment.equipment,
        derivedAttack: derived,
        gold: gold,
        progression: progression.progression,
        lastCheckpointTick: tick,
        lastCheckpointX: character.position.x,
        lastCheckpointY: character.position.y,
      };
      applyJoinDerived(zone, player);
      player.health = joinHealth(player.maxHealth);
    }
    const ownershipChanged = prepareJoinedPlayerAbilities(zone, player, parked === null);
    if (ownershipChanged && player.progression !== undefined) {
      writeProgression(nk, presence.userId, player.progression, character.characterId);
    }
    if (parked !== null) {
      logger.info("starter_zone grace rejoin user_id=%s", presence.userId);
    } else {
      logger.info("starter_zone join user_id=%s character_id=%s", presence.userId, character.characterId);
    }
    zone = addPlayer(zone, player);
    joined.push(presence);
  }

  for (let i = 0; i < joined.length; i++) {
    const presence = joined[i];
    dispatcher.broadcastMessage(fullStateOpcode(), buildFullState(zone, tick, presence.userId), [presence], null, true);
  }
  if (joined.length > 0) {
    const snapshot = snapshotForOthers(zone, tick, "");
    const others = presencesNotIn(nextPresences, joined);
    if (others.length > 0) {
      dispatcher.broadcastMessage(snapshot.opcode, snapshot.body, others, null, true);
    }
  }

  return { state: persistable({ zone: zone, presences: nextPresences }) };
}

export function matchLeave(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  presences: nkruntime.Presence[],
): { state: StarterMatchRuntimeState } {
  state = hydrateRuntime(state);
  let zone = state.zone;
  const nextPresences: { [userId: string]: nkruntime.Presence } = {};
  const existing = Object.keys(state.presences);
  for (let i = 0; i < existing.length; i++) {
    nextPresences[existing[i]] = state.presences[existing[i]];
  }
  for (let i = 0; i < presences.length; i++) {
    const presence = presences[i];
    const left = applyPlayerLeave(zone, presence.userId, tick);
    zone = left.state;
    if (left.checkpoint !== null) {
      writeCharacterCheckpoint(nk, left.checkpoint.userId, left.checkpoint.x, left.checkpoint.y, left.checkpoint.characterId);
      logger.info("starter_zone leave checkpoint user_id=%s", presence.userId);
    }
    delete nextPresences[presence.userId];
    logger.info("starter_zone leave user_id=%s", presence.userId);
  }
  const remaining = allPresences(nextPresences);
  if (remaining.length > 0) {
    const snapshot = snapshotForOthers(zone, tick, "");
    dispatcher.broadcastMessage(snapshot.opcode, snapshot.body, remaining, null, true);
  }
  return { state: persistable({ zone: zone, presences: nextPresences }) };
}

export function matchLoop(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  messages: nkruntime.MatchMessage[],
): { state: StarterMatchRuntimeState } | null {
  state = hydrateRuntime(state);
  const incoming: IncomingMatchData[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    incoming.push({
      opcode: message.opCode,
      raw: nk.binaryToString(message.data),
      userId: message.sender.userId,
    });
  }
  const result = applyMatchLoop(state.zone, tick, contentHash, incoming, function () {
    return nk.uuidv4();
  }, function (request) {
    return commitQuestReward(nk, request);
  });
  for (let p = 0; p < result.persistQuests.length; p++) {
    const persist = result.persistQuests[p];
    writeQuests(nk, persist.userId, persist.log, persist.characterId);
    logger.info("starter_zone persist quests user_id=%s", persist.userId);
  }
  persistEconomy(nk, logger, tick, result.persistInventories, result.persistEquipment);
  for (let pg = 0; pg < result.persistProgression.length; pg++) {
    const persist = result.persistProgression[pg];
    writeProgression(nk, persist.userId, persist.progression, persist.characterId);
    logger.info("starter_zone persist progression user_id=%s", persist.userId);
  }
  writeCheckpoints(nk, logger, result.persistCheckpoints);
  for (let r = 0; r < result.rejections.length; r++) {
    const rejected = result.rejections[r];
    logger.info(
      "match_action rejected user_id=%s action=%s reason=%s tick=%s",
      rejected.userId,
      rejected.action,
      rejected.code,
      String(rejected.tick),
    );
  }
  for (let i = 0; i < result.outbound.length; i++) {
    const out = result.outbound[i];
    const targets = resolveTargets(state.presences, out.toUserId, out.broadcastOthersFrom);
    if (targets !== null && targets.length === 0) {
      continue;
    }
    dispatcher.broadcastMessage(out.opcode, out.body, targets, null, true);
  }
  if (result.terminate) {
    logger.info("starter_zone empty timeout tick=%s", String(tick));
    return null;
  }
  return { state: persistable({ zone: result.state, presences: state.presences }) };
}

export function matchTerminate(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: StarterMatchRuntimeState,
  _graceSeconds: number,
): { state: StarterMatchRuntimeState } {
  state = hydrateRuntime(state);
  writeCheckpoints(nk, logger, checkpointsForTerminate(state.zone));
  return { state: persistable(state) };
}

export function matchSignal(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  _data: string,
): { state: StarterMatchRuntimeState; data: string } {
  state = hydrateRuntime(state);
  return {
    state: persistable(state),
    data: JSON.stringify({
      tick: tick,
      zoneId: state.zone.zoneId,
      playerCount: Object.keys(state.zone.players).length,
    }),
  };
}

function hydrateRuntime(state: StarterMatchRuntimeState): StarterMatchRuntimeState {
  const zone = state.zone;
  zone.players = dict(zone.players);
  zone.disconnected = dict(zone.disconnected);
  zone.actionRates = dict(zone.actionRates);
  if (!Array.isArray(zone.spawns)) {
    zone.spawns = [];
  }
  zone.processedDeathEventIds = dict(zone.processedDeathEventIds);
  bindContentCatalogs(zone);
  return {
    zone: zone,
    presences: dict(state.presences),
  };
}

function persistable(state: StarterMatchRuntimeState): StarterMatchRuntimeState {
  stripContentCatalogs(state.zone);
  return state;
}

function bindContentCatalogs(zone: StarterZoneState): void {
  zone.abilitiesById = abilityDefinitionsFromContent(content.abilities);
  zone.basicAbilityId = content.player.basicAbilityId;
  zone.progressionCatalog = catalogFromContent(content);
  zone.classTags = classTagsFromContent(content.classes);
  zone.itemsById = itemDefinitionsFromContent(content.items);
  zone.questsById = questDefinitionsFromContent(content.quests);
  zone.equipmentSlotsByTag = equipmentSlotsFromContent(content.equipmentSlots);
  zone.classEquipmentTags = classEquipmentTagsFromContent(content.classes);
  zone.enemyLootById = enemyLootFromContent();
  zone.enemiesById = enemyDefinitionsFromContent(content.enemies);
  zone.aiProfilesById = aiProfilesFromContent(content.aiProfiles);
  zone.lootTablesById = lootTablesFromContent(content.lootTables);
  zone.playerAttack = content.player.attack;
  zone.playerAttackRange = content.player.attackRange;
  zone.playerAttackCooldownSec = content.player.attackCooldown;
  zone.moveSpeed = content.player.moveSpeed;
  zone.interactionRange = content.player.interactionRange;
  if (typeof content.player.pickupRange === "number") {
    zone.pickupRange = content.player.pickupRange;
  }
}

function stripContentCatalogs(zone: StarterZoneState): void {
  zone.abilitiesById = undefined;
  zone.progressionCatalog = undefined;
  zone.classTags = undefined;
  zone.equipmentSlotsByTag = undefined;
  zone.classEquipmentTags = undefined;
  zone.itemsById = {};
  zone.questsById = {};
  zone.enemyLootById = {};
  zone.enemiesById = undefined;
  zone.aiProfilesById = undefined;
  zone.lootTablesById = undefined;
}

function enemyLootFromContent(): { [id: string]: { itemId: string; quantity: number; guaranteed?: boolean }[] } {
  const enemies = enemyDefinitionsFromContent(content.enemies);
  const loot: { [id: string]: { itemId: string; quantity: number; guaranteed?: boolean }[] } = {};
  const ids = Object.keys(enemies);
  for (let i = 0; i < ids.length; i++) {
    const def = enemies[ids[i]];
    if (def.loot === undefined) {
      continue;
    }
    const drops: { itemId: string; quantity: number; guaranteed?: boolean }[] = [];
    for (let d = 0; d < def.loot.length; d++) {
      const drop = def.loot[d];
      const copied: { itemId: string; quantity: number; guaranteed?: boolean } = {
        itemId: drop.itemId,
        quantity: drop.quantity,
      };
      if (drop.guaranteed !== undefined) {
        copied.guaranteed = drop.guaranteed;
      }
      drops.push(copied);
    }
    loot[ids[i]] = drops;
  }
  return loot;
}

function persistEconomy(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  tick: number,
  inventories: InventoryPersist[],
  equipment: EquipmentPersist[],
): void {
  const byUser: {
    [userId: string]: {
      characterId?: string;
      inventory?: InventoryPersist["inventory"];
      equipment?: EquipmentPersist["equipment"];
    };
  } = {};
  for (let i = 0; i < inventories.length; i++) {
    const persist = inventories[i];
    byUser[persist.userId] = {
      characterId: persist.characterId,
      inventory: persist.inventory,
    };
  }
  for (let e = 0; e < equipment.length; e++) {
    const persist = equipment[e];
    const current = byUser[persist.userId] !== undefined ? byUser[persist.userId] : {};
    current.characterId = persist.characterId !== undefined ? persist.characterId : current.characterId;
    current.equipment = persist.equipment;
    byUser[persist.userId] = current;
  }
  const userIds = Object.keys(byUser);
  for (let u = 0; u < userIds.length; u++) {
    const userId = userIds[u];
    const row = byUser[userId];
    const hasInventory = row.inventory !== undefined;
    const result = commitTransaction(nk, {
      requestId: "match-persist-" + userId + "-" + String(tick),
      characterId: row.characterId !== undefined ? row.characterId : "",
      userId: userId,
      reasonType: hasInventory ? TX_REASON_LOOT : TX_REASON_EQUIPMENT,
      reasonId: hasInventory ? "inventory" : "equipment",
      goldDelta: 0,
      currentGold: 0,
      inventory: row.inventory,
      equipment: row.equipment,
      metadata: { tick: tick },
    });
    if (!result.ok) {
      logger.info("starter_zone persist economy failed user_id=%s reason=%s", userId, result.code);
      continue;
    }
    logger.info("starter_zone persist economy user_id=%s", userId);
  }
}

function writeCheckpoints(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  checkpoints: PositionCheckpoint[],
): void {
  for (let i = 0; i < checkpoints.length; i++) {
    const checkpoint = checkpoints[i];
    writeCharacterCheckpoint(nk, checkpoint.userId, checkpoint.x, checkpoint.y, checkpoint.characterId);
    logger.info("starter_zone persist checkpoint user_id=%s", checkpoint.userId);
  }
}

function presencesExcept(
  presences: { [userId: string]: nkruntime.Presence },
  userId: string,
): nkruntime.Presence[] {
  const list: nkruntime.Presence[] = [];
  const ids = Object.keys(presences);
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== userId) {
      list.push(presences[ids[i]]);
    }
  }
  return list;
}

function presencesNotIn(
  presences: { [userId: string]: nkruntime.Presence },
  exclude: nkruntime.Presence[],
): nkruntime.Presence[] {
  const skip: { [userId: string]: boolean } = {};
  for (let i = 0; i < exclude.length; i++) {
    skip[exclude[i].userId] = true;
  }
  const list: nkruntime.Presence[] = [];
  const ids = Object.keys(presences);
  for (let i = 0; i < ids.length; i++) {
    if (!skip[ids[i]]) {
      list.push(presences[ids[i]]);
    }
  }
  return list;
}

function loadPlayerInventory(nk: nkruntime.Nakama, userId: string, character: { characterId: string; classId?: string }) {
  const existing = readInventory(nk, userId, character.characterId);
  const classId = character.classId !== undefined ? character.classId : "";
  const stacks = startingEquipmentForClass(classDefinitionsFromContent(content.classes), classId);
  const loaded = initializeInventoryFromStacks(existing, function () {
    return nk.uuidv4();
  }, stacks);
  if (loaded.created) {
    const now = Date.now();
    loaded.inventory.schemaVersion = SAVE_SCHEMA_VERSION;
    loaded.inventory.createdAt = now;
    loaded.inventory.updatedAt = now;
    writeInventoryOnce(nk, userId, loaded.inventory, character.characterId);
  }
  return loaded.inventory;
}

function loadPlayerProgression(
  nk: nkruntime.Nakama,
  userId: string,
  character: { characterId: string; classId?: string },
) {
  const existing = readProgression(nk, userId, character.characterId);
  if (existing !== null) {
    return { progression: existing, created: false };
  }
  const classId = character.classId !== undefined ? character.classId : "";
  const catalog = catalogFromContent(content);
  const progression = initializeProgression(catalog, classId);
  const now = Date.now();
  progression.schemaVersion = SAVE_SCHEMA_VERSION;
  progression.createdAt = now;
  progression.updatedAt = now;
  writeProgressionOnce(nk, userId, progression, character.characterId);
  return { progression: progression, created: true };
}

function applyJoinDerived(zone: StarterZoneState, player: MatchPlayer): void {
  if (zone.progressionCatalog === undefined || player.classId === undefined || player.classId.length === 0) {
    return;
  }
  if (player.progression === undefined) {
    player.progression = initializeProgression(zone.progressionCatalog, player.classId);
  }
  syncCombatStatsFromPipeline(player, zone.progressionCatalog, zone.itemsById);
}

function allPresences(presences: { [userId: string]: nkruntime.Presence }): nkruntime.Presence[] {
  const list: nkruntime.Presence[] = [];
  const ids = Object.keys(presences);
  for (let i = 0; i < ids.length; i++) {
    list.push(presences[ids[i]]);
  }
  return list;
}

function resolveTargets(
  presences: { [userId: string]: nkruntime.Presence },
  toUserId?: string,
  broadcastOthersFrom?: string,
): nkruntime.Presence[] | null {
  if (toUserId !== undefined) {
    const presence = presences[toUserId];
    return presence !== undefined ? [presence] : [];
  }
  if (broadcastOthersFrom !== undefined && broadcastOthersFrom.length > 0) {
    return presencesExcept(presences, broadcastOthersFrom);
  }
  return null;
}

export const starterZoneMatchHandler: nkruntime.MatchHandler<StarterMatchRuntimeState> = {
  matchInit: matchInit,
  matchJoinAttempt: matchJoinAttempt,
  matchJoin: matchJoin,
  matchLeave: matchLeave,
  matchLoop: matchLoop,
  matchTerminate: matchTerminate,
  matchSignal: matchSignal,
};
