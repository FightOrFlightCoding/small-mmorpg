import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash, developmentOnly, packageId } from "../src/generated/content";

test("generated server content is importable without filesystem access", () => {
  assert.match(contentHash, /^[a-f0-9]{64}$/);
  assert.equal(packageId, "vibecode.foundation");
  assert.deepEqual(developmentOnly, []);
  assert.equal(content.player.id, "player.base");
  assert.equal(content.zones["zone.starter"].id, "zone.starter");
  assert.equal(content.quests["quest.slime_problem"].rewards.gold, 25);
  assert.equal(content.items["item.slime_gel"].maxStack, 20);
  const classDefs = Object.values(content.classes);
  assert.ok(classDefs.length >= 2);
  let defaults = 0;
  for (let i = 0; i < classDefs.length; i++) {
    const classDef = classDefs[i] as { legacyMigrationDefault?: boolean; startingEquipment: ReadonlyArray<unknown>; progressionId?: string };
    if (classDef.legacyMigrationDefault === true) {
      defaults += 1;
    }
    assert.ok(Array.isArray(classDef.startingEquipment));
    assert.equal(typeof classDef.progressionId, "string");
  }
  assert.equal(defaults, 1);
  assert.ok(Object.keys(content.attributes).length >= 1);
  assert.ok(Object.keys(content.resources).length >= 1);
  assert.ok(Object.keys(content.derivedStats).length >= 1);
  assert.ok(Object.keys(content.levelCurves).length >= 1);
  assert.ok(Object.keys(content.classProgressions).length >= 2);
  assert.ok(Object.keys(content.equipmentSlots).length >= 6);
  assert.ok(Object.keys(content.abilities).length >= 5);
  assert.equal(content.abilities["test.ability.basic_melee"].targetMode, "entity");
  assert.equal(content.player.basicAbilityId, "test.ability.basic_melee");
  assert.equal(content.items["item.training_sword"].category, "weapon");
  assert.equal(content.items["item.test_leather_cap"].category, "armor");
  assert.equal(content.items["item.slime_gel"].destroyable, false);
  assert.equal(content.player.inventoryCapacity, 20);
  assert.equal(content.enemies["enemy.green_slime"].aiProfileId, "test.ai.melee");
  assert.equal(content.enemies["enemy.green_slime"].lootTableId, "loot.green_slime");
  assert.ok(content.enemies["test.enemy.melee"]);
  assert.ok(content.enemies["test.enemy.ranged"]);
  assert.ok(content.enemies["test.enemy.caster"]);
  assert.ok(content.enemies["test.enemy.cave_boss"]);
  assert.equal(content.aiProfiles["test.ai.melee"].style, "melee");
  assert.equal(content.lootTables["loot.green_slime"].entries[0].itemDefinitionId, "item.slime_gel");
  assert.equal(content.spawns["spawn.starter.green_slime"].activationPolicy, "always");
  assert.equal(content.spawns["spawn.starter.test_melee"].activationPolicy, "manual");
});
