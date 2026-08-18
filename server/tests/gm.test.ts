import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  applyGmToMatch,
  emptyGmAllowlist,
  isGmAuthorized,
  makeGmAudit,
  parseGmAllowlist,
  parseGmCommandPayload,
  resolveGmZoneTemplateId,
  SYSTEMS_LAB_ZONE_ID,
} from "../src/domain/gm";
import { CAVE_ZONE_ID } from "../src/domain/instance";
import { emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import {
  STARTER_ZONE_ID,
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";

function player(): MatchPlayer {
  return {
    userId: "user-gm",
    sessionId: "session-gm",
    username: "gm",
    characterId: "char-gm",
    name: "GM",
    classId: "test.class.vanguard",
    x: 240,
    y: 384,
    maxHealth: 20,
    health: 20,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    gold: 0,
  };
}

function zone() {
  return createStarterZoneState(
    "hash",
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
  );
}

test("gm allowlist is disabled by default", () => {
  const empty = emptyGmAllowlist();
  assert.equal(empty.enabled, false);
  assert.equal(isGmAuthorized(empty, { userId: "user-1" }), false);
  assert.equal(isGmAuthorized(parseGmAllowlist(null), { userId: "user-1" }), false);
});

test("gm allowlist authorizes configured user ids", () => {
  const allowlist = parseGmAllowlist({
    enabled: true,
    userIds: ["user-admin"],
    customIds: ["dev-alice"],
    emails: ["gm@example.com"],
  });
  assert.equal(isGmAuthorized(allowlist, { userId: "user-admin" }), true);
  assert.equal(isGmAuthorized(allowlist, { userId: "user-other", customId: "dev-alice" }), true);
  assert.equal(isGmAuthorized(allowlist, { userId: "user-other", email: "gm@example.com" }), true);
  assert.equal(isGmAuthorized(allowlist, { userId: "user-other" }), false);
  assert.equal(
    isGmAuthorized({ schemaVersion: 1, enabled: false, userIds: ["user-admin"], customIds: [], emails: [] }, { userId: "user-admin" }),
    false,
  );
});

test("gm payload requires reason and rejects unknown commands", () => {
  assert.throws(() => parseGmCommandPayload("{"), /malformed_json/);
  assert.throws(
    () => parseGmCommandPayload(JSON.stringify({ command: "inspect_character", reason: "ok", characterId: "c1", extra: true })),
    /unknown_field/,
  );
  assert.throws(
    () => parseGmCommandPayload(JSON.stringify({ command: "explode", reason: "because", characterId: "c1" })),
    /unknown_command/,
  );
  assert.throws(
    () => parseGmCommandPayload(JSON.stringify({ command: "inspect_character", reason: "", characterId: "c1" })),
    /reason_required/,
  );
  const parsed = parseGmCommandPayload(
    JSON.stringify({ command: "inspect_character", reason: "debug inspect", characterId: "char-gm", requestId: "gm-1" }),
  );
  assert.equal(parsed.command, "inspect_character");
  assert.equal(parsed.reason, "debug inspect");
});

test("gm audit records administrator target command reason timestamp and result", () => {
  const audit = makeGmAudit({
    administratorUser: "user-admin",
    targetCharacter: "char-gm",
    command: "grant_test_gold",
    reason: "lab",
    timestamp: 1700000000000,
    result: "ok",
    requestId: "gm-1",
  });
  assert.equal(audit.administratorUser, "user-admin");
  assert.equal(audit.targetCharacter, "char-gm");
  assert.equal(audit.command, "grant_test_gold");
  assert.equal(audit.reason, "lab");
  assert.equal(audit.timestamp, 1700000000000);
  assert.equal(audit.result, "ok");
  assert.equal(audit.schemaVersion, 1);
});

test("gm teleport and grant item apply in match state", () => {
  let state = zone();
  const actor = player();
  state = addPlayer(state, actor);
  const live = state.players[actor.userId];
  const teleported = applyGmToMatch(
    state,
    live,
    {
      command: "teleport_character",
      reason: "lab",
      characterId: actor.characterId,
      requestId: "gm-tp",
      x: 400,
      y: 400,
    },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(teleported.ok, true);
  assert.equal(live.x, 400);
  const granted = applyGmToMatch(
    state,
    live,
    {
      command: "grant_test_item",
      reason: "lab",
      characterId: actor.characterId,
      requestId: "gm-item",
      itemId: "item.training_sword",
      quantity: 1,
    },
    1,
    1,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    [],
  );
  assert.equal(granted.ok, true);
  assert.equal(granted.persistInventory, true);
  assert.ok(live.inventory !== undefined && live.inventory.items.length > 0);
});

test("gm open cave prefers systems lab when the template exists", () => {
  assert.equal(resolveGmZoneTemplateId(undefined, {}), CAVE_ZONE_ID);
  assert.equal(resolveGmZoneTemplateId("zone.cave", { "zone.cave": true }), "zone.cave");
  const withLab: { [id: string]: unknown } = {};
  withLab[SYSTEMS_LAB_ZONE_ID] = true;
  assert.equal(resolveGmZoneTemplateId(undefined, withLab), SYSTEMS_LAB_ZONE_ID);
  assert.equal(CAVE_ZONE_ID, "zone.cave");
  assert.equal(STARTER_ZONE_ID, "zone.starter");
});
