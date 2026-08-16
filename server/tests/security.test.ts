import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  CHARACTER_PERMISSION_WRITE,
  CHARACTER_COLLECTION,
  CHARACTER_KEY,
} from "../src/domain/character";
import { MAX_CHAT_MESSAGE_CHARS, parseChatMessageContent } from "../src/domain/chat";
import { emptyEquipment } from "../src/domain/equipment";
import { EQUIPMENT_PERMISSION_WRITE } from "../src/domain/equipment_store";
import {
  initializeInventory,
  itemDefinitionsFromContent,
  type PlayerInventory,
} from "../src/domain/inventory";
import { INVENTORY_PERMISSION_WRITE } from "../src/domain/inventory_store";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchLoot,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { QUEST_PERMISSION_WRITE } from "../src/domain/quest_store";
import { ACTION_LIMITS, MAX_MESSAGES_PER_PLAYER_PER_TICK, RATE_WINDOW_TICKS } from "../src/domain/rate_limit";
import { formatRejectedActionLog, isSafeRejectionLog } from "../src/domain/security_log";
import { MALFORMED_MESSAGE_FIXTURES } from "./fixtures/malformed_messages";

function emptyZone(): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
      attack: content.player.attack,
      attackRange: content.player.attackRange,
      attackCooldown: content.player.attackCooldown,
      pickupRange: content.player.pickupRange,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
  );
}

function playerAt(userId: string, name: string, x: number, y: number, health?: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: health !== undefined ? health : content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: initializeInventory(null, function () {
      return userId + "-sword";
    }).inventory,
    equipment: emptyEquipment(),
  };
}

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function gelLoot(id: string, x: number, y: number): MatchLoot {
  return {
    id: id,
    itemId: "item.slime_gel",
    quantity: 1,
    instanceId: id + "-inst",
    x: x,
    y: y,
    expiresAtTick: 9999,
  };
}

function systemCodes(result: ReturnType<typeof applyMatchLoop>): string[] {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.SYSTEM_MESSAGE)
    .map((item) => JSON.parse(item.body).code as string);
}

function actionCodes(result: ReturnType<typeof applyMatchLoop>): string[] {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body).code as string);
}

test("malformed-message fixtures reject without crashing the match", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 240, 384));
  const before = state.players["user-alice"].x;
  for (let i = 0; i < MALFORMED_MESSAGE_FIXTURES.length; i++) {
    const fixture = MALFORMED_MESSAGE_FIXTURES[i];
    const parsed = parseClientMessage(fixture.opcode, fixture.raw, contentHash);
    assert.equal(isProtocolError(parsed), true, fixture.name);
    if (isProtocolError(parsed)) {
      assert.equal(parsed.code.slice(0, fixture.codePrefix.length), fixture.codePrefix, fixture.name);
    }
    const result = applyMatchLoop(state, 3, contentHash, [
      { opcode: fixture.opcode, raw: fixture.raw, userId: "user-alice" },
    ]);
    assert.equal(result.terminate, false, fixture.name);
    assert.equal(result.state.players["user-alice"].x, before, fixture.name);
    assert.ok(systemCodes(result).indexOf(fixture.codePrefix) !== -1 || systemCodes(result).some((code) => code.indexOf(fixture.codePrefix) === 0), fixture.name);
    assert.equal(result.rejections[0].userId, "user-alice", fixture.name);
    assert.equal(result.rejections[0].tick, 3, fixture.name);
    assert.ok(isSafeRejectionLog(formatRejectedActionLog(result.rejections[0])), fixture.name);
  }
});

test("position spoofing and speed-hack fields never move the player", () => {
  const spawn = content.zones["zone.starter"].playerSpawn;
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const spoof = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INPUT,
      raw: envelope({ seq: 1, axisX: 1, axisY: 0, x: 12, y: 12, speed: 999, dt: 5 }),
      userId: "user-alice",
    },
  ]);
  assert.equal(spoof.state.players["user-alice"].x, spawn.x);
  assert.equal(systemCodes(spoof)[0].indexOf("stat_injection"), 0);
  const legal = applyMatchLoop(state, 1, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 1, axisX: 1, axisY: 0 }), userId: "user-alice" },
  ]);
  const boosted = applyMatchLoop(state, 1, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 1, axisX: 4, axisY: 0 }), userId: "user-alice" },
  ]);
  assert.equal(legal.state.players["user-alice"].x, boosted.state.players["user-alice"].x);
});

test("stale movement sequence is ignored", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 240, 384));
  const first = applyMatchLoop(state, 1, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 4, axisX: 1, axisY: 0 }), userId: "user-alice" },
  ]);
  const after = first.state.players["user-alice"].x;
  const stale = applyMatchLoop(first.state, 2, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 4, axisX: -1, axisY: 0 }), userId: "user-alice" },
  ]);
  assert.equal(stale.state.players["user-alice"].lastProcessedSeq, 4);
  assert.ok(stale.state.players["user-alice"].x > after);
});

test("excessive movement input is rate-limited and does not apply extra seq", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 240, 384));
  const flood: { opcode: number; raw: string; userId: string }[] = [];
  for (let seq = 1; seq <= ACTION_LIMITS.input + 8; seq++) {
    flood.push({
      opcode: ClientOpcode.INPUT,
      raw: envelope({ seq: seq, axisX: 1, axisY: 0 }),
      userId: "user-alice",
    });
  }
  const result = applyMatchLoop(state, 1, contentHash, flood);
  assert.equal(result.state.players["user-alice"].lastProcessedSeq, ACTION_LIMITS.input);
  assert.ok(systemCodes(result).indexOf("rate_limited") !== -1);
  assert.ok(result.rejections.some((row) => row.code === "rate_limited" && row.action === "input"));
});

test("honest 10 Hz input stays under the documented limit", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 240, 384));
  for (let tick = 1; tick <= RATE_WINDOW_TICKS; tick++) {
    const step = applyMatchLoop(state, tick, contentHash, [
      { opcode: ClientOpcode.INPUT, raw: envelope({ seq: tick, axisX: 1, axisY: 0 }), userId: "user-alice" },
    ]);
    assert.equal(systemCodes(step).indexOf("rate_limited"), -1);
    assert.equal(step.state.players["user-alice"].lastProcessedSeq, tick);
    state = step.state;
  }
});

test("attack spam, out-of-range, unknown target, dead player, and client damage are rejected", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const first = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "req-atk-ok-1" }),
      userId: "user-alice",
    },
  ]);
  const afterHit = first.state.enemies[0].health;
  const spam = applyMatchLoop(first.state, 2, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: first.state.enemies[0].id, requestId: "req-atk-spam-2" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(spam)[0], "on_cooldown");
  assert.equal(spam.state.enemies[0].health, afterHit);
  assert.equal(spam.rejections[0].code, "on_cooldown");

  const far = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 0, 0));
  const range = applyMatchLoop(far, 1, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: far.enemies[0].id, requestId: "req-atk-range" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(range)[0], "out_of_range");
  assert.equal(range.state.enemies[0].health, far.enemies[0].health);

  const unknown = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: "enemy.missing", requestId: "req-atk-miss" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(unknown)[0], "invalid_target");

  const dead = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 0));
  const deadHit = applyMatchLoop(dead, 1, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: dead.enemies[0].id, requestId: "req-atk-dead" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(deadHit)[0], "player_dead");
  assert.equal(deadHit.state.enemies[0].health, dead.enemies[0].health);

  const injected = parseClientMessage(
    ClientOpcode.ATTACK,
    envelope({ targetId: state.enemies[0].id, requestId: "req-atk-dmg", damage: 999 }),
    contentHash,
  );
  assert.equal(isProtocolError(injected), true);
});

test("duplicate pickup, instance injection, and unowned equip do not mutate canonical state", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  state.loot.push(gelLoot("loot-gel", 400, 400));
  const first = applyMatchLoop(state, 1, contentHash, [
    { opcode: ClientOpcode.PICKUP, raw: envelope({ lootId: "loot-gel", requestId: "req-pick-1" }), userId: "user-alice" },
  ]);
  assert.equal(actionCodes(first)[0], "ok");
  const gelAfter = first.state.players["user-alice"].inventory as PlayerInventory;
  const countAfter = gelAfter.items.filter((item) => item.itemId === "item.slime_gel").reduce((sum, item) => sum + item.quantity, 0);
  const replay = applyMatchLoop(first.state, 2, contentHash, [
    { opcode: ClientOpcode.PICKUP, raw: envelope({ lootId: "loot-gel", requestId: "req-pick-1" }), userId: "user-alice" },
  ]);
  assert.equal(actionCodes(replay)[0], "ok");
  const gelReplay = replay.state.players["user-alice"].inventory as PlayerInventory;
  const countReplay = gelReplay.items.filter((item) => item.itemId === "item.slime_gel").reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(countReplay, countAfter);

  const forged = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.PICKUP,
      raw: envelope({ lootId: "loot-gel", requestId: "req-pick-forge", instanceId: "forged" }),
      userId: "user-alice",
    },
  ]);
  assert.ok(systemCodes(forged)[0].indexOf("stat_injection") === 0);

  let contested = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  contested = addPlayer(contested, playerAt("user-bob", "Bob", 420, 400));
  const bobSword = (contested.players["user-bob"].inventory as PlayerInventory).items[0].instanceId;
  const unowned = applyMatchLoop(contested, 1, contentHash, [
    {
      opcode: ClientOpcode.EQUIP,
      raw: envelope({ instanceId: bobSword, slot: "main_hand", requestId: "req-equip-steal" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(unowned)[0], "unowned");
  assert.equal(unowned.state.players["user-alice"].equipment?.slots.main_hand, "");
});

test("quest skip, client progress, and duplicate rewards do not grant twice", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const skip = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.QUEST_TURN_IN,
      raw: envelope({ questId: "quest.slime_problem", npcId: "npc.elder", requestId: "req-skip-1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(skip)[0], "invalid_id");
  assert.equal(skip.state.players["user-alice"].gold, 0);

  const injected = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({
        questId: "quest.slime_problem",
        requestId: "req-accept-inject",
        status: "completed",
      }),
      userId: "user-alice",
    },
  ]);
  assert.ok(systemCodes(injected)[0].indexOf("unknown_field") === 0);
  assert.equal(injected.state.players["user-alice"].questLog.quests["quest.slime_problem"], undefined);

  const accept = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(accept)[0], "accepted");
  const replay = applyMatchLoop(accept.state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(replay)[0], "accepted");
});

test("repeated resync abuse is rate-limited", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 240, 384));
  const messages: { opcode: number; raw: string; userId: string }[] = [];
  for (let i = 0; i < ACTION_LIMITS.resync + 3; i++) {
    messages.push({
      opcode: ClientOpcode.RESYNC_REQUEST,
      raw: envelope(),
      userId: "user-alice",
    });
  }
  const result = applyMatchLoop(state, 4, contentHash, messages);
  const fullStates = result.outbound.filter((item) => item.opcode === ServerOpcode.FULL_STATE);
  assert.equal(fullStates.length, ACTION_LIMITS.resync);
  assert.ok(systemCodes(result).indexOf("rate_limited") !== -1);
  assert.ok(result.rejections.some((row) => row.action === "resync" && row.code === "rate_limited"));
});

test("per-tick message cap stops mixed opcode floods", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 240, 384));
  const flood: { opcode: number; raw: string; userId: string }[] = [];
  for (let i = 0; i < MAX_MESSAGES_PER_PLAYER_PER_TICK + 5; i++) {
    flood.push({ opcode: 77, raw: envelope(), userId: "user-alice" });
  }
  const result = applyMatchLoop(state, 1, contentHash, flood);
  const unknown = result.outbound.filter((item) => {
    return item.opcode === ServerOpcode.SYSTEM_MESSAGE && JSON.parse(item.body).code === "unknown_opcode";
  });
  assert.equal(unknown.length, MAX_MESSAGES_PER_PLAYER_PER_TICK);
  assert.ok(systemCodes(result).indexOf("rate_limited") !== -1);
});

test("oversized and markup chat are handled without executing payload", () => {
  assert.throws(
    () => parseChatMessageContent(JSON.stringify({ message: "a".repeat(MAX_CHAT_MESSAGE_CHARS + 1) })),
    /message_too_long/,
  );
  assert.equal(parseChatMessageContent(JSON.stringify({ message: "[b]hi[/b]" })), "[b]hi[/b]");
});

test("canonical storage writes remain server-only", () => {
  assert.equal(CHARACTER_PERMISSION_WRITE, 0);
  assert.equal(INVENTORY_PERMISSION_WRITE, 0);
  assert.equal(EQUIPMENT_PERMISSION_WRITE, 0);
  assert.equal(QUEST_PERMISSION_WRITE, 0);
  assert.equal(CHARACTER_COLLECTION, "player");
  assert.equal(CHARACTER_KEY, "character");
});

test("rejection logs include user, action, reason, and tick without secrets", () => {
  const line = formatRejectedActionLog({
    userId: "user-alice",
    action: "attack",
    code: "out_of_range",
    tick: 42,
  });
  assert.equal(line, "match_action rejected user_id=user-alice action=attack reason=out_of_range tick=42");
  assert.equal(isSafeRejectionLog(line), true);
  assert.equal(line.indexOf("token"), -1);
  assert.equal(line.indexOf("password"), -1);
  assert.equal(line.indexOf("eyJ"), -1);
});
