import { KIND_PREFIX, isAllowedEquipSlot, isContentId } from "./ids";
import { ContentValidationError, issue, type ContentIssue } from "./issues";
import { loadAjv, mapAjvErrors, validatorForKind } from "./schema";
import type {
  Aabb,
  ContentPayload,
  EnemyDef,
  ItemDef,
  ItemStack,
  NpcDef,
  PlayerDef,
  QuestDef,
  SourceDocument,
  ZoneDef,
} from "./types";

export function validateDocuments(schemaDir: string, documents: SourceDocument[]): ContentPayload {
  const issues: ContentIssue[] = [];
  const ajv = loadAjv(schemaDir);
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
    if (typeof kind !== "string" || !KIND_PREFIX[kind]) {
      issues.push(issue("unknown_kind:" + id));
      continue;
    }
    if (id.indexOf(KIND_PREFIX[kind] + ".") !== 0) {
      issues.push(issue("kind_prefix_mismatch:" + id));
    }

    const validator = validatorForKind(ajv, kind);
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

  const player = asKind<PlayerDef>(byId, "player", issues);
  const items = asKindMap<ItemDef>(byId, "item");
  const npcs = asKindMap<NpcDef>(byId, "npc");
  const enemies = asKindMap<EnemyDef>(byId, "enemy");
  const quests = asKindMap<QuestDef>(byId, "quest");
  const zones = asKindMap<ZoneDef>(byId, "zone");

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

  if (issues.length > 0) {
    throw new ContentValidationError(uniqueIssues(issues));
  }

  if (!player) {
    throw new Error("missing_player");
  }

  return { player, items, npcs, enemies, quests, zones };
}

function asKind<T>(byId: Map<string, SourceDocument>, kind: string, issues: ContentIssue[]): T | null {
  const matches: T[] = [];
  const docs = Array.from(byId.values());
  for (let i = 0; i < docs.length; i++) {
    if (docs[i].data["kind"] === kind) {
      matches.push(docs[i].data as T);
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
      const typed = docs[i].data as T;
      result[typed.id] = typed;
    }
  }
  return result;
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
