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
import { applyMatchLoop, snapshotForOthers, type IncomingMatchData, type EquipmentPersist, type InventoryPersist, type MatchLoopResult } from "../domain/match_loop";
import { PLAYER_RESPAWN_DELAY_SEC } from "../domain/combat";
import { questDefinitionsFromContent } from "../domain/quest";
import { initializeInventoryFromStacks, itemDefinitionsFromContent, INVENTORY_CAPACITY } from "../domain/inventory";
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
  STARTER_ZONE_LABEL,
  addPlayer,
  buildFullState,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  fullStateOpcode,
  partyViewForPlayer,
  type MatchPlayer,
  type StarterZoneState,
} from "../domain/match_state";
import { dict } from "../domain/maps";
import { groupCreditRulesFromPlayer } from "../domain/party";
import { applyPartyMatchSignal } from "../domain/party_credit";
import { actionResult, partyEventMessage, partyStateMessage } from "../domain/protocol";
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
import { abilityDefinitionsFromContent, prepareJoinedPlayerAbilities } from "../domain/ability";
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

export interface StarterMatchRuntimeState {
  zone: StarterZoneState;
  presences: { [userId: string]: nkruntime.Presence };
  pendingTransfers?: { [userId: string]: string };
}

export function matchInit(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  params: { [key: string]: any },
): { state: StarterMatchRuntimeState; tickRate: number; label: string } {
  const instanceType = String(params.instanceType !== undefined ? params.instanceType : "public_world");
  const isCave = instanceType === "party_cave";
  const zoneTemplateId = isCave ? CAVE_ZONE_ID : "zone.starter";
  const zoneContent = content.zones[zoneTemplateId];
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
  if (isCave) {
    applyPersistedCaveCompletion(zone);
  }
  const label = isCave ? PARTY_CAVE_LABEL : STARTER_ZONE_LABEL;
  logger.info("starter_zone init label=%s instance_type=%s content_hash=%s", label, instanceType, contentHash);
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
    const reason = error instanceof Error ? error.message : "save_incompatible";
    logger.info("starter_zone join rejected user_id=%s reason=%s", presence.userId, reason);
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
      logger.info("starter_zone grace rejoin user_id=%s", presence.userId);
    } else {
      logger.info("starter_zone join user_id=%s character_id=%s", presence.userId, character.characterId);
    }
    zone = addPlayer(zone, player);
    loadPartyCache(nk, zone, presence.userId, character.characterId, character.name);
    markPartyOnline(nk, {
      accountUserId: presence.userId,
      characterId: character.characterId,
      displayName: character.name,
    }, Date.now());
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
    logger.info("starter_zone leave user_id=%s", presence.userId);
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
  const result = applyMatchLoop(state.zone, tick, contentHash, incoming, function () {
    return nk.uuidv4();
  }, function (request) {
    return commitQuestReward(nk, request);
  }, function (request) {
    return commitTransaction(nk, request);
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
    if (result.state.instanceType === "party_cave" && result.state.instanceId !== undefined) {
      const repo = nakamaCaveRepository(nk);
      const record = repo.getCave(result.state.instanceId);
      if (record !== null) {
        terminateCave(repo, record, Date.now());
      }
    }
    return null;
  }
  return { state: persistable({ zone: result.state, presences: state.presences, pendingTransfers: state.pendingTransfers }) };
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
  if (state.zone.instanceType === "party_cave" && state.zone.instanceId !== undefined) {
    const repo = nakamaCaveRepository(nk);
    const record = repo.getCave(state.zone.instanceId);
    if (record !== null && record.lifecycleState !== "terminated" && record.lifecycleState !== "expired") {
      terminateCave(repo, record, Date.now());
    }
  }
  return { state: persistable(state) };
}

export function matchSignal(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  data: string,
): { state: StarterMatchRuntimeState; data: string } {
  state = hydrateRuntime(state);
  if (typeof data === "string" && data.length > 0) {
    try {
      const parsed = JSON.parse(data) as { [key: string]: unknown };
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
  bindContentCatalogs(zone);
  return {
    zone: zone,
    presences: dict(state.presences),
    pendingTransfers: dict(state.pendingTransfers),
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
