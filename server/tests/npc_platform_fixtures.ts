import { content, contentHash } from "../src/generated/content";
import {
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import { npcRoutesFromContent } from "../src/domain/npc_movement";
import { dialogueDefinitionsFromContent } from "../src/domain/dialogue";
import { vendorDefinitionsFromContent } from "../src/domain/vendor";
import { emptyInventory, itemDefinitionsFromContent, type PlayerInventory } from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";

export function platformZone(): StarterZoneState {
  return createStarterZoneState(
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
    itemDefinitionsFromContent(content.items),
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      npcRoutesById: npcRoutesFromContent(content.npcRoutes),
      vendorsById: vendorDefinitionsFromContent(content.vendors),
      dialoguesById: dialogueDefinitionsFromContent(content.dialogues),
    },
  );
}

export function npcPos(npcId: string): { x: number; y: number } {
  const row = content.zones["zone.starter"].npcs.find((npc) => npc.npcId === npcId);
  if (row === undefined) {
    return { x: 0, y: 0 };
  }
  return { x: row.x, y: row.y };
}

export function platformPlayer(
  userId: string,
  name: string,
  x: number,
  y: number,
  gold = 0,
  extras: Partial<MatchPlayer> = {},
): MatchPlayer {
  const actor: MatchPlayer = {
    userId: userId,
    sessionId: extras.sessionId !== undefined ? extras.sessionId : "session-" + userId,
    username: name.toLowerCase(),
    characterId: extras.characterId !== undefined ? extras.characterId : "char-" + userId,
    name: name,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: extras.health !== undefined ? extras.health : content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: extras.questLog !== undefined ? extras.questLog : emptyQuestLog(),
    gold: gold,
    inventory: extras.inventory !== undefined ? extras.inventory : emptyInventory(),
    equipment: extras.equipment !== undefined ? extras.equipment : emptyEquipment(),
  };
  if (extras.classId !== undefined) {
    actor.classId = extras.classId;
  }
  if (extras.linkDead === true) {
    actor.linkDead = true;
  }
  if (extras.transferState !== undefined) {
    actor.transferState = extras.transferState;
  }
  return actor;
}

export function itemCount(inventory: PlayerInventory | undefined, itemId: string): number {
  if (inventory === undefined) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i].itemId === itemId) {
      total += inventory.items[i].quantity;
    }
  }
  return total;
}
