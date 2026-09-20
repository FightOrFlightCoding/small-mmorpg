import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { content, contentHash, developmentOnly } from "../src/generated/content";
import { CORPSE_EXPIRE_SEC, CORPSE_PRIVATE_SEC } from "../src/domain/corpse";
import { GROUND_ITEM_TTL_SEC } from "../src/domain/ground_item";
import { GM_COMMANDS } from "../src/domain/gm";
import { INVENTORY_CAPACITY, ITEM_MAX_STACK, itemDefinitionsFromContent } from "../src/domain/inventory";
import { INVENTORY_PERMISSION_WRITE } from "../src/domain/inventory_store";
import { TRADE_OFFER_SLOTS } from "../src/domain/trade";
import { ClientOpcode, PROTOCOL_VERSION, isProtocolError, parseClientMessage } from "../src/domain/protocol";

function repoRoot(): string {
  const candidates = [
    join(__dirname, "..", "..", ".."),
    join(__dirname, "..", ".."),
    join(__dirname, ".."),
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (existsSync(join(candidates[i], "content", "source"))) {
      return candidates[i];
    }
  }
  return candidates[0];
}

const REPO = repoRoot();

function walkFiles(dir: string, acc: string[]): void {
  const entries = readdirSync(dir);
  for (let i = 0; i < entries.length; i++) {
    const full = join(dir, entries[i]);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entries[i] === "addons" || entries[i] === "node_modules" || entries[i] === "dist" || entries[i] === "dist-test") {
        continue;
      }
      walkFiles(full, acc);
    } else {
      acc.push(full);
    }
  }
}

test("production bag, stack, equipment, trade, and timer contracts hold", () => {
  assert.equal(INVENTORY_CAPACITY, 30);
  assert.equal(content.player.inventoryCapacity, 30);
  assert.equal(ITEM_MAX_STACK, 99);
  assert.equal(TRADE_OFFER_SLOTS, 20);
  assert.equal(CORPSE_PRIVATE_SEC, 60);
  assert.equal(CORPSE_EXPIRE_SEC, 300);
  assert.equal(GROUND_ITEM_TTL_SEC, 300);
  assert.equal(INVENTORY_PERMISSION_WRITE, 0);
  assert.ok(GM_COMMANDS.indexOf("scan_item_recovery") !== -1);
  assert.ok(GM_COMMANDS.indexOf("repair_item_recovery") !== -1);
});

test("production items never overstack, bind, or keep quest items untradeable", () => {
  const items = itemDefinitionsFromContent(content.items);
  const ids = Object.keys(items);
  for (let i = 0; i < ids.length; i++) {
    const item = items[ids[i]];
    assert.ok(item.maxStack >= 1 && item.maxStack <= ITEM_MAX_STACK, item.id + " maxStack");
    if (item.equippable === true) {
      assert.equal(item.maxStack, 1, item.id + " equippable stack");
    }
    if (item.questItem === true) {
      assert.notEqual(item.tradeable, false, item.id + " quest tradeable");
      assert.notEqual(item.droppable, false, item.id + " quest droppable");
    }
  }
  const sourceDir = join(REPO, "content", "source");
  const files = readdirSync(sourceDir).filter(function (name) {
    return name.indexOf("item.") === 0 && name.slice(-5) === ".json";
  });
  for (let f = 0; f < files.length; f++) {
    const raw = JSON.parse(readFileSync(join(sourceDir, files[f]), "utf8")) as { [key: string]: unknown };
    assert.equal(raw.soulbind, undefined, files[f]);
    assert.equal(raw.bindOnPickup, undefined, files[f]);
    assert.equal(raw.bindOnEquip, undefined, files[f]);
    assert.equal(raw.binding, undefined, files[f]);
  }
});

test("developmentOnly content is not referenced by the starter zone", () => {
  const blocked: { [id: string]: boolean } = {};
  for (let i = 0; i < developmentOnly.length; i++) {
    blocked[developmentOnly[i]] = true;
  }
  const zone = content.zones["zone.starter"];
  for (let n = 0; n < zone.npcs.length; n++) {
    assert.equal(blocked[zone.npcs[n].npcId], undefined, zone.npcs[n].npcId);
  }
  const spawnMap = content.spawns as { [id: string]: { id?: string; enemyId?: string; zoneId?: string } };
  const spawnIds = Object.keys(spawnMap);
  for (let s = 0; s < spawnIds.length; s++) {
    const spawn = spawnMap[spawnIds[s]];
    if (spawn.zoneId !== "zone.starter") {
      continue;
    }
    if (typeof spawn.id === "string") {
      assert.equal(blocked[spawn.id], undefined, spawn.id);
    }
    if (typeof spawn.enemyId === "string") {
      assert.equal(blocked[spawn.enemyId], undefined, spawn.enemyId);
    }
  }
});

test("client never authors instance ids, prices, rolls, winners, or coordinates", () => {
  const envelope = JSON.stringify({ protocolVersion: PROTOCOL_VERSION, requestId: "reqaudit01" });
  const roll = parseClientMessage(
    ClientOpcode.SUBMIT_LOOT_ROLL,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, rollId: "r1", choice: "NEED", roll: 99, requestId: "reqaudit02" }),
    contentHash,
  );
  assert.equal(isProtocolError(roll), true);
  const drop = parseClientMessage(
    ClientOpcode.DROP_ITEM,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, instanceId: "i1", quantity: 1, x: 1, y: 1, requestId: "reqaudit03" }),
    contentHash,
  );
  assert.equal(isProtocolError(drop), true);
  const buy = parseClientMessage(
    ClientOpcode.VENDOR_BUY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      vendorId: "vendor.test_general",
      stockEntryId: "vendor.test_general:item.test_potion",
      interactionSessionId: "sess-1",
      quantity: 1,
      price: 1,
      requestId: "reqaudit04",
    }),
    contentHash,
  );
  assert.equal(isProtocolError(buy), true);
  const pickup = parseClientMessage(
    ClientOpcode.PICKUP,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, lootId: "l1", instanceId: "forged", requestId: "reqaudit05" }),
    contentHash,
  );
  assert.equal(isProtocolError(pickup), true);
  assert.equal(typeof envelope, "string");
});

test("no production bag capacity 20 remains and client scripts do not write inventory storage", () => {
  const productionRoots = [join(REPO, "server", "src"), join(REPO, "content", "source"), join(REPO, "client", "scripts")];
  for (let r = 0; r < productionRoots.length; r++) {
    const files: string[] = [];
    walkFiles(productionRoots[r], files);
    for (let f = 0; f < files.length; f++) {
      const path = files[f];
      if (path.slice(-3) !== ".ts" && path.slice(-3) !== ".gd" && path.slice(-5) !== ".json") {
        continue;
      }
      const text = readFileSync(path, "utf8");
      assert.equal(text.indexOf("inventoryCapacity\": 20") === -1, true, path);
      assert.equal(text.indexOf("INVENTORY_CAPACITY = 20") === -1, true, path);
      if (path.indexOf(join(REPO, "client", "scripts")) === 0) {
        assert.equal(text.indexOf("write_storage_objects") === -1, true, path);
        assert.equal(text.indexOf("writeStorageObjects") === -1, true, path);
      }
    }
  }
  assert.equal(existsSync(join(REPO, "server", "src", "domain", "item_txn.ts")), true);
  const txnFiles = readdirSync(join(REPO, "server", "src", "domain")).filter(function (name) {
    return name.indexOf("txn") !== -1 || name.indexOf("transaction") !== -1;
  });
  assert.ok(txnFiles.indexOf("item_txn.ts") !== -1);
  assert.ok(txnFiles.indexOf("transaction.ts") !== -1);
});

test("loot is generated once at corpse create and trade has exactly 20 offer slots", () => {
  assert.equal(TRADE_OFFER_SLOTS, 20);
  const corpseSrc = readFileSync(join(REPO, "server", "src", "domain", "corpse.ts"), "utf8");
  assert.equal(corpseSrc.indexOf("generateCorpseLoot") !== -1, true);
  assert.equal(corpseSrc.indexOf("openCorpseWindow") !== -1, true);
  const openFn = corpseSrc.slice(corpseSrc.indexOf("export function openCorpseWindow"), corpseSrc.indexOf("export function closeCorpseWindow"));
  assert.equal(openFn.indexOf("generateCorpseLoot") === -1, true);
});
