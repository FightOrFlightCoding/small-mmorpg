import { definitionSchemaVersion, isDevelopmentOnly, stripDefinitionMeta } from "./definition_meta";
import { KIND_PREFIX, isAllowedEquipSlot, isContentId } from "./ids";
import { ContentValidationError, issue, type ContentIssue } from "./issues";
import { DEFAULT_MANIFEST, type ContentPackageManifest } from "./registry";
import { loadAjv, mapAjvErrors, validatorForKind } from "./schema";
import type {
  Aabb,
  AbilityDef,
  AiProfileDef,
  AttributeDef,
  BossPhaseDef,
  ClassDef,
  ClassProgressionDef,
  ContentPayload,
  DerivedStatDef,
  EnemyDef,
  EquipmentSlotDef,
  ItemDef,
  ItemStack,
  LevelCurveDef,
  LootTableDef,
  NpcDef,
  PlayerDef,
  QuestDef,
  ResourceDef,
  SourceDocument,
  SpawnDef,
  ZoneDef,
} from "./types";

export interface ValidateOptions {
  manifest?: ContentPackageManifest;
  includeDevelopment?: boolean;
}

export function validateDocuments(
  schemaDir: string,
  documents: SourceDocument[],
  options: ValidateOptions = {},
): ContentPayload {
  const manifest = options.manifest ?? DEFAULT_MANIFEST;
  const includeDevelopment = options.includeDevelopment === true;
  const issues: ContentIssue[] = [];
  const ajv = loadAjv(schemaDir, manifest);
  const byId = new Map<string, SourceDocument>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const id = doc.data["id"];
    if (typeof id !== "string" || !isContentId(id)) {
      issues.push(issue("invalid_id:" + doc.fileName));
      continue;
    }
    const expectedFile = id + ".json";
    if (doc.fileName !== expectedFile) {
      issues.push(issue("filename_mismatch:" + doc.fileName));
    }
    if (byId.has(id)) {
      issues.push(issue("duplicate_id:" + id));
      continue;
    }
    byId.set(id, doc);

    const kind = doc.data["kind"];
    if (typeof kind !== "string" || !manifest.kinds[kind]) {
      issues.push(issue("unknown_kind:" + id));
      continue;
    }
    const prefix = manifest.kinds[kind].idPrefix || KIND_PREFIX[kind];
    if (!prefixMatches(kind, id, prefix)) {
      issues.push(issue("kind_prefix_mismatch:" + id));
    }
    const expectedDefVersion = manifest.kinds[kind].definitionSchemaVersion;
    const actualDefVersion = definitionSchemaVersion(doc.data, expectedDefVersion);
    if (actualDefVersion !== expectedDefVersion) {
      issues.push(issue("definition_schema_version:" + id));
    }

    const validator = validatorForKind(ajv, kind, manifest);
    if (!validator) {
      issues.push(issue("unknown_kind:" + kind));
      continue;
    }
    const ok = validator(doc.data);
    if (!ok) {
      const mapped = mapAjvErrors(validator.errors);
      for (let e = 0; e < mapped.length; e++) {
        issues.push(mapped[e]);
      }
    }
  }

  const selected = selectDocuments(byId, includeDevelopment);
  const player = asKind<PlayerDef>(selected, "player", issues);
  const items = asKindMap<ItemDef>(selected, "item");
  const npcs = asKindMap<NpcDef>(selected, "npc");
  const enemies = asKindMap<EnemyDef>(selected, "enemy");
  const quests = asKindMap<QuestDef>(selected, "quest");
  const zones = asKindMap<ZoneDef>(selected, "zone");
  const classes = asKindMap<ClassDef>(selected, "class");
  const attributes = asKindMap<AttributeDef>(selected, "attribute");
  const resources = asKindMap<ResourceDef>(selected, "resource");
  const derivedStats = asKindMap<DerivedStatDef>(selected, "derived_stat");
  const levelCurves = asKindMap<LevelCurveDef>(selected, "level_curve");
  const classProgressions = asKindMap<ClassProgressionDef>(selected, "class_progression");
  const equipmentSlots = asKindMap<EquipmentSlotDef>(selected, "equipment_slot");
  const abilities = asKindMap<AbilityDef>(selected, "ability");
  const aiProfiles = asKindMap<AiProfileDef>(selected, "ai_profile");
  const lootTables = asKindMap<LootTableDef>(selected, "loot_table");
  const spawns = asKindMap<SpawnDef>(selected, "spawn");

  if (player) {
    checkVisual(player.visualId, issues);
    if (player.basicAbilityId !== undefined && !abilities[player.basicAbilityId]) {
      issues.push(issue("missing_reference:" + player.basicAbilityId));
    }
  }

  const slotTags = slotTagsFrom(equipmentSlots, issues);
  const itemIds = Object.keys(items);
  for (let i = 0; i < itemIds.length; i++) {
    checkItem(items[itemIds[i]], classes, derivedStats, slotTags, issues);
  }
  const npcIds = Object.keys(npcs);
  for (let i = 0; i < npcIds.length; i++) {
    checkVisual(npcs[npcIds[i]].visualId, issues);
  }
  const enemyIds = Object.keys(enemies);
  for (let i = 0; i < enemyIds.length; i++) {
    checkEnemy(enemies[enemyIds[i]], items, abilities, aiProfiles, lootTables, resources, spawns, issues);
  }
  const lootTableIds = Object.keys(lootTables);
  for (let i = 0; i < lootTableIds.length; i++) {
    checkLootTable(lootTables[lootTableIds[i]], items, issues);
  }
  const spawnIds = Object.keys(spawns);
  for (let i = 0; i < spawnIds.length; i++) {
    checkSpawn(spawns[spawnIds[i]], zones, enemies, issues);
  }
  const questIds = Object.keys(quests);
  for (let i = 0; i < questIds.length; i++) {
    checkQuest(quests[questIds[i]], npcs, items, issues);
  }
  const zoneIds = Object.keys(zones);
  for (let i = 0; i < zoneIds.length; i++) {
    checkZone(zones[zoneIds[i]], npcs, enemies, spawns, issues);
  }
  checkClasses(classes, items, classProgressions, slotTags, abilities, issues);
  checkProgressionCatalog(attributes, resources, derivedStats, levelCurves, classProgressions, classes, issues);
  checkAbilities(abilities, resources, derivedStats, classes, issues);

  if (issues.length > 0) {
    throw new ContentValidationError(uniqueIssues(issues));
  }

  if (!player) {
    throw new Error("missing_player");
  }

  return {
    player,
    items,
    npcs,
    enemies,
    quests,
    zones,
    classes,
    attributes,
    resources,
    derivedStats,
    levelCurves,
    classProgressions,
    equipmentSlots,
    abilities,
    aiProfiles,
    lootTables,
    spawns,
  };
}

function selectDocuments(byId: Map<string, SourceDocument>, includeDevelopment: boolean): Map<string, SourceDocument> {
  if (includeDevelopment) {
    return byId;
  }
  const selected = new Map<string, SourceDocument>();
  const docs = Array.from(byId.values());
  for (let i = 0; i < docs.length; i++) {
    if (isDevelopmentOnly(docs[i].data)) {
      continue;
    }
    selected.set(docs[i].data["id"] as string, docs[i]);
  }
  return selected;
}

function prefixMatches(kind: string, id: string, prefix: string | undefined): boolean {
  if (!prefix) {
    return false;
  }
  if (id.indexOf(prefix + ".") === 0) {
    return true;
  }
  return kind === "enemy" && id.indexOf("test.enemy.") === 0;
}

function asKind<T>(byId: Map<string, SourceDocument>, kind: string, issues: ContentIssue[]): T | null {
  const matches: T[] = [];
  const docs = Array.from(byId.values());
  for (let i = 0; i < docs.length; i++) {
    if (docs[i].data["kind"] === kind) {
      matches.push(stripDefinitionMeta(docs[i].data) as T);
    }
  }
  if (kind === "player" && matches.length !== 1) {
    issues.push(issue("player_count:" + String(matches.length)));
    return matches[0] ?? null;
  }
  return matches[0] ?? null;
}

function asKindMap<T extends { id: string }>(byId: Map<string, SourceDocument>, kind: string): Record<string, T> {
  const result: Record<string, T> = {};
  const docs = Array.from(byId.values());
  for (let i = 0; i < docs.length; i++) {
    if (docs[i].data["kind"] === kind) {
      const typed = stripDefinitionMeta(docs[i].data) as T;
      result[typed.id] = typed;
    }
  }
  return result;
}

export function developmentOnlyIds(documents: SourceDocument[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < documents.length; i++) {
    const id = documents[i].data["id"];
    if (typeof id === "string" && isDevelopmentOnly(documents[i].data)) {
      ids.push(id);
    }
  }
  ids.sort();
  return ids;
}

function slotTagsFrom(slots: Record<string, EquipmentSlotDef>, issues: ContentIssue[]): string[] {
  const tags: string[] = [];
  const seen: { [tag: string]: boolean } = {};
  const ids = Object.keys(slots);
  for (let i = 0; i < ids.length; i++) {
    const slot = slots[ids[i]];
    if (seen[slot.tag] === true) {
      issues.push(issue("duplicate_equipment_slot:" + slot.tag));
      continue;
    }
    seen[slot.tag] = true;
    tags.push(slot.tag);
  }
  return tags;
}

function checkItem(
  item: ItemDef,
  classes: Record<string, ClassDef>,
  derivedStats: Record<string, DerivedStatDef>,
  slotTags: readonly string[],
  issues: ContentIssue[],
): void {
  checkVisual(item.visualId, issues);
  if (item.iconAssetId !== undefined) {
    checkVisual(item.iconAssetId, issues);
  }
  if (item.worldAssetId !== undefined) {
    checkVisual(item.worldAssetId, issues);
  }
  if (item.maxStack < 1) {
    issues.push(issue("invalid_stack_size:" + item.id));
  }
  const tags = item.equipmentSlotTags !== undefined ? item.equipmentSlotTags : [];
  if (item.equipSlot !== undefined) {
    if (!isAllowedEquipSlot(item.equipSlot, slotTags)) {
      issues.push(issue("unknown_equipment_slot:" + item.equipSlot));
    } else if (item.maxStack !== 1) {
      issues.push(issue("invalid_stack_size:" + item.id));
    }
  }
  for (let t = 0; t < tags.length; t++) {
    if (!isAllowedEquipSlot(tags[t], slotTags)) {
      issues.push(issue("unknown_equipment_slot:" + tags[t]));
    }
  }
  if (item.equipSlot !== undefined && tags.length > 0 && tags.indexOf(item.equipSlot) === -1) {
    issues.push(issue("unknown_equipment_slot:" + item.equipSlot));
  }
  if ((item.equipSlot !== undefined || tags.length > 0) && item.maxStack !== 1) {
    issues.push(issue("invalid_stack_size:" + item.id));
  }
  const classReqs = item.classRequirements !== undefined ? item.classRequirements : [];
  for (let c = 0; c < classReqs.length; c++) {
    if (!classes[classReqs[c]]) {
      issues.push(issue("missing_reference:" + classReqs[c]));
    }
  }
  const modifiers = item.statModifiers !== undefined ? item.statModifiers : [];
  for (let m = 0; m < modifiers.length; m++) {
    if (!derivedStats[modifiers[m].statId]) {
      issues.push(issue("missing_reference:" + modifiers[m].statId));
    }
  }
}

function checkEnemy(
  enemy: EnemyDef,
  items: Record<string, ItemDef>,
  abilities: Record<string, AbilityDef>,
  aiProfiles: Record<string, AiProfileDef>,
  lootTables: Record<string, LootTableDef>,
  resources: Record<string, ResourceDef>,
  spawns: Record<string, SpawnDef>,
  issues: ContentIssue[],
): void {
  checkVisual(enemy.visualId, issues);
  if (enemy.leashRadius < enemy.aggroRadius) {
    issues.push(issue("invalid_range:leashRadius"));
  }
  if (!aiProfiles[enemy.aiProfileId]) {
    issues.push(issue("missing_reference:" + enemy.aiProfileId));
  }
  if (!lootTables[enemy.lootTableId]) {
    issues.push(issue("missing_reference:" + enemy.lootTableId));
  }
  if (!isContentId(enemy.collisionProfileId) || enemy.collisionProfileId.indexOf("collision.") !== 0) {
    issues.push(issue("missing_reference:" + enemy.collisionProfileId));
  }
  for (let a = 0; a < enemy.abilityLoadout.length; a++) {
    if (!abilities[enemy.abilityLoadout[a]]) {
      issues.push(issue("missing_reference:" + enemy.abilityLoadout[a]));
    }
  }
  const enemyResources = enemy.resources !== undefined ? enemy.resources : [];
  for (let r = 0; r < enemyResources.length; r++) {
    if (!resources[enemyResources[r].resourceId]) {
      issues.push(issue("missing_reference:" + enemyResources[r].resourceId));
    }
  }
  const drops = enemy.loot !== undefined ? enemy.loot : [];
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    requireItem(drop.itemId, items, issues);
    if (drop.quantity < 1) {
      issues.push(issue("invalid_stack_size:" + drop.itemId));
    }
  }
  const phases = enemy.phases !== undefined ? enemy.phases : [];
  for (let p = 0; p < phases.length; p++) {
    checkBossPhase(phases[p], abilities, spawns, issues);
  }
}

function checkBossPhase(
  phase: BossPhaseDef,
  abilities: Record<string, AbilityDef>,
  spawns: Record<string, SpawnDef>,
  issues: ContentIssue[],
): void {
  const added = phase.addAbilityIds !== undefined ? phase.addAbilityIds : [];
  for (let i = 0; i < added.length; i++) {
    if (!abilities[added[i]]) {
      issues.push(issue("missing_reference:" + added[i]));
    }
  }
  const removed = phase.removeAbilityIds !== undefined ? phase.removeAbilityIds : [];
  for (let i = 0; i < removed.length; i++) {
    if (!abilities[removed[i]]) {
      issues.push(issue("missing_reference:" + removed[i]));
    }
  }
  if (phase.triggerSpawnId !== undefined && !spawns[phase.triggerSpawnId]) {
    issues.push(issue("missing_reference:" + phase.triggerSpawnId));
  }
}

function checkLootTable(table: LootTableDef, items: Record<string, ItemDef>, issues: ContentIssue[]): void {
  const groupWeight: { [groupId: string]: number } = {};
  for (let i = 0; i < table.entries.length; i++) {
    const entry = table.entries[i];
    requireItem(entry.itemDefinitionId, items, issues);
    if (entry.minimumQuantity > entry.maximumQuantity) {
      issues.push(issue("invalid_range:maximumQuantity"));
    }
    if (entry.groupId !== undefined && entry.groupId.length > 0) {
      const weight = entry.weight !== undefined ? entry.weight : 0;
      const current = groupWeight[entry.groupId] !== undefined ? groupWeight[entry.groupId] : 0;
      groupWeight[entry.groupId] = current + weight;
    }
  }
  const groups = Object.keys(groupWeight);
  for (let g = 0; g < groups.length; g++) {
    if (groupWeight[groups[g]] <= 0) {
      issues.push(issue("invalid_range:weight"));
    }
  }
}

function checkSpawn(
  spawn: SpawnDef,
  zones: Record<string, ZoneDef>,
  enemies: Record<string, EnemyDef>,
  issues: ContentIssue[],
): void {
  const zone = zones[spawn.zoneId];
  if (!zone) {
    issues.push(issue("missing_reference:" + spawn.zoneId));
    return;
  }
  requireEnemy(spawn.enemyId, enemies, issues);
  checkPointInWorld(zone, spawn.x, spawn.y, "spawn:" + spawn.id, issues);
}

function checkQuest(
  quest: QuestDef,
  npcs: Record<string, NpcDef>,
  items: Record<string, ItemDef>,
  issues: ContentIssue[],
): void {
  requireNpc(quest.acceptNpcId, npcs, issues);
  requireNpc(quest.turnInNpcId, npcs, issues);
  for (let i = 0; i < quest.objectives.length; i++) {
    requireItem(quest.objectives[i].itemId, items, issues);
  }
  for (let i = 0; i < quest.consume.length; i++) {
    requireItem(quest.consume[i].itemId, items, issues);
  }
  const seen = new Map<string, boolean>();
  for (let i = 0; i < quest.rewards.items.length; i++) {
    const reward: ItemStack = quest.rewards.items[i];
    requireItem(reward.itemId, items, issues);
    if (seen.has(reward.itemId)) {
      issues.push(issue("duplicate_quest_reward:" + reward.itemId));
    }
    seen.set(reward.itemId, true);
  }
  if (quest.rewards.gold < 0) {
    issues.push(issue("invalid_range:gold"));
  }
}

function checkZone(
  zone: ZoneDef,
  npcs: Record<string, NpcDef>,
  enemies: Record<string, EnemyDef>,
  spawns: Record<string, SpawnDef>,
  issues: ContentIssue[],
): void {
  checkVisual(zone.visualId, issues);
  checkPointInWorld(zone, zone.playerSpawn.x, zone.playerSpawn.y, "playerSpawn", issues);
  checkAabbInWorld(zone, zone.walkableBounds, "walkableBounds", issues);
  for (let i = 0; i < zone.npcs.length; i++) {
    const placed = zone.npcs[i];
    requireNpc(placed.npcId, npcs, issues);
    checkPointInWorld(zone, placed.x, placed.y, "npc:" + placed.npcId, issues);
  }
  for (let i = 0; i < zone.enemies.length; i++) {
    const placed = zone.enemies[i];
    requireEnemy(placed.enemyId, enemies, issues);
    checkPointInWorld(zone, placed.x, placed.y, "enemy:" + placed.enemyId, issues);
    if (placed.spawnId !== undefined) {
      const spawn = spawns[placed.spawnId];
      if (!spawn) {
        issues.push(issue("missing_reference:" + placed.spawnId));
      } else if (spawn.enemyId !== placed.enemyId || spawn.zoneId !== zone.id) {
        issues.push(issue("missing_reference:" + placed.spawnId));
      }
    }
  }
  for (let i = 0; i < zone.collisions.length; i++) {
    checkAabbInWorld(zone, zone.collisions[i], "collision:" + String(i), issues);
  }
}

function checkPointInWorld(
  zone: ZoneDef,
  x: number,
  y: number,
  label: string,
  issues: ContentIssue[],
): void {
  if (x < 0 || y < 0 || x > zone.width || y > zone.height) {
    issues.push(issue("invalid_range:" + label));
  }
}

function checkAabbInWorld(zone: ZoneDef, box: Aabb, label: string, issues: ContentIssue[]): void {
  if (box.width <= 0 || box.height <= 0) {
    issues.push(issue("invalid_range:" + label));
    return;
  }
  if (box.x < 0 || box.y < 0 || box.x + box.width > zone.width || box.y + box.height > zone.height) {
    issues.push(issue("invalid_range:" + label));
  }
}

function checkClasses(
  classes: Record<string, ClassDef>,
  items: Record<string, ItemDef>,
  progressions: Record<string, ClassProgressionDef>,
  slotTags: readonly string[],
  abilities: Record<string, AbilityDef>,
  issues: ContentIssue[],
): void {
  const ids = Object.keys(classes);
  if (ids.length === 0) {
    issues.push(issue("missing_class_catalog"));
    return;
  }
  let defaults = 0;
  for (let i = 0; i < ids.length; i++) {
    const def = classes[ids[i]];
    checkVisual(def.visualAssetSetId, issues);
    for (let e = 0; e < def.startingEquipment.length; e++) {
      requireItem(def.startingEquipment[e].itemId, items, issues);
    }
    for (let a = 0; a < def.startingAbilities.length; a++) {
      if (!abilities[def.startingAbilities[a]]) {
        issues.push(issue("missing_reference:" + def.startingAbilities[a]));
      }
    }
    if (!progressions[def.progressionId]) {
      issues.push(issue("missing_reference:" + def.progressionId));
    }
    if (def.legacyMigrationDefault === true) {
      defaults += 1;
    }
    for (let t = 0; t < def.allowedEquipmentTags.length; t++) {
      if (!isAllowedEquipSlot(def.allowedEquipmentTags[t], slotTags)) {
        issues.push(issue("unknown_equipment_slot:" + def.allowedEquipmentTags[t]));
      }
    }
  }
  if (defaults !== 1) {
    issues.push(issue("legacy_migration_default:" + String(defaults)));
  }
}

function checkProgressionCatalog(
  attributes: Record<string, AttributeDef>,
  resources: Record<string, ResourceDef>,
  derivedStats: Record<string, DerivedStatDef>,
  levelCurves: Record<string, LevelCurveDef>,
  progressions: Record<string, ClassProgressionDef>,
  classes: Record<string, ClassDef>,
  issues: ContentIssue[],
): void {
  if (Object.keys(attributes).length === 0) {
    issues.push(issue("missing_attribute_catalog"));
  }
  if (Object.keys(resources).length === 0) {
    issues.push(issue("missing_resource_catalog"));
  }
  const derivedIds = Object.keys(derivedStats);
  if (derivedIds.length === 0) {
    issues.push(issue("missing_derived_stat_catalog"));
  }
  let attackRoles = 0;
  let healthRoles = 0;
  for (let i = 0; i < derivedIds.length; i++) {
    const stat = derivedStats[derivedIds[i]];
    if (stat.role === "attack") {
      attackRoles += 1;
    }
    if (stat.role === "max_health") {
      healthRoles += 1;
    }
    for (let c = 0; c < stat.components.length; c++) {
      const component = stat.components[c];
      if (component.id !== undefined && !attributes[component.id] && !resources[component.id] && !derivedStats[component.id]) {
        issues.push(issue("missing_reference:" + component.id));
      }
    }
  }
  if (attackRoles !== 1) {
    issues.push(issue("derived_stat_role:attack:" + String(attackRoles)));
  }
  if (healthRoles !== 1) {
    issues.push(issue("derived_stat_role:max_health:" + String(healthRoles)));
  }
  const curveIds = Object.keys(levelCurves);
  if (curveIds.length === 0) {
    issues.push(issue("missing_level_curve_catalog"));
  }
  for (let i = 0; i < curveIds.length; i++) {
    const curve = levelCurves[curveIds[i]];
    if (curve.maxLevel < 2 || curve.xpRequired.length !== curve.maxLevel - 1) {
      issues.push(issue("invalid_range:xpRequired"));
    }
    if (curve.attributePointsPerLevel.length !== curve.maxLevel - 1) {
      issues.push(issue("invalid_range:attributePointsPerLevel"));
    }
    if (curve.skillPointsPerLevel.length !== curve.maxLevel - 1) {
      issues.push(issue("invalid_range:skillPointsPerLevel"));
    }
  }
  const progressionIds = Object.keys(progressions);
  if (progressionIds.length === 0) {
    issues.push(issue("missing_class_progression_catalog"));
  }
  for (let i = 0; i < progressionIds.length; i++) {
    const progression = progressions[progressionIds[i]];
    if (!classes[progression.classId]) {
      issues.push(issue("missing_reference:" + progression.classId));
    }
    if (!levelCurves[progression.levelCurveId]) {
      issues.push(issue("missing_reference:" + progression.levelCurveId));
    }
    requireIdMap(progression.startingAttributes, attributes, issues);
    requireIdMap(progression.attributeGrowth, attributes, issues);
    requireIdMap(progression.startingResources, resources, issues);
    if (progression.resourceGrowth !== undefined) {
      requireIdMap(progression.resourceGrowth, resources, issues);
    }
    requireIdMap(progression.startingDerived, derivedStats, issues);
    for (let a = 0; a < progression.allowedAttributeIds.length; a++) {
      if (!attributes[progression.allowedAttributeIds[a]]) {
        issues.push(issue("missing_reference:" + progression.allowedAttributeIds[a]));
      }
    }
  }
}

function checkAbilities(
  abilities: Record<string, AbilityDef>,
  resources: Record<string, ResourceDef>,
  derivedStats: Record<string, DerivedStatDef>,
  classes: Record<string, ClassDef>,
  issues: ContentIssue[],
): void {
  const classTags: { [tag: string]: boolean } = {};
  const classIds = Object.keys(classes);
  for (let c = 0; c < classIds.length; c++) {
    const source = classes[classIds[c]].tags;
    if (source !== undefined) {
      for (let t = 0; t < source.length; t++) {
        classTags[source[t]] = true;
      }
    }
  }
  const ids = Object.keys(abilities);
  for (let i = 0; i < ids.length; i++) {
    const ability = abilities[ids[i]];
    checkVisual(ability.animationAssetId, issues);
    checkVisual(ability.iconAssetId, issues);
    checkVisual(ability.soundAssetId, issues);
    if (ability.minimumRange > ability.range) {
      issues.push(issue("invalid_range:minimumRange"));
    }
    if (ability.areaShape === "circle" && ability.areaRadius <= 0) {
      issues.push(issue("invalid_range:areaRadius"));
    }
    for (let r = 0; r < ability.resourceCosts.length; r++) {
      if (!resources[ability.resourceCosts[r].resourceId]) {
        issues.push(issue("missing_reference:" + ability.resourceCosts[r].resourceId));
      }
    }
    for (let p = 0; p < ability.prerequisites.length; p++) {
      if (!abilities[ability.prerequisites[p]]) {
        issues.push(issue("missing_reference:" + ability.prerequisites[p]));
      }
    }
    for (let t = 0; t < ability.requiredClassTags.length; t++) {
      const tag = ability.requiredClassTags[t];
      if (classTags[tag] !== true && !classes[tag]) {
        issues.push(issue("missing_reference:" + tag));
      }
    }
    for (let e = 0; e < ability.effects.length; e++) {
      checkAbilityEffect(ability.effects[e], derivedStats, issues);
    }
  }
}

function checkAbilityEffect(
  effect: AbilityDef["effects"][number],
  derivedStats: Record<string, DerivedStatDef>,
  issues: ContentIssue[],
): void {
  const formula = effect.magnitude;
  if (formula.kind === "constant" && formula.value === undefined) {
    issues.push(issue("missing_field:value"));
  }
  if (formula.kind === "stat_id") {
    if (formula.statId === undefined || !derivedStats[formula.statId]) {
      issues.push(issue("missing_reference:" + (formula.statId !== undefined ? formula.statId : "statId")));
    }
  }
  if (effect.type === "timed_stat_modifier" && (effect.statChannel === undefined || effect.statChannel.length === 0)) {
    issues.push(issue("missing_field:statChannel"));
  }
  if (
    (effect.type === "periodic_damage" || effect.type === "periodic_heal") &&
    (effect.duration <= 0 || effect.tickInterval <= 0)
  ) {
    issues.push(issue("invalid_range:tickInterval"));
  }
}

function requireIdMap(
  map: Record<string, number>,
  catalog: Record<string, { id: string }>,
  issues: ContentIssue[],
): void {
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    if (!catalog[keys[i]]) {
      issues.push(issue("missing_reference:" + keys[i]));
    }
  }
}

function requireItem(id: string, items: Record<string, ItemDef>, issues: ContentIssue[]): void {
  if (!items[id]) {
    issues.push(issue("missing_reference:" + id));
  }
}

function requireNpc(id: string, npcs: Record<string, NpcDef>, issues: ContentIssue[]): void {
  if (!npcs[id]) {
    issues.push(issue("missing_reference:" + id));
  }
}

function requireEnemy(id: string, enemies: Record<string, EnemyDef>, issues: ContentIssue[]): void {
  if (!enemies[id]) {
    issues.push(issue("missing_reference:" + id));
  }
}

function checkVisual(id: string, issues: ContentIssue[]): void {
  if (!isContentId(id) || id.indexOf("visual.") !== 0) {
    issues.push(issue("missing_reference:" + id));
  }
}

function uniqueIssues(issues: ContentIssue[]): ContentIssue[] {
  const seen = new Map<string, boolean>();
  const unique: ContentIssue[] = [];
  for (let i = 0; i < issues.length; i++) {
    const code = issues[i].code;
    if (seen.has(code)) {
      continue;
    }
    seen.set(code, true);
    unique.push(issues[i]);
  }
  return unique;
}
