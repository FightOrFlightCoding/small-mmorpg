import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { emptyEquipment } from "../src/domain/equipment";
import { initializeInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  buildFullState,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import {
  allocateAttributes,
  grantXp,
  initializeProgression,
  publicProgression,
} from "../src/domain/progression";
import { storedProgressionFromValue, storedProgressionWriteValue } from "../src/domain/progression_store";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";
import { loadCanonicalProgression } from "../src/domain/save_load";
import {
  STAT_LAYER_ORDER,
  catalogFromContent,
  derivedStatIdForRole,
  emptyModifierMap,
  evaluateStats,
  equipmentModifiersFromGear,
} from "../src/domain/stats";

const catalog = catalogFromContent(content);
const classIds = Object.keys(catalog.classes).sort();
const defaultClassId = defaultClass();
const otherClassId = otherClass();
const attributeIds = Object.keys(catalog.attributes).sort();

function defaultClass(): string {
  for (let i = 0; i < classIds.length; i++) {
    const def = content.classes[classIds[i] as keyof typeof content.classes] as { legacyMigrationDefault?: boolean };
    if (def.legacyMigrationDefault === true) {
      return classIds[i];
    }
  }
  return classIds[0];
}

function otherClass(): string {
  for (let i = 0; i < classIds.length; i++) {
    if (classIds[i] !== defaultClassId) {
      return classIds[i];
    }
  }
  return classIds[0];
}

function swordInventory() {
  return initializeInventory(null, function () {
    return "sword-1";
  }).inventory;
}

function itemsById() {
  return itemDefinitionsFromContent(content.items);
}

function equippedSwordModifiers() {
  const inventory = swordInventory();
  const equipment = emptyEquipment();
  equipment.slots.main_hand = inventory.items[0].instanceId;
  return equipmentModifiersFromGear(equipment, inventory, itemsById());
}

function statsFor(classId: string, level: number, allocated: { [id: string]: number }, equipment: { [channel: string]: number }) {
  return evaluateStats(catalog, {
    classId: classId,
    level: level,
    allocatedAttributes: allocated,
    equipmentModifiers: equipment,
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
}

function zoneWithCatalog() {
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
      pickupRange: content.player.pickupRange,
    },
    questDefinitionsFromContent(content.quests),
    itemsById(),
  );
  state.progressionCatalog = catalog;
  return state;
}

function playerWithProgression(userId: string, classId: string): MatchPlayer {
  const inventory = swordInventory();
  const equipment = emptyEquipment();
  equipment.slots.main_hand = inventory.items[0].instanceId;
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: "char-" + userId,
    name: userId,
    classId: classId,
    x: content.zones["zone.starter"].playerSpawn.x,
    y: content.zones["zone.starter"].playerSpawn.y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: inventory,
    equipment: equipment,
    progression: initializeProgression(catalog, classId),
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

test("xp below the next level threshold stays at level 1", () => {
  const progression = initializeProgression(catalog, defaultClassId);
  const result = grantXp(progression, catalog, defaultClassId, {
    characterId: "char-1",
    amount: 10,
    reasonType: "kill",
    reasonId: "enemy",
    eventId: "kill:below",
  });
  assert.equal(result.code, "ok");
  assert.equal(result.levelsGained, 0);
  assert.equal(result.progression.level, 1);
  assert.equal(result.progression.currentXp, 10);
  assert.equal(result.progression.lifetimeXp, 10);
  assert.equal(result.progression.unspentAttributePoints, 0);
});

test("one xp grant can produce exactly one level", () => {
  const progression = initializeProgression(catalog, defaultClassId);
  const result = grantXp(progression, catalog, defaultClassId, {
    characterId: "char-1",
    amount: 50,
    reasonType: "quest",
    reasonId: "quest",
    eventId: "quest:one-level",
  });
  assert.equal(result.levelsGained, 1);
  assert.equal(result.progression.level, 2);
  assert.equal(result.progression.currentXp, 0);
  assert.equal(result.progression.unspentAttributePoints, 1);
  assert.equal(result.progression.unspentSkillPoints, 1);
});

test("one xp grant can cross multiple levels", () => {
  const progression = initializeProgression(catalog, defaultClassId);
  const result = grantXp(progression, catalog, defaultClassId, {
    characterId: "char-1",
    amount: 50 + 75 + 10,
    reasonType: "admin",
    reasonId: "admin",
    eventId: "admin:multi",
  });
  assert.equal(result.levelsGained, 2);
  assert.equal(result.progression.level, 3);
  assert.equal(result.progression.currentXp, 10);
  assert.equal(result.progression.unspentAttributePoints, 2);
  assert.equal(result.progression.unspentSkillPoints, 2);
});

test("maximum level keeps leftover xp out of currentXp and grants no extra points", () => {
  const progression = initializeProgression(catalog, defaultClassId);
  const toMax = grantXp(progression, catalog, defaultClassId, {
    characterId: "char-1",
    amount: 50 + 75 + 100 + 150 + 40,
    reasonType: "admin",
    reasonId: "admin",
    eventId: "admin:to-max",
  });
  assert.equal(toMax.progression.level, 5);
  assert.equal(toMax.progression.currentXp, 0);
  const pointsAtCap = toMax.progression.unspentAttributePoints;
  const skillsAtCap = toMax.progression.unspentSkillPoints;
  const extra = grantXp(toMax.progression, catalog, defaultClassId, {
    characterId: "char-1",
    amount: 99,
    reasonType: "admin",
    reasonId: "admin",
    eventId: "admin:over-max",
  });
  assert.equal(extra.levelsGained, 0);
  assert.equal(extra.progression.level, 5);
  assert.equal(extra.progression.currentXp, 0);
  assert.equal(extra.progression.lifetimeXp, toMax.progression.lifetimeXp + 99);
  assert.equal(extra.progression.unspentAttributePoints, pointsAtCap);
  assert.equal(extra.progression.unspentSkillPoints, skillsAtCap);
});

test("duplicate xp event ids do not grant twice", () => {
  const progression = initializeProgression(catalog, defaultClassId);
  const grant = {
    characterId: "char-1",
    amount: 50,
    reasonType: "kill",
    reasonId: "enemy",
    eventId: "kill:same",
  };
  const first = grantXp(progression, catalog, defaultClassId, grant);
  const second = grantXp(first.progression, catalog, defaultClassId, grant);
  assert.equal(second.replay, true);
  assert.equal(second.changed, false);
  assert.equal(second.progression.level, first.progression.level);
  assert.equal(second.progression.lifetimeXp, first.progression.lifetimeXp);
  assert.equal(second.progression.unspentAttributePoints, first.progression.unspentAttributePoints);
});

test("attribute allocation spends unspent points and is idempotent", () => {
  let progression = initializeProgression(catalog, defaultClassId);
  progression = grantXp(progression, catalog, defaultClassId, {
    characterId: "char-1",
    amount: 50,
    reasonType: "admin",
    reasonId: "admin",
    eventId: "admin:alloc",
  }).progression;
  const first = allocateAttributes(progression, catalog, {
    requestId: "alloc-1-xxxx",
    attributeId: attributeIds[0],
    amount: 1,
    classId: defaultClassId,
  });
  assert.equal(first.ok, true);
  assert.equal(first.progression.unspentAttributePoints, 0);
  assert.equal(first.progression.allocatedAttributes[attributeIds[0]], 1);
  const replay = allocateAttributes(first.progression, catalog, {
    requestId: "alloc-1-xxxx",
    attributeId: attributeIds[0],
    amount: 1,
    classId: defaultClassId,
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.progression.allocatedAttributes[attributeIds[0]], 1);
});

test("overspending, unknown attributes, and negative amounts are rejected", () => {
  const progression = initializeProgression(catalog, defaultClassId);
  const overspend = allocateAttributes(progression, catalog, {
    requestId: "alloc-overspend",
    attributeId: attributeIds[0],
    amount: 1,
    classId: defaultClassId,
  });
  assert.equal(overspend.ok, false);
  assert.equal(overspend.code, "insufficient_points");
  const unknown = allocateAttributes(progression, catalog, {
    requestId: "alloc-unknown",
    attributeId: "missing.attribute.id",
    amount: 1,
    classId: defaultClassId,
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "unknown_attribute");
  const negative = allocateAttributes(progression, catalog, {
    requestId: "alloc-negative",
    attributeId: attributeIds[0],
    amount: -1,
    classId: defaultClassId,
  });
  assert.equal(negative.ok, false);
  assert.equal(negative.code, "invalid_amount");
});

test("derived-stat layers run in fixed order even if content lists clamp first", () => {
  const attackId = derivedStatIdForRole(catalog, "attack");
  const original = catalog.derivedStats[attackId].components;
  const reversed = original.slice().reverse();
  assert.notEqual(reversed[0].layer, STAT_LAYER_ORDER[0]);
  const clone = catalogFromContent(content);
  clone.derivedStats[attackId] = {
    id: clone.derivedStats[attackId].id,
    displayName: clone.derivedStats[attackId].displayName,
    role: clone.derivedStats[attackId].role,
    components: reversed,
  };
  const ordered = evaluateStats(catalog, {
    classId: defaultClassId,
    level: 1,
    allocatedAttributes: {},
    equipmentModifiers: { attack: 2 },
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  const shuffled = evaluateStats(clone, {
    classId: defaultClassId,
    level: 1,
    allocatedAttributes: {},
    equipmentModifiers: { attack: 2 },
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  assert.equal(shuffled.attack, ordered.attack);
});

test("equipment and effect modifier hooks change canonical derived stats", () => {
  const bare = statsFor(defaultClassId, 1, {}, {});
  const geared = statsFor(defaultClassId, 1, {}, equippedSwordModifiers());
  const buffed = evaluateStats(catalog, {
    classId: defaultClassId,
    level: 1,
    allocatedAttributes: {},
    equipmentModifiers: equippedSwordModifiers(),
    effectModifiers: { attack: 3 },
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  assert.ok(geared.attack > bare.attack);
  assert.equal(buffed.attack, geared.attack + 3);
});

test("different classes produce different server-calculated stats", () => {
  const left = statsFor(defaultClassId, 1, {}, equippedSwordModifiers());
  const right = statsFor(otherClassId, 1, {}, equippedSwordModifiers());
  assert.notEqual(left.attack, right.attack);
  assert.notEqual(left.maxHealth, right.maxHealth);
});

test("prompt 18 characters initialize at level 1 with previous combat numbers", () => {
  const missing = loadCanonicalProgression(undefined, false);
  assert.equal(missing.missing, true);
  const progression = initializeProgression(catalog, defaultClassId);
  const evaluated = statsFor(defaultClassId, 1, {}, equippedSwordModifiers());
  assert.equal(progression.level, 1);
  assert.equal(progression.currentXp, 0);
  assert.equal(evaluated.attack, content.player.attack + content.items["item.training_sword"].attackBonus);
  assert.equal(evaluated.maxHealth, content.player.maxHealth);
});

test("full state reconnection includes canonical progression", () => {
  let state = addPlayer(zoneWithCatalog(), playerWithProgression("user-alice", defaultClassId));
  const player = state.players["user-alice"];
  const granted = grantXp(player.progression!, catalog, defaultClassId, {
    characterId: player.characterId,
    amount: 50,
    reasonType: "admin",
    reasonId: "admin",
    eventId: "admin:reconnect",
  });
  player.progression = granted.progression;
  const body = JSON.parse(buildFullState(state, 9, "user-alice"));
  assert.equal(body.progression.level, 2);
  assert.equal(body.progression.unspentSkillPoints, 1);
  assert.equal(body.progression.classId, defaultClassId);
});

test("allocate opcode is parsed as a number amount and rejects xp injection", () => {
  const parsed = parseClientMessage(
    ClientOpcode.ALLOCATE_ATTRIBUTES,
    envelope({ requestId: "allocreq1", attributeId: attributeIds[0], amount: 2 }),
    contentHash,
  );
  assert.equal(isProtocolError(parsed), false);
  if (!isProtocolError(parsed)) {
    assert.equal(parsed.amount, 2);
    assert.equal(parsed.fields.attributeId, attributeIds[0]);
  }
  const injected = parseClientMessage(
    ClientOpcode.ALLOCATE_ATTRIBUTES,
    envelope({ requestId: "allocreq2", attributeId: attributeIds[0], amount: 1, xp: 999 }),
    contentHash,
  );
  assert.equal(isProtocolError(injected), true);
  if (isProtocolError(injected)) {
    assert.equal(injected.code, "stat_injection:xp");
  }
});

test("match allocate command spends points and persist skill points", () => {
  let state = addPlayer(zoneWithCatalog(), playerWithProgression("user-alice", defaultClassId));
  state.players["user-alice"].progression = grantXp(
    state.players["user-alice"].progression!,
    catalog,
    defaultClassId,
    {
      characterId: "char-user-alice",
      amount: 50,
      reasonType: "admin",
      reasonId: "admin",
      eventId: "admin:match-alloc",
    },
  ).progression;
  const result = applyMatchLoop(state, 4, contentHash, [
    {
      opcode: ClientOpcode.ALLOCATE_ATTRIBUTES,
      raw: envelope({ requestId: "allocmatch1", attributeId: attributeIds[0], amount: 1 }),
      userId: "user-alice",
    },
  ]);
  const player = result.state.players["user-alice"];
  assert.equal(player.progression?.allocatedAttributes[attributeIds[0]], 1);
  assert.equal(player.progression?.unspentAttributePoints, 0);
  assert.equal(player.progression?.unspentSkillPoints, 1);
  assert.equal(result.persistProgression.length, 1);
  const stored = storedProgressionFromValue(storedProgressionWriteValue(player.progression!));
  assert.equal(stored?.unspentSkillPoints, 1);
  const progressionMessages = result.outbound.filter((item) => item.opcode === ServerOpcode.PROGRESSION_STATE);
  assert.ok(progressionMessages.length >= 1);
});

test("trusted kill credit grants xp once per death count", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(zoneWithCatalog(), playerWithProgression("user-alice", defaultClassId));
  state.players["user-alice"].x = spawn.x;
  state.players["user-alice"].y = spawn.y;
  state.enemies[0].health = 1;
  const result = applyMatchLoop(state, 4, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "killxp001" }),
      userId: "user-alice",
    },
  ]);
  const reward = content.enemies["enemy.green_slime"].xpReward;
  assert.equal(result.state.players["user-alice"].progression?.currentXp, reward);
  assert.equal(result.state.players["user-alice"].progression?.lifetimeXp, reward);
  assert.equal(result.state.players["user-alice"].progression?.level, 1);
  assert.equal(result.persistProgression.length, 1);
});

test("combat uses pipeline attack instead of player.base plus bonus for progressed classes", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(zoneWithCatalog(), playerWithProgression("user-alice", otherClassId));
  state.players["user-alice"].x = spawn.x;
  state.players["user-alice"].y = spawn.y;
  const expected = statsFor(otherClassId, 1, {}, equippedSwordModifiers()).attack;
  assert.notEqual(expected, content.player.attack + content.items["item.training_sword"].attackBonus);
  const before = state.enemies[0].health;
  const result = applyMatchLoop(state, 4, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "pipatk001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(result.state.enemies[0].health, before - expected);
});

test("public progression payload is class-specific", () => {
  const left = initializeProgression(catalog, defaultClassId);
  const right = initializeProgression(catalog, otherClassId);
  const leftStats = statsFor(defaultClassId, 1, {}, {});
  const rightStats = statsFor(otherClassId, 1, {}, {});
  const leftView = publicProgression(catalog, defaultClassId, left, leftStats.values);
  const rightView = publicProgression(catalog, otherClassId, right, rightStats.values);
  assert.notEqual(leftView.classId, rightView.classId);
  assert.notEqual((leftView.derived as { [id: string]: number })[derivedStatIdForRole(catalog, "attack")], (rightView.derived as { [id: string]: number })[derivedStatIdForRole(catalog, "attack")]);
});
