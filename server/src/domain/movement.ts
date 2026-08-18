export const PLAYER_HALF_EXTENT = 12;
export const SNAPSHOT_RATE_HZ = 10;
export const INPUT_SEND_HZ = 10;

export interface Aabb {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clampAxis(value: number): number {
  if (value < -1) {
    return -1;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function sanitizeAxes(axisX: number, axisY: number): Vec2 {
  const x = clampAxis(axisX);
  const y = clampAxis(axisY);
  const length = Math.sqrt(x * x + y * y);
  if (length > 1) {
    return { x: x / length, y: y / length };
  }
  return { x: x, y: y };
}

export function intendedDelta(axisX: number, axisY: number, moveSpeed: number, dt: number): Vec2 {
  const axes = sanitizeAxes(axisX, axisY);
  return {
    x: axes.x * moveSpeed * dt,
    y: axes.y * moveSpeed * dt,
  };
}

export function playerAabb(x: number, y: number, halfExtent: number): Aabb {
  return {
    x: x - halfExtent,
    y: y - halfExtent,
    width: halfExtent * 2,
    height: halfExtent * 2,
  };
}

export function aabbsOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function overlapsObstacle(x: number, y: number, halfExtent: number, collisions: ReadonlyArray<Aabb>): Aabb | null {
  const hits = collectOverlaps(x, y, halfExtent, collisions);
  if (hits.length === 0) {
    return null;
  }
  return hits[0];
}

function collectOverlaps(
  x: number,
  y: number,
  halfExtent: number,
  collisions: ReadonlyArray<Aabb>,
): Aabb[] {
  const body = playerAabb(x, y, halfExtent);
  const hits: Aabb[] = [];
  for (let i = 0; i < collisions.length; i++) {
    if (aabbsOverlap(body, collisions[i])) {
      hits.push(collisions[i]);
    }
  }
  return hits;
}

function minimumTranslation(body: Aabb, box: Aabb): Vec2 {
  const overlapLeft = body.x + body.width - box.x;
  const overlapRight = box.x + box.width - body.x;
  const overlapTop = body.y + body.height - box.y;
  const overlapBottom = box.y + box.height - body.y;
  const xPush = overlapLeft < overlapRight ? -overlapLeft : overlapRight;
  const yPush = overlapTop < overlapBottom ? -overlapTop : overlapBottom;
  if (Math.abs(xPush) <= Math.abs(yPush)) {
    return { x: xPush, y: 0 };
  }
  return { x: 0, y: yPush };
}

export function depenetrate(
  x: number,
  y: number,
  halfExtent: number,
  collisions: ReadonlyArray<Aabb>,
  walkableBounds: Aabb,
): Vec2 {
  const minX = walkableBounds.x + halfExtent;
  const maxX = walkableBounds.x + walkableBounds.width - halfExtent;
  const minY = walkableBounds.y + halfExtent;
  const maxY = walkableBounds.y + walkableBounds.height - halfExtent;
  let px = clamp(x, minX, maxX);
  let py = clamp(y, minY, maxY);
  for (let iter = 0; iter < 4; iter++) {
    const hit = overlapsObstacle(px, py, halfExtent, collisions);
    if (hit === null) {
      return { x: px, y: py };
    }
    const mtv = minimumTranslation(playerAabb(px, py, halfExtent), hit);
    px = clamp(px + mtv.x, minX, maxX);
    py = clamp(py + mtv.y, minY, maxY);
  }
  return { x: px, y: py };
}

export function livingPlayerAabbs(
  players: { readonly [userId: string]: { x: number; y: number; health: number } },
  excludeUserId: string,
  halfExtent: number,
): Aabb[] {
  const ids = Object.keys(players);
  const boxes: Aabb[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id === excludeUserId) {
      continue;
    }
    const player = players[id];
    if (player.health <= 0) {
      continue;
    }
    boxes.push(playerAabb(player.x, player.y, halfExtent));
  }
  return boxes;
}

export function npcAabbs(
  npcs: ReadonlyArray<{ x: number; y: number }> | undefined,
  halfExtent: number,
): Aabb[] {
  if (npcs === undefined || npcs.length === 0) {
    return [];
  }
  const boxes: Aabb[] = [];
  for (let i = 0; i < npcs.length; i++) {
    boxes.push(playerAabb(npcs[i].x, npcs[i].y, halfExtent));
  }
  return boxes;
}

export function collisionsWithPlayers(
  zoneCollisions: ReadonlyArray<Aabb>,
  players: { readonly [userId: string]: { x: number; y: number; health: number } },
  excludeUserId: string,
  halfExtent: number,
  npcs?: ReadonlyArray<{ x: number; y: number }>,
): ReadonlyArray<Aabb> {
  const extra = livingPlayerAabbs(players, excludeUserId, halfExtent).concat(npcAabbs(npcs, halfExtent));
  if (extra.length === 0) {
    return zoneCollisions;
  }
  return zoneCollisions.concat(extra);
}

function snapAxis(
  origin: number,
  attempted: number,
  delta: number,
  hits: ReadonlyArray<Aabb>,
  min: number,
  max: number,
  halfExtent: number,
  axis: "x" | "y",
): number {
  if (hits.length === 0) {
    return attempted;
  }
  if (delta === 0) {
    return origin;
  }
  let snapped = attempted;
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (axis === "x") {
      if (delta > 0) {
        const face = hit.x - halfExtent;
        snapped = face < snapped ? face : snapped;
      } else {
        const face = hit.x + hit.width + halfExtent;
        snapped = face > snapped ? face : snapped;
      }
    } else if (delta > 0) {
      const face = hit.y - halfExtent;
      snapped = face < snapped ? face : snapped;
    } else {
      const face = hit.y + hit.height + halfExtent;
      snapped = face > snapped ? face : snapped;
    }
  }
  return clamp(snapped, min, max);
}

export function resolveMove(
  x: number,
  y: number,
  dx: number,
  dy: number,
  halfExtent: number,
  collisions: ReadonlyArray<Aabb>,
  walkableBounds: Aabb,
): Vec2 {
  const minX = walkableBounds.x + halfExtent;
  const maxX = walkableBounds.x + walkableBounds.width - halfExtent;
  const minY = walkableBounds.y + halfExtent;
  const maxY = walkableBounds.y + walkableBounds.height - halfExtent;
  const origin = depenetrate(x, y, halfExtent, collisions, walkableBounds);

  let nextX = clamp(origin.x + dx, minX, maxX);
  const hitsX = collectOverlaps(nextX, origin.y, halfExtent, collisions);
  if (hitsX.length > 0) {
    nextX = snapAxis(origin.x, nextX, dx, hitsX, minX, maxX, halfExtent, "x");
    if (overlapsObstacle(nextX, origin.y, halfExtent, collisions) !== null) {
      nextX = origin.x;
    }
  }

  let nextY = clamp(origin.y + dy, minY, maxY);
  const hitsY = collectOverlaps(nextX, nextY, halfExtent, collisions);
  if (hitsY.length > 0) {
    nextY = snapAxis(origin.y, nextY, dy, hitsY, minY, maxY, halfExtent, "y");
    if (overlapsObstacle(nextX, nextY, halfExtent, collisions) !== null) {
      nextY = origin.y;
    }
  }

  return { x: nextX, y: nextY };
}

export function segmentIntersectsAabb(ax: number, ay: number, bx: number, by: number, box: Aabb): boolean {
  const minX = box.x;
  const maxX = box.x + box.width;
  const minY = box.y;
  const maxY = box.y + box.height;
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const xSlab = clipSlab(ax, dx, minX, maxX, t0, t1);
  if (!xSlab.ok) {
    return false;
  }
  t0 = xSlab.t0;
  t1 = xSlab.t1;
  const ySlab = clipSlab(ay, dy, minY, maxY, t0, t1);
  return ySlab.ok;
}

export function lineBlocked(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  collisions: ReadonlyArray<Aabb>,
): boolean {
  for (let i = 0; i < collisions.length; i++) {
    if (segmentIntersectsAabb(ax, ay, bx, by, collisions[i])) {
      return true;
    }
  }
  return false;
}

function clipSlab(
  start: number,
  delta: number,
  min: number,
  max: number,
  t0: number,
  t1: number,
): { ok: boolean; t0: number; t1: number } {
  if (delta === 0) {
    if (start < min || start > max) {
      return { ok: false, t0: t0, t1: t1 };
    }
    return { ok: t0 <= t1, t0: t0, t1: t1 };
  }
  const tEnter = (min - start) / delta;
  const tExit = (max - start) / delta;
  const near = tEnter < tExit ? tEnter : tExit;
  const far = tEnter > tExit ? tEnter : tExit;
  const nextT0 = near > t0 ? near : t0;
  const nextT1 = far < t1 ? far : t1;
  if (nextT0 > nextT1) {
    return { ok: false, t0: nextT0, t1: nextT1 };
  }
  return { ok: true, t0: nextT0, t1: nextT1 };
}

