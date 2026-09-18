import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  MATCH_TICK_RATE,
  addPlayer,
  buildFullState,
  buildSnapshot,
  cloneStarterZoneState,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import {
  acceptNpcMovementPlan,
  interpolateNpcPose,
  pauseNpcMovement,
  publicNpc,
  resumeNpcMovement,
  tickNpcMovement,
  type NpcRouteContent,
} from "../src/domain/npc_movement";
import { createNpcRuntimeInstance, npcDefinitionsFromContent, type NpcDefinition } from "../src/domain/npc";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";

const TICK_RATE = MATCH_TICK_RATE;

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function playerAt(userId: string, name: string, x: number, y: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
  };
}

function npcDef(id: string, routeId: string, x = 0, y = 0): NpcDefinition {
  return {
    id: id,
    displayName: id,
    visualId: "visual.npc_elder",
    zoneId: "zone.test_npc_move",
    x: x,
    y: y,
    homeX: x,
    homeY: y,
    routeId: routeId,
    interactionRange: 48,
    dialogueId: "",
    services: [{ type: "dialogue" }],
  };
}

function walkerZone(route: NpcRouteContent, x = 0, y = 0): StarterZoneState {
  const definition = npcDef("npc.walker", route.id, x, y);
  return createStarterZoneState(
    contentHash,
    {
      id: "zone.test_npc_move",
      playerSpawn: { x: 0, y: 0 },
      npcs: [{ npcId: definition.id, x: x, y: y }],
      enemies: [],
      walkableBounds: { x: -4000, y: -4000, width: 8000, height: 8000 },
      collisions: [],
    },
    {},
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    {},
    {},
    {
      npcsById: { [definition.id]: definition },
      npcRoutesById: { [route.id]: route },
    },
  );
}

function starterZone(): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    { "enemy.green_slime": content.enemies["enemy.green_slime"] },
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    questDefinitionsFromContent(content.quests),
    {},
    { npcsById: npcDefinitionsFromContent(content.npcs) },
  );
}

function snapshotBody(result: ReturnType<typeof applyMatchLoop>): { [key: string]: unknown } {
  const row = result.outbound.find((item) => item.opcode === ServerOpcode.SNAPSHOT);
  assert.ok(row);
  return JSON.parse(row.body) as { [key: string]: unknown };
}

function nodeVisits(route: NpcRouteContent, ticks: number): string[] {
  const npc = createNpcRuntimeInstance({
    npcId: "npc.walker",
    x: 0,
    y: 0,
    zoneId: "zone.test_npc_move",
    definition: npcDef("npc.walker", route.id),
    defaultInteractionRange: 48,
  });
  const seen: string[] = [];
  for (let tick = 0; tick <= ticks; tick++) {
    tickNpcMovement([npc], { [route.id]: route }, tick, TICK_RATE);
    const current = npc.movement !== undefined ? npc.movement.currentNodeId : "";
    if (current !== "" && seen[seen.length - 1] !== current) {
      seen.push(current);
    }
  }
  return seen;
}

function loopRoute(): NpcRouteContent {
  return {
    id: "route.test_loop",
    routeType: "loop",
    speed: 1000,
    maxDistanceFromHome: 400,
    dwellMin: 0,
    dwellMax: 0,
    waypoints: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 100, y: 100 },
    ],
  };
}

test("stationary NPCs remain at home and do not invent positions", () => {
  const route: NpcRouteContent = {
    id: "route.still",
    routeType: "stationary",
    speed: 40,
    maxDistanceFromHome: 0,
    dwellMin: 0,
    dwellMax: 0,
  };
  const npc = createNpcRuntimeInstance({
    npcId: "npc.still",
    x: 12,
    y: 24,
    zoneId: "zone.test_npc_move",
    definition: npcDef("npc.still", route.id, 12, 24),
    defaultInteractionRange: 48,
  });
  for (let tick = 0; tick <= 20; tick++) {
    tickNpcMovement([npc], { [route.id]: route }, tick, TICK_RATE);
  }
  assert.equal(npc.x, 12);
  assert.equal(npc.y, 24);
  assert.equal(npc.movement?.phase, "idle");
  assert.equal(npc.movement?.revision, 1);
});

test("loop visits waypoints in order and wraps", () => {
  const seen = nodeVisits(loopRoute(), 12);
  assert.deepEqual(seen.slice(0, 6), ["a", "b", "c", "a", "b", "c"]);
});

test("ping-pong reverses at the ends", () => {
  const route: NpcRouteContent = {
    id: "route.test_ping",
    routeType: "ping_pong",
    speed: 1000,
    maxDistanceFromHome: 400,
    dwellMin: 0,
    dwellMax: 0,
    waypoints: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
      { id: "c", x: 200, y: 0 },
    ],
  };
  const seen = nodeVisits(route, 16);
  assert.deepEqual(seen.slice(0, 7), ["a", "b", "c", "b", "a", "b", "c"]);
});

test("weighted route choices are deterministic under the same seed", () => {
  const route: NpcRouteContent = {
    id: "route.test_graph",
    routeType: "weighted_route_graph",
    speed: 1000,
    maxDistanceFromHome: 400,
    dwellMin: 0,
    dwellMax: 0,
    waypoints: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 80, y: 0 },
      { id: "c", x: 0, y: 80 },
    ],
    edges: [
      { from: "a", to: "b", weight: 2 },
      { from: "a", to: "c", weight: 1 },
      { from: "b", to: "a", weight: 1 },
      { from: "c", to: "a", weight: 1 },
    ],
  };
  const first = nodeVisits(route, 20);
  const second = nodeVisits(route, 20);
  assert.deepEqual(first, second);
  assert.ok(first.length >= 4);
  for (let i = 0; i < first.length - 1; i++) {
    const from = first[i];
    const to = first[i + 1];
    const allowed =
      (from === "a" && (to === "b" || to === "c")) ||
      (from === "b" && to === "a") ||
      (from === "c" && to === "a");
    assert.equal(allowed, true, "invalid weighted transition " + from + " -> " + to);
  }
});

test("loop only uses ordered waypoint transitions", () => {
  const seen = nodeVisits(loopRoute(), 18);
  for (let i = 0; i < seen.length - 1; i++) {
    const from = seen[i];
    const to = seen[i + 1];
    const allowed =
      (from === "a" && to === "b") || (from === "b" && to === "c") || (from === "c" && to === "a");
    assert.equal(allowed, true, "invalid loop transition " + from + " -> " + to);
  }
});

test("waypoints outside maxDistanceFromHome are never selected", () => {
  const route: NpcRouteContent = {
    id: "route.oob",
    routeType: "loop",
    speed: 80,
    maxDistanceFromHome: 10,
    dwellMin: 0,
    dwellMax: 0,
    waypoints: [
      { id: "home", x: 0, y: 0 },
      { id: "far", x: 400, y: 0 },
    ],
  };
  const npc = createNpcRuntimeInstance({
    npcId: "npc.bound",
    x: 0,
    y: 0,
    zoneId: "zone.test_npc_move",
    definition: npcDef("npc.bound", route.id),
    defaultInteractionRange: 48,
  });
  for (let tick = 0; tick <= 30; tick++) {
    tickNpcMovement([npc], { [route.id]: route }, tick, TICK_RATE);
  }
  assert.ok(Math.hypot(npc.x, npc.y) <= 10 + 0.0001);
  assert.notEqual(npc.movement?.currentNodeId, "far");
  assert.notEqual(npc.movement?.nextNodeId, "far");
});

test("dwell waits the authored duration before the next segment", () => {
  const route: NpcRouteContent = {
    id: "route.dwell",
    routeType: "loop",
    speed: 1000,
    maxDistanceFromHome: 400,
    dwellMin: 1,
    dwellMax: 1,
    waypoints: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
    ],
  };
  const npc = createNpcRuntimeInstance({
    npcId: "npc.dwell",
    x: 0,
    y: 0,
    zoneId: "zone.test_npc_move",
    definition: npcDef("npc.dwell", route.id),
    defaultInteractionRange: 48,
  });
  const idleTicks: number[] = [];
  for (let tick = 0; tick <= 25; tick++) {
    tickNpcMovement([npc], { [route.id]: route }, tick, TICK_RATE);
    if (npc.movement?.phase === "idle" && npc.movement.currentNodeId === "a") {
      idleTicks.push(tick);
    }
  }
  assert.ok(idleTicks.length >= TICK_RATE);
  assert.equal(idleTicks[idleTicks.length - 1] - idleTicks[0] + 1 >= TICK_RATE, true);
});

test("movement revision changes on new plans and not every mid-segment tick", () => {
  const route: NpcRouteContent = {
    id: "route.rev",
    routeType: "loop",
    speed: 10,
    maxDistanceFromHome: 400,
    dwellMin: 0,
    dwellMax: 0,
    waypoints: [
      { id: "a", x: 100, y: 0 },
      { id: "b", x: 200, y: 0 },
    ],
  };
  const npc = createNpcRuntimeInstance({
    npcId: "npc.rev",
    x: 0,
    y: 0,
    zoneId: "zone.test_npc_move",
    definition: npcDef("npc.rev", route.id),
    defaultInteractionRange: 48,
  });
  tickNpcMovement([npc], { [route.id]: route }, 1, TICK_RATE);
  const first = npc.movement?.revision;
  assert.ok(first !== undefined && first > 1);
  tickNpcMovement([npc], { [route.id]: route }, 2, TICK_RATE);
  tickNpcMovement([npc], { [route.id]: route }, 3, TICK_RATE);
  assert.equal(npc.movement?.revision, first);
  assert.equal(npc.movement?.phase, "moving");
});

test("old movement plans are rejected", () => {
  assert.equal(acceptNpcMovementPlan(5, 6), true);
  assert.equal(acceptNpcMovementPlan(5, 5), false);
  assert.equal(acceptNpcMovementPlan(5, 4), false);
});

test("two consumers interpolate the same pose from a plan", () => {
  const route: NpcRouteContent = {
    id: "route.sync",
    routeType: "loop",
    speed: 20,
    maxDistanceFromHome: 400,
    dwellMin: 0,
    dwellMax: 0,
    waypoints: [
      { id: "a", x: 100, y: 0 },
      { id: "b", x: 0, y: 0 },
    ],
  };
  const npc = createNpcRuntimeInstance({
    npcId: "npc.sync",
    x: 0,
    y: 0,
    zoneId: "zone.test_npc_move",
    definition: npcDef("npc.sync", route.id),
    defaultInteractionRange: 48,
  });
  tickNpcMovement([npc], { [route.id]: route }, 1, TICK_RATE);
  assert.equal(npc.movement?.phase, "moving");
  const plan = publicNpc(npc).movement;
  const tick = 1 + (npc.movement!.endTick - npc.movement!.startTick) / 2;
  const alice = interpolateNpcPose(plan, tick);
  const bob = interpolateNpcPose(plan, tick);
  assert.deepEqual(alice, bob);
  assert.ok(Math.abs(alice.x - npc.homeX) > 1);
});

test("late join full-state pose matches the current interpolated plan", () => {
  let state = addPlayer(walkerZone({
    id: "route.late",
    routeType: "loop",
    speed: 10,
    maxDistanceFromHome: 400,
    dwellMin: 0,
    dwellMax: 0,
    waypoints: [
      { id: "a", x: 100, y: 0 },
      { id: "b", x: 200, y: 0 },
    ],
  }), playerAt("user-alice", "Alice", 0, 80));
  for (let tick = 1; tick <= 21; tick++) {
    state = applyMatchLoop(state, tick, contentHash, []).state;
  }
  const npc = state.npcs[0];
  const body = JSON.parse(buildFullState(state, 21, "user-alice")) as {
    npcs: Array<{ x: number; y: number; movement: { revision: number; rngState?: number; startX: number; endX: number } }>;
  };
  assert.equal(body.npcs.length, 1);
  assert.equal(body.npcs[0].movement.rngState, undefined);
  const pose = interpolateNpcPose(body.npcs[0].movement as never, 21);
  assert.ok(Math.abs(pose.x - npc.x) < 0.0001);
  assert.ok(Math.abs(pose.y - npc.y) < 0.0001);
  assert.ok(Math.abs(npc.x - 0) > 1);
});

test("SNAPSHOT omits NPC plans unless the revision changed", () => {
  let state = addPlayer(walkerZone({
    id: "route.snap",
    routeType: "loop",
    speed: 10,
    maxDistanceFromHome: 400,
    dwellMin: 0,
    dwellMax: 0,
    waypoints: [
      { id: "a", x: 100, y: 0 },
      { id: "b", x: 200, y: 0 },
    ],
  }), playerAt("user-alice", "Alice", 0, 80));
  const start = applyMatchLoop(state, 1, contentHash, []);
  const first = snapshotBody(start);
  assert.ok(Array.isArray(first.npcs));
  state = start.state;
  const mid = applyMatchLoop(state, 2, contentHash, []);
  const second = snapshotBody(mid);
  assert.equal(Object.prototype.hasOwnProperty.call(second, "npcs"), false);
});

test("production starter NPCs stay on the stationary route and skip snapshot NPC traffic", () => {
  let state = addPlayer(starterZone(), playerAt("user-alice", "Alice", 400, 400));
  const elderHome = content.zones["zone.starter"].npcs.find((row) => row.npcId === "npc.elder") as { x: number; y: number };
  for (let tick = 1; tick <= 8; tick++) {
    const step = applyMatchLoop(state, tick, contentHash, []);
    const snap = snapshotBody(step);
    assert.equal(Object.prototype.hasOwnProperty.call(snap, "npcs"), false);
    state = step.state;
  }
  const elder = state.npcs.find((npc) => npc.npcId === "npc.elder");
  assert.ok(elder);
  assert.equal(elder.x, elderHome.x);
  assert.equal(elder.y, elderHome.y);
  const full = JSON.parse(buildFullState(state, 8, "user-alice")) as {
    npcs: Array<{ npcId: string; movement: { phase: string; rngState?: number } }>;
  };
  const published = full.npcs.find((row) => row.npcId === "npc.elder");
  assert.ok(published);
  assert.equal(published.movement.phase, "idle");
  assert.equal(published.movement.rngState, undefined);
});

test("NPC movement is not persisted and resets on a new match", () => {
  let state = addPlayer(walkerZone(loopRoute()), playerAt("user-alice", "Alice", 0, 80));
  for (let tick = 1; tick <= 6; tick++) {
    const step = applyMatchLoop(state, tick, contentHash, []);
    assert.equal(step.persistCheckpoints.length, 0);
    assert.equal(step.persistQuests.length, 0);
    assert.equal(step.persistInventories.length, 0);
    assert.equal(step.persistOpCount, 0);
    state = step.state;
  }
  assert.ok(state.npcs[0].movement !== undefined);
  const fresh = walkerZone(loopRoute());
  assert.equal(fresh.npcs[0].x, 0);
  assert.equal(fresh.npcs[0].y, 0);
  assert.equal(fresh.npcs[0].movement?.currentNodeId, "");
});

test("cloning a match copies NPC movement instead of sharing it", () => {
  const state = walkerZone(loopRoute());
  tickNpcMovement(state.npcs, state.npcRoutesById, 1, TICK_RATE);
  const cloned = cloneStarterZoneState(state);
  tickNpcMovement(cloned.npcs, cloned.npcRoutesById, 8, TICK_RATE);
  assert.notEqual(cloned.npcs[0].movement?.revision, state.npcs[0].movement?.revision);
  assert.equal(cloned.npcs[0].id, "npc.walker");
});

test("pause and resume freeze pose until the last interaction session closes", () => {
  const route = loopRoute();
  const npc = createNpcRuntimeInstance({
    npcId: "npc.pause",
    x: 0,
    y: 0,
    zoneId: "zone.test_npc_move",
    definition: npcDef("npc.pause", route.id),
    defaultInteractionRange: 48,
  });
  tickNpcMovement([npc], { [route.id]: route }, 1, TICK_RATE);
  tickNpcMovement([npc], { [route.id]: route }, 2, TICK_RATE);
  const x = npc.x;
  const y = npc.y;
  pauseNpcMovement(npc, 2);
  assert.equal(npc.movement?.phase, "paused");
  tickNpcMovement([npc], { [route.id]: route }, 10, TICK_RATE);
  assert.equal(npc.x, x);
  assert.equal(npc.y, y);
  resumeNpcMovement(npc, route, 11, TICK_RATE);
  assert.notEqual(npc.movement?.phase, "paused");
  const loopSrc = readFileSync(join(process.cwd(), "src/domain/match_loop.ts"), "utf8");
  assert.equal(loopSrc.includes("refreshNpcPauses"), true);
  const persistSrc = readFileSync(join(process.cwd(), "src/domain/persistence.ts"), "utf8");
  assert.equal(persistSrc.includes("refreshNpcPauses"), true);
  const moveSrc = readFileSync(join(process.cwd(), "src/domain/npc_movement.ts"), "utf8");
  assert.equal(moveSrc.includes("export function pauseNpcMovement"), true);
  assert.equal(moveSrc.includes("export function resumeNpcMovement"), true);
});

test("INTERACT pauses cosmetic NPC movement and broadcasts the paused plan", () => {
  const route = loopRoute();
  const state = addPlayer(walkerZone(route), playerAt("user-alice", "Alice", 0, 0));
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.walker", requestId: "interact-npc-move-1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(result.state.npcs[0].movement?.phase, "paused");
  const snap = snapshotBody(result);
  const npcs = snap.npcs as Array<{ movement?: { phase?: string } }>;
  assert.ok(Array.isArray(npcs));
  assert.equal(npcs[0].movement?.phase, "paused");
});

test("closing the final session resumes NPC route movement", () => {
  const route = loopRoute();
  let state = addPlayer(walkerZone(route), playerAt("user-alice", "Alice", 0, 0));
  state = addPlayer(state, playerAt("user-bob", "Bob", 0, 0));
  const aliceOpen = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.walker", requestId: "interact-pause-a1" }),
      userId: "user-alice",
    },
  ]);
  const bobOpen = applyMatchLoop(aliceOpen.state, 2, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.walker", requestId: "interact-pause-b1" }),
      userId: "user-bob",
    },
  ]);
  assert.equal(bobOpen.state.npcs[0].movement?.phase, "paused");
  const aliceSession = bobOpen.state.players["user-alice"].interactionSession;
  const bobSession = bobOpen.state.players["user-bob"].interactionSession;
  assert.ok(aliceSession);
  assert.ok(bobSession);
  const aliceClose = applyMatchLoop(bobOpen.state, 3, contentHash, [
    {
      opcode: ClientOpcode.INTERACTION_CLOSE,
      raw: envelope({
        interactionSessionId: aliceSession.sessionId,
        npcInstanceId: "npc.walker",
        requestId: "interact-close-a1",
      }),
      userId: "user-alice",
    },
  ]);
  assert.equal(aliceClose.state.npcs[0].movement?.phase, "paused");
  const bobClose = applyMatchLoop(aliceClose.state, 4, contentHash, [
    {
      opcode: ClientOpcode.INTERACTION_CLOSE,
      raw: envelope({
        interactionSessionId: bobSession.sessionId,
        npcInstanceId: "npc.walker",
        requestId: "interact-close-b1",
      }),
      userId: "user-bob",
    },
  ]);
  assert.notEqual(bobClose.state.npcs[0].movement?.phase, "paused");
});

test("moving NPCs do not block players or join combat", () => {
  const route = loopRoute();
  let state = addPlayer(walkerZone(route, 0, 0), playerAt("user-alice", "Alice", 0, 0));
  const enemyCount = state.enemies.length;
  const startX = state.players["user-alice"].x;
  for (let tick = 1; tick <= 8; tick++) {
    const step = applyMatchLoop(state, tick, contentHash, [
      {
        opcode: ClientOpcode.INPUT,
        raw: envelope({ seq: tick, axisX: 1, axisY: 0 }),
        userId: "user-alice",
      },
    ]);
    state = step.state;
  }
  assert.ok(state.players["user-alice"].x > startX);
  assert.equal(state.enemies.length, enemyCount);
  assert.equal(state.players["user-alice"].health, content.player.maxHealth);
  assert.equal("health" in state.npcs[0], false);
});

test("ordinary SNAPSHOT builder omits NPC plans", () => {
  const state = addPlayer(starterZone(), playerAt("user-alice", "Alice", 400, 400));
  const snap = JSON.parse(buildSnapshot(state, 3)) as { npcs?: unknown };
  assert.equal(snap.npcs, undefined);
  const withPlans = JSON.parse(buildSnapshot(state, 3, true)) as { npcs: Array<{ movement: { revision: number } }> };
  assert.ok(withPlans.npcs.length > 0);
  assert.ok(withPlans.npcs[0].movement.revision >= 1);
});
