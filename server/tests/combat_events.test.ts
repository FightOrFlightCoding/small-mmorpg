import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_COMBAT_EVENT_TYPES,
  createCombatEventBus,
  eventsOfType,
  toLegacyCombatEvent,
  type CanonicalCombatEvent,
} from "../src/domain/combat_events";

function baseEvent(type: CanonicalCombatEvent["type"]): CanonicalCombatEvent {
  return {
    type: type,
    tick: 4,
    sourceId: "player-a",
    sourceKind: "player",
    targetId: "enemy-a",
    targetKind: "enemy",
    abilityId: "ability.test.generic",
    amount: 10,
  };
}

test("every named combat event type is registered", () => {
  assert.equal(CANONICAL_COMBAT_EVENT_TYPES.length, 21);
  const seen: { [id: string]: boolean } = {};
  for (let i = 0; i < CANONICAL_COMBAT_EVENT_TYPES.length; i++) {
    seen[CANONICAL_COMBAT_EVENT_TYPES[i]] = true;
  }
  assert.equal(seen["before_ability"], true);
  assert.equal(seen["movement_stopped"], true);
  assert.equal(seen["shield_expired"], true);
});

test("handlers subscribe by event type and do not require class ids", () => {
  const bus = createCombatEventBus();
  const seen: string[] = [];
  bus.on({
    id: "generic_on_hit",
    events: ["damage_dealt", "hit_rolled"],
    handle: function (_ctx, event): void {
      seen.push(event.type);
    },
  });
  bus.emit(baseEvent("damage_dealt"));
  bus.emit(baseEvent("healing_dealt"));
  bus.emit(baseEvent("hit_rolled"));
  assert.deepEqual(seen, ["damage_dealt", "hit_rolled"]);
  assert.equal(eventsOfType(bus.events, "healing_dealt").length, 1);
});

test("legacy mapping covers damage, heal, interrupt, and death", () => {
  const hit = toLegacyCombatEvent(baseEvent("damage_dealt"));
  assert.ok(hit !== null);
  assert.equal(hit.type, "hit");
  const heal = toLegacyCombatEvent(baseEvent("healing_dealt"));
  assert.ok(heal !== null);
  assert.equal(heal.type, "heal");
  const death = toLegacyCombatEvent(baseEvent("entity_killed"));
  assert.ok(death !== null);
  assert.equal(death.type, "death");
});
