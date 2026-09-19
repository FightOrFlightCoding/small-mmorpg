import { dict } from "./maps";
import type { MatchPlayer, StarterZoneState } from "./match_state";
import { questState } from "./protocol";
import {
  cloneQuestLog,
  publicNpcQuestMarkers,
  publicQuestPayloads,
  syncAcquireObjectives,
  type QuestLog,
  type QuestPossessionExtras,
} from "./quest";
import { findLiveTradeForCharacter, offeredQuantitiesForCharacter } from "./trade";

export function questPossessionExtras(state: StarterZoneState, player: MatchPlayer): QuestPossessionExtras {
  const extras: QuestPossessionExtras = {};
  if (player.equipment !== undefined) {
    extras.equipment = player.equipment.items;
  }
  const trade = findLiveTradeForCharacter(dict(state.trades), player.characterId);
  extras.offeredQuantities = offeredQuantitiesForCharacter(trade, player.characterId);
  return extras;
}

export function syncPlayerQuestPossession(
  state: StarterZoneState,
  userId: string,
  persistByUser: { [userId: string]: QuestLog } | undefined,
  outbound?: { opcode: number; body: string; toUserId?: string }[],
  requestId?: string,
): boolean {
  const player = liveOrParkedPlayer(state, userId);
  if (player === undefined) {
    return false;
  }
  const synced = syncAcquireObjectives(player.questLog, player.inventory, questPossessionExtras(state, player));
  player.questLog = synced.log;
  if (!synced.changed) {
    return false;
  }
  if (persistByUser !== undefined) {
    persistByUser[userId] = cloneQuestLog(synced.log);
  }
  if (outbound !== undefined && state.players[userId] !== undefined) {
    const markers = publicNpcQuestMarkers(
      state.npcs,
      state.npcsById !== undefined ? state.npcsById : {},
      player.questLog,
      state.questsById,
      player.progression !== undefined ? player.progression.level : 1,
      player.classId,
    );
    const message = questState(
      state.contentHash,
      publicQuestPayloads(player.questLog, state.questsById),
      requestId,
      markers,
    );
    outbound.push({ opcode: message.opcode, body: message.body, toUserId: userId });
  }
  return true;
}

function liveOrParkedPlayer(state: StarterZoneState, userId: string): MatchPlayer | undefined {
  if (state.players[userId] !== undefined) {
    return state.players[userId];
  }
  const parked = dict(state.disconnected)[userId];
  if (parked === undefined) {
    return undefined;
  }
  return parked.player;
}
