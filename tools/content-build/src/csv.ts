import { canonicalize } from "./canonical";
import type { EnemyDef, LevelCurveDef, LootTableDef, VendorDef } from "./types";

export type CsvKind = "level_curve" | "vendor_stock" | "enemy_stats" | "loot_entries";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
        continue;
      }
      field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      if (field.endsWith("\r")) {
        field = field.slice(0, field.length - 1);
      }
      row.push(field);
      if (row.length > 1 || row[0].length > 0) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function encodeCsv(rows: string[][]): string {
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const encoded: string[] = [];
    for (let c = 0; c < rows[i].length; c++) {
      encoded.push(csvField(rows[i][c]));
    }
    lines.push(encoded.join(","));
  }
  return lines.join("\n") + "\n";
}

function csvField(value: string): string {
  if (value.indexOf(",") === -1 && value.indexOf('"') === -1 && value.indexOf("\n") === -1) {
    return value;
  }
  return '"' + value.replace(/"/g, '""') + '"';
}

export function exportLevelCurves(curves: Record<string, LevelCurveDef>): string {
  const rows: string[][] = [["id", "level", "xpRequired", "attributePoints", "skillPoints"]];
  const ids = Object.keys(curves).sort();
  for (let i = 0; i < ids.length; i++) {
    const curve = curves[ids[i]];
    for (let level = 2; level <= curve.maxLevel; level++) {
      const index = level - 2;
      rows.push([
        curve.id,
        String(level),
        String(curve.xpRequired[index]),
        String(curve.attributePointsPerLevel[index]),
        String(curve.skillPointsPerLevel[index]),
      ]);
    }
  }
  return encodeCsv(rows);
}

export function importLevelCurves(
  curves: Record<string, LevelCurveDef>,
  csv: string,
): Record<string, LevelCurveDef> {
  const rows = parseCsv(csv);
  const grouped: { [id: string]: { level: number; xp: number; attributes: number; skills: number }[] } = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = row[0];
    if (curves[id] === undefined) {
      throw new Error("unknown_id:" + id);
    }
    if (grouped[id] === undefined) {
      grouped[id] = [];
    }
    grouped[id].push({
      level: Number(row[1]),
      xp: Number(row[2]),
      attributes: Number(row[3]),
      skills: Number(row[4]),
    });
  }
  const next: Record<string, LevelCurveDef> = {};
  const ids = Object.keys(curves).sort();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const original = curves[id];
    const lines = grouped[id];
    if (lines === undefined) {
      next[id] = original;
      continue;
    }
    lines.sort((a, b) => a.level - b.level);
    const xpRequired: number[] = [];
    const attributePointsPerLevel: number[] = [];
    const skillPointsPerLevel: number[] = [];
    for (let l = 0; l < lines.length; l++) {
      xpRequired.push(lines[l].xp);
      attributePointsPerLevel.push(lines[l].attributes);
      skillPointsPerLevel.push(lines[l].skills);
    }
    next[id] = {
      ...original,
      maxLevel: lines.length + 1,
      xpRequired: xpRequired,
      attributePointsPerLevel: attributePointsPerLevel,
      skillPointsPerLevel: skillPointsPerLevel,
    };
  }
  return canonicalize(next) as Record<string, LevelCurveDef>;
}

export function exportVendorStock(vendors: Record<string, VendorDef>): string {
  const rows: string[][] = [["vendorId", "itemId", "buyPrice", "levelRequirement", "classRequirements"]];
  const ids = Object.keys(vendors).sort();
  for (let i = 0; i < ids.length; i++) {
    const vendor = vendors[ids[i]];
    for (let s = 0; s < vendor.stock.length; s++) {
      const stock = vendor.stock[s];
      const classes = stock.classRequirements !== undefined ? stock.classRequirements.join("|") : "";
      rows.push([
        vendor.id,
        stock.itemId,
        String(stock.buyPrice),
        String(stock.levelRequirement !== undefined ? stock.levelRequirement : 0),
        classes,
      ]);
    }
  }
  return encodeCsv(rows);
}

export function importVendorStock(vendors: Record<string, VendorDef>, csv: string): Record<string, VendorDef> {
  const rows = parseCsv(csv);
  const stockByVendor: { [vendorId: string]: VendorDef["stock"] } = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const vendorId = row[0];
    if (vendors[vendorId] === undefined) {
      throw new Error("unknown_id:" + vendorId);
    }
    if (stockByVendor[vendorId] === undefined) {
      stockByVendor[vendorId] = [];
    }
    const classes = row[4].length > 0 ? row[4].split("|") : [];
    stockByVendor[vendorId].push({
      itemId: row[1],
      buyPrice: Number(row[2]),
      levelRequirement: Number(row[3]),
      classRequirements: classes,
    });
  }
  const next: Record<string, VendorDef> = {};
  const ids = Object.keys(vendors).sort();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    next[id] = stockByVendor[id] !== undefined ? { ...vendors[id], stock: stockByVendor[id] } : vendors[id];
  }
  return canonicalize(next) as Record<string, VendorDef>;
}

export function exportEnemyStats(enemies: Record<string, EnemyDef>): string {
  const rows: string[][] = [[
    "id",
    "displayName",
    "level",
    "maxHealth",
    "damage",
    "defense",
    "moveSpeed",
    "aggroRadius",
    "attackRange",
    "attackCooldown",
    "leashRadius",
    "respawnDelay",
    "xpReward",
    "aiProfileId",
    "lootTableId",
  ]];
  const ids = Object.keys(enemies).sort();
  for (let i = 0; i < ids.length; i++) {
    const enemy = enemies[ids[i]];
    rows.push([
      enemy.id,
      enemy.displayName,
      String(enemy.level),
      String(enemy.maxHealth),
      String(enemy.damage),
      String(enemy.defense !== undefined ? enemy.defense : ""),
      String(enemy.moveSpeed),
      String(enemy.aggroRadius),
      String(enemy.attackRange),
      String(enemy.attackCooldown),
      String(enemy.leashRadius),
      String(enemy.respawnDelay),
      String(enemy.xpReward),
      enemy.aiProfileId,
      enemy.lootTableId,
    ]);
  }
  return encodeCsv(rows);
}

export function importEnemyStats(enemies: Record<string, EnemyDef>, csv: string): Record<string, EnemyDef> {
  const rows = parseCsv(csv);
  const next: Record<string, EnemyDef> = {};
  const ids = Object.keys(enemies);
  for (let i = 0; i < ids.length; i++) {
    next[ids[i]] = enemies[ids[i]];
  }
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = row[0];
    if (enemies[id] === undefined) {
      throw new Error("unknown_id:" + id);
    }
    const defense = row[5];
    next[id] = {
      ...enemies[id],
      displayName: row[1],
      level: Number(row[2]),
      maxHealth: Number(row[3]),
      damage: Number(row[4]),
      moveSpeed: Number(row[6]),
      aggroRadius: Number(row[7]),
      attackRange: Number(row[8]),
      attackCooldown: Number(row[9]),
      leashRadius: Number(row[10]),
      respawnDelay: Number(row[11]),
      xpReward: Number(row[12]),
      aiProfileId: row[13],
      lootTableId: row[14],
    };
    if (defense.length > 0) {
      next[id].defense = Number(defense);
    }
  }
  return canonicalize(next) as Record<string, EnemyDef>;
}

export function exportLootEntries(tables: Record<string, LootTableDef>): string {
  const rows: string[][] = [[
    "lootTableId",
    "itemDefinitionId",
    "minimumQuantity",
    "maximumQuantity",
    "chance",
    "weight",
    "groupId",
    "guaranteed",
    "ownershipPolicy",
  ]];
  const ids = Object.keys(tables).sort();
  for (let i = 0; i < ids.length; i++) {
    const table = tables[ids[i]];
    for (let e = 0; e < table.entries.length; e++) {
      const entry = table.entries[e];
      rows.push([
        table.id,
        entry.itemDefinitionId,
        String(entry.minimumQuantity),
        String(entry.maximumQuantity),
        String(entry.chance),
        entry.weight !== undefined ? String(entry.weight) : "",
        entry.groupId !== undefined ? entry.groupId : "",
        entry.guaranteed === true ? "true" : "false",
        entry.ownershipPolicy !== undefined ? entry.ownershipPolicy : "",
      ]);
    }
  }
  return encodeCsv(rows);
}

export function importLootEntries(tables: Record<string, LootTableDef>, csv: string): Record<string, LootTableDef> {
  const rows = parseCsv(csv);
  const entriesByTable: { [id: string]: LootTableDef["entries"] } = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const tableId = row[0];
    if (tables[tableId] === undefined) {
      throw new Error("unknown_id:" + tableId);
    }
    if (entriesByTable[tableId] === undefined) {
      entriesByTable[tableId] = [];
    }
    const entry: LootTableDef["entries"][number] = {
      itemDefinitionId: row[1],
      minimumQuantity: Number(row[2]),
      maximumQuantity: Number(row[3]),
      chance: Number(row[4]),
    };
    if (row[5].length > 0) {
      entry.weight = Number(row[5]);
    }
    if (row[6].length > 0) {
      entry.groupId = row[6];
    }
    if (row[7] === "true") {
      entry.guaranteed = true;
    }
    if (row[8].length > 0) {
      entry.ownershipPolicy = row[8] as NonNullable<LootTableDef["entries"][number]["ownershipPolicy"]>;
    }
    entriesByTable[tableId].push(entry);
  }
  const next: Record<string, LootTableDef> = {};
  const ids = Object.keys(tables).sort();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    next[id] = entriesByTable[id] !== undefined ? { ...tables[id], entries: entriesByTable[id] } : tables[id];
  }
  return canonicalize(next) as Record<string, LootTableDef>;
}
