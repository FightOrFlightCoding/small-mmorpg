import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyInventory,
  makeInstance,
  type ItemDefinition,
  type PlayerInventory,
} from "../src/domain/inventory";
import {
  ITEM_ERROR_CATALOG,
  ITEM_ERROR_INVENTORY_STALE,
  ITEM_ERROR_INVALID_QUANTITY,
  ITEM_ERROR_ITEM_LOCKED,
  ITEM_ERROR_TRANSACTION_CONFLICT,
  ITEM_ERROR_DESTINATION_UNAVAILABLE,
} from "../src/domain/item_errors";
import {
  LOCK_TYPE_TRADE,
  acquireItemLock,
  expireInventoryLocks,
  expireOrphanLocks,
  ITEM_LOCK_TTL_MS,
  releaseItemLock,
  validateItemLock,
} from "../src/domain/item_lock";
import {
  JOURNAL_COMMITTED,
  JOURNAL_COMMITTING,
  memoryJournalStore,
} from "../src/domain/item_journal";
import {
  createCharacterSerial,
  executeDropIntent,
  runItemTransaction,
  sortCharacterIds,
} from "../src/domain/item_txn";

function mat(id: string, maxStack = 99): ItemDefinition {
  return { id: id, maxStack: maxStack, equippable: false };
}

function bagWith(id: string, itemId: string, qty: number, slot = 0): PlayerInventory {
  const inventory = emptyInventory(30);
  inventory.items.push(makeInstance(id, itemId, qty, slot));
  inventory.revision = 3;
  return inventory;
}

function ids(prefix = "id"): () => string {
  let n = 0;
  return function () {
    n += 1;
    return prefix + "-" + String(n);
  };
}

test("item error catalogue is stable snake_case", () => {
  assert.equal(ITEM_ERROR_CATALOG.length, 14);
  assert.equal(ITEM_ERROR_INVENTORY_STALE, "inventory_stale");
  assert.equal(ITEM_ERROR_TRANSACTION_CONFLICT, "transaction_conflict");
});

test("stale revision makes no mutation", () => {
  const inventory = bagWith("ore-1", "item.ore", 5);
  const result = runItemTransaction({
    requestId: "req-stale-0001",
    operationType: "loot",
    nowMs: 10,
    sides: [
      {
        characterId: "char-a",
        inventory: inventory,
        expectedRevision: 1,
        incoming: [{ itemId: "item.ore", quantity: 1 }],
      },
    ],
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, ITEM_ERROR_INVENTORY_STALE);
  assert.equal(result.persist, false);
  assert.equal(result.inventories["char-a"].items[0].quantity, 5);
  assert.equal(result.inventories["char-a"].revision, 3);
});

test("duplicate successful request returns the original result", () => {
  const journal = memoryJournalStore();
  const inventory = emptyInventory(30);
  const first = runItemTransaction({
    requestId: "req-dup-ok0001",
    operationType: "loot",
    nowMs: 10,
    sides: [
      {
        characterId: "char-a",
        inventory: inventory,
        incoming: [{ itemId: "item.ore", quantity: 2 }],
      },
    ],
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids("n"),
    journal: journal,
  });
  assert.equal(first.ok, true);
  const second = runItemTransaction({
    requestId: "req-dup-ok0001",
    operationType: "loot",
    nowMs: 11,
    sides: [
      {
        characterId: "char-a",
        inventory: first.inventories["char-a"],
        incoming: [{ itemId: "item.ore", quantity: 2 }],
      },
    ],
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids("x"),
    journal: journal,
  });
  assert.equal(second.ok, true);
  assert.equal(second.replay, true);
  assert.equal(second.persist, false);
  assert.equal(second.inventories["char-a"].items.length, first.inventories["char-a"].items.length);
});

test("duplicate failed request returns the same terminal result", () => {
  const journal = memoryJournalStore();
  const items: PlayerInventory = emptyInventory(30);
  for (let i = 0; i < 30; i++) {
    items.items.push(makeInstance("p" + String(i), "item.pebble", 1, i));
  }
  const input = {
    requestId: "req-dup-fail01",
    operationType: "loot",
    nowMs: 10,
    sides: [
      {
        characterId: "char-a",
        inventory: items,
        incoming: [{ itemId: "item.ore", quantity: 1 }],
      },
    ],
    definitions: { "item.ore": mat("item.ore"), "item.pebble": mat("item.pebble", 1) },
    newIds: ids(),
    journal: journal,
  };
  const first = runItemTransaction(input);
  assert.equal(first.ok, false);
  assert.equal(first.code, "inventory_full");
  const second = runItemTransaction(input);
  assert.equal(second.ok, false);
  assert.equal(second.replay, true);
  assert.equal(second.code, "inventory_full");
});

test("concurrent requests for one character conflict", () => {
  const serial = createCharacterSerial();
  const held = serial.acquire(["char-a"], "op-1");
  assert.equal(held.ok, true);
  const result = runItemTransaction({
    requestId: "req-concurrent1",
    operationType: "loot",
    nowMs: 10,
    sides: [
      {
        characterId: "char-a",
        inventory: emptyInventory(30),
        incoming: [{ itemId: "item.ore", quantity: 1 }],
      },
    ],
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids(),
    serial: serial,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, ITEM_ERROR_TRANSACTION_CONFLICT);
  serial.release(["char-a"], "op-1");
});

test("lock acquisition, conflict, and expiry", () => {
  let inventory = bagWith("ore-1", "item.ore", 20);
  const first = acquireItemLock({
    inventory: inventory,
    instanceId: "ore-1",
    lockId: "lock-a",
    lockType: LOCK_TYPE_TRADE,
    quantity: 5,
    ownerOperation: "trade",
    nowMs: 1000,
    ttlMs: 50,
  });
  assert.equal(first.ok, true);
  assert.equal(first.lock !== null && first.lock.quantity, 5);
  inventory = first.inventory;
  const conflict = acquireItemLock({
    inventory: inventory,
    instanceId: "ore-1",
    lockId: "lock-b",
    lockType: LOCK_TYPE_TRADE,
    quantity: 2,
    ownerOperation: "trade",
    nowMs: 1010,
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, ITEM_ERROR_ITEM_LOCKED);
  const stillValid = validateItemLock(inventory, "ore-1", "lock-a", 1020);
  assert.equal(stillValid.ok, true);
  const expired = expireInventoryLocks(inventory, 1060);
  assert.equal(expired.changed, true);
  assert.equal(expired.inventory.items[0].lockId, "");
  const after = acquireItemLock({
    inventory: expired.inventory,
    instanceId: "ore-1",
    lockId: "lock-c",
    lockType: LOCK_TYPE_TRADE,
    quantity: 2,
    ownerOperation: "trade",
    nowMs: 1060,
    ttlMs: ITEM_LOCK_TTL_MS,
  });
  assert.equal(after.ok, true);
  const released = releaseItemLock(after.inventory, "lock-c");
  assert.equal(released.items[0].lockId, "");
});

test("lock acquisition rejects invalid quantity", () => {
  const inventory = bagWith("ore-1", "item.ore", 4);
  const result = acquireItemLock({
    inventory: inventory,
    instanceId: "ore-1",
    lockId: "lock-qty",
    lockType: LOCK_TYPE_TRADE,
    quantity: 9,
    ownerOperation: "trade",
    nowMs: 1000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, ITEM_ERROR_INVALID_QUANTITY);
});

test("orphan locks are cleared on recovery", () => {
  let inventory = bagWith("ore-1", "item.ore", 8);
  inventory = acquireItemLock({
    inventory: inventory,
    instanceId: "ore-1",
    lockId: "gone-trade",
    lockType: LOCK_TYPE_TRADE,
    quantity: 8,
    ownerOperation: "trade",
    nowMs: 1,
    ttlMs: 0,
  }).inventory;
  const recovered = expireOrphanLocks(inventory, []);
  assert.equal(recovered.changed, true);
  assert.equal(recovered.inventory.items[0].lockId, "");
});

test("interrupted commit retries without duplicating items", () => {
  const journal = memoryJournalStore();
  const inventory = emptyInventory(30);
  const interrupted = runItemTransaction({
    requestId: "req-retry-0001",
    operationType: "loot",
    nowMs: 10,
    sides: [
      {
        characterId: "char-a",
        inventory: inventory,
        incoming: [{ itemId: "item.ore", quantity: 3 }],
      },
    ],
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids("i"),
    journal: journal,
    interruptAfter: "committing",
  });
  assert.equal(interrupted.ok, false);
  assert.equal(interrupted.journal.state, JOURNAL_COMMITTING);
  const retried = runItemTransaction({
    requestId: "req-retry-0001",
    operationType: "loot",
    nowMs: 20,
    sides: [
      {
        characterId: "char-a",
        inventory: inventory,
        incoming: [{ itemId: "item.ore", quantity: 3 }],
      },
    ],
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids("r"),
    journal: journal,
  });
  assert.equal(retried.ok, true);
  assert.equal(retried.inventories["char-a"].items[0].quantity, 3);
  const replay = runItemTransaction({
    requestId: "req-retry-0001",
    operationType: "loot",
    nowMs: 30,
    sides: [
      {
        characterId: "char-a",
        inventory: retried.inventories["char-a"],
        incoming: [{ itemId: "item.ore", quantity: 3 }],
      },
    ],
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids("z"),
    journal: journal,
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.inventories["char-a"].items[0].quantity, 3);
});

test("compensation restores snapshots after a failed commit", () => {
  const journal = memoryJournalStore();
  const inventory = bagWith("ore-1", "item.ore", 4);
  const result = runItemTransaction({
    requestId: "req-comp-00001",
    operationType: "loot",
    nowMs: 10,
    sides: [
      {
        characterId: "char-a",
        inventory: inventory,
        incoming: [{ itemId: "item.ore", quantity: 1 }],
        gold: 0,
        goldDelta: -5,
      },
    ],
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids(),
    journal: journal,
  });
  assert.equal(result.ok, false);
  assert.equal(result.journal.state === "COMPENSATED" || result.journal.state === "FAILED", true);
  assert.equal(result.inventories["char-a"].items[0].quantity, 4);
});

test("multi-character lock ordering is lexicographic and released in reverse", () => {
  assert.deepEqual(sortCharacterIds(["char-z", "char-a", "char-a"]), ["char-a", "char-z"]);
  const serial = createCharacterSerial();
  const ordered = serial.acquire(["char-z", "char-a"], "trade-1");
  assert.equal(ordered.ok, true);
  assert.deepEqual(ordered.ordered, ["char-a", "char-z"]);
  const conflict = serial.acquire(["char-z"], "trade-2");
  assert.equal(conflict.ok, false);
  serial.release(["char-z", "char-a"], "trade-1");
  const again = serial.acquire(["char-z"], "trade-2");
  assert.equal(again.ok, true);
});

test("drop intent compensates into the bag when the ground entity is missing", () => {
  const inventory = bagWith("ore-1", "item.ore", 6);
  const result = executeDropIntent({
    inventory: inventory,
    instanceId: "ore-1",
    quantity: 6,
    requestId: "req-drop-fail01",
    characterId: "char-a",
    nowMs: 50,
    x: 10,
    y: 10,
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids("d"),
    failBeforeEntity: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, ITEM_ERROR_DESTINATION_UNAVAILABLE);
  assert.equal(result.ground, null);
  assert.equal(result.inventory.items.some(function (item) { return item.itemId === "item.ore"; }), true);
  assert.equal(result.intent.state, "compensated");
});

test("committed drop does not duplicate on retry", () => {
  const journal = memoryJournalStore();
  const inventory = bagWith("ore-1", "item.ore", 6);
  const first = executeDropIntent({
    inventory: inventory,
    instanceId: "ore-1",
    quantity: 6,
    requestId: "req-drop-ok0001",
    characterId: "char-a",
    nowMs: 50,
    x: 10,
    y: 10,
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids("g"),
    journal: journal,
  });
  assert.equal(first.ok, true);
  assert.equal(first.ground !== null, true);
  assert.equal(first.inventory.items.length, 0);
  const second = executeDropIntent({
    inventory: first.inventory,
    instanceId: "ore-1",
    quantity: 6,
    requestId: "req-drop-ok0001",
    characterId: "char-a",
    nowMs: 60,
    x: 10,
    y: 10,
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids("h"),
    journal: journal,
  });
  assert.equal(second.ok, true);
  assert.equal(second.inventory.items.length, 0);
});

test("successful mutation writes an audit event", () => {
  const result = runItemTransaction({
    requestId: "req-audit-0001",
    operationType: "loot",
    nowMs: 99,
    sides: [
      {
        characterId: "char-a",
        inventory: emptyInventory(30),
        incoming: [{ itemId: "item.ore", quantity: 2 }],
      },
    ],
    definitions: { "item.ore": mat("item.ore") },
    newIds: ids("a"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.audits.length > 0, true);
  assert.equal(result.audits[0].requestId, "req-audit-0001");
  assert.equal(result.audits[0].characterId, "char-a");
  assert.equal(result.audits[0].operationType, "loot");
  assert.equal(result.audits[0].definitionId, "item.ore");
  assert.equal(result.audits[0].result, "ok");
  assert.equal(result.journal.state, JOURNAL_COMMITTED);
});

test("two-character grant does not duplicate gold or items under replay", () => {
  const journal = memoryJournalStore();
  const first = runItemTransaction({
    requestId: "req-two-char001",
    operationType: "trade",
    nowMs: 10,
    sides: [
      {
        characterId: "char-b",
        inventory: bagWith("gem-1", "item.gem", 1),
        outgoing: [{ instanceId: "gem-1", quantity: 1 }],
        incoming: [{ itemId: "item.ore", quantity: 2 }],
        gold: 10,
        goldDelta: 5,
      },
      {
        characterId: "char-a",
        inventory: bagWith("ore-1", "item.ore", 2),
        outgoing: [{ instanceId: "ore-1", quantity: 2 }],
        incoming: [{ itemId: "item.gem", quantity: 1 }],
        gold: 20,
        goldDelta: -5,
      },
    ],
    definitions: { "item.ore": mat("item.ore"), "item.gem": mat("item.gem") },
    newIds: ids("t"),
    journal: journal,
  });
  assert.equal(first.ok, true);
  assert.equal(first.gold["char-a"], 15);
  assert.equal(first.gold["char-b"], 15);
  const replay = runItemTransaction({
    requestId: "req-two-char001",
    operationType: "trade",
    nowMs: 11,
    sides: [
      { characterId: "char-b", inventory: first.inventories["char-b"], gold: first.gold["char-b"] },
      { characterId: "char-a", inventory: first.inventories["char-a"], gold: first.gold["char-a"] },
    ],
    definitions: { "item.ore": mat("item.ore"), "item.gem": mat("item.gem") },
    newIds: ids("u"),
    journal: journal,
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.gold["char-a"], 15);
  assert.equal(replay.gold["char-b"], 15);
});
