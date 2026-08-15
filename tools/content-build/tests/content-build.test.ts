import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { emitClientJson, emitServerModule, buildBundle, writeOutputs } from "../src/emit";
import { ContentValidationError } from "../src/issues";
import { loadSourceDocuments } from "../src/load";
import type { SourceDocument } from "../src/types";
import { validateDocuments } from "../src/validate";

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
  const client = JSON.parse(emitClientJson(bundle)) as { contentHash: string; schemaVersion: number };
  const match = emitServerModule(bundle).match(/export const contentHash = "([a-f0-9]{64})";/);
  assert.ok(match);
  assert.equal(client.contentHash, match[1]);
  assert.equal(client.contentHash, bundle.contentHash);
  assert.equal(client.schemaVersion, 1);
  assert.equal(bundle.schemaVersion, 1);
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
