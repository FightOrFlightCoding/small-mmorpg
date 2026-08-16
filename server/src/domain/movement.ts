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
  const body = playerAabb(x, y, halfExtent);
  for (let i = 0; i < collisions.length; i++) {
    if (aabbsOverlap(body, collisions[i])) {
      return collisions[i];
    }
  }
  return null;
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

  let nextX = clamp(x + dx, minX, maxX);
  const hitX = overlapsObstacle(nextX, y, halfExtent, collisions);
  if (hitX !== null) {
    if (dx > 0) {
      nextX = clamp(hitX.x - halfExtent, minX, maxX);
    } else if (dx < 0) {
      nextX = clamp(hitX.x + hitX.width + halfExtent, minX, maxX);
    } else {
      nextX = x;
    }
    if (overlapsObstacle(nextX, y, halfExtent, collisions) !== null) {
      nextX = x;
    }
  }

  let nextY = clamp(y + dy, minY, maxY);
  const hitY = overlapsObstacle(nextX, nextY, halfExtent, collisions);
  if (hitY !== null) {
    if (dy > 0) {
      nextY = clamp(hitY.y - halfExtent, minY, maxY);
    } else if (dy < 0) {
      nextY = clamp(hitY.y + hitY.height + halfExtent, minY, maxY);
    } else {
      nextY = y;
    }
    if (overlapsObstacle(nextX, nextY, halfExtent, collisions) !== null) {
      nextY = y;
    }
  }

  return { x: nextX, y: nextY };
}
