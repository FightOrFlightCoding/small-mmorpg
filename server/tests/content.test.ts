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
    const classDef = classDefs[i] as { legacyMigrationDefault?: boolean; startingEquipment: ReadonlyArray<unknown> };
    if (classDef.legacyMigrationDefault === true) {
      defaults += 1;
    }
    assert.ok(Array.isArray(classDef.startingEquipment));
  }
  assert.equal(defaults, 1);
});
