export interface SourceDocument {
  fileName: string;
  data: Record<string, unknown>;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Aabb {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ItemStack {
  itemId: string;
  quantity: number;
}

export interface LootEntry extends ItemStack {
  guaranteed: boolean;
}

export interface PlayerDef {
  id: string;
  kind: "player";
  visualId: string;
  maxHealth: number;
  attack: number;
  moveSpeed: number;
  attackRange: number;
  attackCooldown: number;
  interactionRange: number;
  pickupRange: number;
}

export interface ItemDef {
  id: string;
  kind: "item";
  displayName: string;
  visualId: string;
  maxStack: number;
  equipSlot?: string;
  attackBonus: number;
}

export interface NpcDef {
  id: string;
  kind: "npc";
  displayName: string;
  visualId: string;
}

export interface EnemyDef {
  id: string;
  kind: "enemy";
  displayName: string;
  visualId: string;
  maxHealth: number;
  damage: number;
  moveSpeed: number;
  aggroRadius: number;
  attackRange: number;
  attackCooldown: number;
  leashRadius: number;
  respawnDelay: number;
  loot: LootEntry[];
}

export interface QuestDef {
  id: string;
  kind: "quest";
  displayName: string;
  acceptNpcId: string;
  turnInNpcId: string;
  objectives: Array<{ type: "acquire_item"; itemId: string; quantity: number }>;
  consume: ItemStack[];
  rewards: { gold: number; items: ItemStack[] };
  completeOnce: boolean;
}

export interface ZoneDef {
  id: string;
  kind: "zone";
  displayName: string;
  visualId: string;
  tileSize: number;
  width: number;
  height: number;
  playerSpawn: Vec2;
  npcs: Array<{ npcId: string; x: number; y: number }>;
  enemies: Array<{ enemyId: string; x: number; y: number }>;
  walkableBounds: Aabb;
  collisions: Aabb[];
}

export interface ContentPayload {
  player: PlayerDef;
  items: Record<string, ItemDef>;
  npcs: Record<string, NpcDef>;
  enemies: Record<string, EnemyDef>;
  quests: Record<string, QuestDef>;
  zones: Record<string, ZoneDef>;
}

export interface ContentBundle extends ContentPayload {
  schemaVersion: number;
  contentHash: string;
}
