import { findEnemy } from "./combat";
import { dict } from "./maps";
import type { MatchEnemy, MatchPlayer, StarterZoneState } from "./match_state";
import { distance } from "./movement";

export type TargetMode =
  | "self"
  | "hostile_current"
  | "friendly_current"
  | "entity"
  | "ground_point"
  | "area_source"
  | "area_point";

export interface TargetQuery {
  mode: TargetMode;
  entityId?: string;
  x?: number;
  y?: number;
  radius?: number;
}

export interface ResolvedEntity {
  id: string;
  kind: "player" | "enemy";
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  alive: boolean;
}

export interface TargetResolution {
  ok: boolean;
  code: string;
  primary: ResolvedEntity | null;
  pointX: number;
  pointY: number;
  entities: ResolvedEntity[];
}

export interface SetTargetDecision {
  ok: boolean;
  code: string;
  replay: boolean;
}

export function findMatchEntity(state: StarterZoneState, entityId: string): ResolvedEntity | null {
  const wanted = String(entityId);
  if (wanted.length === 0) {
    return null;
  }
  const player = dict(state.players)[wanted];
  if (player !== undefined) {
    return playerAsResolved(player);
  }
  const enemy = findEnemy(state.enemies, wanted);
  if (enemy === null) {
    return null;
  }
  return enemyAsResolved(enemy);
}

export function playerAsResolved(player: MatchPlayer): ResolvedEntity {
  return {
    id: player.userId,
    kind: "player",
    x: player.x,
    y: player.y,
    health: player.health,
    maxHealth: player.maxHealth,
    alive: player.health > 0,
  };
}

export function enemyAsResolved(enemy: MatchEnemy): ResolvedEntity {
  return {
    id: enemy.id,
    kind: "enemy",
    x: enemy.x,
    y: enemy.y,
    health: enemy.health,
    maxHealth: enemy.maxHealth,
    alive: enemy.health > 0 && enemy.aiState !== "dead",
  };
}

export function entitiesInRadius(
  state: StarterZoneState,
  originX: number,
  originY: number,
  radius: number,
): ResolvedEntity[] {
  const list: ResolvedEntity[] = [];
  const playerIds = Object.keys(dict(state.players));
  playerIds.sort();
  for (let i = 0; i < playerIds.length; i++) {
    const player = state.players[playerIds[i]];
    if (player === undefined || player.health <= 0) {
      continue;
    }
    if (distance(originX, originY, player.x, player.y) <= radius) {
      list.push(playerAsResolved(player));
    }
  }
  for (let e = 0; e < state.enemies.length; e++) {
    const enemy = state.enemies[e];
    if (enemy.health <= 0 || enemy.aiState === "dead") {
      continue;
    }
    if (distance(originX, originY, enemy.x, enemy.y) <= radius) {
      list.push(enemyAsResolved(enemy));
    }
  }
  return list;
}

export function resolveTargetQuery(
  state: StarterZoneState,
  actorUserId: string,
  query: TargetQuery,
): TargetResolution {
  const actor = dict(state.players)[actorUserId];
  if (actor === undefined) {
    return failResolution("player_missing");
  }
  const mode = String(query.mode);
  if (mode === "self") {
    const self = playerAsResolved(actor);
    return {
      ok: true,
      code: "ok",
      primary: self,
      pointX: actor.x,
      pointY: actor.y,
      entities: [self],
    };
  }
  if (mode === "hostile_current") {
    return resolveStoredTarget(state, actor, actor.hostileTargetId !== undefined ? actor.hostileTargetId : "");
  }
  if (mode === "friendly_current") {
    return resolveStoredTarget(state, actor, actor.friendlyTargetId !== undefined ? actor.friendlyTargetId : "");
  }
  if (mode === "ground_point") {
    if (!finiteNumber(query.x) || !finiteNumber(query.y)) {
      return failResolution("invalid_target");
    }
    const x = query.x as number;
    const y = query.y as number;
    return { ok: true, code: "ok", primary: null, pointX: x, pointY: y, entities: [] };
  }
  if (mode === "area_source") {
    if (!finiteNumber(query.radius) || (query.radius as number) < 0) {
      return failResolution("invalid_target");
    }
    const entities = entitiesInRadius(state, actor.x, actor.y, query.radius as number);
    return {
      ok: true,
      code: "ok",
      primary: playerAsResolved(actor),
      pointX: actor.x,
      pointY: actor.y,
      entities: entities,
    };
  }
  if (mode === "area_point") {
    if (!finiteNumber(query.x) || !finiteNumber(query.y) || !finiteNumber(query.radius) || (query.radius as number) < 0) {
      return failResolution("invalid_target");
    }
    const x = query.x as number;
    const y = query.y as number;
    const entities = entitiesInRadius(state, x, y, query.radius as number);
    return { ok: true, code: "ok", primary: null, pointX: x, pointY: y, entities: entities };
  }
  const entityId = query.entityId !== undefined ? String(query.entityId) : "";
  if (entityId.length === 0) {
    return failResolution("invalid_target");
  }
  return resolveStoredTarget(state, actor, entityId);
}

export function applySetTarget(
  state: StarterZoneState,
  player: MatchPlayer | undefined,
  targetId: string,
  intent: string,
  requestId: string,
): SetTargetDecision {
  if (player === undefined) {
    return { ok: false, code: "player_missing", replay: false };
  }
  if (player.lastSetTargetRequestId === requestId && player.lastSetTargetRequestId !== "") {
    return {
      ok: player.lastSetTargetResultOk === true,
      code:
        player.lastSetTargetResultCode !== undefined && player.lastSetTargetResultCode !== ""
          ? player.lastSetTargetResultCode
          : "ok",
      replay: true,
    };
  }
  const wanted = String(targetId);
  if (wanted.length === 0) {
    player.hostileTargetId = "";
    player.friendlyTargetId = "";
    rememberSetTarget(player, requestId, "ok", true);
    return { ok: true, code: "ok", replay: false };
  }
  const entity = findMatchEntity(state, wanted);
  if (entity === null) {
    rememberSetTarget(player, requestId, "invalid_target", false);
    return { ok: false, code: "invalid_target", replay: false };
  }
  if (!entity.alive) {
    rememberSetTarget(player, requestId, "target_dead", false);
    return { ok: false, code: "target_dead", replay: false };
  }
  const relation = classifySetIntent(player.userId, entity);
  const wantedIntent = String(intent);
  if (wantedIntent === "hostile") {
    if (relation !== "hostile") {
      rememberSetTarget(player, requestId, "pvp_disabled", false);
      return { ok: false, code: "pvp_disabled", replay: false };
    }
    player.hostileTargetId = entity.id;
    rememberSetTarget(player, requestId, "ok", true);
    return { ok: true, code: "ok", replay: false };
  }
  if (wantedIntent === "friendly") {
    if (relation === "hostile") {
      rememberSetTarget(player, requestId, "invalid_relation", false);
      return { ok: false, code: "invalid_relation", replay: false };
    }
    player.friendlyTargetId = entity.id;
    rememberSetTarget(player, requestId, "ok", true);
    return { ok: true, code: "ok", replay: false };
  }
  if (wantedIntent.length > 0) {
    rememberSetTarget(player, requestId, "invalid_id", false);
    return { ok: false, code: "invalid_id", replay: false };
  }
  if (relation === "hostile") {
    player.hostileTargetId = entity.id;
  } else {
    player.friendlyTargetId = entity.id;
  }
  rememberSetTarget(player, requestId, "ok", true);
  return { ok: true, code: "ok", replay: false };
}

function classifySetIntent(actorId: string, entity: ResolvedEntity): "self" | "friendly" | "hostile" {
  if (entity.kind === "enemy") {
    return "hostile";
  }
  if (entity.id === actorId) {
    return "self";
  }
  return "friendly";
}

function resolveStoredTarget(state: StarterZoneState, _actor: MatchPlayer, targetId: string): TargetResolution {
  if (String(targetId).length === 0) {
    return failResolution("invalid_target");
  }
  const entity = findMatchEntity(state, targetId);
  if (entity === null) {
    return failResolution("invalid_target");
  }
  if (!entity.alive) {
    return failResolution("target_dead");
  }
  return {
    ok: true,
    code: "ok",
    primary: entity,
    pointX: entity.x,
    pointY: entity.y,
    entities: [entity],
  };
}

function rememberSetTarget(player: MatchPlayer, requestId: string, code: string, ok: boolean): void {
  player.lastSetTargetRequestId = requestId;
  player.lastSetTargetResultCode = code;
  player.lastSetTargetResultOk = ok;
}

function failResolution(code: string): TargetResolution {
  return { ok: false, code: code, primary: null, pointX: 0, pointY: 0, entities: [] };
}

function finiteNumber(value: number | undefined): boolean {
  return typeof value === "number" && isFinite(value);
}
