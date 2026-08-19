import { content, contentHash, packageVersion } from "../generated/content";
import { readCharacter, writeCharacterCheckpoint } from "./character_store";
import { readQuests, writeQuests } from "./quest_store";
import { readInventory, writeInventory, writeInventoryOnce } from "./inventory_store";
import { readEquipment, writeEquipment } from "./equipment_store";
import { loadWalletRef } from "./wallet_ref_store";
import { SAVE_SCHEMA_VERSION, publicSaveRejectCode } from "../domain/save_schema";
import { applyGmToMatch, gmRequestFromMatchSignal } from "../domain/gm";
import { writeGmCommandResult } from "./gm_store";
import { commitQuestReward, commitTransaction, readGold } from "./quest_reward_store";
import { commitTradeTransaction, readTrade, readTradeIndex, writeTrade } from "./trade_store";
import { cancelTradesForUser, recoverCommittingTrades } from "../domain/match_trade";
import { cancelTrade, type TradeRecord } from "../domain/trade";
import { clearLocksByLockId, initializeInventoryFromStacks, itemDefinitionsFromContent, INVENTORY_CAPACITY, type PlayerInventory } from "../domain/inventory";
import { TX_REASON_ADMIN_GRANT, TX_REASON_EQUIPMENT, TX_REASON_LOOT } from "../domain/transaction";
import { validateJoinAttempt } from "../domain/join_validation";
import { applyMatchLoop, snapshotForOthers, type IncomingMatchData, type EquipmentPersist, type InventoryPersist, type MatchLoopResult } from "../domain/match_loop";
import { PLAYER_RESPAWN_DELAY_SEC } from "../domain/combat";
import { questDefinitionsFromContent } from "../domain/quest";
import {
  derivedAttack,
  equipmentSlotsFromContent,
  loadEquipment,
} from "../domain/equipment";
import {
  CAVE_EMPTY_TIMEOUT_TICKS,
  CAVE_MATCH_MAX_PLAYERS,
  CAVE_RECONNECT_GRACE_TICKS,
  CAVE_ZONE_ID,
  MATCH_TICK_RATE,
  PARTY_CAVE_LABEL,
  STARTER_ZONE_ID,
  STARTER_ZONE_LABEL,
  addPlayer,
  buildFullState,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  findPlayerByCharacterId,
  fullStateOpcode,
  partyViewForPlayer,
  type MatchPlayer,
  type StarterZoneState,
} from "../domain/match_state";
import { dict } from "../domain/maps";
import { groupCreditRulesFromPlayer } from "../domain/party";
import { applyPartyMatchSignal } from "../domain/party_credit";
import { actionResult, partyEventMessage, partyStateMessage, systemMessage } from "../domain/protocol";
import { nakamaPartyRepository } from "./party_store";
import { markPartyDisconnectGrace, markPartyOnline } from "../rpcs/party";
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
import { abilityDefinitionsFromContent, prepareJoinedPlayerAbilities, startingAbilitiesForClass } from "../domain/ability";
import { spawnDefinitionsFromContent } from "../domain/spawn_controller";
import { aiProfilesFromContent } from "../domain/threat";
import { lootTablesFromContent } from "../domain/loot_table";
import { npcDefinitionsFromContent } from "../domain/npc";
import { vendorDefinitionsFromContent } from "../domain/vendor";
import { readProgression, writeProgression, writeProgressionOnce } from "./progression_store";
import { accountCaveRepository, nakamaCaveRepository } from "./cave_store";
import { readActiveLocation, writeActiveLocation } from "./location_store";
import { nakamaTransferRepository } from "./transfer_store";
import {
  applyPersistedCaveCompletion,
  associateCharacterWithCave,
  canJoinOwnedCave,
  clearCharacterCaveAssociation,
  emptyTimeoutMs,
  findOrCreateOwnedCave,
  markCaveActive,
  markCaveEmptyGrace,
  resolvePartyForActor,
  setCaveCompletion,
  terminateCave,
} from "../domain/cave";
import {
  caveLocation,
  publicWorldLocation,
} from "../domain/instance";
import { evaluateJoinPresence, withCheckpoint, withTransferState } from "../domain/location";
import { consumeTransferTicket, issueTransferTicket, previewTransferTicket } from "../domain/transfer";
import { createCaveMatch } from "../rpcs/cave";
import { findOrCreateStarterZoneMatch } from "./starter_zone_registry";
import { formatOpsLog, incrementCounter } from "../domain/ops_metrics";
import { SLOW_TICK_MS } from "../domain/rate_limit";
import { shouldWarnShutdown, shutdownWarningMessage } from "../domain/maintenance";
import { readEffectiveMaintenance, readEnvironment } from "./ops_store";

export interface StarterMatchRuntimeState {
  zone: StarterZoneState;
  presences: { [userId: string]: nkruntime.Presence };
  pendingTransfers?: { [userId: string]: string };
  lastMaintenanceWarnTick?: number;
}

export function matchInit(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  params: { [key: string]: any },
): { state: StarterMatchRuntimeState; tickRate: number; label: string } {
  const instanceType = String(params.instanceType !== undefined ? params.instanceType : "public_world");
  const isCave = instanceType === "party_cave";
  const requested = String(params.zoneTemplateId !== undefined ? params.zoneTemplateId : "");
  const zoneContent = resolveZoneContent(isCave, requested);
  const instanceId = String(params.instanceId !== undefined ? params.instanceId : "world.public");
  const completionState = String(params.completionState !== undefined ? params.completionState : "none") as
    | "none"
    | "in_progress"
    | "boss_defeated";
  const zone = createStarterZoneState(
    contentHash,
    zoneContent,
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
      npcsById: npcDefinitionsFromContent(content.npcs),
      vendorsById: vendorDefinitionsFromContent(content.vendors),
      groupCreditRules: groupCreditRulesFromPlayer(content.player),
      instanceType: isCave ? "party_cave" : "public_world",
      instanceId: instanceId,
      ownerPartyId: params.ownerPartyId !== undefined && String(params.ownerPartyId).length > 0 ? String(params.ownerPartyId) : undefined,
      ownerCharacterId:
        params.ownerCharacterId !== undefined && String(params.ownerCharacterId).length > 0
          ? String(params.ownerCharacterId)
          : undefined,
      completionState: completionState,
      maxPlayers: isCave ? CAVE_MATCH_MAX_PLAYERS : undefined,
      emptyTimeoutTicks: isCave ? CAVE_EMPTY_TIMEOUT_TICKS : undefined,
      reconnectGraceTicks: isCave ? CAVE_RECONNECT_GRACE_TICKS : undefined,
    },
  );
  zone.progressionCatalog = catalogFromContent(content);
  zone.matchId = typeof ctx.matchId === "string" ? ctx.matchId : "";
  zone.trades = {};
  zone.tradeByCharacterId = {};
  if (isCave) {
    applyPersistedCaveCompletion(zone);
  }
  const label = isCave ? PARTY_CAVE_LABEL : STARTER_ZONE_LABEL;
  incrementCounter(isCave ? "activeCaveMatches" : "activePublicMatches");
  logger.info(formatOpsLog("match_create", { label: label, instance_type: instanceType, content_hash: contentHash }));
  return {
    state: persistable({ zone: zone, presences: {} }),
    tickRate: MATCH_TICK_RATE,
    label: label,
  };
}

export function matchJoinAttempt(
  ctx: nkruntime.Context,
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
  const env = readEnvironment(ctx);
  const maintenance = readEffectiveMaintenance(nk, env, ctx.env);
  const gate = validateJoinAttempt(
    state.zone,
    contentHash,
    meta,
    alreadyJoined,
    presence.sessionId,
    existing !== undefined ? existing.sessionId : "",
    {
      minClientVersion: env.minClientVersion,
      maxClientVersion: env.maxClientVersion,
      expectedContentVersion: env.contentVersion.length > 0 ? env.contentVersion : packageVersion,
      maintenance: maintenance,
    },
  );
  if (!gate.accept) {
    logger.info(formatOpsLog("match_join_rejected", { user_id: presence.userId, reason: gate.rejectMessage !== undefined ? gate.rejectMessage : "join_failed" }));
    incrementCounter("rejectedActions");
    return { state: persistable(state), accept: false, rejectMessage: gate.rejectMessage };
  }
  const transferTicketId = meta.transferTicket !== undefined ? meta.transferTicket : "";
  const hasTransfer = transferTicketId.length > 0;
  try {
    const deps = characterLifecycleDeps(nk);
    migrateLegacyCharacterIntoRoster(presence.userId, deps);
    const ticket = readSelection(nk, presence.userId);
    const selectedId = ticket !== null ? ticket.characterId : "";
    const character = selectedId.length > 0 ? readCharacter(nk, presence.userId, selectedId) : null;
    if (!hasTransfer) {
      const presented = meta.selectionTicket !== undefined ? meta.selectionTicket : "";
      const selected = validateJoinSelection(presented, ticket, presence.userId, character, Date.now());
      if (!selected.ok) {
        logger.info("starter_zone join rejected user_id=%s reason=%s", presence.userId, selected.reason);
        return { state: persistable(state), accept: false, rejectMessage: selected.reason };
      }
    }
    if (character === null) {
      logger.info("starter_zone join rejected user_id=%s reason=character_missing", presence.userId);
      return { state: persistable(state), accept: false, rejectMessage: "character_missing" };
    }
    const location = readActiveLocation(nk, presence.userId, character.characterId);
    const instanceType = state.zone.instanceType !== undefined ? state.zone.instanceType : "public_world";
    const joiningMatchId = typeof ctx.matchId === "string" ? ctx.matchId : "";
    let locatedCaveAlive = false;
    if (location !== null && location.instanceType === "party_cave") {
      const cave = nakamaCaveRepository(nk).getCave(location.instanceId);
      locatedCaveAlive =
        cave !== null &&
        cave.lifecycleState !== "expired" &&
        cave.lifecycleState !== "terminated" &&
        nk.matchGet(cave.matchId) !== null;
    }
    const originPresenceLive =
      location !== null &&
      location.transferState === "issued" &&
      (joiningMatchId.length === 0 || location.matchId !== joiningMatchId);
    const presenceGate = evaluateJoinPresence({
      location: location,
      joiningMatchId: joiningMatchId,
      joiningInstanceType: instanceType,
      hasTransferTicket: hasTransfer,
      originPresenceLive: originPresenceLive,
      destinationCaveAlive: locatedCaveAlive,
    });
    if (!presenceGate.accept) {
      logger.info("starter_zone join rejected user_id=%s reason=%s", presence.userId, presenceGate.rejectMessage);
      return { state: persistable(state), accept: false, rejectMessage: presenceGate.rejectMessage };
    }
    if (hasTransfer) {
      const preview = nakamaTransferRepository(nk).getTicket(transferTicketId);
      const checked = previewTransferTicket(preview, {
        characterId: character.characterId,
        accountUserId: presence.userId,
        destinationMatchId: joiningMatchId.length > 0 ? joiningMatchId : preview !== null ? preview.destinationMatchId : "",
        nowMs: Date.now(),
      });
      if (!checked.ok) {
        return { state: persistable(state), accept: false, rejectMessage: checked.code };
      }
      if (state.pendingTransfers === undefined) {
        state.pendingTransfers = {};
      }
      state.pendingTransfers[presence.userId] = transferTicketId;
    }
    if (instanceType === "party_cave") {
      const instanceId = state.zone.instanceId !== undefined ? state.zone.instanceId : "";
      const record = instanceId.length > 0 ? nakamaCaveRepository(nk).getCave(instanceId) : null;
      if (record === null) {
        return { state: persistable(state), accept: false, rejectMessage: "cave_expired" };
      }
      const party = resolvePartyForActor(nakamaPartyRepository(nk), presence.userId, character.characterId);
      const allowed = canJoinOwnedCave({ characterId: character.characterId, record: record, party: party });
      if (!allowed.ok) {
        return { state: persistable(state), accept: false, rejectMessage: allowed.code };
      }
    }
    readInventory(nk, presence.userId, character.characterId);
    readEquipment(nk, presence.userId, character.characterId);
    readQuests(nk, presence.userId, character.characterId);
    readProgression(nk, presence.userId, character.characterId);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "save_incompatible";
    const reason = publicSaveRejectCode(raw);
    logger.info(formatOpsLog("match_join_rejected", { user_id: presence.userId, reason: reason }));
    incrementCounter("rejectedActions");
    return { state: persistable(state), accept: false, rejectMessage: reason };
  }
  const alreadySameSession =
    alreadyJoined && (existing === undefined || existing.sessionId === presence.sessionId || existing.sessionId === "");
  if (alreadySameSession) {
    return { state: persistable(state), accept: true };
  }
  return { state: persistable(state), accept: true };
}

export function matchJoin(
  ctx: nkruntime.Context,
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
      loadPartyCache(nk, zone, presence.userId, existingLive.characterId, existingLive.name);
      markPartyOnline(nk, {
        accountUserId: presence.userId,
        characterId: existingLive.characterId,
        displayName: existingLive.name,
      }, Date.now());
      joined.push(presence);
      logger.info(formatOpsLog("reconnect", { user_id: presence.userId }));
      incrementCounter("reconnects");
      incrementCounter("connectedPlayers");
      recoverJoinTrade(nk, zone, existingLive);
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
        x: spawnX(zone, character.position.x),
        y: spawnY(zone, character.position.y),
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
        lastCheckpointX: spawnX(zone, character.position.x),
        lastCheckpointY: spawnY(zone, character.position.y),
        bindX: character.bindX,
        bindY: character.bindY,
        bindZoneId: character.bindZoneId,
        innByRequestId: character.innByRequestId,
      };
      applyJoinDerived(zone, player);
      player.health = joinHealth(player.maxHealth);
    }
    if (
      !consumeJoinTransfer(
        nk,
        state,
        presence.userId,
        character.characterId,
        zone,
        player,
        typeof ctx.matchId === "string" ? ctx.matchId : "",
      )
    ) {
      dispatcher.matchKick([presence]);
      delete nextPresences[presence.userId];
      continue;
    }
    commitJoinLocation(nk, zone, presence.userId, character.characterId, player, typeof ctx.matchId === "string" ? ctx.matchId : "");
    const ownershipChanged = prepareJoinedPlayerAbilities(zone, player, parked === null);
    if (ownershipChanged && player.progression !== undefined) {
      writeProgression(nk, presence.userId, player.progression, character.characterId);
    }
    if (parked !== null) {
      logger.info(formatOpsLog("reconnect", { user_id: presence.userId, kind: "grace" }));
      incrementCounter("reconnects");
      incrementCounter("connectedPlayers");
    } else {
      logger.info(formatOpsLog("match_join", { user_id: presence.userId, character_id: character.characterId }));
      incrementCounter("connectedPlayers");
    }
    zone = addPlayer(zone, player);
    recoverJoinTrade(nk, zone, player);
    loadPartyCache(nk, zone, presence.userId, character.characterId, character.name);
    markPartyOnline(nk, {
      accountUserId: presence.userId,
      characterId: character.characterId,
      displayName: character.name,
    }, Date.now());
    joined.push(presence);
  }
  recoverCommittingTrades(zone, function (request) {
    return commitTradeTransaction(nk, request);
  });

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

  return { state: persistable({ zone: zone, presences: nextPresences, pendingTransfers: state.pendingTransfers }) };
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
    const live = zone.players[presence.userId];
    const transferring = live !== undefined && (live.transferState === "issued" || live.transferState === "pending");
    if (transferring && live !== undefined) {
      const persistInventories: { [userId: string]: PlayerInventory } = {};
      const persistTrades: { [tradeId: string]: TradeRecord } = {};
      cancelTradesForUser(zone, presence.userId, "zone_transfer", [], persistInventories, persistTrades);
      const unlockedIds = Object.keys(persistInventories);
      for (let u = 0; u < unlockedIds.length; u++) {
        const uid = unlockedIds[u];
        const inv = persistInventories[uid];
        const owner = zone.players[uid];
        if (owner !== undefined) {
          writeInventory(nk, uid, inv, owner.characterId);
        }
      }
      const tradeIds = Object.keys(persistTrades);
      for (let t = 0; t < tradeIds.length; t++) {
        writeTrade(nk, persistTrades[tradeIds[t]]);
      }
    }
    const left = applyPlayerLeave(zone, presence.userId, tick);
    zone = left.state;
    if (left.checkpoint !== null) {
      if ((zone.instanceType !== "party_cave") && !transferring) {
        writeCharacterCheckpoint(nk, left.checkpoint.userId, left.checkpoint.x, left.checkpoint.y, left.checkpoint.characterId);
      }
      const nowMs = Date.now();
      const location = readActiveLocation(nk, presence.userId, left.checkpoint.characterId);
      if (location !== null) {
        if (transferring) {
          writeActiveLocation(nk, withTransferState(withCheckpoint(location, left.checkpoint.x, left.checkpoint.y, nowMs), "in_flight", nowMs));
        } else {
          writeActiveLocation(nk, withCheckpoint(location, left.checkpoint.x, left.checkpoint.y, nowMs));
        }
      }
      if (!transferring) {
        markPartyDisconnectGrace(nk, {
          accountUserId: presence.userId,
          characterId: left.checkpoint.characterId,
          displayName: "",
        }, Date.now());
      }
      logger.info("starter_zone leave checkpoint user_id=%s", presence.userId);
    }
    delete nextPresences[presence.userId];
    logger.info(formatOpsLog("match_leave", { user_id: presence.userId }));
    incrementCounter("connectedPlayers", -1);
  }
  touchCaveOccupancy(nk, zone);
  const remaining = allPresences(nextPresences);
  if (remaining.length > 0) {
    const snapshot = snapshotForOthers(zone, tick, "");
    dispatcher.broadcastMessage(snapshot.opcode, snapshot.body, remaining, null, true);
  }
  return { state: persistable({ zone: zone, presences: nextPresences, pendingTransfers: state.pendingTransfers }) };
}

export function matchLoop(
  ctx: nkruntime.Context,
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
  let result: MatchLoopResult;
  const tickStartedMs = Date.now();
  try {
    result = applyMatchLoop(state.zone, tick, contentHash, incoming, function () {
      return nk.uuidv4();
    }, function (request) {
      return commitQuestReward(nk, request);
    }, function (request) {
      return commitTransaction(nk, request);
    }, function (request) {
      return commitTradeTransaction(nk, request);
    });
  } catch (error) {
    incrementCounter("matchLoopErrors");
    logger.error(
      formatOpsLog("match_loop_error", {
        reason: error instanceof Error ? error.message : "internal_error",
        tick: tick,
      }),
    );
    return { state: persistable(state) };
  }
  const tickMs = Date.now() - tickStartedMs;
  if (tickMs > SLOW_TICK_MS) {
    logger.warn(formatOpsLog("slow_tick", { tick: tick, ms: tickMs, messages: incoming.length }));
  }
  for (let p = 0; p < result.persistQuests.length; p++) {
    const persist = result.persistQuests[p];
    writeQuests(nk, persist.userId, persist.log, persist.characterId);
    logger.info(formatOpsLog("quest_reward", { user_id: persist.userId }));
  }
  persistEconomy(nk, logger, tick, result.persistInventories, result.persistEquipment);
  for (let t = 0; t < result.persistTrades.length; t++) {
    writeTrade(nk, result.persistTrades[t]);
    logger.info(formatOpsLog("trade_complete", { trade_id: result.persistTrades[t].tradeId }));
  }
  for (let pg = 0; pg < result.persistProgression.length; pg++) {
    const persist = result.persistProgression[pg];
    writeProgression(nk, persist.userId, persist.progression, persist.characterId);
    logger.info("starter_zone persist progression user_id=%s", persist.userId);
  }
  if (result.state.instanceType !== "party_cave") {
    writeCheckpoints(nk, logger, result.persistCheckpoints);
  }
  processCaveTransfers(nk, logger, dispatcher, ctx, state.presences, result);
  if (result.caveCompletionChanged && result.state.instanceType === "party_cave" && result.state.instanceId !== undefined) {
    const repo = nakamaCaveRepository(nk);
    const record = repo.getCave(result.state.instanceId);
    if (record !== null && result.state.completionState !== undefined) {
      repo.putCave(setCaveCompletion(record, result.state.completionState, Date.now()));
    }
  }
  touchCaveOccupancy(nk, result.state);
  for (let r = 0; r < result.rejections.length; r++) {
    const rejected = result.rejections[r];
    logger.info(
      formatOpsLog("rejected_action", {
        user_id: rejected.userId,
        action: rejected.action,
        reason: rejected.code,
        tick: rejected.tick,
      }),
    );
    incrementCounter("rejectedActions");
  }
  const env = readEnvironment(ctx);
  const maintenance = readEffectiveMaintenance(nk, env, ctx.env);
  if (shouldWarnShutdown(maintenance, Date.now())) {
    const last = state.lastMaintenanceWarnTick !== undefined ? state.lastMaintenanceWarnTick : -1000;
    if (tick - last >= MATCH_TICK_RATE * 10) {
      const notice = systemMessage("server_maintenance", shutdownWarningMessage(maintenance, Date.now()));
      dispatcher.broadcastMessage(notice.opcode, notice.body, null, null, true);
      state.lastMaintenanceWarnTick = tick;
    }
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
    logger.info(formatOpsLog("match_terminate", { reason: "empty_timeout", tick: tick, instance_type: result.state.instanceType !== undefined ? result.state.instanceType : "public_world" }));
    incrementCounter(result.state.instanceType === "party_cave" ? "activeCaveMatches" : "activePublicMatches", -1);
    if (result.state.instanceType === "party_cave" && result.state.instanceId !== undefined) {
      const repo = nakamaCaveRepository(nk);
      const record = repo.getCave(result.state.instanceId);
      if (record !== null) {
        terminateCave(repo, record, Date.now());
        logger.info(formatOpsLog("cave_cleanup", { instance_id: result.state.instanceId, reason: "empty_timeout" }));
      }
    }
    return null;
  }
  return { state: persistable({ zone: result.state, presences: state.presences, pendingTransfers: state.pendingTransfers, lastMaintenanceWarnTick: state.lastMaintenanceWarnTick }) };
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
  const instanceType = state.zone.instanceType !== undefined ? state.zone.instanceType : "public_world";
  incrementCounter(instanceType === "party_cave" ? "activeCaveMatches" : "activePublicMatches", -1);
  logger.info(formatOpsLog("match_terminate", { instance_type: instanceType }));
  if (state.zone.instanceType === "party_cave" && state.zone.instanceId !== undefined) {
    const repo = nakamaCaveRepository(nk);
    const record = repo.getCave(state.zone.instanceId);
    if (record !== null && record.lifecycleState !== "terminated" && record.lifecycleState !== "expired") {
      terminateCave(repo, record, Date.now());
      logger.info(formatOpsLog("cave_cleanup", { instance_id: state.zone.instanceId, reason: "match_terminate" }));
    }
  }
  return { state: persistable(state) };
}

export function matchSignal(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  data: string,
): { state: StarterMatchRuntimeState; data: string } {
  state = hydrateRuntime(state);
  if (typeof data === "string" && data.length > 0) {
    try {
      const parsed = JSON.parse(data) as { [key: string]: unknown };
      if (parsed.type === "gm_command") {
        const gmData = applyGmSignal(nk, logger, dispatcher, tick, state, parsed);
        return {
          state: persistable(state),
          data: JSON.stringify(gmData),
        };
      }
      if (state.zone.partyByCharacterId === undefined) {
        state.zone.partyByCharacterId = {};
      }
      if (state.zone.pendingInvitesByCharacterId === undefined) {
        state.zone.pendingInvitesByCharacterId = {};
      }
      applyPartyMatchSignal(state.zone.partyByCharacterId, state.zone.pendingInvitesByCharacterId, parsed);
      broadcastPartyUpdates(dispatcher, state, parsed, tick);
    } catch {
      // Party signals are best-effort; ignore malformed payloads.
    }
  }
  return {
    state: persistable(state),
    data: JSON.stringify({
      tick: tick,
      zoneId: state.zone.zoneId,
      playerCount: Object.keys(state.zone.players).length,
    }),
  };
}

function loadPartyCache(
  nk: nkruntime.Nakama,
  zone: StarterZoneState,
  userId: string,
  characterId: string,
  displayName: string,
): void {
  if (zone.partyByCharacterId === undefined) {
    zone.partyByCharacterId = {};
  }
  if (zone.pendingInvitesByCharacterId === undefined) {
    zone.pendingInvitesByCharacterId = {};
  }
  const repo = nakamaPartyRepository(nk);
  const index = repo.getIndex(userId, characterId);
  if (index === null) {
    return;
  }
  if (index.partyId.length > 0) {
    const party = repo.getParty(index.partyId);
    if (party !== null) {
      const members: { [key: string]: unknown }[] = [];
      for (let i = 0; i < party.members.length; i++) {
        members.push({
          accountUserId: party.members[i].accountUserId,
          characterId: party.members[i].characterId,
          displayName: party.members[i].displayName,
          connectionState: party.members[i].connectionState,
        });
      }
      applyPartyMatchSignal(zone.partyByCharacterId, zone.pendingInvitesByCharacterId, {
        type: "party_update",
        partyId: party.partyId,
        characterId: characterId,
        revision: party.revision,
        leaderCharacterId: party.leaderCharacterId,
        lootPolicy: party.lootPolicy,
        members: members,
      });
    }
  }
  if (index.pendingPartyId.length > 0) {
    const pending = repo.getParty(index.pendingPartyId);
    if (pending !== null) {
      zone.pendingInvitesByCharacterId[characterId] = {
        partyId: pending.partyId,
        fromDisplayName: displayName,
        expiresAt: Date.now() + 60000,
      };
    }
  }
}

function broadcastPartyUpdates(
  dispatcher: nkruntime.MatchDispatcher,
  state: StarterMatchRuntimeState,
  parsed: { [key: string]: unknown },
  _tick: number,
): void {
  const eventType = typeof parsed.eventType === "string" ? parsed.eventType : "updated";
  const ids = Object.keys(state.zone.players);
  for (let i = 0; i < ids.length; i++) {
    const player = state.zone.players[ids[i]];
    const presence = state.presences[player.userId];
    if (presence === undefined) {
      continue;
    }
    const view = partyViewForPlayer(state.zone, player.userId);
    const message = partyStateMessage(contentHash, view, view !== null && view.pendingInvite !== undefined ? (view.pendingInvite as { [key: string]: unknown }) : null);
    dispatcher.broadcastMessage(message.opcode, message.body, [presence], null, true);
  }
  const event = partyEventMessage(contentHash, eventType, {
    partyId: typeof parsed.partyId === "string" ? parsed.partyId : "",
    systemMessage: typeof parsed.systemMessage === "string" ? parsed.systemMessage : "",
  });
  const recipients: nkruntime.Presence[] = [];
  for (let i = 0; i < ids.length; i++) {
    const presence = state.presences[ids[i]];
    if (presence !== undefined) {
      recipients.push(presence);
    }
  }
  if (recipients.length > 0) {
    dispatcher.broadcastMessage(event.opcode, event.body, recipients, null, true);
  }
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
  zone.partyByCharacterId = dict(zone.partyByCharacterId);
  zone.pendingInvitesByCharacterId = dict(zone.pendingInvitesByCharacterId);
  zone.trades = dict(zone.trades);
  zone.tradeByCharacterId = dict(zone.tradeByCharacterId);
  bindContentCatalogs(zone);
  return {
    zone: zone,
    presences: dict(state.presences),
    pendingTransfers: dict(state.pendingTransfers),
    lastMaintenanceWarnTick: state.lastMaintenanceWarnTick,
  };
}

function spawnX(zone: StarterZoneState, fallback: number): number {
  if (zone.instanceType === "party_cave") {
    return zone.playerSpawnX;
  }
  return fallback;
}

function spawnY(zone: StarterZoneState, fallback: number): number {
  if (zone.instanceType === "party_cave") {
    return zone.playerSpawnY;
  }
  return fallback;
}

function consumeJoinTransfer(
  nk: nkruntime.Nakama,
  state: StarterMatchRuntimeState,
  userId: string,
  characterId: string,
  zone: StarterZoneState,
  player: MatchPlayer,
  matchId: string,
): boolean {
  const pending = state.pendingTransfers !== undefined ? state.pendingTransfers[userId] : undefined;
  if (pending === undefined || pending.length === 0) {
    return true;
  }
  if (state.pendingTransfers !== undefined) {
    delete state.pendingTransfers[userId];
  }
  const ticketRepo = nakamaTransferRepository(nk);
  const pendingTicket = ticketRepo.getTicket(pending);
  const destinationMatchId =
    matchId.length > 0 ? matchId : pendingTicket !== null ? pendingTicket.destinationMatchId : "";
  const consumed = consumeTransferTicket(ticketRepo, pending, {
    characterId: characterId,
    accountUserId: userId,
    destinationMatchId: destinationMatchId,
    nowMs: Date.now(),
  });
  if (!consumed.ok || consumed.ticket === undefined) {
    return false;
  }
  player.transferState = "idle";
  if (zone.instanceType === "party_cave" && zone.instanceId !== undefined) {
    associateCharacterWithCave(accountCaveRepository(nk, userId), characterId, zone.instanceId);
  }
  return true;
}

function commitJoinLocation(
  nk: nkruntime.Nakama,
  zone: StarterZoneState,
  userId: string,
  characterId: string,
  player: MatchPlayer,
  matchId: string,
): void {
  const nowMs = Date.now();
  if (zone.instanceType === "party_cave" && zone.instanceId !== undefined) {
    const record = nakamaCaveRepository(nk).getCave(zone.instanceId);
    if (record !== null) {
      writeActiveLocation(nk, caveLocation(record, characterId, userId, player.x, player.y, nowMs));
      nakamaCaveRepository(nk).putCave(markCaveActive(record, nowMs, emptyTimeoutMs()));
      return;
    }
  }
  writeActiveLocation(nk, publicWorldLocation(matchId, characterId, userId, player.x, player.y, nowMs));
}

function touchCaveOccupancy(nk: nkruntime.Nakama, zone: StarterZoneState): void {
  if (zone.instanceType !== "party_cave" || zone.instanceId === undefined) {
    return;
  }
  const repo = nakamaCaveRepository(nk);
  const record = repo.getCave(zone.instanceId);
  if (record === null) {
    return;
  }
  const nowMs = Date.now();
  const live = Object.keys(dict(zone.players)).length;
  if (live === 0) {
    repo.putCave(markCaveEmptyGrace(record, nowMs, emptyTimeoutMs()));
    return;
  }
  repo.putCave(markCaveActive(record, nowMs, emptyTimeoutMs()));
}

function processCaveTransfers(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  dispatcher: nkruntime.MatchDispatcher,
  ctx: nkruntime.Context,
  presences: { [userId: string]: nkruntime.Presence },
  result: MatchLoopResult,
): void {
  for (let i = 0; i < result.transfers.length; i++) {
    const intent = result.transfers[i];
    const player = result.state.players[intent.userId];
    if (player === undefined) {
      continue;
    }
    try {
      const originMatchId = typeof ctx.matchId === "string" ? ctx.matchId : "";
      if (intent.direction === "enter") {
        const allocated = findOrCreateOwnedCave(accountCaveRepository(nk, intent.userId), {
          create: function (params) {
            return createCaveMatch(nk, params);
          },
          isRunning: function (matchId: string) {
            return nk.matchGet(matchId) !== null;
          },
          contentHash: contentHash,
          nowMs: Date.now(),
          newId: function () {
            return nk.uuidv4();
          },
          emptyTimeoutMs: emptyTimeoutMs(),
        }, {
          characterId: intent.characterId,
          ownerKind: resolvePartyForActor(nakamaPartyRepository(nk), intent.userId, intent.characterId) !== null ? "party" : "character",
          ownerId: ownerIdFor(nk, intent.userId, intent.characterId),
          party: resolvePartyForActor(nakamaPartyRepository(nk), intent.userId, intent.characterId),
        });
        if (!allocated.ok || allocated.record === undefined) {
          player.transferState = "idle";
          const failed = actionResult(allocated.code, false, intent.requestId);
          const failedTarget = targetPresence(presences, intent.userId);
          if (failedTarget !== null) {
            dispatcher.broadcastMessage(failed.opcode, failed.body, [failedTarget], null, true);
          }
          logger.info("cave enter rejected user_id=%s reason=%s", intent.userId, allocated.code);
          continue;
        }
        const ticket = issueTransferTicket({
          ticketId: nk.uuidv4(),
          characterId: intent.characterId,
          accountUserId: intent.userId,
          originMatchId: originMatchId,
          destinationMatchId: allocated.record.matchId,
          destinationInstanceId: allocated.record.instanceId,
          nowMs: Date.now(),
        });
        nakamaTransferRepository(nk).putTicket(ticket);
        player.transferState = "issued";
        writeCharacterCheckpoint(nk, intent.userId, player.x, player.y, intent.characterId);
        const location = publicWorldLocation(originMatchId, intent.characterId, intent.userId, player.x, player.y, Date.now());
        writeActiveLocation(nk, withTransferState(location, "issued", Date.now()));
        const ok = actionResult("ok", true, intent.requestId, {
          ticketId: ticket.ticketId,
          destinationMatchId: ticket.destinationMatchId,
          destinationInstanceId: ticket.destinationInstanceId,
          originMatchId: ticket.originMatchId,
          zoneId: allocated.record.zoneTemplateId,
          instanceType: "party_cave",
        });
        const target = targetPresence(presences, intent.userId);
        if (target !== null) {
          dispatcher.broadcastMessage(ok.opcode, ok.body, [target], null, true);
        }
        logger.info("cave enter ticket user_id=%s instance_id=%s", intent.userId, allocated.record.instanceId);
        continue;
      }
      const publicMatchId = findOrCreateStarterZoneMatch(nk, logger);
      const ticket = issueTransferTicket({
        ticketId: nk.uuidv4(),
        characterId: intent.characterId,
        accountUserId: intent.userId,
        originMatchId: originMatchId,
        destinationMatchId: publicMatchId,
        destinationInstanceId: "world.public",
        nowMs: Date.now(),
      });
      nakamaTransferRepository(nk).putTicket(ticket);
      player.transferState = "issued";
      const current = readActiveLocation(nk, intent.userId, intent.characterId);
      if (current !== null) {
        writeActiveLocation(nk, withTransferState(withCheckpoint(current, player.x, player.y, Date.now()), "issued", Date.now()));
      }
      if (result.state.instanceId !== undefined) {
        clearCharacterCaveAssociation(accountCaveRepository(nk, intent.userId), intent.characterId, result.state.instanceId);
      }
      const ok = actionResult("ok", true, intent.requestId, {
        ticketId: ticket.ticketId,
        destinationMatchId: ticket.destinationMatchId,
        destinationInstanceId: ticket.destinationInstanceId,
        originMatchId: ticket.originMatchId,
        zoneId: "zone.starter",
        instanceType: "public_world",
      });
      const target = targetPresence(presences, intent.userId);
      if (target !== null) {
        dispatcher.broadcastMessage(ok.opcode, ok.body, [target], null, true);
      }
      logger.info("cave exit ticket user_id=%s", intent.userId);
    } catch (error) {
      player.transferState = "idle";
      const code = error instanceof Error ? error.message : "internal_error";
      const failed = actionResult(code, false, intent.requestId);
      const target = targetPresence(presences, intent.userId);
      if (target !== null) {
        dispatcher.broadcastMessage(failed.opcode, failed.body, [target], null, true);
      }
      logger.info("cave transfer rejected user_id=%s reason=%s", intent.userId, code);
      incrementCounter("transferFailures");
    }
  }
}

function ownerIdFor(nk: nkruntime.Nakama, userId: string, characterId: string): string {
  const party = resolvePartyForActor(nakamaPartyRepository(nk), userId, characterId);
  if (party !== null) {
    return party.partyId;
  }
  return characterId;
}

function targetPresence(presences: { [userId: string]: nkruntime.Presence }, userId: string): nkruntime.Presence | null {
  const found = presences[userId];
  return found !== undefined ? found : null;
}

function recoverJoinTrade(nk: nkruntime.Nakama, zone: StarterZoneState, player: MatchPlayer): void {
  zone.trades = dict(zone.trades);
  zone.tradeByCharacterId = dict(zone.tradeByCharacterId);
  const tradeId = readTradeIndex(nk, player.userId, player.characterId);
  if (tradeId.length === 0) {
    return;
  }
  let trade = zone.trades[tradeId];
  if (trade === undefined) {
    const stored = readTrade(nk, tradeId);
    if (stored === null) {
      return;
    }
    trade = stored;
  }
  const matchId = zone.matchId !== undefined ? zone.matchId : "";
  if (trade.matchId !== matchId && (trade.state === "inviting" || trade.state === "open" || trade.state === "committing")) {
    if (trade.state === "committing") {
      zone.trades[trade.tradeId] = trade;
      return;
    }
    const cancelled = cancelTrade(trade, "zone_transfer");
    if (player.inventory !== undefined) {
      player.inventory = clearLocksByLockId(player.inventory, trade.tradeId);
      writeInventory(nk, player.userId, player.inventory, player.characterId);
    }
    writeTrade(nk, cancelled.trade);
    return;
  }
  if (trade.state === "inviting" || trade.state === "open" || trade.state === "committing") {
    zone.trades[trade.tradeId] = trade;
    zone.tradeByCharacterId[trade.participantA.characterId] = trade.tradeId;
    zone.tradeByCharacterId[trade.participantB.characterId] = trade.tradeId;
  }
}

function persistable(state: StarterMatchRuntimeState): StarterMatchRuntimeState {
  stripContentCatalogs(state.zone);
  return state;
}

function resolveZoneContent(isCave: boolean, requested: string): (typeof content.zones)[keyof typeof content.zones] {
  const zones = content.zones as { [id: string]: (typeof content.zones)[keyof typeof content.zones] };
  if (!isCave) {
    return zones[STARTER_ZONE_ID];
  }
  if (requested.length > 0 && zones[requested] !== undefined) {
    return zones[requested];
  }
  return zones[CAVE_ZONE_ID];
}

function applyGmSignal(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  parsed: { [key: string]: unknown },
): { ok: boolean; code: string; result: { [key: string]: unknown } } {
  const requestId = typeof parsed.requestId === "string" && parsed.requestId.length > 0 ? parsed.requestId : "gm-req";
  try {
    const request = gmRequestFromMatchSignal(parsed);
    const player = findPlayerByCharacterId(state.zone, request.characterId);
    if (player === null) {
      const missing = { ok: false, code: "character_missing", result: {} };
      writeGmCommandResult(nk, request.requestId, missing);
      return missing;
    }
    const classId = player.classId !== undefined ? player.classId : "";
    const applied = applyGmToMatch(
      state.zone,
      player,
      request,
      Date.now(),
      tick,
      state.zone.itemsById,
      state.zone.questsById,
      startingAbilitiesForClass(state.zone, classId),
    );
    persistGmFromMatch(nk, logger, player, applied, request.requestId);
    const out = { ok: applied.ok, code: applied.code, result: applied.result };
    writeGmCommandResult(nk, request.requestId, out);
    const presence = state.presences[player.userId];
    if (presence !== undefined) {
      dispatcher.broadcastMessage(fullStateOpcode(), buildFullState(state.zone, tick, player.userId), [presence], null, true);
    }
    return out;
  } catch (error) {
    const code = error instanceof Error ? error.message : "internal_error";
    const failed = { ok: false, code: code, result: {} };
    writeGmCommandResult(nk, requestId, failed);
    return failed;
  }
}

function persistGmFromMatch(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  player: MatchPlayer,
  applied: { persistInventory: boolean; persistProgression: boolean; persistQuests: boolean; goldDelta: number; repairLocation: boolean },
  requestId: string,
): void {
  if (applied.persistInventory && player.inventory !== undefined) {
    writeInventory(nk, player.userId, player.inventory, player.characterId);
  }
  if (applied.persistProgression && player.progression !== undefined) {
    writeProgression(nk, player.userId, player.progression, player.characterId);
  }
  if (applied.persistQuests) {
    writeQuests(nk, player.userId, player.questLog, player.characterId);
  }
  if (applied.goldDelta !== 0) {
    const committed = commitTransaction(nk, {
      requestId: requestId,
      characterId: player.characterId,
      userId: player.userId,
      reasonType: TX_REASON_ADMIN_GRANT,
      reasonId: requestId,
      goldDelta: applied.goldDelta,
      currentGold: player.gold !== undefined ? player.gold : 0,
    });
    if (committed.ok) {
      player.gold = committed.gold;
    }
  }
  if (applied.repairLocation) {
    const matchId = findOrCreateStarterZoneMatch(nk, logger);
    writeActiveLocation(nk, publicWorldLocation(matchId, player.characterId, player.userId, player.x, player.y, Date.now()));
  }
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
  zone.npcsById = npcDefinitionsFromContent(content.npcs);
  zone.vendorsById = vendorDefinitionsFromContent(content.vendors);
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
  zone.npcsById = undefined;
  zone.vendorsById = undefined;
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
      logger.info(formatOpsLog("inventory_transaction", { user_id: userId, reason: result.code }));
      continue;
    }
    logger.info(formatOpsLog("inventory_transaction", { user_id: userId, code: "ok" }));
  }
}

function writeCheckpoints(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  checkpoints: PositionCheckpoint[],
): void {
  for (let i = 0; i < checkpoints.length; i++) {
    const checkpoint = checkpoints[i];
    writeCharacterCheckpoint(
      nk,
      checkpoint.userId,
      checkpoint.x,
      checkpoint.y,
      checkpoint.characterId,
      checkpoint.bindX !== undefined && checkpoint.bindY !== undefined
        ? {
            bindX: checkpoint.bindX,
            bindY: checkpoint.bindY,
            bindZoneId: checkpoint.bindZoneId !== undefined ? checkpoint.bindZoneId : "",
            innByRequestId: checkpoint.innByRequestId,
          }
        : undefined,
    );
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
