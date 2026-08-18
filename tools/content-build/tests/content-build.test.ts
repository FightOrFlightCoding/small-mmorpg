import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { copyDefinition, createFromTemplate, migrateSource } from "../src/authoring";
import { canonicalize } from "../src/canonical";
import {
  exportEnemyStats,
  exportLevelCurves,
  exportLootEntries,
  exportVendorStock,
  importEnemyStats,
  importLevelCurves,
  importLootEntries,
  importVendorStock,
} from "../src/csv";
import { emitClientJson, emitServerModule, buildBundle, writeOutputs } from "../src/emit";
import { diffPayloads } from "../src/diff";
import { ContentValidationError } from "../src/issues";
import { loadSourceDocuments } from "../src/load";
import { defaultIdFor } from "../src/templates";
import { traceReferences } from "../src/trace";
import type { SourceDocument } from "../src/types";
import { unusedReport } from "../src/unused";
import { defaultClientAssetPaths, loadAssetIndex } from "../src/assets";
import { developmentOnlyIds, validateDocuments } from "../src/validate";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const SOURCE_DIR = join(REPO_ROOT, "content", "source");
const SCHEMA_DIR = join(REPO_ROOT, "content", "schemas");

function loadValid(): SourceDocument[] {
  const loaded = loadSourceDocuments(SOURCE_DIR);
  assert.equal(loaded.issues.length, 0);
  return loaded.documents;
}

function clone(docs: SourceDocument[]): SourceDocument[] {
  return docs.map((doc) => ({
    fileName: doc.fileName,
    data: JSON.parse(JSON.stringify(doc.data)) as Record<string, unknown>,
  }));
}

function find(docs: SourceDocument[], id: string): Record<string, unknown> {
  for (let i = 0; i < docs.length; i++) {
    if (docs[i].data["id"] === id) {
      return docs[i].data;
    }
  }
  throw new Error("missing fixture id " + id);
}

function codesOf(run: () => void): string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return error.issues.map((entry) => entry.code);
    }
    throw error;
  }
  throw new Error("expected validation to fail");
}

test("valid source documents compile to a payload", () => {
  const payload = validateDocuments(SCHEMA_DIR, loadValid());
  assert.equal(payload.player.id, "player.base");
  assert.equal(payload.items["item.training_sword"].equipSlot, "main_hand");
  assert.equal(payload.items["item.training_sword"].attackBonus, 2);
  assert.equal(payload.items["item.slime_gel"].maxStack, 20);
  assert.equal(payload.items["item.slime_gel"].equipSlot, undefined);
  assert.equal(payload.items["item.iron_sword"].attackBonus, 5);
  assert.equal(payload.enemies["enemy.green_slime"].maxHealth, 20);
  assert.equal(payload.enemies["enemy.green_slime"].damage, 2);
  const slimeLoot = payload.enemies["enemy.green_slime"].loot;
  assert.ok(slimeLoot);
  assert.equal(slimeLoot[0].itemId, "item.slime_gel");
  assert.equal(slimeLoot[0].guaranteed, true);
  assert.equal(payload.enemies["enemy.green_slime"].aiProfileId, "test.ai.melee");
  assert.equal(payload.enemies["enemy.green_slime"].lootTableId, "loot.green_slime");
  assert.ok(payload.aiProfiles["test.ai.melee"]);
  assert.ok(payload.lootTables["loot.green_slime"]);
  assert.ok(payload.spawns["spawn.starter.green_slime"]);
  assert.ok(payload.vendors["vendor.test_general"]);
  assert.ok(payload.npcs["npc.test_vendor"]);
  assert.ok(payload.quests["quest.test.talk"]);
  assert.ok(payload.enemies["test.enemy.melee"]);
  assert.ok(payload.enemies["test.enemy.ranged"]);
  assert.ok(payload.enemies["test.enemy.caster"]);
  assert.ok(payload.enemies["test.enemy.cave_boss"]);
  assert.equal(payload.quests["quest.slime_problem"].acceptNpcId, "npc.elder");
  assert.equal(payload.quests["quest.slime_problem"].turnInNpcId, "npc.elder");
  assert.equal(payload.quests["quest.slime_problem"].rewards.gold, 25);
  assert.equal(payload.quests["quest.slime_problem"].completeOnce, true);
  assert.equal(payload.zones["zone.starter"].npcs[0].npcId, "npc.elder");
  assert.equal(payload.zones["zone.starter"].enemies[0].enemyId, "enemy.green_slime");
  assert.ok(payload.zones["zone.starter"].collisions.length >= 4);
  const classIds = Object.keys(payload.classes).sort();
  assert.ok(classIds.length >= 2);
  let defaults = 0;
  for (let i = 0; i < classIds.length; i++) {
    if (payload.classes[classIds[i]].legacyMigrationDefault === true) {
      defaults += 1;
    }
    assert.ok(payload.classes[classIds[i]].startingEquipment.length >= 0);
    assert.ok(typeof payload.classes[classIds[i]].visualAssetSetId === "string");
    assert.ok(typeof payload.classes[classIds[i]].progressionId === "string");
  }
  assert.equal(defaults, 1);
  assert.ok(Object.keys(payload.attributes).length >= 1);
  assert.ok(Object.keys(payload.resources).length >= 1);
  assert.ok(Object.keys(payload.derivedStats).length >= 1);
  assert.ok(Object.keys(payload.levelCurves).length >= 1);
  assert.ok(Object.keys(payload.classProgressions).length >= 2);
  assert.ok(Object.keys(payload.equipmentSlots).length >= 6);
  assert.ok(Object.keys(payload.abilities).length >= 5);
  assert.equal(payload.abilities["test.ability.basic_melee"].targetMode, "entity");
  assert.equal(payload.items["item.training_sword"].category, "weapon");
  assert.equal(payload.items["item.slime_gel"].destroyable, false);
  assert.equal(typeof payload.enemies["enemy.green_slime"].xpReward, "number");
  assert.equal(typeof payload.quests["quest.slime_problem"].rewards.xp, "number");
});

test("duplicate IDs are rejected", () => {
  const docs = clone(loadValid());
  docs.push({
    fileName: "item.training_sword.json",
    data: JSON.parse(JSON.stringify(find(docs, "item.training_sword"))) as Record<string, unknown>,
  });
  const codes = codesOf(() => validateDocuments(SCHEMA_DIR, docs));
  assert.ok(codes.indexOf("duplicate_id:item.training_sword") !== -1);
});

test("broken references are rejected", () => {
  const docs = clone(loadValid());
  const quest = find(docs, "quest.slime_problem");
  (quest["objectives"] as Array<{ itemId: string }>)[0].itemId = "item.missing_gel";
  const codes = codesOf(() => validateDocuments(SCHEMA_DIR, docs));
  assert.ok(codes.indexOf("missing_reference:item.missing_gel") !== -1);
});

test("invalid numerical ranges are rejected", () => {
  const docs = clone(loadValid());
  find(docs, "enemy.green_slime")["maxHealth"] = -1;
  const codes = codesOf(() => validateDocuments(SCHEMA_DIR, docs));
  assert.ok(codes.some((code) => code.indexOf("invalid_range:maxHealth") === 0));
});

test("unknown equipment slots are rejected", () => {
  const docs = clone(loadValid());
  find(docs, "item.training_sword")["equipSlot"] = "tail";
  const codes = codesOf(() => validateDocuments(SCHEMA_DIR, docs));
  assert.ok(codes.indexOf("unknown_equipment_slot:tail") !== -1);
});

test("duplicate quest rewards are rejected", () => {
  const docs = clone(loadValid());
  const quest = find(docs, "quest.slime_problem");
  const rewards = quest["rewards"] as { items: Array<{ itemId: string; quantity: number }> };
  rewards.items.push({ itemId: "item.iron_sword", quantity: 1 });
  const codes = codesOf(() => validateDocuments(SCHEMA_DIR, docs));
  assert.ok(codes.indexOf("duplicate_quest_reward:item.iron_sword") !== -1);
});

test("generation is deterministic", () => {
  const payload = validateDocuments(SCHEMA_DIR, loadValid());
  const first = buildBundle(payload);
  const second = buildBundle(validateDocuments(SCHEMA_DIR, loadValid()));
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(emitClientJson(first), emitClientJson(second));
  assert.equal(emitServerModule(first), emitServerModule(second));
});

test("client and server outputs share the same content hash", () => {
  const bundle = buildBundle(validateDocuments(SCHEMA_DIR, loadValid()));
  const client = JSON.parse(emitClientJson(bundle)) as {
    contentHash: string;
    schemaVersion: number;
    packageId: string;
    minimumProtocolVersion: number;
    developmentOnly: string[];
  };
  const match = emitServerModule(bundle).match(/export const contentHash = "([a-f0-9]{64})";/);
  assert.ok(match);
  assert.equal(client.contentHash, match[1]);
  assert.equal(client.contentHash, bundle.contentHash);
  assert.equal(client.schemaVersion, 1);
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(client.packageId, "vibecode.foundation");
  assert.equal(bundle.packageId, "vibecode.foundation");
  assert.equal(client.minimumProtocolVersion, 1);
  assert.deepEqual(client.developmentOnly, []);
});

test("generated files contain no machine-specific absolute paths", () => {
  const bundle = buildBundle(validateDocuments(SCHEMA_DIR, loadValid()));
  const dir = mkdtempSync(join(tmpdir(), "vibecode-content-"));
  try {
    const serverOut = join(dir, "content.ts");
    const clientOut = join(dir, "bundle.json");
    writeOutputs(serverOut, clientOut, bundle);
    const ts = readFileSync(serverOut, "utf8");
    const json = readFileSync(clientOut, "utf8");
    assert.equal(/[A-Za-z]:[\\/]/.test(ts), false);
    assert.equal(/[A-Za-z]:[\\/]/.test(json), false);
    assert.equal(ts.indexOf("C:\\") === -1, true);
    assert.equal(json.indexOf("/Users/") === -1, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("development-only definitions are excluded from the production payload", () => {
  const docs = clone(loadValid());
  docs.push({
    fileName: "item.debug_widget.json",
    data: {
      id: "item.debug_widget",
      kind: "item",
      displayName: "Debug Widget",
      visualId: "visual.item_training_sword",
      category: "miscellaneous",
      maxStack: 1,
      attackBonus: 0,
      developmentOnly: true,
    },
  });
  const production = validateDocuments(SCHEMA_DIR, docs);
  const withDev = validateDocuments(SCHEMA_DIR, docs, { includeDevelopment: true });
  assert.equal(production.items["item.debug_widget"], undefined);
  assert.equal(withDev.items["item.debug_widget"].displayName, "Debug Widget");
  const excluded = developmentOnlyIds(docs);
  assert.ok(excluded.indexOf("item.debug_widget") !== -1);
  assert.ok(excluded.indexOf("test.zone.systems_lab") !== -1);
  const prodBundle = buildBundle(production, { developmentOnly: excluded });
  const baseline = buildBundle(validateDocuments(SCHEMA_DIR, loadValid()));
  assert.equal(prodBundle.contentHash, baseline.contentHash);
  assert.ok(prodBundle.developmentOnly.indexOf("item.debug_widget") !== -1);
  assert.equal(Object.prototype.hasOwnProperty.call(prodBundle.items, "item.debug_widget"), false);
});

test("content hash ignores build timestamps", () => {
  const payload = validateDocuments(SCHEMA_DIR, loadValid());
  const first = buildBundle(payload, { buildTimestamp: "2026-01-01T00:00:00.000Z" });
  const second = buildBundle(payload, { buildTimestamp: "2026-12-31T23:59:59.000Z" });
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(emitClientJson(first).indexOf("2026-01-01T00:00:00.000Z"), -1);
  assert.equal(emitServerModule(first).indexOf("2026-01-01T00:00:00.000Z"), -1);
});

test("content diff reports added, removed, and changed IDs", () => {
  const left = validateDocuments(SCHEMA_DIR, loadValid());
  const rightDocs = clone(loadValid());
  find(rightDocs, "item.training_sword")["attackBonus"] = 9;
  rightDocs.push({
    fileName: "item.debug_widget.json",
    data: {
      id: "item.debug_widget",
      kind: "item",
      displayName: "Debug Widget",
      visualId: "visual.item_training_sword",
      category: "miscellaneous",
      maxStack: 1,
      attackBonus: 0,
    },
  });
  const right = validateDocuments(SCHEMA_DIR, rightDocs);
  delete right.items["item.slime_gel"];
  const report = diffPayloads(left, right);
  assert.ok(report.added.indexOf("item.debug_widget") !== -1);
  assert.ok(report.removed.indexOf("item.slime_gel") !== -1);
  assert.ok(report.changed.indexOf("item.training_sword") !== -1);
});

test("unsupported definition schemaVersion is rejected", () => {
  const docs = clone(loadValid());
  find(docs, "item.training_sword")["schemaVersion"] = 2;
  const codes = codesOf(() => validateDocuments(SCHEMA_DIR, docs));
  assert.ok(codes.indexOf("definition_schema_version:item.training_sword") !== -1);
});

test("reference tracing lists inbound and outbound IDs", () => {
  const payload = validateDocuments(SCHEMA_DIR, loadValid());
  const gel = traceReferences(payload, "item.slime_gel");
  assert.ok(gel);
  assert.ok(gel.inbound.indexOf("enemy.green_slime") !== -1);
  assert.ok(gel.inbound.indexOf("quest.slime_problem") !== -1);
  const quest = traceReferences(payload, "quest.slime_problem");
  assert.ok(quest);
  assert.ok(quest.outbound.indexOf("npc.elder") !== -1);
  assert.ok(quest.outbound.indexOf("item.slime_gel") !== -1);
  assert.ok(quest.outbound.indexOf("item.iron_sword") !== -1);
  const slime = traceReferences(payload, "enemy.green_slime");
  assert.ok(slime);
  assert.ok(slime.usedBy.quests.indexOf("quest.test.kill") !== -1 || slime.usedBy.zones.indexOf("zone.starter") !== -1);
  const melee = traceReferences(payload, "test.ability.basic_melee");
  assert.ok(melee);
  assert.ok(melee.usedBy.classes.indexOf("test.class.vanguard") !== -1);
  const sword = traceReferences(payload, "item.training_sword");
  assert.ok(sword);
  assert.ok(sword.usedBy.lootTables.length >= 0);
  const vendorItem = traceReferences(payload, "item.test_potion");
  assert.ok(vendorItem);
  assert.ok(vendorItem.usedBy.vendors.indexOf("vendor.test_general") !== -1 || vendorItem.inbound.indexOf("vendor.test_general") !== -1);
});

test("production payload includes the content-only proof chain and excludes the systems lab", () => {
  const production = validateDocuments(SCHEMA_DIR, loadValid());
  assert.ok(production.items["item.proof_token"]);
  assert.ok(production.enemies["enemy.proof_critter"]);
  assert.ok(production.lootTables["loot.proof_critter"]);
  assert.ok(production.npcs["npc.proof_giver"]);
  assert.ok(production.quests["quest.proof_errand"]);
  assert.equal(production.zones["test.zone.systems_lab"], undefined);
  assert.equal(production.npcs["npc.lab_keeper"], undefined);
  const withDev = validateDocuments(SCHEMA_DIR, loadValid(), { includeDevelopment: true });
  assert.ok(withDev.zones["test.zone.systems_lab"]);
  assert.ok(withDev.quests["quest.lab_tour"]);
  assert.ok(developmentOnlyIds(loadValid()).indexOf("test.zone.systems_lab") !== -1);
});

test("content new writes schema-valid starter templates", () => {
  const dir = mkdtempSync(join(tmpdir(), "vibecode-new-"));
  try {
    const sourceDir = join(dir, "source");
    cpSync(SOURCE_DIR, sourceDir, { recursive: true });
    const written = createFromTemplate({
      root: REPO_ROOT,
      sourceDir: sourceDir,
      type: "item",
      id: defaultIdFor("item"),
    });
    assert.ok(written.length >= 1);
    const loaded = loadSourceDocuments(sourceDir);
    const payload = validateDocuments(SCHEMA_DIR, loaded.documents, { includeDevelopment: true });
    assert.ok(payload.items["item.starter_template"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("content copy clones a definition under a new id", () => {
  const dir = mkdtempSync(join(tmpdir(), "vibecode-copy-"));
  try {
    const sourceDir = join(dir, "source");
    cpSync(SOURCE_DIR, sourceDir, { recursive: true });
    copyDefinition({ sourceDir: sourceDir, fromId: "item.test_pebble", toId: "item.copied_pebble" });
    const loaded = loadSourceDocuments(sourceDir);
    const payload = validateDocuments(SCHEMA_DIR, loaded.documents, { includeDevelopment: true });
    assert.ok(payload.items["item.copied_pebble"]);
    assert.equal(payload.items["item.copied_pebble"].displayName, payload.items["item.test_pebble"].displayName);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unused report lists definitions with no inbound references", () => {
  const payload = validateDocuments(SCHEMA_DIR, loadValid());
  const report = unusedReport(payload);
  assert.ok(report.unused.indexOf("item.test_leather_cap") !== -1);
});

test("csv import/export round-trips tabular definitions", () => {
  const payload = validateDocuments(SCHEMA_DIR, loadValid());
  const curves = importLevelCurves(payload.levelCurves, exportLevelCurves(payload.levelCurves));
  assert.deepEqual(canonicalize(curves), canonicalize(payload.levelCurves));
  const vendors = importVendorStock(payload.vendors, exportVendorStock(payload.vendors));
  assert.deepEqual(canonicalize(vendors), canonicalize(payload.vendors));
  const enemies = importEnemyStats(payload.enemies, exportEnemyStats(payload.enemies));
  assert.deepEqual(canonicalize(enemies), canonicalize(payload.enemies));
  const loot = importLootEntries(payload.lootTables, exportLootEntries(payload.lootTables));
  assert.deepEqual(canonicalize(loot), canonicalize(payload.lootTables));
});

test("cyclic quest prerequisites are rejected", () => {
  const docs = clone(loadValid());
  const first = find(docs, "quest.test.talk");
  const second = find(docs, "quest.test.kill");
  first["prerequisites"] = { questIds: ["quest.test.kill"] };
  second["prerequisites"] = { questIds: ["quest.test.talk"] };
  const codes = codesOf(() => validateDocuments(SCHEMA_DIR, docs));
  assert.ok(codes.some((code) => code.indexOf("cyclic_prerequisite:") === 0));
});

test("production definitions may not reference development-only ids", () => {
  const docs = clone(loadValid());
  docs.push({
    fileName: "item.debug_widget.json",
    data: {
      id: "item.debug_widget",
      kind: "item",
      displayName: "Debug Widget",
      visualId: "visual.item_pebble",
      category: "miscellaneous",
      maxStack: 1,
      developmentOnly: true,
    },
  });
  const quest = find(docs, "quest.proof_errand");
  (quest["rewards"] as { items: Array<{ itemId: string; quantity: number }> }).items.push({
    itemId: "item.debug_widget",
    quantity: 1,
  });
  const codes = codesOf(() => validateDocuments(SCHEMA_DIR, docs));
  assert.ok(codes.some((code) => code.indexOf("development_content_leakage:") === 0));
});

test("missing client assets are rejected when an asset index is supplied", () => {
  const docs = clone(loadValid());
  find(docs, "item.proof_token")["visualId"] = "visual.missing_proof";
  const assets = loadAssetIndex(defaultClientAssetPaths(REPO_ROOT));
  const codes = codesOf(() => validateDocuments(SCHEMA_DIR, docs, { assets: assets }));
  assert.ok(codes.indexOf("missing_asset:visual.missing_proof") !== -1);
});

test("content migrate writes schemaVersion 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "vibecode-migrate-"));
  try {
    const sourceDir = join(dir, "source");
    cpSync(SOURCE_DIR, sourceDir, { recursive: true });
    const first = migrateSource(sourceDir, 1);
    assert.ok(first.updated.length > 0);
    const second = migrateSource(sourceDir, 1);
    assert.equal(second.updated.length, 0);
    assert.ok(second.skipped.length > 0);
    const parsed = JSON.parse(readFileSync(join(sourceDir, "player.base.json"), "utf8")) as { schemaVersion: number };
    assert.equal(parsed.schemaVersion, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

