import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyCombat } from "../src/domain/combat_pipeline";
import { type CombatEvent } from "../src/domain/combat";
import {
  applyEffectDefinition,
  consumeShieldAbsorb,
  hasControlTag,
  isShieldEffect,
  playerAsTarget,
  slowMagnitudeFrom,
  suppressShieldTerminal,
  type EffectDefinition,
} from "../src/domain/effects";
import {
  addPlayer,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { emptyInventory } from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import { PLAYER_RESPAWN_DELAY_SEC } from "../src/domain/combat";
import { applyTaunt, DEFAULT_AI_PROFILE, selectThreatTarget, tauntDamageTakenMultiplier } from "../src/domain/threat";
import { formulaHeal } from "../src/domain/canonical_stats";
import { catalogFromContent, resourceIdForRole } from "../src/domain/stats";
import { entitiesInCone, entitiesOnLine, livingEntities } from "../src/domain/targeting";
import { resolveVault } from "../src/domain/movement";
import { dueDelayedGround, scheduleDelayedGround } from "../src/domain/canonical_combat";
import { ClientOpcode, PROTOCOL_VERSION, isProtocolError, parseClientMessage } from "../src/domain/protocol";

function emptyZone(): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    {},
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
      attack: content.player.attack,
      attackRange: content.player.attackRange,
      attackCooldown: content.player.attackCooldown,
      respawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
    },
    questDefinitionsFromContent(content.quests),
  );
}

function playerAt(userId: string, x: number, y: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: "char-" + userId,
    name: userId,
    x: x,
    y: y,
    maxHealth: 200,
    health: 200,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    gold: 0,
    effects: [],
  };
}

function shieldDef(): EffectDefinition {
  return {
    id: "shield.generic",
    type: "shield_absorb",
    source: "caster",
    target: "self",
    magnitude: { kind: "constant", value: 30 },
    duration: 6,
    tickInterval: 0,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["shield"],
    statChannel: "absorb",
  };
}

test("shields consume absorb, break once, and replace without expiry reward", () => {
  let state = emptyZone();
  state = addPlayer(state, playerAt("user-a", 100, 100));
  const player = state.players["user-a"];
  const events: CombatEvent[] = [];
  const target = playerAsTarget(player);
  applyEffectDefinition(state, shieldDef(), "ability.test.shield", player, target, null, 0, 1, events);
  player.effects = target.effects;
  assert.equal(isShieldEffect(player.effects[0]), true);
  assert.equal(player.effects[0].remainingAbsorb, 30);
  const broken = consumeShieldAbsorb(player.effects, 40, target, events);
  assert.equal(broken, 30);
  const breaks = events.filter(function (event) {
    return event.message === "shield_broken";
  });
  assert.equal(breaks.length, 1);
  const refreshEvents: CombatEvent[] = [];
  applyEffectDefinition(state, shieldDef(), "ability.test.shield", player, playerAsTarget(player), null, 0, 2, refreshEvents);
  const existing = player.effects[0];
  if (existing !== undefined) {
    suppressShieldTerminal(existing);
  }
  const expiry = refreshEvents.filter(function (event) {
    return event.message === "shield_expired";
  });
  assert.equal(expiry.length, 0);
});

test("max-HP percent shields and SPI scaling are generic", () => {
  const percent: EffectDefinition = shieldDef();
  percent.magnitude = { kind: "percent_max_health", scale: 0.1 };
  percent.id = "shield.percent";
  let state = emptyZone();
  state = addPlayer(state, playerAt("user-a", 100, 100));
  const player = state.players["user-a"];
  player.maxHealth = 200;
  player.health = 200;
  const events: CombatEvent[] = [];
  const target = playerAsTarget(player);
  applyEffectDefinition(
    state,
    percent,
    "ability.test.benediction",
    player,
    target,
    { values: { "stat.spirit": 0 }, attack: 0, maxHealth: 200, maxMana: 0 },
    0,
    1,
    events,
  );
  assert.equal(target.effects[0].remainingAbsorb, 20);
});

test("taunt overrides threat then returns to the table", () => {
  let state = emptyZone();
  state = addPlayer(state, playerAt("tank", 10, 10));
  state = addPlayer(state, playerAt("dps", 12, 10));
  const enemy = {
    id: "enemy-1",
    enemyId: "enemy.test",
    spawnX: 20,
    spawnY: 10,
    x: 20,
    y: 10,
    maxHealth: 50,
    health: 50,
    aiState: "chasing" as const,
    aggroTarget: "dps",
    lastAttackTick: 0,
    deadUntilTick: 0,
    damage: 4,
    moveSpeed: 20,
    aggroRadius: 80,
    attackRange: 16,
    attackCooldownSec: 1,
    leashRadius: 200,
    respawnDelaySec: 5,
    xpReward: 1,
    deathCount: 0,
    threatByPlayerId: { dps: 40, tank: 5 },
  };
  state.enemies = [enemy];
  applyTaunt(enemy, "tank", 10, 2, 10, 0.15);
  assert.equal(selectThreatTarget(state, enemy, DEFAULT_AI_PROFILE, 12), "tank");
  assert.equal(selectThreatTarget(state, enemy, DEFAULT_AI_PROFILE, 40), "dps");
});

test("line cone and radius targeting are geometric", () => {
  let state = emptyZone();
  state = addPlayer(state, playerAt("caster", 0, 0));
  const enemyA = {
    id: "e-a",
    enemyId: "e-a",
    spawnX: 20,
    spawnY: 0,
    x: 20,
    y: 0,
    maxHealth: 10,
    health: 10,
    aiState: "idle" as const,
    aggroTarget: "",
    lastAttackTick: 0,
    deadUntilTick: 0,
    damage: 1,
    moveSpeed: 1,
    aggroRadius: 10,
    attackRange: 1,
    attackCooldownSec: 1,
    leashRadius: 10,
    respawnDelaySec: 1,
    xpReward: 0,
    deathCount: 0,
  };
  const enemyB = {
    ...enemyA,
    id: "e-b",
    enemyId: "e-b",
    x: 0,
    y: 20,
  };
  state.enemies = [enemyA, enemyB];
  const living = livingEntities(state);
  const line = entitiesOnLine(living, 0, 0, 1, 0, 40, 4);
  const ids = line.map(function (entry) {
    return entry.id;
  });
  assert.ok(ids.indexOf("e-a") >= 0);
  assert.equal(ids.indexOf("e-b") < 0, true);
  const cone = entitiesInCone(living, 0, 0, 0, 1, 40, Math.PI / 6);
  const coneIds = cone.map(function (entry) {
    return entry.id;
  });
  assert.ok(coneIds.indexOf("e-b") >= 0);
});

test("vault stops at the last valid point and ignores client destinations", () => {
  const start = resolveVault(10, 10, 1, 0, 80, 4, [], { x: 0, y: 0, width: 200, height: 200 });
  assert.ok(start.x > 10);
  const blocked = resolveVault(
    10,
    10,
    1,
    0,
    80,
    4,
    [{ x: 30, y: 0, width: 10, height: 40 }],
    { x: 0, y: 0, width: 200, height: 200 },
  );
  assert.ok(blocked.x < 30);
  assert.ok(blocked.x >= 10);
});

test("delayed ground resolves only at the scheduled tick", () => {
  const pending = scheduleDelayedGround([], {
    id: "nova-1",
    sourceId: "mage",
    sourceKind: "player",
    abilityId: "ability.test.nova",
    x: 40,
    y: 40,
    radius: 16,
    resolveTick: 25,
    effectId: "nova",
  });
  assert.equal(dueDelayedGround(pending, 24).due.length, 0);
  assert.equal(dueDelayedGround(pending, 25).due.length, 1);
});

test("clients cannot submit crit rolls", () => {
  const parsed = parseClientMessage(
    ClientOpcode.ATTACK,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, targetId: "enemy-1", requestId: "req-crit-01", crit: true }),
    contentHash,
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "stat_injection:crit");
  }
  const roll = parseClientMessage(
    ClientOpcode.USE_ABILITY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      abilityId: "ability.test",
      requestId: "req-crit-02",
      critRoll: 0.1,
    }),
    contentHash,
  );
  assert.equal(isProtocolError(roll), true);
  if (isProtocolError(roll)) {
    assert.equal(roll.code, "stat_injection:critRoll");
  }
});

test("pipeline damage consumes remaining shield absorb", () => {
  let state = emptyZone();
  state = addPlayer(state, playerAt("user-a", 100, 100));
  const player = state.players["user-a"];
  const events: CombatEvent[] = [];
  const target = playerAsTarget(player);
  applyEffectDefinition(state, shieldDef(), "ability.test.shield", player, target, null, 0, 1, events);
  player.effects = target.effects;
  const enemy = {
    id: "slime",
    enemyId: "slime",
    spawnX: 110,
    spawnY: 100,
    x: 110,
    y: 100,
    maxHealth: 20,
    health: 20,
    aiState: "attacking" as const,
    aggroTarget: "user-a",
    lastAttackTick: 0,
    deadUntilTick: 0,
    damage: 10,
    moveSpeed: 10,
    aggroRadius: 40,
    attackRange: 16,
    attackCooldownSec: 1,
    leashRadius: 80,
    respawnDelaySec: 3,
    xpReward: 0,
    deathCount: 0,
  };
  state.enemies = [enemy];
  applyCombat(
    state,
    {
      action: "damage",
      sourceId: "slime",
      sourceKind: "enemy",
      targetId: "user-a",
      targetKind: "player",
      formula: { base: 10 },
      tick: 3,
    },
    events,
  );
  assert.ok((player.effects[0].remainingAbsorb !== undefined ? player.effects[0].remainingAbsorb : 0) < 30);
});

function statusDef(type: EffectDefinition["type"], duration: number, magnitude: number): EffectDefinition {
  return {
    id: "status." + type,
    type: type,
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: magnitude },
    duration: duration,
    tickInterval: 0,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: [type],
  };
}

test("stun and root are control tags and slow reduces movement magnitude", () => {
  let state = emptyZone();
  state = addPlayer(state, playerAt("user-a", 40, 40));
  const player = state.players["user-a"];
  const events: CombatEvent[] = [];
  const target = playerAsTarget(player);
  applyEffectDefinition(state, statusDef("stun", 2, 0), "ability.test.stun", player, target, null, 0, 1, events);
  applyEffectDefinition(state, statusDef("root", 2, 0), "ability.test.root", player, target, null, 0, 1, events);
  applyEffectDefinition(state, statusDef("slow", 2, -30), "ability.test.slow", player, target, null, 0, 1, events);
  player.effects = target.effects;
  assert.equal(hasControlTag(player.effects, "stun"), true);
  assert.equal(hasControlTag(player.effects, "root"), true);
  assert.equal(slowMagnitudeFrom(player.effects), -30);
});

test("interrupt stops an active cast", () => {
  let state = emptyZone();
  state = addPlayer(state, playerAt("caster", 8, 8));
  const player = state.players["caster"];
  player.activeCast = {
    abilityId: "ability.test.cast",
    casterId: "caster",
    targetId: "enemy-1",
    targetX: 0,
    targetY: 0,
    startTick: 1,
    completionTick: 20,
    channelUntilTick: 0,
    phase: "casting",
    interruptReason: "",
    requestId: "cast-req-01",
  };
  const events: CombatEvent[] = [];
  applyEffectDefinition(
    state,
    statusDef("interrupt", 0, 0),
    "ability.test.kick",
    player,
    playerAsTarget(player),
    null,
    0,
    5,
    events,
  );
  assert.equal(player.activeCast, undefined);
  assert.equal(
    events.filter(function (event) {
      return event.type === "interrupt";
    }).length,
    1,
  );
});

test("SPI scales shield absorb and higher rank replaces the same node", () => {
  let state = emptyZone();
  state = addPlayer(state, playerAt("user-a", 50, 50));
  const player = state.players["user-a"];
  const events: CombatEvent[] = [];
  const target = playerAsTarget(player);
  const scaled = shieldDef();
  scaled.magnitude = { kind: "constant", value: 20 };
  applyEffectDefinition(
    state,
    scaled,
    "ability.test.charm",
    player,
    target,
    { values: { "stat.spirit": 50 }, attack: 0, maxHealth: 200, maxMana: 0 },
    0,
    1,
    events,
  );
  assert.equal(target.effects[0].remainingAbsorb, Math.floor(formulaHeal(20, 50)));
  const lowBleed: EffectDefinition = {
    id: "bleed.r1",
    type: "periodic_damage",
    source: "caster",
    target: "primary",
    magnitude: { kind: "constant", value: 4 },
    duration: 6,
    tickInterval: 1.5,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    removalReason: "expired",
    tags: ["bleed"],
    nodeId: "node.bleed",
    rank: 1,
  };
  const highBleed = Object.assign({}, lowBleed, {
    id: "bleed.r2",
    magnitude: { kind: "constant", value: 8 },
    rank: 2,
  });
  applyEffectDefinition(state, lowBleed, "ability.test.bleed", player, target, null, 0, 2, events);
  applyEffectDefinition(state, highBleed, "ability.test.bleed", player, target, null, 0, 3, events);
  const bleeds = target.effects.filter(function (effect) {
    return effect.nodeId === "node.bleed";
  });
  assert.equal(bleeds.length, 1);
  assert.equal(bleeds[0].rank, 2);
  assert.equal(bleeds[0].magnitude, 8);
});

test("taunt source takes reduced damage from that enemy", () => {
  let state = emptyZone();
  state = addPlayer(state, playerAt("tank", 10, 10));
  state = addPlayer(state, playerAt("dps", 12, 10));
  const enemy = {
    id: "enemy-1",
    enemyId: "enemy.test",
    spawnX: 20,
    spawnY: 10,
    x: 20,
    y: 10,
    maxHealth: 50,
    health: 50,
    aiState: "chasing" as const,
    aggroTarget: "dps",
    lastAttackTick: 0,
    deadUntilTick: 0,
    damage: 10,
    moveSpeed: 20,
    aggroRadius: 80,
    attackRange: 16,
    attackCooldownSec: 1,
    leashRadius: 200,
    respawnDelaySec: 5,
    xpReward: 1,
    deathCount: 0,
    threatByPlayerId: { dps: 40, tank: 5 },
  };
  state.enemies = [enemy];
  applyTaunt(enemy, "tank", 1, 4, 10, 0.2);
  assert.equal(tauntDamageTakenMultiplier(enemy, "tank"), 0.8);
  assert.equal(tauntDamageTakenMultiplier(enemy, "dps"), 1);
  const events: CombatEvent[] = [];
  applyCombat(
    state,
    {
      action: "damage",
      sourceId: "enemy-1",
      sourceKind: "enemy",
      targetId: "tank",
      targetKind: "player",
      formula: { base: 10 },
      tick: 2,
    },
    events,
  );
  assert.equal(state.players["tank"].health, 192);
});

test("mana restoration writes the mana resource", () => {
  let state = emptyZone();
  const catalog = catalogFromContent(content);
  state.progressionCatalog = catalog;
  state = addPlayer(state, playerAt("mage", 4, 4));
  const player = state.players["mage"];
  const manaId = resourceIdForRole(catalog, "mana");
  player.resources = {};
  player.resources[manaId] = 5;
  const events: CombatEvent[] = [];
  applyEffectDefinition(
    state,
    {
      id: "restore.mana",
      type: "resource_change",
      source: "caster",
      target: "self",
      magnitude: { kind: "constant", value: 12 },
      duration: 0,
      tickInterval: 0,
      stackPolicy: "replace",
      maxStacks: 1,
      refreshPolicy: "refresh",
      removalReason: "expired",
      tags: ["mana"],
      resourceRole: "mana",
    },
    "ability.test.restore",
    player,
    playerAsTarget(player),
    null,
    0,
    1,
    events,
  );
  assert.equal(player.resources[manaId], 17);
});
