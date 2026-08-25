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

export interface LootTableEntry {
  itemDefinitionId: string;
  minimumQuantity: number;
  maximumQuantity: number;
  chance: number;
  weight?: number;
  groupId?: string;
  guaranteed?: boolean;
  ownershipPolicy?: "ground_free" | "killer" | "party_split" | "personal" | "server_assigned";
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
  basicAbilityId?: string;
  groupCredit?: {
    rangePx?: number;
    recentlyActiveAfterDeathSec?: number;
    xpFormula?: "full" | "split";
    defaultLootPolicy?: "personal" | "server_assigned";
  };
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

export interface NpcServiceDef {
  type: "dialogue" | "quest_offer" | "quest_turn_in" | "vendor" | "inn" | "healer" | "cave_entrance" | "cave_exit";
  questIds?: string[];
  vendorId?: string;
  goldCost?: number;
  healToFull?: boolean;
  restoreResources?: boolean;
  bindRespawn?: boolean;
  minLevel?: number;
  classRequirements?: string[];
  requireParty?: boolean;
  requiredQuestId?: string;
  requiredQuestStatus?: string;
}

export interface NpcDef {
  id: string;
  kind: "npc";
  displayName: string;
  displayNameKey?: string;
  visualId: string;
  zoneId: string;
  position: Vec2;
  interactionRange: number;
  dialogueId: string;
  services: NpcServiceDef[];
}

export interface VendorStockDef {
  itemId: string;
  buyPrice: number;
  classRequirements?: string[];
  levelRequirement?: number;
}

export interface VendorDef {
  id: string;
  kind: "vendor";
  displayName: string;
  stock: VendorStockDef[];
  sellMultiplier: number;
}

export interface EnemyDef {
  id: string;
  kind: "enemy";
  displayName: string;
  displayNameKey: string;
  visualId: string;
  level: number;
  maxHealth: number;
  damage: number;
  defense?: number;
  moveSpeed: number;
  aggroRadius: number;
  attackRange: number;
  attackCooldown: number;
  leashRadius: number;
  respawnDelay: number;
  abilityLoadout: string[];
  aiProfileId: string;
  xpReward: number;
  lootTableId: string;
  collisionProfileId: string;
  tags: string[];
  resources?: Array<{ resourceId: string; max: number }>;
  loot?: LootEntry[];
  phases?: BossPhaseDef[];
}

export interface BossPhaseDef {
  id: string;
  healthPercentAtOrBelow?: number;
  combatTimeSecAtOrAbove?: number;
  addDeathsAtOrAbove?: number;
  requireFlag?: string;
  setFlag?: string;
  addAbilityIds?: string[];
  removeAbilityIds?: string[];
  moveSpeed?: number;
  aggroRadius?: number;
  attackRange?: number;
  triggerSpawnId?: string;
  combatMessage?: string;
  applyEffect?: AbilityEffectDef;
}

export interface AiProfileDef {
  id: string;
  kind: "ai_profile";
  displayName: string;
  style: "melee" | "ranged" | "caster" | "boss";
  acquireMode: "nearest";
  damageThreatWeight: number;
  healThreatWeight: number;
  generateHealThreat: boolean;
  threatSwitchRatio: number;
  preferredRange: number;
  kiteRange: number;
  resetHealthOnReturn: boolean;
  resetThreatOnReturn: boolean;
}

export interface LootTableDef {
  id: string;
  kind: "loot_table";
  displayName: string;
  ownershipPolicy: "ground_free" | "killer" | "party_split" | "personal" | "server_assigned";
  entries: LootTableEntry[];
}

export interface SpawnDef {
  id: string;
  kind: "spawn";
  zoneId: string;
  enemyId: string;
  x: number;
  y: number;
  spawnCount: number;
  respawnDelay: number;
  activationPolicy: "always" | "manual";
  groupId: string;
}

export interface QuestObjectiveDef {
  type:
    | "acquire_item"
    | "talk_to_npc"
    | "kill_enemy"
    | "collect_item"
    | "enter_location"
    | "defeat_boss"
    | "return_to_npc";
  itemId?: string;
  npcId?: string;
  enemyId?: string;
  quantity?: number;
  enemyTags?: string[];
  itemTags?: string[];
  zoneId?: string;
  instanceId?: string;
  location?: Aabb;
  partyCreditPolicy?: "solo" | "party";
}

export interface QuestStageDef {
  id: string;
  objectives: QuestObjectiveDef[];
}

export interface QuestDef {
  id: string;
  kind: "quest";
  displayName: string;
  category?: "main" | "side";
  acceptNpcId: string;
  turnInNpcId: string;
  startNpcId?: string;
  prerequisites?: { questIds?: string[]; minLevel?: number; classIds?: string[] };
  repeatable?: boolean;
  objectives?: QuestObjectiveDef[];
  stages?: QuestStageDef[];
  consume?: ItemStack[];
  rewards: {
    gold: number;
    xp?: number;
    items: ItemStack[];
    abilityUnlockIds?: string[];
    attributePoints?: number;
    skillPoints?: number;
  };
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
  enemies: Array<{
    enemyId: string;
    x: number;
    y: number;
    spawnId?: string;
    spawnCount?: number;
    respawnDelay?: number;
    activationPolicy?: "always" | "manual";
    groupId?: string;
  }>;
  walkableBounds: Aabb;
  collisions: Aabb[];
}

export interface ClassDef {
  id: string;
  kind: "class";
  displayName: string;
  shortDescription?: string;
  displayNameKey?: string;
  shortDescriptionKey?: string;
  longDescriptionKey?: string;
  roleSummaryKey?: string;
  placeholderIconAssetId?: string;
  placeholderVisualSetId?: string;
  placeholderThemeKey?: string;
  selectOrder?: number;
  visualAssetSetId: string;
  legacyMigrationDefault?: boolean;
  progressionId: string;
  levelCurveId?: string;
  startingAttributes?: Record<string, number>;
  startingResources?: Record<string, number>;
  attributePointPolicy?: { pointsAtCreate: number };
  skillPointPolicy?: { pointsAtCreate: number };
  startingEquipment: ItemStack[];
  startingAbilities: string[];
  allowedEquipmentTags: string[];
  tags?: string[];
  rosterSelectable?: boolean;
  descriptionKey?: string;
  visualSetId?: string;
  baseStats?: Record<string, number>;
  automaticGrowth?: Record<string, number>;
  autoAssignTemplate?: {
    amounts: Record<string, number>;
    classification?: "canonical" | "compile-time-addition";
    compileTimeAddition?: boolean;
  };
  resourceType?: string;
  autoAttackId?: string;
  basicAbilityId?: string;
  classTreeId?: string;
  branchIds?: string[];
  canonicalLevelCurveId?: string;
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
  displayNameKey?: string;
  descriptionKey?: string;
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

export interface ResourceCost {
  resourceId: string;
  amount: number;
}

export interface MagnitudeFormula {
  kind: "constant" | "stat_role" | "stat_id";
  value?: number;
  role?: "attack" | "max_health" | "max_mana" | "generic";
  statId?: string;
  scale?: number;
}

export interface EffectConditionDef {
  type:
    | "target_relation"
    | "target_health_percent"
    | "target_has_tag"
    | "source_has_tag"
    | "shield_event"
    | "standing_still"
    | "no_enemy_in_range"
    | "effect_active"
    | "resource_percent";
  relation?: "hostile" | "friendly" | "self" | "any";
  comparison?: "below" | "above" | "at_or_below" | "at_or_above";
  value?: number;
  tag?: string;
  effectId?: string;
  event?: "break" | "expire";
  range?: number;
  duration?: number;
}

export interface TalentModifierDef {
  type: string;
  abilityId?: string;
  value?: number;
  grantsAbilityId?: string;
  effectId?: string;
}

export interface AbilityEffectDef {
  id: string;
  type:
    | "direct_damage"
    | "direct_heal"
    | "resource_change"
    | "timed_stat_modifier"
    | "periodic_damage"
    | "periodic_heal"
    | "stun"
    | "root"
    | "taunt"
    | "interrupt"
    | "slow"
    | "shield"
    | "movement"
    | "reflect_damage"
    | "propagate_effect"
    | "cooldown_reset_on_kill"
    | "guaranteed_crit"
    | "passive_stacker";
  source: "caster";
  target: "primary" | "area" | "self";
  magnitude: MagnitudeFormula;
  duration: number;
  tickInterval: number;
  stackPolicy: "replace" | "refresh" | "stack" | "ignore";
  maxStacks: number;
  refreshPolicy: "refresh" | "extend" | "ignore";
  removalReason: "expired" | "dispelled" | "death" | "replaced";
  tags: string[];
  statChannel?: string;
  resourceRole?: "health" | "mana" | "generic";
  school?: "melee" | "ranged" | "spell" | "heal" | "none";
  delay?: number;
  hitCount?: number;
  independentCrit?: boolean;
  guaranteedCrit?: boolean;
  cooldownResetOnKill?: boolean;
  reflectFraction?: number;
  movementKind?: "leap" | "dash";
  movementDistance?: number;
  propagateOn?: "death" | "shield_break" | "shield_expire";
  propagateEffectId?: string;
  shieldBreakHealRatio?: number;
  healthPercent?: number;
  conditions?: EffectConditionDef[];
  classification?: "canonical" | "compile-time-addition";
  compileTimeAddition?: boolean;
}

export interface AbilityDef {
  id: string;
  kind: "ability";
  displayName: string;
  displayNameKey: string;
  descriptionKey: string;
  targetMode: "self" | "entity" | "ground_point";
  relationFilter: "self" | "friendly" | "hostile" | "any";
  range: number;
  minimumRange: number;
  areaShape: "none" | "circle" | "cone" | "line" | "ground";
  areaRadius: number;
  castTime: number;
  channelTime: number;
  globalCooldown: number;
  individualCooldown: number;
  resourceCosts: ResourceCost[];
  movementInterruptsCast: boolean;
  damageInterruptsCast: boolean;
  requiredLevel: number;
  requiredClassTags: string[];
  prerequisites: string[];
  effects: AbilityEffectDef[];
  animationAssetId: string;
  iconAssetId: string;
  soundAssetId: string;
  skillPointCost?: number;
  maxRank?: number;
  runtimeEnabled?: boolean;
  abilityCategory?: "auto_attack" | "basic" | "signature" | "capstone" | "tree_active" | "passive";
  ownerClassId?: string;
  ownerBranchId?: string;
  school?: "melee" | "ranged" | "spell" | "heal" | "none";
  hitCount?: number;
  independentCrit?: boolean;
  delay?: number;
  coneAngleDegrees?: number;
  lineWidth?: number;
  lineLength?: number;
  effectIds?: string[];
  classification?: "canonical" | "compile-time-addition";
  compileTimeAddition?: boolean;
}

export interface StatDefinitionDef {
  id: string;
  kind: "stat_definition";
  displayName: string;
  displayNameKey: string;
  descriptionKey: string;
  abbreviation: string;
  perPointEffects: Array<{
    type: string;
    perPoint: number;
    castersOnly?: boolean;
  }>;
  classification?: "canonical" | "compile-time-addition";
}

export interface BranchDefinitionDef {
  id: string;
  kind: "branch_definition";
  classId: string;
  displayName: string;
  displayNameKey: string;
  descriptionKey?: string;
  roleKey: string;
  signatureAbilityId: string;
  capstoneAbilityId: string;
  branchTreeId: string;
  recommendedBuildIds: string[];
  classification?: "canonical" | "compile-time-addition";
}

export interface ProgressionTimelineDef {
  id: string;
  kind: "progression_timeline";
  displayName?: string;
  displayNameKey: string;
  descriptionKey?: string;
  levelCurveId: string;
  automaticGrowthPerLevel: number;
  freePointsPerLevel: number;
  classPoints: number;
  branchPoints: number;
  tierGates: Array<{ tier: number; minLevel?: number; minPointsSpent: number }>;
  unlocks: Array<{
    level: number;
    grant: "auto_attack" | "basic_ability" | "class_point" | "branch_unlock" | "branch_point" | "capstone";
  }>;
  classification?: "canonical" | "compile-time-addition";
}

export interface AutoAttackDefinitionDef {
  id: string;
  kind: "auto_attack_definition";
  displayName: string;
  displayNameKey: string;
  descriptionKey: string;
  ownerClassId: string;
  baseDamage: number;
  interval: number;
  scalingStatId: string;
  school: "melee" | "ranged" | "spell" | "heal" | "none";
  range: number;
  targetMode?: "self" | "entity" | "ground_point";
  relationFilter?: "self" | "friendly" | "hostile" | "any";
  runtimeEnabled?: boolean;
  effects: AbilityEffectDef[];
  effectIds?: string[];
  animationAssetId: string;
  iconAssetId: string;
  soundAssetId: string;
  classification?: "canonical" | "compile-time-addition";
  compileTimeAddition?: boolean;
}

export interface EffectDefinitionDef {
  id: string;
  kind: "effect_definition";
  displayName?: string;
  displayNameKey: string;
  descriptionKey?: string;
  ownerAbilityId?: string;
  effect: AbilityEffectDef;
  classification?: "canonical" | "compile-time-addition";
  compileTimeAddition?: boolean;
}

export interface TalentTreeDef {
  id: string;
  kind: "talent_tree";
  displayName?: string;
  displayNameKey: string;
  descriptionKey?: string;
  treeKind: "class" | "branch";
  ownerId: string;
  pointsAvailable: number;
  maxActiveGrants?: number;
  tierGates?: Array<{ tier: number; minLevel?: number; minPointsSpent: number }>;
  nodeIds: string[];
  classification?: "canonical" | "compile-time-addition";
}

export interface TalentNodeDef {
  id: string;
  kind: "talent_node";
  displayName: string;
  displayNameKey: string;
  descriptionKey: string;
  treeId: string;
  tier: number;
  maxRank: number;
  pointCostPerRank: number;
  prerequisites?: Array<{ nodeId: string; minRank: number }>;
  rankReplacement?: { nodeId?: string; abilityId?: string };
  unlockEffects?: AbilityEffectDef[];
  abilityModifications?: Array<{
    abilityId: string;
    rank?: number;
    modifiers: TalentModifierDef[];
  }>;
  passiveModifiers?: TalentModifierDef[];
  conditionalModifiers?: Array<{
    conditions: EffectConditionDef[];
    modifiers: TalentModifierDef[];
  }>;
  grantsActiveAbilityId?: string;
  classification?: "canonical" | "compile-time-addition";
  compileTimeAddition?: boolean;
}

export interface ReferenceBuildDef {
  id: string;
  kind: "reference_build";
  displayName: string;
  displayNameKey: string;
  descriptionKey?: string;
  branchId: string;
  statPriority: string[];
  identityKey: string;
  pairedNodeIds?: string[];
  classification?: "canonical" | "compile-time-addition";
}

export interface EnemyScalingProfileDef {
  id: string;
  kind: "enemy_scaling_profile";
  displayName?: string;
  displayNameKey: string;
  descriptionKey?: string;
  hpIntercept: number;
  hpPerLevel: number;
  damageIntercept: number;
  damagePerLevel: number;
  swingInterval: number;
  killXpIntercept: number;
  killXpPerLevel: number;
  hpMultiplier: number;
  damageMultiplier: number;
  killXpMultiplier: number;
  classification?: "canonical" | "compile-time-addition";
  compileTimeAddition?: boolean;
}

export interface XpRewardDef {
  id: string;
  kind: "xp_reward";
  displayName?: string;
  displayNameKey: string;
  descriptionKey?: string;
  formula: { kind: "kill_xp_linear"; intercept: number; perLevel: number };
  inUse?: boolean;
  classification?: "canonical" | "compile-time-addition";
}

export interface EquipmentModifierCategoryDef {
  id: string;
  kind: "equipment_modifier_category";
  displayName?: string;
  displayNameKey: string;
  descriptionKey?: string;
  statId: string;
  channel: string;
  classification?: "canonical" | "compile-time-addition";
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
  abilities: Record<string, AbilityDef>;
  stats: Record<string, StatDefinitionDef>;
  branches: Record<string, BranchDefinitionDef>;
  progressionTimelines: Record<string, ProgressionTimelineDef>;
  autoAttacks: Record<string, AutoAttackDefinitionDef>;
  effectDefinitions: Record<string, EffectDefinitionDef>;
  talentTrees: Record<string, TalentTreeDef>;
  talentNodes: Record<string, TalentNodeDef>;
  referenceBuilds: Record<string, ReferenceBuildDef>;
  enemyScalingProfiles: Record<string, EnemyScalingProfileDef>;
  xpRewards: Record<string, XpRewardDef>;
  equipmentModifierCategories: Record<string, EquipmentModifierCategoryDef>;
  aiProfiles: Record<string, AiProfileDef>;
  lootTables: Record<string, LootTableDef>;
  spawns: Record<string, SpawnDef>;
  vendors: Record<string, VendorDef>;
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
