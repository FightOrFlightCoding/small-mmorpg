import { hashSeed } from "./loot_table";
import type { NpcMovePhase, NpcMovementRuntime, NpcRuntimeInstance } from "./npc";

export type { NpcMovePhase, NpcMovementRuntime };

export interface NpcRouteWaypoint {
  id: string;
  x: number;
  y: number;
  dwellMin?: number;
  dwellMax?: number;
}

export interface NpcRouteEdge {
  from: string;
  to: string;
  weight: number;
}

export interface NpcRouteContent {
  id: string;
  routeType: "stationary" | "loop" | "ping_pong" | "weighted_route_graph";
  speed: number;
  speedMin?: number;
  maxDistanceFromHome: number;
  dwellMin: number;
  dwellMax: number;
  waypoints?: ReadonlyArray<NpcRouteWaypoint>;
  edges?: ReadonlyArray<NpcRouteEdge>;
}

export interface NpcMovementPlan {
  currentNodeId: string;
  nextNodeId: string;
  revision: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startTick: number;
  endTick: number;
  idleUntilTick: number;
  phase: NpcMovePhase;
}

export interface NpcPose {
  x: number;
  y: number;
}

export function emptyNpcMovement(x: number, y: number, seedText: string): NpcMovementRuntime {
  return {
    currentNodeId: "",
    nextNodeId: "",
    revision: 1,
    startX: x,
    startY: y,
    endX: x,
    endY: y,
    startTick: 0,
    endTick: 0,
    idleUntilTick: 0,
    rngState: hashSeed(seedText === "" ? "npc" : seedText) || 1,
    phase: "idle",
    pingPongDir: 1,
  };
}

export function cloneNpcMovement(source: NpcMovementRuntime | undefined, x: number, y: number, seedText: string): NpcMovementRuntime {
  const fallback = emptyNpcMovement(x, y, seedText);
  if (source === undefined) {
    return fallback;
  }
  return {
    currentNodeId: source.currentNodeId,
    nextNodeId: source.nextNodeId,
    revision: source.revision,
    startX: source.startX,
    startY: source.startY,
    endX: source.endX,
    endY: source.endY,
    startTick: source.startTick,
    endTick: source.endTick,
    idleUntilTick: source.idleUntilTick,
    rngState: source.rngState,
    phase: source.phase,
    pingPongDir: source.pingPongDir === -1 ? -1 : 1,
  };
}

export function publicNpcMovementPlan(npc: NpcRuntimeInstance): NpcMovementPlan {
  const movement = ensureMovement(npc);
  return {
    currentNodeId: movement.currentNodeId,
    nextNodeId: movement.nextNodeId,
    revision: movement.revision,
    startX: movement.startX,
    startY: movement.startY,
    endX: movement.endX,
    endY: movement.endY,
    startTick: movement.startTick,
    endTick: movement.endTick,
    idleUntilTick: movement.idleUntilTick,
    phase: movement.phase,
  };
}

export function interpolateNpcPose(plan: NpcMovementPlan | NpcMovementRuntime, tick: number): NpcPose {
  if (plan.phase === "moving" && plan.endTick > plan.startTick && tick < plan.endTick) {
    if (tick <= plan.startTick) {
      return { x: plan.startX, y: plan.startY };
    }
    const t = (tick - plan.startTick) / (plan.endTick - plan.startTick);
    return {
      x: plan.startX + (plan.endX - plan.startX) * t,
      y: plan.startY + (plan.endY - plan.startY) * t,
    };
  }
  if (plan.phase === "moving" && tick >= plan.endTick) {
    return { x: plan.endX, y: plan.endY };
  }
  return { x: plan.startX, y: plan.startY };
}

export function acceptNpcMovementPlan(currentRevision: number, incomingRevision: number): boolean {
  return incomingRevision > currentRevision;
}

export function npcRoutesFromContent(routes: {
  [id: string]: {
    id: string;
    routeType: NpcRouteContent["routeType"];
    speed: number;
    speedMin?: number;
    maxDistanceFromHome: number;
    dwellMin: number;
    dwellMax: number;
    waypoints?: ReadonlyArray<NpcRouteWaypoint>;
    edges?: ReadonlyArray<NpcRouteEdge>;
  };
}): { [id: string]: NpcRouteContent } {
  const map: { [id: string]: NpcRouteContent } = {};
  const ids = Object.keys(routes);
  for (let i = 0; i < ids.length; i++) {
    const entry = routes[ids[i]];
    map[ids[i]] = {
      id: entry.id,
      routeType: entry.routeType,
      speed: entry.speed,
      speedMin: entry.speedMin,
      maxDistanceFromHome: entry.maxDistanceFromHome,
      dwellMin: entry.dwellMin,
      dwellMax: entry.dwellMax,
      waypoints: entry.waypoints !== undefined ? entry.waypoints.slice() : undefined,
      edges: entry.edges !== undefined ? entry.edges.slice() : undefined,
    };
  }
  return map;
}

export function initNpcMovement(
  npc: NpcRuntimeInstance,
  route: NpcRouteContent | undefined,
  tick: number,
  tickRate: number,
  seedText?: string,
): void {
  const seed = seedText !== undefined ? seedText : npc.npcId + ":" + npc.routeId;
  npc.movement = emptyNpcMovement(npc.homeX, npc.homeY, seed);
  const movement = npc.movement;
  movement.startX = npc.homeX;
  movement.startY = npc.homeY;
  movement.endX = npc.homeX;
  movement.endY = npc.homeY;
  movement.startTick = tick;
  movement.endTick = tick;
  movement.phase = "idle";
  movement.currentNodeId = "";
  movement.nextNodeId = "";
  if (route === undefined || route.routeType === "stationary") {
    movement.idleUntilTick = tick;
    applyPose(npc, { x: npc.homeX, y: npc.homeY });
    return;
  }
  const delay = rollDwellTicks(route, undefined, movement, tickRate);
  movement.idleUntilTick = tick + delay;
  applyPose(npc, { x: npc.homeX, y: npc.homeY });
}

export function publicNpc(npc: NpcRuntimeInstance): {
  id: string;
  npcId: string;
  x: number;
  y: number;
  zoneId: string;
  interactionRange: number;
  dialogueId: string;
  visualId: string;
  displayName: string;
  displayNameKey: string;
  homeX: number;
  homeY: number;
  routeId: string;
  movement: NpcMovementPlan;
} {
  return {
    id: npc.id,
    npcId: npc.npcId,
    x: npc.x,
    y: npc.y,
    zoneId: npc.zoneId,
    interactionRange: npc.interactionRange,
    dialogueId: npc.dialogueId,
    visualId: npc.visualId,
    displayName: npc.displayName,
    displayNameKey: npc.displayNameKey,
    homeX: npc.homeX,
    homeY: npc.homeY,
    routeId: npc.routeId,
    movement: publicNpcMovementPlan(npc),
  };
}

export function publicNpcs(npcs: ReadonlyArray<NpcRuntimeInstance>): ReturnType<typeof publicNpc>[] {
  const list: ReturnType<typeof publicNpc>[] = [];
  for (let i = 0; i < npcs.length; i++) {
    list.push(publicNpc(npcs[i]));
  }
  return list;
}

export function cloneNpcRuntimeInstance(npc: NpcRuntimeInstance): NpcRuntimeInstance {
  return {
    id: npc.id,
    npcId: npc.npcId,
    x: npc.x,
    y: npc.y,
    zoneId: npc.zoneId,
    interactionRange: npc.interactionRange,
    dialogueId: npc.dialogueId,
    visualId: npc.visualId,
    displayName: npc.displayName,
    displayNameKey: npc.displayNameKey,
    homeX: npc.homeX,
    homeY: npc.homeY,
    routeId: npc.routeId,
    movement: cloneNpcMovement(npc.movement, npc.x, npc.y, npc.npcId + ":" + npc.routeId),
  };
}

export function cloneNpcs(npcs: ReadonlyArray<NpcRuntimeInstance> | undefined): NpcRuntimeInstance[] {
  const list: NpcRuntimeInstance[] = [];
  if (!Array.isArray(npcs)) {
    return list;
  }
  for (let i = 0; i < npcs.length; i++) {
    list.push(cloneNpcRuntimeInstance(npcs[i]));
  }
  return list;
}

export function tickNpcMovement(
  npcs: NpcRuntimeInstance[],
  routes: { [id: string]: NpcRouteContent } | undefined,
  tick: number,
  tickRate: number,
): boolean {
  let dirty = false;
  const catalog = routes !== undefined ? routes : {};
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    const before = npc.movement !== undefined ? npc.movement.revision : 0;
    tickOneNpc(npc, catalog[npc.routeId], tick, tickRate);
    if (npc.movement !== undefined && npc.movement.revision !== before) {
      dirty = true;
    }
  }
  return dirty;
}

export function pauseNpcMovement(npc: NpcRuntimeInstance, tick: number): void {
  const movement = ensureMovement(npc);
  const pose = interpolateNpcPose(movement, tick);
  movement.phase = "paused";
  movement.startX = pose.x;
  movement.startY = pose.y;
  movement.endX = pose.x;
  movement.endY = pose.y;
  movement.startTick = tick;
  movement.endTick = tick;
  movement.idleUntilTick = tick;
  movement.nextNodeId = movement.currentNodeId;
  movement.revision = movement.revision + 1;
  applyPose(npc, pose);
}

export function resumeNpcMovement(
  npc: NpcRuntimeInstance,
  route: NpcRouteContent | undefined,
  tick: number,
  tickRate: number,
): void {
  const movement = ensureMovement(npc);
  if (movement.phase !== "paused") {
    return;
  }
  movement.phase = "idle";
  movement.idleUntilTick = tick;
  movement.revision = movement.revision + 1;
  applyPose(npc, { x: movement.startX, y: movement.startY });
  if (route !== undefined && route.routeType !== "stationary") {
    beginNextSegment(npc, route, tick, tickRate);
  }
}

function tickOneNpc(
  npc: NpcRuntimeInstance,
  route: NpcRouteContent | undefined,
  tick: number,
  tickRate: number,
): void {
  if (npc.movement === undefined) {
    initNpcMovement(npc, route, tick, tickRate);
  }
  const movement = npc.movement;
  if (movement === undefined) {
    return;
  }
  if (movement.phase === "paused") {
    applyPose(npc, interpolateNpcPose(movement, tick));
    return;
  }
  for (let step = 0; step < 4; step++) {
    if (movement.phase === "moving" && tick >= movement.endTick) {
      arrive(npc, route, tick, tickRate);
      continue;
    }
    if (movement.phase === "idle" && tick >= movement.idleUntilTick) {
      if (!beginNextSegment(npc, route, tick, tickRate)) {
        break;
      }
      continue;
    }
    break;
  }
  applyPose(npc, interpolateNpcPose(movement, tick));
}

function arrive(npc: NpcRuntimeInstance, route: NpcRouteContent | undefined, tick: number, tickRate: number): void {
  const movement = ensureMovement(npc);
  movement.currentNodeId = movement.nextNodeId;
  movement.startX = movement.endX;
  movement.startY = movement.endY;
  movement.startTick = tick;
  movement.endTick = tick;
  movement.phase = "idle";
  const waypoint = findWaypoint(route, movement.currentNodeId);
  movement.idleUntilTick = tick + rollDwellTicks(route, waypoint, movement, tickRate);
  movement.revision = movement.revision + 1;
}

function beginNextSegment(
  npc: NpcRuntimeInstance,
  route: NpcRouteContent | undefined,
  tick: number,
  tickRate: number,
): boolean {
  const movement = ensureMovement(npc);
  if (route === undefined || route.routeType === "stationary") {
    movement.phase = "idle";
    movement.idleUntilTick = tick + 1;
    applyPose(npc, { x: npc.homeX, y: npc.homeY });
    return false;
  }
  const picked = pickNextNode(route, movement);
  if (picked === null) {
    movement.phase = "idle";
    movement.idleUntilTick = tick + 1;
    return false;
  }
  const world = waypointWorld(npc, picked.waypoint);
  if (!withinHomeBounds(route, picked.waypoint)) {
    movement.phase = "idle";
    movement.idleUntilTick = tick + 1;
    return false;
  }
  const start = interpolateNpcPose(movement, tick);
  const speed = rollSpeed(route, movement);
  const distance = Math.sqrt((world.x - start.x) * (world.x - start.x) + (world.y - start.y) * (world.y - start.y));
  let travelTicks = 0;
  if (distance > 0.0001 && speed > 0) {
    travelTicks = Math.max(1, Math.round((distance / speed) * tickRate));
  }
  movement.phase = travelTicks > 0 ? "moving" : "idle";
  movement.nextNodeId = picked.waypoint.id;
  movement.pingPongDir = picked.pingPongDir;
  movement.startX = start.x;
  movement.startY = start.y;
  movement.endX = world.x;
  movement.endY = world.y;
  movement.startTick = tick;
  movement.endTick = tick + travelTicks;
  if (travelTicks === 0) {
    movement.currentNodeId = picked.waypoint.id;
    movement.idleUntilTick = tick + rollDwellTicks(route, picked.waypoint, movement, tickRate);
  }
  movement.revision = movement.revision + 1;
  return true;
}

function pickNextNode(
  route: NpcRouteContent,
  movement: NpcMovementRuntime,
): { waypoint: NpcRouteWaypoint; pingPongDir: number } | null {
  const waypoints = route.waypoints !== undefined ? route.waypoints : [];
  if (waypoints.length === 0) {
    return null;
  }
  const current = movement.currentNodeId;
  if (route.routeType === "loop") {
    const index = waypointIndex(waypoints, current);
    const next = index < 0 ? waypoints[0] : waypoints[(index + 1) % waypoints.length];
    return inBoundsOrNull(route, next, movement.pingPongDir);
  }
  if (route.routeType === "ping_pong") {
    const index = waypointIndex(waypoints, current);
    if (index < 0) {
      return inBoundsOrNull(route, waypoints[0], 1);
    }
    let dir = movement.pingPongDir === -1 ? -1 : 1;
    let nextIndex = index + dir;
    if (nextIndex >= waypoints.length || nextIndex < 0) {
      dir = -dir;
      nextIndex = index + dir;
    }
    if (nextIndex < 0 || nextIndex >= waypoints.length) {
      return null;
    }
    return inBoundsOrNull(route, waypoints[nextIndex], dir);
  }
  if (route.routeType === "weighted_route_graph") {
    if (current === "") {
      return inBoundsOrNull(route, waypoints[0], movement.pingPongDir);
    }
    const edges = outgoingEdges(route, current);
    const chosen = pickWeightedEdge(edges, movement);
    if (chosen === null) {
      return null;
    }
    const waypoint = findWaypoint(route, chosen.to);
    if (waypoint === undefined) {
      return null;
    }
    return inBoundsOrNull(route, waypoint, movement.pingPongDir);
  }
  return null;
}

function inBoundsOrNull(
  route: NpcRouteContent,
  waypoint: NpcRouteWaypoint,
  pingPongDir: number,
): { waypoint: NpcRouteWaypoint; pingPongDir: number } | null {
  if (!withinHomeBounds(route, waypoint)) {
    return null;
  }
  return { waypoint: waypoint, pingPongDir: pingPongDir };
}

function outgoingEdges(route: NpcRouteContent, from: string): NpcRouteEdge[] {
  const edges = route.edges !== undefined ? route.edges : [];
  const out: NpcRouteEdge[] = [];
  for (let i = 0; i < edges.length; i++) {
    if (edges[i].from === from && edges[i].weight > 0) {
      const waypoint = findWaypoint(route, edges[i].to);
      if (waypoint !== undefined && withinHomeBounds(route, waypoint)) {
        out.push(edges[i]);
      }
    }
  }
  return out;
}

function pickWeightedEdge(edges: NpcRouteEdge[], movement: NpcMovementRuntime): NpcRouteEdge | null {
  if (edges.length === 0) {
    return null;
  }
  let total = 0;
  for (let i = 0; i < edges.length; i++) {
    total += edges[i].weight;
  }
  if (!(total > 0)) {
    return edges[0];
  }
  const roll = nextUnit(movement) * total;
  let cursor = roll;
  for (let i = 0; i < edges.length; i++) {
    cursor -= edges[i].weight;
    if (cursor < 0) {
      return edges[i];
    }
  }
  return edges[edges.length - 1];
}

function rollSpeed(route: NpcRouteContent, movement: NpcMovementRuntime): number {
  const max = route.speed;
  const min = route.speedMin !== undefined && route.speedMin > 0 ? Math.min(route.speedMin, max) : max;
  if (!(max > 0)) {
    return 0;
  }
  if (min >= max) {
    return max;
  }
  return min + nextUnit(movement) * (max - min);
}

function rollDwellTicks(
  route: NpcRouteContent | undefined,
  waypoint: NpcRouteWaypoint | undefined,
  movement: NpcMovementRuntime,
  tickRate: number,
): number {
  if (route === undefined) {
    return 0;
  }
  const min = waypoint !== undefined && waypoint.dwellMin !== undefined ? waypoint.dwellMin : route.dwellMin;
  const max = waypoint !== undefined && waypoint.dwellMax !== undefined ? waypoint.dwellMax : route.dwellMax;
  const lo = min < 0 ? 0 : min;
  const hi = max < lo ? lo : max;
  const seconds = lo >= hi ? lo : lo + nextUnit(movement) * (hi - lo);
  if (!(seconds > 0)) {
    return 0;
  }
  return Math.max(0, Math.round(seconds * tickRate));
}

function waypointWorld(npc: NpcRuntimeInstance, waypoint: NpcRouteWaypoint): NpcPose {
  return { x: npc.homeX + waypoint.x, y: npc.homeY + waypoint.y };
}

function withinHomeBounds(route: NpcRouteContent, waypoint: NpcRouteWaypoint): boolean {
  return Math.sqrt(waypoint.x * waypoint.x + waypoint.y * waypoint.y) <= route.maxDistanceFromHome + 0.0001;
}

function findWaypoint(route: NpcRouteContent | undefined, id: string): NpcRouteWaypoint | undefined {
  if (route === undefined || id === "") {
    return undefined;
  }
  const waypoints = route.waypoints !== undefined ? route.waypoints : [];
  for (let i = 0; i < waypoints.length; i++) {
    if (waypoints[i].id === id) {
      return waypoints[i];
    }
  }
  return undefined;
}

function waypointIndex(waypoints: ReadonlyArray<NpcRouteWaypoint>, id: string): number {
  for (let i = 0; i < waypoints.length; i++) {
    if (waypoints[i].id === id) {
      return i;
    }
  }
  return -1;
}

function ensureMovement(npc: NpcRuntimeInstance): NpcMovementRuntime {
  if (npc.movement === undefined) {
    npc.movement = emptyNpcMovement(npc.x, npc.y, npc.npcId);
  }
  return npc.movement;
}

function applyPose(npc: NpcRuntimeInstance, pose: NpcPose): void {
  npc.x = pose.x;
  npc.y = pose.y;
}

function nextUnit(movement: NpcMovementRuntime): number {
  const state = movement.rngState === 0 ? 1 : movement.rngState >>> 0;
  const next = (mul32(state, 1664525) + 1013904223) >>> 0;
  movement.rngState = next;
  return next / 4294967296;
}

function mul32(a: number, b: number): number {
  return (a * b) >>> 0;
}
