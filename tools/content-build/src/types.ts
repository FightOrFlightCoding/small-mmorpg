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
  inventoryCapacity?: number;
}

export interface ItemStatModifier {
  statId: string;
  amount: number;
}

export interface ItemDef {
  id: string;
  kind: "item";
  displayName: string;
  displayNameKey?: string;
  descriptionKey?: string;
  visualId: string;
  iconAssetId?: string;
  worldAssetId?: string;
  category: "weapon" | "armor" | "consumable" | "quest" | "material" | "miscellaneous";
  maxStack: number;
  tradeable?: boolean;
  destroyable?: boolean;
  uniquePolicy?: "none" | "character" | "equipped";
  equipSlot?: string;
  equipmentSlotTags?: string[];
  classRequirements?: string[];
  levelRequirement?: number;
  attackBonus?: number;
  statModifiers?: ItemStatModifier[];
  sellValue?: number;
}

export interface EquipmentSlotDef {
  id: string;
  kind: "equipment_slot";
  tag: string;
  displayName: string;
  allowedCategories: Array<"weapon" | "armor" | "consumable" | "quest" | "material" | "miscellaneous">;
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
  xpReward?: number;
}

export interface QuestDef {
  id: string;
  kind: "quest";
  displayName: string;
  acceptNpcId: string;
  turnInNpcId: string;
  objectives: Array<{ type: "acquire_item"; itemId: string; quantity: number }>;
  consume: ItemStack[];
  rewards: { gold: number; xp?: number; items: ItemStack[] };
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

export interface ClassDef {
  id: string;
  kind: "class";
  displayName: string;
  visualAssetSetId: string;
  legacyMigrationDefault?: boolean;
  progressionId: string;
  startingEquipment: ItemStack[];
  startingAbilities: string[];
  allowedEquipmentTags: string[];
}

export interface AttributeDef {
  id: string;
  kind: "attribute";
  displayName: string;
}

export interface ResourceDef {
  id: string;
  kind: "resource";
  displayName: string;
  role: "health" | "mana" | "generic";
}

export interface StatComponent {
  layer: string;
  source?: string;
  id?: string;
  channel?: string;
  weight?: number;
  value?: number;
  min?: number;
  max?: number;
}

export interface DerivedStatDef {
  id: string;
  kind: "derived_stat";
  displayName: string;
  role: "attack" | "max_health" | "max_mana" | "generic";
  components: StatComponent[];
}

export interface LevelUnlock {
  level: number;
  abilityIds: string[];
}

export interface LevelCurveDef {
  id: string;
  kind: "level_curve";
  maxLevel: number;
  xpRequired: number[];
  attributePointsPerLevel: number[];
  skillPointsPerLevel: number[];
  automaticUnlocks?: LevelUnlock[];
}

export interface ClassProgressionDef {
  id: string;
  kind: "class_progression";
  classId: string;
  levelCurveId: string;
  startingAttributes: Record<string, number>;
  attributeGrowth: Record<string, number>;
  startingResources: Record<string, number>;
  resourceGrowth?: Record<string, number>;
  startingDerived: Record<string, number>;
  allowedAttributeIds: string[];
  attributePointRules: { pointsAtCreate: number };
  skillPointRules: { pointsAtCreate: number };
}

export interface ContentPayload {
  player: PlayerDef;
  items: Record<string, ItemDef>;
  npcs: Record<string, NpcDef>;
  enemies: Record<string, EnemyDef>;
  quests: Record<string, QuestDef>;
  zones: Record<string, ZoneDef>;
  classes: Record<string, ClassDef>;
  attributes: Record<string, AttributeDef>;
  resources: Record<string, ResourceDef>;
  derivedStats: Record<string, DerivedStatDef>;
  levelCurves: Record<string, LevelCurveDef>;
  classProgressions: Record<string, ClassProgressionDef>;
  equipmentSlots: Record<string, EquipmentSlotDef>;
}

export interface ContentBundle extends ContentPayload {
  packageId: string;
  packageVersion: string;
  schemaVersion: number;
  contentHash: string;
  minimumProtocolVersion: number;
  developmentOnly: string[];
}

export interface ContentPackage extends ContentBundle {
  buildTimestamp: string;
  definitions: ContentPayload;
}
