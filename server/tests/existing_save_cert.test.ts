import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { migrateAccount, migrateRecord } from "../src/domain/migration";
import { SAVE_SCHEMA_VERSION } from "../src/domain/save_schema";

interface SaveFixture {
  userId: string;
  gold: number;
  character: { [key: string]: unknown };
  inventory: { [key: string]: unknown };
  equipment: { [key: string]: unknown };
  quests: { [key: string]: unknown };
  progression?: { [key: string]: unknown };
}

function fixturePath(name: string): string {
  const candidates = [
    join(__dirname, "fixtures", "saves", name),
    join(__dirname, "..", "..", "tests", "fixtures", "saves", name),
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (existsSync(candidates[i])) {
      return candidates[i];
    }
  }
  throw new Error("missing save fixture " + name);
}

function loadFixture(name: string): SaveFixture {
  return JSON.parse(readFileSync(fixturePath(name), "utf8")) as SaveFixture;
}

function migrateFixture(fixture: SaveFixture) {
  return migrateAccount({
    userId: fixture.userId,
    character: fixture.character,
    inventory: fixture.inventory,
    equipment: fixture.equipment,
    quests: fixture.quests,
    gold: fixture.gold,
    characterPresent: true,
    inventoryPresent: true,
    equipmentPresent: true,
    questsPresent: true,
    walletRefPresent: false,
  });
}

function recordValue(account: ReturnType<typeof migrateAccount>, kind: string): { [key: string]: unknown } {
  const row = account.records.filter((entry) => entry.kind === kind)[0];
  assert.ok(row);
  assert.equal(row.result.ok, true);
  assert.ok(row.result.value);
  return row.result.value as { [key: string]: unknown };
}

function itemIds(inventory: { [key: string]: unknown }): string[] {
  const items = inventory.items as Array<{ itemId: string; instanceId: string }>;
  return items.map((item) => item.itemId).sort();
}

function instanceIds(inventory: { [key: string]: unknown }): string[] {
  const items = inventory.items as Array<{ instanceId: string }>;
  return items.map((item) => item.instanceId).sort();
}

function assertCanonicalSlice(account: ReturnType<typeof migrateAccount>, position: { x: number; y: number }): void {
  assert.equal(account.ok, true);
  assert.equal(account.gold, 25);
  assert.equal(account.characterId, "char-alice");
  const character = recordValue(account, "character");
  assert.equal(character.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(character.name, "Alice");
  assert.equal(character.characterId, "char-alice");
  const pose = character.position as { x: number; y: number };
  assert.equal(pose.x, position.x);
  assert.equal(pose.y, position.y);
  const inventory = recordValue(account, "inventory");
  assert.deepEqual(itemIds(inventory), ["item.iron_sword", "item.training_sword"]);
  assert.deepEqual(instanceIds(inventory), ["inst-iron", "inst-sword"]);
  const equipment = recordValue(account, "equipment");
  const slots = equipment.slots as { main_hand: string };
  assert.equal(slots.main_hand, "inst-iron");
  const quests = recordValue(account, "quests");
  const questRows = quests.quests as Array<{ questId: string; status: string }>;
  const slime = questRows.filter((row) => row.questId === "quest.slime_problem")[0];
  assert.ok(slime);
  assert.equal(slime.status, "completed");
}

test("Prompt 18, intermediate, and current saves keep quest, gear, gold, and pose", () => {
  const p18 = migrateFixture(loadFixture("p18-alice.json"));
  assertCanonicalSlice(p18, { x: 640, y: 400 });
  const p20 = migrateFixture(loadFixture("p20-v1-alice.json"));
  assertCanonicalSlice(p20, { x: 640, y: 400 });
  const p21 = migrateFixture(loadFixture("p21-class-alice.json"));
  assertCanonicalSlice(p21, { x: 640, y: 400 });
  assert.equal(recordValue(p21, "character").classId, "test.class.vanguard");
  const current = migrateFixture(loadFixture("current-v1-alice.json"));
  assertCanonicalSlice(current, { x: 512, y: 384 });
  assert.equal(recordValue(current, "character").classId, "test.class.vanguard");
  assert.equal(recordValue(current, "character").bindX, 200);
  assert.equal(recordValue(current, "character").bindY, 640);
});

test("migrating the same save twice does not duplicate items, gold, or quests", () => {
  const names = ["p18-alice.json", "p20-v1-alice.json", "p21-class-alice.json", "current-v1-alice.json"];
  for (let i = 0; i < names.length; i++) {
    const fixture = loadFixture(names[i]);
    const first = migrateFixture(fixture);
    const inventory = recordValue(first, "inventory");
    const equipment = recordValue(first, "equipment");
    const quests = recordValue(first, "quests");
    const character = recordValue(first, "character");
    const second = migrateAccount({
      userId: fixture.userId,
      character: character,
      inventory: inventory,
      equipment: equipment,
      quests: quests,
      walletRef: first.records.filter((row) => row.kind === "wallet_ref")[0].result.value,
      gold: 25,
      characterPresent: true,
      inventoryPresent: true,
      equipmentPresent: true,
      questsPresent: true,
      walletRefPresent: true,
    });
    assert.equal(second.ok, true, names[i]);
    assert.equal(second.changed, false, names[i]);
    assert.equal(second.gold, 25, names[i]);
    assert.deepEqual(itemIds(recordValue(second, "inventory")), ["item.iron_sword", "item.training_sword"]);
    assert.deepEqual(instanceIds(recordValue(second, "inventory")), ["inst-iron", "inst-sword"]);
    const questRows = recordValue(second, "quests").quests as Array<{ questId: string }>;
    assert.equal(questRows.filter((row) => row.questId === "quest.slime_problem").length, 1);
  }
});

test("current progression blob stays at schema 1 without losing allocated points", () => {
  const fixture = loadFixture("current-v1-alice.json");
  assert.ok(fixture.progression);
  const first = migrateRecord("progression", fixture.progression, true);
  assert.equal(first.ok, true);
  assert.equal(first.value !== null && first.value.level, 2);
  assert.equal(first.value !== null && first.value.lifetimeXp, 70);
  const allocated = first.value !== null ? (first.value.allocatedAttributes as { [id: string]: number }) : {};
  assert.equal(allocated["test.attribute.might"], 1);
  const second = migrateRecord("progression", first.value, true);
  assert.equal(second.ok, true);
  assert.equal(second.changed, false);
});
