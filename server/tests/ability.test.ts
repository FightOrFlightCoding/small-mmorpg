import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import {
  assignHotbar,
  ensureAbilityOwnership,
  interruptOnDamage,
  prepareJoinedPlayerAbilities,
  unlockAbility,
  useAbility,
  abilityDefinitionsFromContent,
} from "../src/domain/ability";
import {
  applyEffectDefinition,
  hasControlTag,
  playerAsTarget,
  resolveMagnitude,
  writeTarget,
  type EffectDefinition,
} from "../src/domain/effects";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { restoreGracePlayer } from "../src/domain/persistence";
import { initializeProgression } from "../src/domain/progression";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import { catalogFromContent } from "../src/domain/stats";
import { classTagsFromContent } from "../src/domain/class_catalog";
import { PLAYER_RESPAWN_DELAY_SEC } from "../src/domain/combat";

const catalog = catalogFromContent(content);
const CLASS_ID = "test.class.vanguard";
const MELEE = "test.ability.basic_melee";
const BOLT = "test.ability.ranged_bolt";
const HEAL = "test.ability.small_heal";
const BUFF = "test.ability.power_buff";
const DOT = "test.ability.damage_over_time";
const MANA = "test.resource.mana";

function abilityZone(): StarterZoneState {
  const state = createStarterZoneState(
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
      respawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
      pickupRange: content.player.pickupRange,
      basicAbilityId: content.player.basicAbilityId,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      abilitiesById: abilityDefinitionsFromContent(content.abilities),
      basicAbilityId: content.player.basicAbilityId,
      classTags: classTagsFromContent(content.classes),
    },
  );
  state.progressionCatalog = catalog;
  return state;
}

function caster(x: number, y: number, extras?: { unlocked?: string[]; mana?: number; health?: number }): MatchPlayer {
  const progression = initializeProgression(catalog, CLASS_ID);
  ensureAbilityOwnership(progression, extras !== undefined && extras.unlocked !== undefined ? extras.unlocked : [MELEE], MELEE);
  if (extras !== undefined && extras.unlocked !== undefined) {
    progression.unlockedAbilityIds = extras.unlocked.slice();
  }
  return {
    userId: "user-alice",
    sessionId: "session-alice",
    username: "alice",
    characterId: "char-alice",
    name: "Alice",
    classId: CLASS_ID,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: extras !== undefined && extras.health !== undefined ? extras.health : content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    progression: progression,
    resources: { [MANA]: extras !== undefined && extras.mana !== undefined ? extras.mana : 60 },
  };
}

function envelope(extra: { [key: string]: unknown }): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function loop(
  state: StarterZoneState,
  tick: number,
  messages: { opcode: number; raw: string; userId: string }[],
) {
  return applyMatchLoop(state, tick, contentHash, messages);
}

function actionCode(result: ReturnType<typeof applyMatchLoop>): string {
  const row = result.outbound.filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)[0];
  if (row === undefined) {
    return "";
  }
  return String((JSON.parse(row.body) as { code?: string }).code);
}

function slime(state: StarterZoneState) {
  return state.enemies[0];
}

function statusEffect(policy: EffectDefinition["stackPolicy"], duration = 2): EffectDefinition {
  return {
    id: "test-status",
    type: "timed_stat_modifier",
    source: "caster",
    target: "self",
    magnitude: { kind: "constant", value: 2 },
    duration: duration,
    tickInterval: 0,
    stackPolicy: policy,
    maxStacks: 3,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["buff"],
    statChannel: "attack",
  };
}

test("stat_role attack uses fallback when the pipeline reports 0", () => {
  const amount = resolveMagnitude(
    { kind: "stat_role", role: "attack" },
    { values: {}, attack: 0, maxHealth: 100, maxMana: 0 },
    4,
  );
  assert.equal(amount, 4);
});

test("resolveMagnitude ignores null scale and bonus from Goja-style objects", () => {
  const amount = resolveMagnitude(
    { kind: "stat_role", role: "attack", scale: null as unknown as number, value: null as unknown as number },
    { values: {}, attack: 4, maxHealth: 100, maxMana: 0 },
    4,
  );
  assert.equal(amount, 4);
});

test("locked ability is rejected", () => {
  let state = addPlayer(abilityZone(), caster(930, 400, { unlocked: [] }));
  const result = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: MELEE, targetId: slime(state).id, requestId: "req-locked-abil1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(result), "ability_locked");
});

test("valid melee ability deals server damage", () => {
  let state = addPlayer(abilityZone(), caster(930, 400));
  const before = slime(state).health;
  const result = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: MELEE, targetId: slime(state).id, requestId: "req-melee-ok0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(result), "ok");
  assert.ok(result.state.enemies[0].health < before);
});

test("attack opcode uses the basic melee ability when unlocked", () => {
  let state = addPlayer(abilityZone(), caster(930, 400));
  const before = slime(state).health;
  const result = loop(state, 10, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: slime(state).id, requestId: "req-attack-wrap1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(result), "ok");
  assert.ok(result.state.enemies[0].health < before);
});

test("out-of-range cast is rejected", () => {
  let state = addPlayer(abilityZone(), caster(240, 384));
  const result = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: MELEE, targetId: slime(state).id, requestId: "req-range-fail01" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(result), "out_of_range");
});

test("hostile player targeting is rejected while PvP is disabled", () => {
  let state = addPlayer(abilityZone(), caster(930, 400));
  const bob: MatchPlayer = {
    userId: "user-bob",
    sessionId: "session-bob",
    username: "bob",
    characterId: "char-bob",
    name: "Bob",
    x: 940,
    y: 400,
    maxHealth: 100,
    health: 100,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
  };
  state = addPlayer(state, bob);
  const result = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: MELEE, targetId: "user-bob", requestId: "req-pvp-disabled" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(result), "pvp_disabled");
});

test("insufficient resource is rejected", () => {
  let state = addPlayer(abilityZone(), caster(900, 400, { unlocked: [MELEE, BOLT], mana: 0 }));
  const result = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: BOLT, targetId: slime(state).id, requestId: "req-mana-fail001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(result), "insufficient_resource");
});

test("hostile ability against self is an invalid relation", () => {
  let state = addPlayer(abilityZone(), caster(930, 400));
  const result = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: MELEE, targetId: "user-alice", requestId: "req-rel-self0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(result), "invalid_relation");
});

test("individual cooldown rejects a second cast after global cooldown expires", () => {
  let state = addPlayer(abilityZone(), caster(930, 400, { unlocked: [MELEE, BOLT], mana: 60 }));
  const first = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: BOLT, targetId: slime(state).id, requestId: "req-icd-first0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(first), "ok");
  let current = first.state;
  for (let tick = 11; tick <= 16; tick++) {
    current = loop(current, tick, []).state;
  }
  const second = loop(current, 17, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: BOLT, targetId: slime(current).id, requestId: "req-icd-second001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(second), "on_cooldown");
});

test("global cooldown rejects a different ability", () => {
  let state = addPlayer(abilityZone(), caster(930, 400, { unlocked: [MELEE, BOLT], mana: 60 }));
  const first = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: MELEE, targetId: slime(state).id, requestId: "req-gcd-first0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(first), "ok");
  const second = loop(first.state, 11, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: BOLT, targetId: slime(first.state).id, requestId: "req-gcd-second001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(second), "on_global_cooldown");
});

test("duplicate request ids replay without a second hit", () => {
  let state = addPlayer(abilityZone(), caster(930, 400));
  const first = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: MELEE, targetId: slime(state).id, requestId: "req-dup-same0001" }),
      userId: "user-alice",
    },
  ]);
  const health = first.state.enemies[0].health;
  const second = loop(first.state, 20, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: MELEE, targetId: slime(first.state).id, requestId: "req-dup-same0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(second), "ok");
  assert.equal(second.state.enemies[0].health, health);
});

test("movement interrupts a cast", () => {
  let state = addPlayer(abilityZone(), caster(900, 400, { unlocked: [MELEE, BOLT], mana: 60 }));
  const start = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: BOLT, targetId: slime(state).id, requestId: "req-move-cast001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(start), "ok");
  assert.ok(start.state.players["user-alice"].activeCast !== undefined);
  const moved = loop(start.state, 11, [
    {
      opcode: ClientOpcode.INPUT,
      raw: envelope({ seq: 1, axisX: 1, axisY: 0 }),
      userId: "user-alice",
    },
  ]);
  assert.equal(moved.state.players["user-alice"].activeCast, undefined);
  const interrupts = moved.outbound
    .filter((item) => item.opcode === ServerOpcode.COMBAT_EVENT)
    .some((item) => {
      const body = JSON.parse(item.body) as { events?: { type?: string; interruptReason?: string }[] };
      const events = body.events !== undefined ? body.events : [];
      return events.some((event) => event.type === "interrupt" && event.interruptReason === "movement");
    });
  assert.equal(interrupts, true);
});

test("damage interrupts a cast", () => {
  const state = addPlayer(abilityZone(), caster(900, 400, { unlocked: [MELEE, BOLT], mana: 60 }));
  const events: { type?: string; interruptReason?: string }[] = [];
  const decision = useAbility(
    state,
    "user-alice",
    { abilityId: BOLT, targetId: slime(state).id, requestId: "req-dmg-cast0001" },
    10,
    events as never,
  );
  assert.equal(decision.ok, true);
  assert.ok(state.players["user-alice"].activeCast !== undefined);
  interruptOnDamage(state.players["user-alice"], state, 11, events as never);
  assert.equal(state.players["user-alice"].activeCast, undefined);
  assert.equal(events.some((event) => event.type === "interrupt" && event.interruptReason === "damage"), true);
});

test("cast cancellation clears the active cast", () => {
  let state = addPlayer(abilityZone(), caster(900, 400, { unlocked: [MELEE, BOLT], mana: 60 }));
  const start = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: BOLT, targetId: slime(state).id, requestId: "req-cancel-cast1" }),
      userId: "user-alice",
    },
  ]);
  const cancelled = loop(start.state, 11, [
    {
      opcode: ClientOpcode.CANCEL_CAST,
      raw: envelope({ requestId: "req-cancel-cast2" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(cancelled), "ok");
  assert.equal(cancelled.state.players["user-alice"].activeCast, undefined);
});

test("direct heal restores health after the cast completes", () => {
  let state = addPlayer(abilityZone(), caster(240, 384, { unlocked: [MELEE, HEAL], mana: 60, health: 40 }));
  const start = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: HEAL, requestId: "req-heal-cast001" }),
      userId: "user-alice",
    },
  ]);
  let current = start.state;
  for (let tick = 11; tick <= 16; tick++) {
    current = loop(current, tick, []).state;
  }
  assert.ok(current.players["user-alice"].health > 40);
});

test("periodic ground effect damages enemies in the radius", () => {
  let state = addPlayer(abilityZone(), caster(930, 400, { unlocked: [MELEE, DOT], mana: 60 }));
  const before = slime(state).health;
  const start = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: DOT, targetX: 960, targetY: 400, requestId: "req-dot-cast0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(start), "ok");
  let current = start.state;
  for (let tick = 11; tick <= 45; tick++) {
    current = loop(current, tick, []).state;
  }
  assert.ok(current.enemies[0].health < before);
});

test("stack policies replace, refresh, stack, and ignore", () => {
  const state = addPlayer(abilityZone(), caster(240, 384));
  const player = state.players["user-alice"];
  const events: never[] = [];
  const apply = (policy: EffectDefinition["stackPolicy"]) => {
    const target = playerAsTarget(player);
    applyEffectDefinition(state, statusEffect(policy, 5), "test.ability.power_buff", player, target, null, 4, 10, events);
    writeTarget(state, target);
  };
  apply("replace");
  const firstTicks = state.players["user-alice"].effects![0].remainingTicks;
  apply("replace");
  assert.equal(state.players["user-alice"].effects![0].stacks, 1);
  assert.equal(state.players["user-alice"].effects![0].remainingTicks, firstTicks);

  state.players["user-alice"].effects = [];
  apply("refresh");
  state.players["user-alice"].effects![0].remainingTicks = 2;
  apply("refresh");
  assert.equal(state.players["user-alice"].effects![0].stacks, 1);
  assert.ok(state.players["user-alice"].effects![0].remainingTicks > 2);

  state.players["user-alice"].effects = [];
  apply("stack");
  apply("stack");
  assert.equal(state.players["user-alice"].effects![0].stacks, 2);

  state.players["user-alice"].effects = [];
  apply("ignore");
  state.players["user-alice"].effects![0].remainingTicks = 1;
  apply("ignore");
  assert.equal(state.players["user-alice"].effects![0].stacks, 1);
  assert.equal(state.players["user-alice"].effects![0].remainingTicks, 1);
});

test("stun and root apply control tags", () => {
  const state = addPlayer(abilityZone(), caster(240, 384));
  const player = state.players["user-alice"];
  const events: never[] = [];
  const stun: EffectDefinition = {
    id: "stun-hit",
    type: "stun",
    source: "caster",
    target: "self",
    magnitude: { kind: "constant", value: 0 },
    duration: 1,
    tickInterval: 0,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["control"],
  };
  const target = playerAsTarget(player);
  applyEffectDefinition(state, stun, BUFF, player, target, null, 4, 10, events);
  writeTarget(state, target);
  assert.equal(hasControlTag(state.players["user-alice"].effects, "stun"), true);
});

test("timed effects expire", () => {
  const state = addPlayer(abilityZone(), caster(240, 384, { unlocked: [MELEE, BUFF], mana: 60 }));
  const start = loop(state, 10, [
    {
      opcode: ClientOpcode.USE_ABILITY,
      raw: envelope({ abilityId: BUFF, requestId: "req-buff-cast001" }),
      userId: "user-alice",
    },
  ]);
  assert.ok((start.state.players["user-alice"].effects !== undefined ? start.state.players["user-alice"].effects.length : 0) > 0);
  let current = start.state;
  for (let tick = 11; tick <= 70; tick++) {
    current = loop(current, tick, []).state;
  }
  const remaining = current.players["user-alice"].effects !== undefined ? current.players["user-alice"].effects.length : 0;
  assert.equal(remaining, 0);
});

test("skill-point unlock persists on the progression record", () => {
  const progression = initializeProgression(catalog, CLASS_ID);
  ensureAbilityOwnership(progression, [MELEE], MELEE);
  progression.unspentSkillPoints = 2;
  const definition = abilityDefinitionsFromContent(content.abilities)[BUFF];
  const first = unlockAbility(progression, definition, ["vanguard"], CLASS_ID, "req-unlock-buff1", 10);
  assert.equal(first.ok, true);
  assert.equal(first.progression.unlockedAbilityIds.indexOf(BUFF) !== -1, true);
  assert.equal(first.progression.unspentSkillPoints, 1);
  const replay = unlockAbility(first.progression, definition, ["vanguard"], CLASS_ID, "req-unlock-buff1", 11);
  assert.equal(replay.replay, true);
  assert.equal(replay.progression.unspentSkillPoints, 1);
});

test("skill-point unlock rejects overspend", () => {
  const progression = initializeProgression(catalog, CLASS_ID);
  ensureAbilityOwnership(progression, [MELEE], MELEE);
  progression.unspentSkillPoints = 0;
  const definition = abilityDefinitionsFromContent(content.abilities)[BUFF];
  const denied = unlockAbility(progression, definition, ["vanguard"], CLASS_ID, "req-unlock-overspend", 10);
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "insufficient_points");
  assert.equal(denied.progression.unlockedAbilityIds.indexOf(BUFF), -1);
});

test("hotbar assignment rejects locked abilities", () => {
  const progression = initializeProgression(catalog, CLASS_ID);
  ensureAbilityOwnership(progression, [MELEE], MELEE);
  const locked = assignHotbar(progression, 1, BUFF, "req-hotbar-lock1", 10);
  assert.equal(locked.ok, false);
  assert.equal(locked.code, "ability_locked");
  const ok = assignHotbar(progression, 1, MELEE, "req-hotbar-ok001", 10);
  assert.equal(ok.ok, true);
  assert.equal(ok.progression.hotbar![1], MELEE);
});

test("reconnect clears transient casts and keeps match-lived resources", () => {
  const parked = caster(900, 400, { unlocked: [MELEE, BOLT], mana: 21 });
  parked.activeCast = {
    abilityId: BOLT,
    casterId: parked.userId,
    targetId: "enemy.green_slime:0",
    targetX: 960,
    targetY: 400,
    startTick: 10,
    completionTick: 14,
    channelUntilTick: 0,
    phase: "casting",
    interruptReason: "",
    requestId: "req-cast-live001",
  };
  const restored = restoreGracePlayer(
    parked,
    "session-alice-2",
    "alice",
    parked.questLog,
    emptyInventory(),
    emptyEquipment(),
    4,
    0,
  );
  assert.equal(restored.activeCast, undefined);
  assert.equal(restored.resources![MANA], 21);
});

test("melee still deals damage after JSON match-state roundtrip", () => {
  const seeded = addPlayer(abilityZone(), caster(930, 400));
  const restored = JSON.parse(JSON.stringify(seeded)) as StarterZoneState;
  restored.players = restored.players;
  const before = slime(restored).health;
  const result = loop(restored, 10, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: slime(restored).id, requestId: "req-json-melee001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(result), "ok");
  assert.ok(result.state.enemies[0].health < before, "health=" + String(result.state.enemies[0].health));
});

test("melee still deals damage after catalog strip, JSON roundtrip, and rebind", () => {
  const seeded = addPlayer(abilityZone(), caster(930, 400));
  seeded.abilitiesById = undefined;
  seeded.progressionCatalog = undefined;
  seeded.classTags = undefined;
  seeded.itemsById = {};
  seeded.questsById = {};
  const restored = JSON.parse(JSON.stringify(seeded)) as StarterZoneState;
  restored.abilitiesById = abilityDefinitionsFromContent(content.abilities);
  restored.basicAbilityId = content.player.basicAbilityId;
  restored.progressionCatalog = catalogFromContent(content);
  restored.classTags = classTagsFromContent(content.classes);
  restored.itemsById = itemDefinitionsFromContent(content.items);
  const before = slime(restored).health;
  const result = loop(restored, 10, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: slime(restored).id, requestId: "req-json-rebind001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCode(result), "ok");
  assert.ok(result.state.enemies[0].health < before, "health=" + String(result.state.enemies[0].health));
});

test("join helper fills starting abilities without trusting client hotbar state", () => {
  const state = abilityZone();
  const player = caster(240, 384, { unlocked: [] });
  player.progression!.unlockedAbilityIds = [];
  player.progression!.hotbar = ["forged.by.client"];
  const changed = prepareJoinedPlayerAbilities(state, player, true);
  assert.equal(changed, true);
  assert.equal(player.progression!.unlockedAbilityIds.indexOf(MELEE) !== -1, true);
  assert.notEqual(player.progression!.hotbar![0], "forged.by.client");
});
