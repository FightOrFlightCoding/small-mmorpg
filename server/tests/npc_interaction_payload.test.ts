import assert from "node:assert/strict";
import test from "node:test";
import { contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { addPlayer, cloneStarterZoneState, buildSnapshot } from "../src/domain/match_state";
import { ServerOpcode } from "../src/domain/protocol";
import { interactionPayload, interactMessage, openNpcSession } from "./npc_session";
import { npcPos, platformPlayer, platformZone } from "./npc_platform_fixtures";

function persistableRoundtrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function openAt(npcId: string, requestId: string) {
  const pos = npcPos(npcId);
  const state = addPlayer(platformZone(), platformPlayer("user-alice", "Alice", pos.x, pos.y, 20));
  return openNpcSession(state, "user-alice", npcId, 1, requestId);
}

test("platform quest and quartermaster interact payloads present and survive Nakama JSON persist", () => {
  const cases = ["npc.elder", "npc.platform_quest", "npc.cert_quartermaster"] as const;
  for (let i = 0; i < cases.length; i++) {
    const npcId = cases[i];
    const opened = openAt(npcId, "req-payload-" + npcId.replace(".", "-"));
    const body = interactionPayload(opened.result);
    assert.equal(body.ok, true, npcId + " interact must return INTERACTION_RESULT ok");
    assert.equal(body.code, "ok");
    assert.equal(body.targetId, npcId);
    assert.ok(typeof body.interactionSessionId === "string" && body.interactionSessionId.length >= 8, npcId);
    assert.ok(typeof body.currentNodeId === "string" && body.currentNodeId.length > 0, npcId + " must have a dialogue node");
    assert.ok(Array.isArray(body.allowedOptionIds), npcId);
    assert.ok(Array.isArray(body.availableServiceIds), npcId);
    const row = opened.result.outbound.find((item) => item.opcode === ServerOpcode.INTERACTION_RESULT);
    assert.ok(row !== undefined);
    assert.ok(row.body.length < 2048, npcId + " INTERACTION_RESULT must stay under client inbound comfort size, got " + String(row.body.length));

    const snapshot = opened.result.outbound.find((item) => item.opcode === ServerOpcode.SNAPSHOT);
    assert.ok(snapshot !== undefined, npcId + " tick must still emit SNAPSHOT");
    assert.ok(snapshot.body.length < 2048 * 16, npcId + " SNAPSHOT must parse on the client, got " + String(snapshot.body.length));

    const persisted = persistableRoundtrip(opened.result.state);
    const cloned = cloneStarterZoneState(persisted);
    assert.equal(cloned.players["user-alice"].interactionSession?.targetId, npcId);
    const continued = applyMatchLoop(cloned, 2, contentHash, []);
    assert.equal(continued.outbound.some((item) => item.opcode === ServerOpcode.SNAPSHOT), true);
    const plans = buildSnapshot(cloned, 2, true);
    assert.ok(plans.length < 2048 * 16, npcId + " NPC-plan SNAPSHOT must parse, got " + String(plans.length));
  }
});

test("JSON-null dialogue options and vendor stock still emit INTERACTION_RESULT", () => {
  const cases = ["npc.platform_quest", "npc.cert_quartermaster"] as const;
  for (let i = 0; i < cases.length; i++) {
    const npcId = cases[i];
    const opened = openAt(npcId, "req-null-" + npcId.replace(".", "-"));
    const poisoned = persistableRoundtrip(opened.result.state) as ReturnType<typeof platformZone>;
    const dialogueId = npcId === "npc.platform_quest" ? "dialogue.npc.platform_quest" : "dialogue.npc.cert_quartermaster";
    const dialogue = poisoned.dialoguesById !== undefined ? poisoned.dialoguesById[dialogueId] : undefined;
    if (dialogue !== undefined && dialogue.nodes.start !== undefined) {
      (dialogue.nodes.start as { options?: unknown }).options = null;
    }
    if (poisoned.vendorsById !== undefined && poisoned.vendorsById["vendor.cert_quartermaster"] !== undefined) {
      (poisoned.vendorsById["vendor.cert_quartermaster"] as { stock?: unknown }).stock = null;
    }
    if (poisoned.npcsById !== undefined && poisoned.npcsById[npcId] !== undefined) {
      const services = poisoned.npcsById[npcId].services;
      if (Array.isArray(services)) {
        for (let s = 0; s < services.length; s++) {
          (services[s] as { questIds?: unknown }).questIds = services[s].questIds === undefined ? null : services[s].questIds;
        }
      }
    }
    const cloned = cloneStarterZoneState(poisoned);
    const continued = applyMatchLoop(cloned, 3, contentHash, [
      interactMessage("user-alice", npcId, "req-null2-" + npcId.replace(".", "-")),
    ]);
    const body = interactionPayload(continued);
    assert.equal(body.ok, true, npcId + " must still return INTERACTION_RESULT after JSON-null options/stock");
    assert.equal(body.code, "ok");
    assert.ok(Array.isArray(body.allowedOptionIds), npcId);
  }
});
