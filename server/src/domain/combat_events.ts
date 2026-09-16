import type { CombatEvent } from "./combat";

export const CANONICAL_COMBAT_EVENT_TYPES = [
  "before_ability",
  "cast_started",
  "cast_interrupted",
  "ability_resolved",
  "hit_rolled",
  "damage_dealt",
  "damage_taken",
  "healing_dealt",
  "shield_applied",
  "shield_broken",
  "shield_expired",
  "effect_applied",
  "effect_ticked",
  "effect_removed",
  "auto_attack_landed",
  "enemy_taunted",
  "entity_killed",
  "combat_started",
  "combat_ended",
  "movement_started",
  "movement_stopped",
] as const;

export type CanonicalCombatEventType = (typeof CANONICAL_COMBAT_EVENT_TYPES)[number];

export type CombatActorKind = "player" | "enemy";

export type CombatOriginTag = "primary" | "reflect" | "overflow" | "propagation" | "periodic" | "lifesteal";

export interface CanonicalCombatEvent {
  type: CanonicalCombatEventType;
  tick: number;
  sourceId: string;
  sourceKind: CombatActorKind;
  targetId: string;
  targetKind: CombatActorKind;
  abilityId?: string;
  effectId?: string;
  amount?: number;
  remainingHealth?: number;
  crit?: boolean;
  hitIndex?: number;
  hitCount?: number;
  originTag?: CombatOriginTag;
  originalSourceId?: string;
  reflectorId?: string;
  isReflection?: boolean;
  isDot?: boolean;
  x?: number;
  y?: number;
  interruptReason?: string;
  nodeId?: string;
}

export interface CombatHandlerContext {
  tick: number;
  emit: (event: CanonicalCombatEvent) => void;
}

export interface CombatHandler {
  id: string;
  events: ReadonlyArray<CanonicalCombatEventType>;
  handle: (ctx: CombatHandlerContext, event: CanonicalCombatEvent) => void;
}

export interface CombatEventBus {
  handlers: CombatHandler[];
  events: CanonicalCombatEvent[];
  on: (handler: CombatHandler) => void;
  emit: (event: CanonicalCombatEvent) => void;
}

export function createCombatEventBus(handlers?: ReadonlyArray<CombatHandler>): CombatEventBus {
  const list: CombatHandler[] = [];
  if (handlers !== undefined) {
    for (let i = 0; i < handlers.length; i++) {
      list.push(handlers[i]);
    }
  }
  const bus: CombatEventBus = {
    handlers: list,
    events: [],
    on: function (handler: CombatHandler): void {
      list.push(handler);
    },
    emit: function (event: CanonicalCombatEvent): void {
      bus.events.push(event);
      for (let i = 0; i < list.length; i++) {
        const handler = list[i];
        if (subscribesTo(handler, event.type)) {
          handler.handle(
            {
              tick: event.tick,
              emit: function (next: CanonicalCombatEvent): void {
                bus.emit(next);
              },
            },
            event,
          );
        }
      }
    },
  };
  return bus;
}

export function eventsOfType(
  events: ReadonlyArray<CanonicalCombatEvent>,
  type: CanonicalCombatEventType,
): CanonicalCombatEvent[] {
  const matched: CanonicalCombatEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === type) {
      matched.push(events[i]);
    }
  }
  return matched;
}

export function toLegacyCombatEvent(event: CanonicalCombatEvent): CombatEvent | null {
  if (event.type === "damage_dealt" || event.type === "hit_rolled" || event.type === "auto_attack_landed") {
    return {
      type: "hit",
      sourceId: event.sourceId,
      sourceKind: event.sourceKind,
      targetId: event.targetId,
      targetKind: event.targetKind,
      damage: event.amount,
      remainingHealth: event.remainingHealth,
      abilityId: event.abilityId,
      effectId: event.effectId,
      x: event.x,
      y: event.y,
    };
  }
  if (event.type === "healing_dealt") {
    return {
      type: "heal",
      sourceId: event.sourceId,
      sourceKind: event.sourceKind,
      targetId: event.targetId,
      targetKind: event.targetKind,
      healing: event.amount,
      remainingHealth: event.remainingHealth,
      abilityId: event.abilityId,
      effectId: event.effectId,
      x: event.x,
      y: event.y,
    };
  }
  if (event.type === "cast_interrupted") {
    return {
      type: "interrupt",
      sourceId: event.sourceId,
      sourceKind: event.sourceKind,
      targetId: event.targetId,
      targetKind: event.targetKind,
      interruptReason: event.interruptReason,
      abilityId: event.abilityId,
      remainingHealth: event.remainingHealth,
      x: event.x,
      y: event.y,
    };
  }
  if (event.type === "entity_killed") {
    return {
      type: "death",
      sourceId: event.sourceId,
      sourceKind: event.sourceKind,
      targetId: event.targetId,
      targetKind: event.targetKind,
      remainingHealth: 0,
      abilityId: event.abilityId,
      x: event.x,
      y: event.y,
    };
  }
  if (event.type === "effect_applied") {
    return {
      type: "effect_applied",
      sourceId: event.sourceId,
      sourceKind: event.sourceKind,
      targetId: event.targetId,
      targetKind: event.targetKind,
      effectId: event.effectId,
      abilityId: event.abilityId,
      remainingHealth: event.remainingHealth,
      x: event.x,
      y: event.y,
    };
  }
  if (event.type === "effect_ticked") {
    return {
      type: "effect_tick",
      sourceId: event.sourceId,
      sourceKind: event.sourceKind,
      targetId: event.targetId,
      targetKind: event.targetKind,
      damage: event.amount,
      remainingHealth: event.remainingHealth,
      effectId: event.effectId,
      abilityId: event.abilityId,
      x: event.x,
      y: event.y,
    };
  }
  if (event.type === "enemy_taunted") {
    return {
      type: "threat",
      sourceId: event.sourceId,
      sourceKind: event.sourceKind,
      targetId: event.targetId,
      targetKind: event.targetKind,
      abilityId: event.abilityId,
      x: event.x,
      y: event.y,
    };
  }
  return null;
}

function subscribesTo(handler: CombatHandler, type: CanonicalCombatEventType): boolean {
  for (let i = 0; i < handler.events.length; i++) {
    if (handler.events[i] === type) {
      return true;
    }
  }
  return false;
}
