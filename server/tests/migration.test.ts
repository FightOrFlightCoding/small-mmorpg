import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { storedCharacterFromValue, storedCharacterWriteValue } from "../src/domain/character";
import { storedInventoryWriteValue } from "../src/domain/inventory_store";
import { migrateAccount, migrateRecord } from "../src/domain/migration";
import { storedQuestWriteValue } from "../src/domain/quest_store";
import { loadCanonicalInventory } from "../src/domain/save_load";
import {
  REASON_ALREADY_CURRENT,
  REASON_CORRUPTED_REQUIRED_FIELDS,
  REASON_CORRUPTED_SCHEMA_VERSION,
  REASON_MIGRATED,
  REASON_UNSUPPORTED_FUTURE_VERSION,
  SAVE_SCHEMA_VERSION,
  deepStableEqual,
} from "../src/domain/save_schema";

function prompt18FixturePath(): string {
  const candidates = [
    join(__dirname, "fixtures", "saves", "p18-alice.json"),
    join(__dirname, "..", "..", "tests", "fixtures", "saves", "p18-alice.json"),
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (existsSync(candidates[i])) {
      return candidates[i];
    }
  }
  throw new Error("missing Prompt 18 fixture");
}

function prompt18Character() {
  return {
    characterId: "char-alice",
    name: "Alice",
    contentId: "player.base",
    zoneId: "zone.starter",
    position: { x: 640, y: 400 },
  };
}

function prompt18Inventory() {
  return {
    capacity: 20,
    items: [
      { instanceId: "inst-sword", itemId: "item.training_sword", quantity: 1, metadata: {} },
      { instanceId: "inst-iron", itemId: "item.iron_sword", quantity: 1, metadata: {} },
    ],
    pickupByRequestId: { "req-gel": { ok: true, code: "ok", lootId: "loot-1" } },
  };
}

function prompt18Equipment() {
  return {
    slots: { main_hand: "inst-iron" },
    equipByRequestId: { "req-eq": { ok: true, code: "ok", slot: "main_hand", instanceId: "inst-iron" } },
  };
}

function prompt18QuestsCompleted() {
  return {
    quests: [
      {
        questId: "quest.slime_problem",
        status: "completed",
        objectives: [{ type: "acquire_item", itemId: "item.slime_gel", current: 1, required: 1 }],
      },
    ],
    acceptByRequestId: { "req-accept": "accepted" },
    turnInByRequestId: { "req-turnin": "ok" },
  };
}

test("current-version load does not change a v1 record", () => {
  const first = migrateRecord("character", prompt18Character(), true);
  assert.equal(first.ok, true);
  const second = migrateRecord("character", first.value, true);
  assert.equal(second.ok, true);
  assert.equal(second.reason, REASON_ALREADY_CURRENT);
  assert.equal(second.changed, false);
  assert.equal(deepStableEqual(first.value, second.value), true);
});

test("older-version Prompt 18 character migrates without losing name or position", () => {
  const result = migrateRecord("character", prompt18Character(), true);
  assert.equal(result.ok, true);
  assert.equal(result.reason, REASON_MIGRATED);
  assert.equal(result.fromVersion, 0);
  assert.equal(result.toVersion, SAVE_SCHEMA_VERSION);
  assert.ok(result.migrationIds.indexOf("mig.character.v0_to_v1") !== -1);
  assert.equal(result.value !== null, true);
  if (result.value !== null) {
    assert.equal(result.value.schemaVersion, 1);
    assert.equal(result.value.name, "Alice");
    assert.equal(result.value.characterId, "char-alice");
    const position = result.value.position as { x: number; y: number };
    assert.equal(position.x, 640);
    assert.equal(position.y, 400);
  }
});

test("repeated migration of the same blob is a no-op", () => {
  const once = migrateRecord("inventory", prompt18Inventory(), true);
  const twice = migrateRecord("inventory", once.value, true);
  const thrice = migrateRecord("inventory", twice.value, true);
  assert.equal(twice.changed, false);
  assert.equal(thrice.changed, false);
  assert.equal(deepStableEqual(once.value, twice.value), true);
  assert.equal(deepStableEqual(twice.value, thrice.value), true);
});

test("interrupted migration retry produces the same result", () => {
  const first = migrateRecord("equipment", prompt18Equipment(), true);
  const retry = migrateRecord("equipment", prompt18Equipment(), true);
  assert.equal(first.ok, true);
  assert.equal(retry.ok, true);
  assert.equal(deepStableEqual(first.value, retry.value), true);
  if (first.value !== null) {
    const slots = first.value.slots as { main_hand: string };
    assert.equal(slots.main_hand, "inst-iron");
  }
});

test("unsupported future versions are rejected", () => {
  const future = { ...prompt18Character(), schemaVersion: 99 };
  const result = migrateRecord("character", future, true);
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASON_UNSUPPORTED_FUTURE_VERSION);
  assert.equal(result.value, null);
});

test("missing version is treated as Prompt 18 v0", () => {
  const result = migrateRecord("character", prompt18Character(), true);
  assert.equal(result.ok, true);
  assert.equal(result.fromVersion, 0);
  assert.equal(result.reason, REASON_MIGRATED);
});

test("partially missing optional fields still migrate", () => {
  const result = migrateRecord("inventory", { capacity: 20, items: [{ instanceId: "a", itemId: "item.training_sword", quantity: 1 }] }, true);
  assert.equal(result.ok, true);
  if (result.value !== null) {
    assert.equal(Array.isArray(result.value.items), true);
    assert.equal((result.value.items as unknown[]).length, 1);
  }
});

test("corrupted required fields are rejected and not reset", () => {
  const character = migrateRecord("character", { name: "Alice" }, true);
  assert.equal(character.ok, false);
  assert.equal(character.reason, REASON_CORRUPTED_REQUIRED_FIELDS);
  assert.equal(character.value, null);
  const quests = migrateRecord("quests", { quests: "nope" }, true);
  assert.equal(quests.ok, false);
  assert.equal(quests.reason, REASON_CORRUPTED_REQUIRED_FIELDS);
});

test("existing Prompt 18 completed quest, equipped item, and wallet gold are preserved", () => {
  const account = migrateAccount({
    userId: "user-alice",
    character: prompt18Character(),
    inventory: prompt18Inventory(),
    equipment: prompt18Equipment(),
    quests: prompt18QuestsCompleted(),
    gold: 25,
    characterPresent: true,
    inventoryPresent: true,
    equipmentPresent: true,
    questsPresent: true,
    walletRefPresent: false,
  });
  assert.equal(account.ok, true);
  assert.equal(account.gold, 25);
  assert.equal(account.characterId, "char-alice");
  const quests = account.records.filter((row) => row.kind === "quests")[0].result.value;
  assert.ok(quests);
  const questRows = quests.quests as Array<{ questId: string; status: string }>;
  assert.equal(questRows[0].status, "completed");
  const turnIns = quests.turnInByRequestId as { [id: string]: string };
  assert.equal(turnIns["req-turnin"], "ok");
  const equipment = account.records.filter((row) => row.kind === "equipment")[0].result.value;
  assert.ok(equipment);
  assert.equal((equipment.slots as { main_hand: string }).main_hand, "inst-iron");
  const inventory = account.records.filter((row) => row.kind === "inventory")[0].result.value;
  assert.ok(inventory);
  const items = inventory.items as Array<{ itemId: string }>;
  assert.equal(items.length, 2);
  assert.equal(items.filter((item) => item.itemId === "item.training_sword").length, 1);
  const again = migrateAccount({
    userId: "user-alice",
    character: account.records[0].result.value,
    inventory: inventory,
    equipment: equipment,
    quests: quests,
    walletRef: account.records.filter((row) => row.kind === "wallet_ref")[0].result.value,
    gold: 25,
    characterPresent: true,
    inventoryPresent: true,
    equipmentPresent: true,
    questsPresent: true,
    walletRefPresent: true,
  });
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.equal(again.gold, 25);
});

test("health extras on a Prompt 18 character are preserved and starter items are not granted", () => {
  const result = migrateRecord(
    "character",
    { ...prompt18Character(), health: 42 },
    true,
  );
  assert.equal(result.ok, true);
  assert.equal(result.value !== null && result.value.health === 42, true);
  if (result.value !== null) {
    const parsed = storedCharacterFromValue(result.value, "");
    assert.ok(parsed);
    assert.equal(parsed !== null && parsed.extras !== undefined && parsed.extras.health === 42, true);
    if (parsed !== null) {
      assert.equal(storedCharacterWriteValue(parsed).health, 42);
    }
  }
  const inventory = migrateRecord("inventory", prompt18Inventory(), true);
  assert.equal(inventory.ok, true);
  if (inventory.value !== null) {
    const items = inventory.value.items as Array<{ itemId: string }>;
    assert.equal(items.length, 2);
  }
});

test("corrupt present inventory is not treated as missing", () => {
  const loaded = loadCanonicalInventory({ capacity: 20 }, true);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.missing, false);
  assert.equal(loaded.value, null);
});

test("Prompt 18 fixture migrates without losing name, equipment, quest, or gold", () => {
  const fixture = JSON.parse(readFileSync(prompt18FixturePath(), "utf8")) as {
    userId: string;
    gold: number;
    character: unknown;
    inventory: unknown;
    equipment: unknown;
    quests: unknown;
  };
  const account = migrateAccount({
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
  assert.equal(account.ok, true);
  assert.equal(account.gold, 25);
  assert.equal(account.characterId, "char-alice");
  assert.equal(account.records.filter((row) => row.kind === "character")[0].result.value?.name, "Alice");
  const again = migrateAccount({
    userId: fixture.userId,
    character: account.records[0].result.value,
    inventory: account.records.filter((row) => row.kind === "inventory")[0].result.value,
    equipment: account.records.filter((row) => row.kind === "equipment")[0].result.value,
    quests: account.records.filter((row) => row.kind === "quests")[0].result.value,
    walletRef: account.records.filter((row) => row.kind === "wallet_ref")[0].result.value,
    gold: 25,
    characterPresent: true,
    inventoryPresent: true,
    equipmentPresent: true,
    questsPresent: true,
    walletRefPresent: true,
  });
  assert.equal(again.changed, false);
});

test("null schemaVersion from Nakama JSON is treated as Prompt 18 v0", () => {
  const result = migrateRecord("quests", { ...prompt18QuestsCompleted(), schemaVersion: null }, true);
  assert.equal(result.ok, true);
  assert.equal(result.fromVersion, 0);
  assert.equal(result.reason, REASON_MIGRATED);
  assert.equal(result.value !== null, true);
  if (result.value !== null) {
    assert.equal(result.value.schemaVersion, 1);
    const questRows = result.value.quests as Array<{ status: string }>;
    assert.equal(questRows[0].status, "completed");
  }
});

test("non-integer schemaVersion is rejected as corrupted", () => {
  const fractional = migrateRecord("character", { ...prompt18Character(), schemaVersion: 1.5 }, true);
  assert.equal(fractional.ok, false);
  assert.equal(fractional.reason, REASON_CORRUPTED_SCHEMA_VERSION);
  assert.equal(fractional.value, null);
  const text = migrateRecord("character", { ...prompt18Character(), schemaVersion: "1" }, true);
  assert.equal(text.ok, false);
  assert.equal(text.reason, REASON_CORRUPTED_SCHEMA_VERSION);
});

test("storage writes coerce null envelope fields to numbers", () => {
  const writtenInventory = storedInventoryWriteValue({
    capacity: 20,
    items: [],
    pickupByRequestId: {},
    schemaVersion: null as unknown as number,
    createdAt: null as unknown as number,
    updatedAt: null as unknown as number,
  });
  assert.equal(writtenInventory.schemaVersion, 1);
  assert.equal(writtenInventory.createdAt, 0);
  assert.equal(writtenInventory.updatedAt, 0);
  const writtenQuests = storedQuestWriteValue({
    quests: {},
    acceptByRequestId: {},
    turnInByRequestId: {},
    schemaVersion: null as unknown as number,
  });
  assert.equal(writtenQuests.schemaVersion, 1);
});
