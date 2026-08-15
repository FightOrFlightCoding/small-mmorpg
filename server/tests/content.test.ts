import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";

test("generated server content is importable without filesystem access", () => {
  assert.match(contentHash, /^[a-f0-9]{64}$/);
  assert.equal(content.player.id, "player.base");
  assert.equal(content.zones["zone.starter"].id, "zone.starter");
  assert.equal(content.quests["quest.slime_problem"].rewards.gold, 25);
  assert.equal(content.items["item.slime_gel"].maxStack, 20);
});
