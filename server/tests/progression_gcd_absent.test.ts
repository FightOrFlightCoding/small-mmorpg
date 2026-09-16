import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import { HOTBAR_SIZE, publicAbilityState } from "../src/domain/ability";
import { CANONICAL_HOTBAR_SIZE } from "../src/domain/canonical_progression";
import { catalogFromContent } from "../src/domain/stats";
import { emptyQuestLog } from "../src/domain/quest";
import { emptyInventory } from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import type { MatchPlayer } from "../src/domain/match_state";
import { initializeProgression } from "../src/domain/progression";

const catalog = catalogFromContent(content);

function warrior(): MatchPlayer {
  return {
    userId: "user-w",
    sessionId: "session-w",
    username: "w",
    characterId: "char-w",
    name: "W",
    classId: "class.warrior",
    x: 0,
    y: 0,
    maxHealth: 110,
    health: 110,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    gold: 0,
    progression: initializeProgression(catalog, "class.warrior"),
    globalCooldownUntilTick: 99,
  };
}

test("production abilities do not use a global cooldown", () => {
  const ids = Object.keys(content.abilities);
  let production = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id.indexOf("ability.") !== 0) {
      continue;
    }
    const def = content.abilities[id as keyof typeof content.abilities];
    production += 1;
    assert.equal(def.globalCooldown, 0, id);
  }
  assert.ok(production > 0);
});

test("production classes ignore authoritative GCD remaining", () => {
  const player = warrior();
  const publicState = publicAbilityState(player, 10, catalog);
  assert.equal(publicState.globalCooldownRemaining, 0);
  assert.equal(CANONICAL_HOTBAR_SIZE, 4);
  assert.equal(HOTBAR_SIZE, 8);
});

test("foundation test abilities may keep a GCD", () => {
  assert.ok(content.abilities["test.ability.basic_melee"].globalCooldown > 0);
});
