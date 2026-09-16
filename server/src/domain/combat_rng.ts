/**
 * Project-owned combat random. Production draws on the server.
 * Tests inject a seeded or scripted sequence. The client never submits rolls.
 */

export interface CombatRandom {
  next(): number;
}

export function productionRandom(): CombatRandom {
  return {
    next: function (): number {
      return Math.random();
    },
  };
}

export function seededRandom(seed: number): CombatRandom {
  let state = finiteSeed(seed);
  return {
    next: function (): number {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    },
  };
}

export function scriptedRandom(values: ReadonlyArray<number>): CombatRandom {
  const copy: number[] = [];
  for (let i = 0; i < values.length; i++) {
    copy.push(clampUnit(values[i]));
  }
  let index = 0;
  return {
    next: function (): number {
      if (copy.length === 0) {
        return 0;
      }
      if (index >= copy.length) {
        return copy[copy.length - 1];
      }
      const value = copy[index];
      index += 1;
      return value;
    },
  };
}

export function asRandomFn(random: CombatRandom): () => number {
  return function (): number {
    return random.next();
  };
}

function finiteSeed(seed: number): number {
  if (typeof seed !== "number" || !isFinite(seed)) {
    return 1;
  }
  const asInt = Math.floor(seed) >>> 0;
  return asInt === 0 ? 1 : asInt;
}

function clampUnit(value: number): number {
  if (typeof value !== "number" || !isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value >= 1) {
    return 0.999999;
  }
  return value;
}
