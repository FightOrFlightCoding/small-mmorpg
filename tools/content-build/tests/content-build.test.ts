import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { emitClientJson, emitServerModule, buildBundle, writeOutputs } from "../src/emit";
import { diffPayloads } from "../src/diff";
import { ContentValidationError } from "../src/issues";
import { loadSourceDocuments } from "../src/load";
import { traceReferences } from "../src/trace";
import type { SourceDocument } from "../src/types";
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
  assert.equal(payload.enemies["enemy.green_slime"].loot[0].itemId, "item.slime_gel");
  assert.equal(payload.enemies["enemy.green_slime"].loot[0].guaranteed, true);
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
  }
  assert.equal(defaults, 1);
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
  find(docs, "item.training_sword")["equipSlot"] = "head";
  const codes = codesOf(() => validateDocuments(SCHEMA_DIR, docs));
  assert.ok(codes.indexOf("unknown_equipment_slot:head") !== -1);
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
      maxStack: 1,
      attackBonus: 0,
      developmentOnly: true,
    },
  });
  const production = validateDocuments(SCHEMA_DIR, docs);
  const withDev = validateDocuments(SCHEMA_DIR, docs, { includeDevelopment: true });
  assert.equal(production.items["item.debug_widget"], undefined);
  assert.equal(withDev.items["item.debug_widget"].displayName, "Debug Widget");
  assert.deepEqual(developmentOnlyIds(docs), ["item.debug_widget"]);
  const prodBundle = buildBundle(production, { developmentOnly: developmentOnlyIds(docs) });
  const baseline = buildBundle(validateDocuments(SCHEMA_DIR, loadValid()));
  assert.equal(prodBundle.contentHash, baseline.contentHash);
  assert.deepEqual(prodBundle.developmentOnly, ["item.debug_widget"]);
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
});
