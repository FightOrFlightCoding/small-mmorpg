import assert from "node:assert/strict";
import test from "node:test";
import { contentHash } from "../src/generated/content";
import {
  ClientOpcode,
  MAX_MATCH_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  ServerOpcode,
  isProtocolError,
  parseClientMessage,
} from "../src/domain/protocol";

const HASH = contentHash;

function parse(opcode: number, body: string) {
  return parseClientMessage(opcode, body, HASH);
}

test("client and server opcodes use the allocated values", () => {
  assert.equal(PROTOCOL_VERSION, 1);
  assert.equal(ClientOpcode.INPUT, 1);
  assert.equal(ClientOpcode.INTERACT, 2);
  assert.equal(ClientOpcode.ATTACK, 3);
  assert.equal(ClientOpcode.PICKUP, 4);
  assert.equal(ClientOpcode.EQUIP, 5);
  assert.equal(ClientOpcode.QUEST_ACCEPT, 6);
  assert.equal(ClientOpcode.QUEST_TURN_IN, 7);
  assert.equal(ClientOpcode.RESYNC_REQUEST, 8);
  assert.equal(ClientOpcode.ALLOCATE_ATTRIBUTES, 9);
  assert.equal(ClientOpcode.DESTROY_ITEM, 10);
  assert.equal(ClientOpcode.SPLIT_STACK, 11);
  assert.equal(ClientOpcode.MOVE_ITEM, 12);
  assert.equal(ClientOpcode.USE_ABILITY, 13);
  assert.equal(ClientOpcode.CANCEL_CAST, 14);
  assert.equal(ClientOpcode.ASSIGN_HOTBAR, 15);
  assert.equal(ClientOpcode.UNLOCK_ABILITY, 16);
  assert.equal(ClientOpcode.SET_TARGET, 17);
  assert.equal(ClientOpcode.RELEASE_RESPAWN, 18);
  assert.equal(ClientOpcode.VENDOR_BUY, 19);
  assert.equal(ClientOpcode.VENDOR_SELL, 20);
  assert.equal(ClientOpcode.INN_REST, 21);
  assert.equal(ClientOpcode.CAVE_ENTER, 22);
  assert.equal(ClientOpcode.CAVE_EXIT, 23);
  assert.equal(ServerOpcode.FULL_STATE, 101);
  assert.equal(ServerOpcode.SNAPSHOT, 102);
  assert.equal(ServerOpcode.ACTION_RESULT, 103);
  assert.equal(ServerOpcode.COMBAT_EVENT, 104);
  assert.equal(ServerOpcode.INVENTORY_STATE, 105);
  assert.equal(ServerOpcode.QUEST_STATE, 106);
  assert.equal(ServerOpcode.INTERACTION_RESULT, 107);
  assert.equal(ServerOpcode.SYSTEM_MESSAGE, 108);
  assert.equal(ServerOpcode.EQUIPMENT_STATE, 109);
  assert.equal(ServerOpcode.WALLET_STATE, 110);
  assert.equal(ServerOpcode.PROGRESSION_STATE, 111);
  assert.equal(ServerOpcode.ABILITY_STATE, 112);
  assert.equal(ServerOpcode.PARTY_STATE, 113);
  assert.equal(ServerOpcode.PARTY_EVENT, 114);
});

test("valid movement input parses direction and sequence only", () => {
  const parsed = parse(
    ClientOpcode.INPUT,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, seq: 42, axisX: 1, axisY: 0 }),
  );
  assert.equal(isProtocolError(parsed), false);
  if (!isProtocolError(parsed)) {
    assert.equal(parsed.seq, 42);
    assert.equal(parsed.axisX, 1);
    assert.equal(parsed.axisY, 0);
  }
});

test("fabricated position on INPUT is rejected", () => {
  const parsed = parse(
    ClientOpcode.INPUT,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, seq: 1, axisX: 1, axisY: 0, x: 999, y: 999 }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "stat_injection:x");
  }
});

test("valid resync request parses", () => {
  const parsed = parse(ClientOpcode.RESYNC_REQUEST, JSON.stringify({ protocolVersion: PROTOCOL_VERSION }));
  assert.equal(isProtocolError(parsed), false);
  if (!isProtocolError(parsed)) {
    assert.equal(parsed.opcode, ClientOpcode.RESYNC_REQUEST);
    assert.equal(parsed.protocolVersion, PROTOCOL_VERSION);
  }
});

test("malformed JSON is rejected", () => {
  const parsed = parse(ClientOpcode.RESYNC_REQUEST, "{");
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "malformed_json");
  }
});

test("unknown opcode is rejected", () => {
  const parsed = parse(99, JSON.stringify({ protocolVersion: PROTOCOL_VERSION }));
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "unknown_opcode");
  }
});

test("unknown fields on strict intentions are rejected", () => {
  const parsed = parse(
    ClientOpcode.RESYNC_REQUEST,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, extra: true }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "unknown_field:extra");
  }
});

test("protocol version mismatch is rejected", () => {
  const parsed = parse(ClientOpcode.RESYNC_REQUEST, JSON.stringify({ protocolVersion: 99 }));
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "protocol_mismatch");
  }
});

test("content hash mismatch is rejected", () => {
  const parsed = parse(
    ClientOpcode.RESYNC_REQUEST,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "content_mismatch");
  }
});

test("reward and interact requests require a unique requestId", () => {
  const missingPickup = parse(
    ClientOpcode.PICKUP,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, lootId: "loot.1" }),
  );
  assert.equal(isProtocolError(missingPickup), true);
  if (isProtocolError(missingPickup)) {
    assert.equal(missingPickup.code, "invalid_request_id");
  }
  const missingInteract = parse(
    ClientOpcode.INTERACT,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, targetId: "npc.elder" }),
  );
  assert.equal(isProtocolError(missingInteract), true);
  if (isProtocolError(missingInteract)) {
    assert.equal(missingInteract.code, "invalid_request_id");
  }
  const valid = parse(
    ClientOpcode.QUEST_ACCEPT,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      requestId: "req-abc-123",
    }),
  );
  assert.equal(isProtocolError(valid), false);
  const missingAttack = parse(
    ClientOpcode.ATTACK,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, targetId: "enemy.green_slime:0" }),
  );
  assert.equal(isProtocolError(missingAttack), true);
  if (isProtocolError(missingAttack)) {
    assert.equal(missingAttack.code, "invalid_request_id");
  }
  const missingEquip = parse(
    ClientOpcode.EQUIP,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, instanceId: "inst-1", slot: "main_hand" }),
  );
  assert.equal(isProtocolError(missingEquip), true);
  if (isProtocolError(missingEquip)) {
    assert.equal(missingEquip.code, "invalid_request_id");
  }
});

test("client-forged party membership is rejected", () => {
  const parsed = parse(
    ClientOpcode.ATTACK,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      targetId: "enemy.1",
      requestId: "req-party-atk1",
      members: ["user-alice", "user-bob"],
    }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "stat_injection:members");
  }
  const credit = parse(
    ClientOpcode.ATTACK,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      targetId: "enemy.1",
      requestId: "req-party-atk2",
      creditUserIds: ["user-bob"],
    }),
  );
  assert.equal(isProtocolError(credit), true);
  if (isProtocolError(credit)) {
    assert.equal(credit.code, "stat_injection:creditUserIds");
  }
});

test("stat injection keys are rejected", () => {
  const parsed = parse(
    ClientOpcode.ATTACK,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, targetId: "enemy.1", damage: 999 }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "stat_injection:damage");
  }
  const instance = parse(
    ClientOpcode.PICKUP,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      lootId: "loot.1",
      requestId: "req-pickup-id1",
      instanceId: "client-id",
    }),
  );
  assert.equal(isProtocolError(instance), true);
  if (isProtocolError(instance)) {
    assert.equal(instance.code, "stat_injection:instanceId");
  }
  const bonus = parse(
    ClientOpcode.EQUIP,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      instanceId: "inst-1",
      slot: "main_hand",
      requestId: "req-equip-bonus1",
      attackBonus: 99,
    }),
  );
  assert.equal(isProtocolError(bonus), true);
  if (isProtocolError(bonus)) {
    assert.equal(bonus.code, "stat_injection:attackBonus");
  }
  const attack = parse(
    ClientOpcode.EQUIP,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      instanceId: "inst-1",
      slot: "main_hand",
      requestId: "req-equip-atk1",
      attack: 99,
    }),
  );
  assert.equal(isProtocolError(attack), true);
  if (isProtocolError(attack)) {
    assert.equal(attack.code, "stat_injection:attack");
  }
});

test("equip intention accepts instance id and slot", () => {
  const parsed = parse(
    ClientOpcode.EQUIP,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      instanceId: "inst-sword-1",
      slot: "main_hand",
      requestId: "req-equip-ok1",
    }),
  );
  assert.equal(isProtocolError(parsed), false);
  if (!isProtocolError(parsed)) {
    assert.equal(parsed.fields.instanceId, "inst-sword-1");
    assert.equal(parsed.fields.slot, "main_hand");
    assert.equal(parsed.requestId, "req-equip-ok1");
  }
  const unequip = parse(
    ClientOpcode.EQUIP,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      slot: "main_hand",
      requestId: "req-unequip-ok1",
    }),
  );
  assert.equal(isProtocolError(unequip), false);
  if (!isProtocolError(unequip)) {
    assert.equal(unequip.fields.instanceId, undefined);
    assert.equal(unequip.fields.slot, "main_hand");
  }
});

test("invalid target ids are rejected", () => {
  const parsed = parse(
    ClientOpcode.INTERACT,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, targetId: 12, requestId: "req-interact-1" }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "invalid_id");
  }
});

test("quest completion injection is rejected", () => {
  const completed = parse(
    ClientOpcode.QUEST_ACCEPT,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      requestId: "req-complete-1",
      status: "completed",
    }),
  );
  assert.equal(isProtocolError(completed), true);
  if (isProtocolError(completed)) {
    assert.equal(completed.code, "unknown_field:status");
  }
  const flag = parse(
    ClientOpcode.QUEST_ACCEPT,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      requestId: "req-complete-2",
      questComplete: true,
    }),
  );
  assert.equal(isProtocolError(flag), true);
  if (isProtocolError(flag)) {
    assert.equal(flag.code, "stat_injection:questComplete");
  }
  const gold = parse(
    ClientOpcode.QUEST_TURN_IN,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      npcId: "npc.elder",
      requestId: "req-turnin-gold1",
      gold: 25,
    }),
  );
  assert.equal(isProtocolError(gold), true);
  if (isProtocolError(gold)) {
    assert.equal(gold.code, "stat_injection:gold");
  }
});

test("quest turn-in intention accepts quest id and npc id", () => {
  const parsed = parse(
    ClientOpcode.QUEST_TURN_IN,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      npcId: "npc.elder",
      requestId: "req-turnin-ok1",
    }),
  );
  assert.equal(isProtocolError(parsed), false);
  if (!isProtocolError(parsed)) {
    assert.equal(parsed.fields.questId, "quest.slime_problem");
    assert.equal(parsed.fields.npcId, "npc.elder");
    assert.equal(parsed.requestId, "req-turnin-ok1");
  }
});

test("inventory mutation opcodes parse instance ids and reject client balances", () => {
  const destroy = parse(
    ClientOpcode.DESTROY_ITEM,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, instanceId: "cloth-a", requestId: "req-destroy-ok1" }),
  );
  assert.equal(isProtocolError(destroy), false);
  if (!isProtocolError(destroy)) {
    assert.equal(destroy.fields.instanceId, "cloth-a");
    assert.equal(destroy.requestId, "req-destroy-ok1");
  }
  const split = parse(
    ClientOpcode.SPLIT_STACK,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      instanceId: "cloth-a",
      quantity: 2,
      requestId: "req-split-ok1xx",
    }),
  );
  assert.equal(isProtocolError(split), false);
  if (!isProtocolError(split)) {
    assert.equal(split.fields.instanceId, "cloth-a");
    assert.equal(split.quantity, 2);
  }
  const move = parse(
    ClientOpcode.MOVE_ITEM,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      instanceId: "cloth-a",
      toSlotIndex: 4,
      requestId: "req-move-ok1xxx",
    }),
  );
  assert.equal(isProtocolError(move), false);
  if (!isProtocolError(move)) {
    assert.equal(move.toSlotIndex, 4);
  }
  const injected = parse(
    ClientOpcode.DESTROY_ITEM,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      instanceId: "cloth-a",
      requestId: "req-destroy-bal1",
      resultingBalance: 99,
    }),
  );
  assert.equal(isProtocolError(injected), true);
  if (isProtocolError(injected)) {
    assert.equal(injected.code, "stat_injection:resultingBalance");
  }
  const gold = parse(
    ClientOpcode.MOVE_ITEM,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      instanceId: "cloth-a",
      toSlotIndex: 1,
      requestId: "req-move-gold1xx",
      resultingGold: 40,
    }),
  );
  assert.equal(isProtocolError(gold), true);
  if (isProtocolError(gold)) {
    assert.equal(gold.code, "stat_injection:resultingGold");
  }
});

test("ability opcodes parse intentions and reject client outcomes", () => {
  const use = parse(
    ClientOpcode.USE_ABILITY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      abilityId: "test.ability.basic_melee",
      targetId: "enemy.green_slime:0",
      requestId: "req-ability-ok01",
    }),
  );
  assert.equal(isProtocolError(use), false);
  if (!isProtocolError(use)) {
    assert.equal(use.fields.abilityId, "test.ability.basic_melee");
    assert.equal(use.fields.targetId, "enemy.green_slime:0");
  }
  const ground = parse(
    ClientOpcode.USE_ABILITY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      abilityId: "test.ability.damage_over_time",
      targetX: 960,
      targetY: 400,
      requestId: "req-ability-ok02",
    }),
  );
  assert.equal(isProtocolError(ground), false);
  if (!isProtocolError(ground)) {
    assert.equal(ground.targetX, 960);
    assert.equal(ground.targetY, 400);
  }
  const injected = parse(
    ClientOpcode.USE_ABILITY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      abilityId: "test.ability.basic_melee",
      targetId: "enemy.green_slime:0",
      requestId: "req-ability-bad1",
      damage: 99,
    }),
  );
  assert.equal(isProtocolError(injected), true);
  if (isProtocolError(injected)) {
    assert.equal(injected.code, "stat_injection:damage");
  }
  const duration = parse(
    ClientOpcode.USE_ABILITY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      abilityId: "test.ability.small_heal",
      requestId: "req-ability-bad2",
      castTime: 0.1,
    }),
  );
  assert.equal(isProtocolError(duration), true);
  if (isProtocolError(duration)) {
    assert.equal(duration.code, "stat_injection:castTime");
  }
  const hotbar = parse(
    ClientOpcode.ASSIGN_HOTBAR,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      slotIndex: 1,
      abilityId: "test.ability.small_heal",
      requestId: "req-hotbar-ok01",
    }),
  );
  assert.equal(isProtocolError(hotbar), false);
  if (!isProtocolError(hotbar)) {
    assert.equal(hotbar.slotIndex, 1);
    assert.equal(hotbar.fields.abilityId, "test.ability.small_heal");
  }
  const unlock = parse(
    ClientOpcode.UNLOCK_ABILITY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      abilityId: "test.ability.power_buff",
      requestId: "req-unlock-ok01",
    }),
  );
  assert.equal(isProtocolError(unlock), false);
});

test("oversized payloads are rejected", () => {
  const huge = '{"protocolVersion":1,"pad":"' + "x".repeat(MAX_MATCH_PAYLOAD_BYTES) + '"}';
  const parsed = parse(ClientOpcode.RESYNC_REQUEST, huge);
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "payload_too_large");
  }
});

test("vendor and inn opcodes parse without client prices", () => {
  const buy = parse(
    ClientOpcode.VENDOR_BUY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      npcId: "npc.test_vendor",
      itemId: "item.test_potion",
      requestId: "req-vendor-buy01",
    }),
  );
  assert.equal(isProtocolError(buy), false);
  const sell = parse(
    ClientOpcode.VENDOR_SELL,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      npcId: "npc.test_vendor",
      instanceId: "inst-1",
      requestId: "req-vendor-sell1",
    }),
  );
  assert.equal(isProtocolError(sell), false);
  const rest = parse(
    ClientOpcode.INN_REST,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      npcId: "npc.test_innkeeper",
      requestId: "req-inn-rest0001",
    }),
  );
  assert.equal(isProtocolError(rest), false);
  const cave = parse(
    ClientOpcode.CAVE_ENTER,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      npcId: "npc.test_cave_portal",
      requestId: "req-cave-enter01",
    }),
  );
  assert.equal(isProtocolError(cave), false);
  const caveExit = parse(
    ClientOpcode.CAVE_EXIT,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      npcId: "npc.test_cave_exit",
      requestId: "req-cave-exit0001",
    }),
  );
  assert.equal(isProtocolError(caveExit), false);
});

test("vendor price spoofing is rejected", () => {
  const priced = parse(
    ClientOpcode.VENDOR_BUY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      npcId: "npc.test_vendor",
      itemId: "item.test_potion",
      price: 1,
      requestId: "req-vendor-price1",
    }),
  );
  assert.equal(isProtocolError(priced), true);
  if (isProtocolError(priced)) {
    assert.equal(priced.code, "unknown_field:price");
  }
  const gold = parse(
    ClientOpcode.VENDOR_SELL,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      npcId: "npc.test_vendor",
      instanceId: "inst-1",
      gold: 999,
      requestId: "req-vendor-gold01",
    }),
  );
  assert.equal(isProtocolError(gold), true);
  if (isProtocolError(gold)) {
    assert.equal(gold.code, "stat_injection:gold");
  }
});
