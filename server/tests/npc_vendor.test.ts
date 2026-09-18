import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  buildFullState,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import { dialogueDefinitionsFromContent } from "../src/domain/dialogue";
import { VENDOR_MAX_QUANTITY, vendorDefinitionsFromContent } from "../src/domain/vendor";
import {
  addOrStackItem,
  emptyInventory,
  itemDefinitionsFromContent,
  type PlayerInventory,
} from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";
import { memoryCommitter, TX_REASON_VENDOR, type TransactionCommitter, type TransactionResult } from "../src/domain/transaction";
import {
  buyMessage,
  closeMessage,
  interactionPayload,
  openNpcSession,
} from "./npc_session";

function serviceZone(vendorsById = vendorDefinitionsFromContent(content.vendors)): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    { "enemy.green_slime": { id: "enemy.green_slime", maxHealth: 20 } },
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      vendorsById: vendorsById,
      dialoguesById: dialogueDefinitionsFromContent(content.dialogues),
    },
  );
}

function playerAt(
  x: number,
  y: number,
  gold = 0,
  inventory?: PlayerInventory,
  extras: Partial<MatchPlayer> = {},
): MatchPlayer {
  const actor: MatchPlayer = {
    userId: extras.userId !== undefined ? extras.userId : "user-alice",
    sessionId: extras.sessionId !== undefined ? extras.sessionId : "session-alice",
    username: extras.username !== undefined ? extras.username : "alice",
    characterId: extras.characterId !== undefined ? extras.characterId : "char-alice",
    name: extras.name !== undefined ? extras.name : "Alice",
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    gold: gold,
    inventory: inventory !== undefined ? inventory : emptyInventory(),
    equipment: emptyEquipment(),
  };
  if (extras.classId !== undefined) {
    actor.classId = extras.classId;
  }
  if (extras.progression !== undefined) {
    actor.progression = extras.progression;
  }
  return actor;
}

function vendorPos() {
  return content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.test_vendor") as { x: number; y: number };
}

function elderPos() {
  return content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.elder") as { x: number; y: number };
}

function actions(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { ok: boolean; code: string; requestId?: string });
}

function itemCount(state: StarterZoneState, userId: string, itemId: string): number {
  const inventory = state.players[userId].inventory;
  if (inventory === undefined) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i].itemId === itemId) {
      total += inventory.items[i].quantity;
    }
  }
  return total;
}

test("opening a vendor shop returns catalog stock and gold currency", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-open01");
  const body = interactionPayload(opened.result);
  assert.equal(body.ok, true);
  assert.ok(body.availableServiceIds !== undefined && body.availableServiceIds.indexOf("vendor") !== -1);
  assert.equal(body.vendorId, "vendor.test_general");
  assert.equal(body.currencyId, "gold");
  assert.ok(Array.isArray(body.stock));
  assert.equal(body.stock.some((row) => row.itemId === "item.test_potion" && row.buyPrice === 10), true);
});

test("unknown vendor catalog id is rejected", () => {
  const vendors = vendorDefinitionsFromContent(content.vendors);
  delete vendors["vendor.test_general"];
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(vendors), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-unkv01");
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-unkv02")],
  );
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "invalid_id");
  assert.equal(result.state.players["user-alice"].gold, 20);
});

test("unknown stock item is rejected", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-unks01");
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.slime_gel", opened.sessionId, opened.npcInstanceId, "req-npc06-unks02")],
  );
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "invalid_id");
  assert.equal(result.state.players["user-alice"].gold, 20);
});

test("client price and resulting balance are protocol rejections", () => {
  const priced = parseClientMessage(
    ClientOpcode.VENDOR_BUY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      interactionSessionId: "sess-price01",
      npcInstanceId: "npc.test_vendor",
      itemId: "item.test_potion",
      price: 1,
      requestId: "req-npc06-price1",
    }),
    contentHash,
  );
  assert.equal(isProtocolError(priced), true);
  if (isProtocolError(priced)) {
    assert.equal(priced.code, "unknown_field:price");
  }
  const balance = parseClientMessage(
    ClientOpcode.VENDOR_BUY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      interactionSessionId: "sess-price02",
      npcInstanceId: "npc.test_vendor",
      itemId: "item.test_potion",
      resultingBalance: 999,
      requestId: "req-npc06-price2",
    }),
    contentHash,
  );
  assert.equal(isProtocolError(balance), true);
  if (isProtocolError(balance)) {
    assert.equal(balance.code, "stat_injection:resultingBalance");
  }
});

test("quantity zero, negative, and excessive buys are rejected", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 200));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-qty001");
  const zero = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-qty002", 0)],
  );
  assert.equal(actions(zero)[0].code, "invalid_amount");
  const negative = applyMatchLoop(
    zero.state,
    3,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-qty003", -2)],
  );
  assert.equal(actions(negative)[0].code, "invalid_amount");
  const excessive = applyMatchLoop(
    negative.state,
    4,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-qty004", VENDOR_MAX_QUANTITY + 1)],
  );
  assert.equal(actions(excessive)[0].code, "invalid_amount");
  assert.equal(excessive.state.players["user-alice"].gold, 200);
  assert.equal(itemCount(excessive.state, "user-alice", "item.test_potion"), 0);
});

test("insufficient currency is rejected", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 0));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-poor01");
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-poor02")],
  );
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "insufficient_gold");
});

test("full inventory is rejected", () => {
  const vendor = vendorPos();
  const items = itemDefinitionsFromContent(content.items);
  const inventory = addOrStackItem(emptyInventory(1), "item.test_pebble", 1, "pebble-full", items["item.test_pebble"]);
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 50, inventory));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-full01");
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.training_sword", opened.sessionId, opened.npcInstanceId, "req-npc06-full02")],
  );
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "inventory_full");
});

test("class and level stock restrictions are enforced", () => {
  const vendor = vendorPos();
  const wrongClass = addPlayer(
    serviceZone(),
    playerAt(vendor.x, vendor.y, 80, undefined, { classId: "test.class.arcanist" }),
  );
  const openedClass = openNpcSession(wrongClass, "user-alice", "npc.test_vendor", 1, "req-npc06-cls001");
  const classDenied = applyMatchLoop(
    openedClass.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_vanguard_mail", openedClass.sessionId, openedClass.npcInstanceId, "req-npc06-cls002")],
  );
  assert.equal(actions(classDenied)[0].code, "class_restricted");
  const lowLevel = addPlayer(
    serviceZone(),
    playerAt(vendor.x, vendor.y, 80, undefined, { classId: "test.class.vanguard" }),
  );
  const openedLevel = openNpcSession(lowLevel, "user-alice", "npc.test_vendor", 1, "req-npc06-lvl001");
  const levelDenied = applyMatchLoop(
    openedLevel.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_vanguard_mail", openedLevel.sessionId, openedLevel.npcInstanceId, "req-npc06-lvl002")],
  );
  assert.equal(actions(levelDenied)[0].code, "level_too_low");
});

test("valid purchase deducts gold and grants the item once", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-buy001");
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-buy002")],
  );
  assert.equal(actions(result)[0].ok, true);
  assert.equal(result.state.players["user-alice"].gold, 10);
  assert.equal(itemCount(result.state, "user-alice", "item.test_potion"), 1);
  const wallet = result.outbound
    .filter((item) => item.opcode === ServerOpcode.WALLET_STATE)
    .map((item) => JSON.parse(item.body) as { gold: number });
  const inventory = result.outbound
    .filter((item) => item.opcode === ServerOpcode.INVENTORY_STATE)
    .map((item) => JSON.parse(item.body) as { items: Array<{ itemId: string }> });
  assert.equal(wallet[0].gold, 10);
  assert.equal(inventory[0].items.some((row) => row.itemId === "item.test_potion"), true);
});

test("duplicate request id replays without a second grant", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-dup001");
  const first = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-dup002")],
  );
  const closed = applyMatchLoop(
    first.state,
    3,
    contentHash,
    [closeMessage("user-alice", opened.sessionId, opened.npcInstanceId, "req-npc06-dup003")],
  );
  const replay = applyMatchLoop(
    closed.state,
    4,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-dup002")],
  );
  assert.equal(actions(replay)[0].ok, true);
  assert.equal(replay.state.players["user-alice"].gold, 10);
  assert.equal(itemCount(replay.state, "user-alice", "item.test_potion"), 1);
});

test("interrupted persist leaves gold and inventory unchanged", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-int001");
  const failCommit: TransactionCommitter = () => {
    const failed: TransactionResult = {
      ok: false,
      code: "persist_failed",
      replay: false,
      gold: 20,
      goldDelta: 0,
      audit: {
        requestId: "req-npc06-int002",
        characterId: "char-alice",
        userId: "user-alice",
        reasonType: TX_REASON_VENDOR,
        reasonId: "npc.test_vendor",
        goldDelta: 0,
        resultingBalance: 20,
        code: "persist_failed",
        ok: false,
        metadata: {},
      },
    };
    return failed;
  };
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-int002")],
    undefined,
    undefined,
    failCommit,
  );
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "persist_failed");
  assert.equal(result.state.players["user-alice"].gold, 20);
  assert.equal(itemCount(result.state, "user-alice", "item.test_potion"), 0);
});

test("reconnect full state restores purchased gold and inventory", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-re001");
  const bought = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-re002")],
  );
  const rejoined = addPlayer(serviceZone(), bought.state.players["user-alice"]);
  const full = JSON.parse(buildFullState(rejoined, 9, "user-alice")) as {
    wallet?: { gold?: number };
    inventory?: { items?: Array<{ itemId: string }> };
  };
  assert.equal(full.wallet !== undefined ? full.wallet.gold : -1, 10);
  assert.equal(
    full.inventory !== undefined && full.inventory.items !== undefined
      ? full.inventory.items.some((row) => row.itemId === "item.test_potion")
      : false,
    true,
  );
});

test("two buyers can purchase the same static stock", () => {
  const vendor = vendorPos();
  let state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  state = addPlayer(
    state,
    playerAt(vendor.x, vendor.y, 20, undefined, {
      userId: "user-bob",
      sessionId: "session-bob",
      username: "bob",
      characterId: "char-bob",
      name: "Bob",
    }),
  );
  const aliceOpen = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-twoa01");
  const bobOpen = openNpcSession(aliceOpen.state, "user-bob", "npc.test_vendor", 2, "req-npc06-twob01");
  const both = applyMatchLoop(bobOpen.state, 3, contentHash, [
    buyMessage("user-alice", "item.test_potion", aliceOpen.sessionId, aliceOpen.npcInstanceId, "req-npc06-twoa02"),
    buyMessage("user-bob", "item.test_potion", bobOpen.sessionId, bobOpen.npcInstanceId, "req-npc06-twob02"),
  ]);
  assert.equal(both.state.players["user-alice"].gold, 10);
  assert.equal(both.state.players["user-bob"].gold, 10);
  assert.equal(itemCount(both.state, "user-alice", "item.test_potion"), 1);
  assert.equal(itemCount(both.state, "user-bob", "item.test_potion"), 1);
});

test("purchase writes a vendor audit event", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-aud001");
  const inner = memoryCommitter();
  const audits: Array<{ reasonType: string; goldDelta: number; ok: boolean; requestId: string }> = [];
  const commit: TransactionCommitter = (request) => {
    const result = inner(request);
    audits.push({
      reasonType: result.audit.reasonType,
      goldDelta: result.audit.goldDelta,
      ok: result.audit.ok,
      requestId: result.audit.requestId,
    });
    return result;
  };
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-aud002")],
    undefined,
    undefined,
    commit,
  );
  assert.equal(actions(result)[0].ok, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].reasonType, TX_REASON_VENDOR);
  assert.equal(audits[0].ok, true);
  assert.equal(audits[0].goldDelta, -10);
  assert.equal(audits[0].requestId, "req-npc06-aud002");
  assert.equal(result.state.players["user-alice"].gold, 10);
});

test("buy after session close is invalid_session", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc06-ses001");
  const closed = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [closeMessage("user-alice", opened.sessionId, opened.npcInstanceId, "req-npc06-ses002")],
  );
  const result = applyMatchLoop(
    closed.state,
    3,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-ses003")],
  );
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "invalid_session");
  assert.equal(result.state.players["user-alice"].gold, 20);
});

test("NPC without vendor service cannot sell", () => {
  const elder = elderPos();
  const state = addPlayer(serviceZone(), playerAt(elder.x, elder.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.elder", 1, "req-npc06-eld001");
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc06-eld002")],
  );
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "invalid_service");
});
