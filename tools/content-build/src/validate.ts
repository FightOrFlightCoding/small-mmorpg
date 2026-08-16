import { definitionSchemaVersion, isDevelopmentOnly, stripDefinitionMeta } from "./definition_meta";
import { KIND_PREFIX, isAllowedEquipSlot, isContentId } from "./ids";
import { ContentValidationError, issue, type ContentIssue } from "./issues";
import { DEFAULT_MANIFEST, type ContentPackageManifest } from "./registry";
import { loadAjv, mapAjvErrors, validatorForKind } from "./schema";
import type {
  Aabb,
  AttributeDef,
  ClassDef,
  ClassProgressionDef,
  ContentPayload,
  DerivedStatDef,
  EnemyDef,
  ItemDef,
  ItemStack,
  LevelCurveDef,
  NpcDef,
  PlayerDef,
  QuestDef,
  ResourceDef,
  SourceDocument,
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
    if (!prefix || id.indexOf(prefix + ".") !== 0) {
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

  if (player) {
    checkVisual(player.visualId, issues);
  }

  const itemIds = Object.keys(items);
  for (let i = 0; i < itemIds.length; i++) {
    checkItem(items[itemIds[i]], issues);
  }
  const npcIds = Object.keys(npcs);
  for (let i = 0; i < npcIds.length; i++) {
    checkVisual(npcs[npcIds[i]].visualId, issues);
  }
  const enemyIds = Object.keys(enemies);
  for (let i = 0; i < enemyIds.length; i++) {
    checkEnemy(enemies[enemyIds[i]], items, issues);
  }
  const questIds = Object.keys(quests);
  for (let i = 0; i < questIds.length; i++) {
    checkQuest(quests[questIds[i]], npcs, items, issues);
  }
  const zoneIds = Object.keys(zones);
  for (let i = 0; i < zoneIds.length; i++) {
    checkZone(zones[zoneIds[i]], npcs, enemies, issues);
  }
  checkClasses(classes, items, classProgressions, issues);
  checkProgressionCatalog(attributes, resources, derivedStats, levelCurves, classProgressions, classes, issues);

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

function checkItem(item: ItemDef, issues: ContentIssue[]): void {
  checkVisual(item.visualId, issues);
  if (item.maxStack < 1) {
    issues.push(issue("invalid_stack_size:" + item.id));
  }
  if (item.equipSlot !== undefined) {
    if (!isAllowedEquipSlot(item.equipSlot)) {
      issues.push(issue("unknown_equipment_slot:" + item.equipSlot));
    } else if (item.maxStack !== 1) {
      issues.push(issue("invalid_stack_size:" + item.id));
    }
  }
}

function checkEnemy(enemy: EnemyDef, items: Record<string, ItemDef>, issues: ContentIssue[]): void {
  checkVisual(enemy.visualId, issues);
  if (enemy.leashRadius < enemy.aggroRadius) {
    issues.push(issue("invalid_range:leashRadius"));
  }
  let guaranteed = 0;
  for (let i = 0; i < enemy.loot.length; i++) {
    const drop = enemy.loot[i];
    requireItem(drop.itemId, items, issues);
    if (drop.quantity < 1) {
      issues.push(issue("invalid_stack_size:" + drop.itemId));
    }
    if (drop.guaranteed) {
      guaranteed += 1;
    }
  }
  if (guaranteed < 1) {
    issues.push(issue("missing_guaranteed_loot:" + enemy.id));
  }
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
    if (!progressions[def.progressionId]) {
      issues.push(issue("missing_reference:" + def.progressionId));
    }
    if (def.legacyMigrationDefault === true) {
      defaults += 1;
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
