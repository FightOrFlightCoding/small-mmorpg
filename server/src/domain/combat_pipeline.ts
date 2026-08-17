import {
  NEVER_ATTACKED_TICK,
  PLAYER_RESPAWN_DELAY_SEC,
  applyDamageAmount,
  applyHealAmount,
  cooldownTicks,
  findEnemy,
  isCooldownReady,
  killEnemy,
  killPlayer,
  rememberAttack,
  restoreRespawnVitals,
  respawnDestination,
  type CombatEvent,
  type PlayerAttackDecision,
  type PlayerAttackInput,
} from "./combat";
import { dict } from "./maps";
import type { MatchPlayer, StarterZoneState } from "./match_state";
import { distance } from "./movement";

export const IN_COMBAT_TIMEOUT_TICKS = 50;
export const COMBAT_APPLY_TTL_TICKS = 6000;

export const COMBAT_PIPELINE_STEPS = [
  "action_accepted",
  "actor_validated",
  "target_validated",
  "hit_eligibility",
  "base_magnitude",
  "source_modifiers",
  "target_modifiers",
  "mitigation",
  "shields",
  "final_amount",
  "health_mutation",
  "combat_event",
  "threat_credit",
  "death_handling",
  "reward_hooks",
] as const;

export type CombatPipelineStep = (typeof COMBAT_PIPELINE_STEPS)[number];

export interface CombatFormula {
  base: number;
  sourceStatValue?: number;
  sourceStatCoefficient?: number;
  sourceFlat?: number;
  sourcePercent?: number;
  targetFlat?: number;
  targetPercent?: number;
  defense?: number;
  absorb?: number;
  critEnabled?: boolean;
  critForced?: boolean;
  critMultiplier?: number;
  minResult?: number;
}

export interface CombatApplyInput {
  action: "damage" | "heal";
  sourceId: string;
  sourceKind: "player" | "enemy";
  targetId: string;
  targetKind: "player" | "enemy";
  formula: CombatFormula;
  tick: number;
  abilityId?: string;
  eventId?: string;
  respawnDelaySec?: number;
  tickRate?: number;
}

export interface CombatStages {
  base: number;
  afterSource: number;
  afterTarget: number;
  afterMitigation: number;
  afterShields: number;
  finalAmount: number;
}

export interface CombatApplyResult {
  ok: boolean;
  code: string;
  replay: boolean;
  applied: boolean;
  amount: number;
  remainingHealth: number;
  died: boolean;
  steps: string[];
  stages: CombatStages;
}

const EMPTY_STAGES: CombatStages = {
  base: 0,
  afterSource: 0,
  afterTarget: 0,
  afterMitigation: 0,
  afterShields: 0,
  finalAmount: 0,
};

export function applyCombat(state: StarterZoneState, input: CombatApplyInput, events: CombatEvent[]): CombatApplyResult {
  const steps: string[] = ["action_accepted"];
  const eventId = input.eventId !== undefined ? String(input.eventId) : "";
  if (eventId.length > 0) {
    const remembered = replayCombatApply(state, eventId);
    if (remembered !== null) {
      return remembered;
    }
  }

  const source = findActor(state, input.sourceId, input.sourceKind);
  if (source === null || !source.alive) {
    return rejectApply(state, eventId, input.tick, steps, "actor_invalid");
  }
  steps.push("actor_validated");

  const target = findVictim(state, input.targetId, input.targetKind);
  if (target === null) {
    return rejectApply(state, eventId, input.tick, steps, "invalid_target");
  }
  if (!target.alive) {
    return rejectApply(state, eventId, input.tick, steps, "target_dead");
  }
  steps.push("target_validated");

  if (input.action === "damage" && input.sourceKind === "player" && input.targetKind === "player" && input.sourceId !== input.targetId) {
    return rejectApply(state, eventId, input.tick, steps, "pvp_disabled");
  }
  steps.push("hit_eligibility");

  const absorb = numericOr(input.formula.absorb, 0) + absorbFromEntity(target.effects);
  const evaluated = evaluateCombatFormula(input.formula, input.action, absorb);
  steps.push("base_magnitude");
  steps.push("source_modifiers");
  steps.push("target_modifiers");
  steps.push("mitigation");
  steps.push("shields");
  steps.push("final_amount");

  if (evaluated.finalAmount <= 0) {
    const remaining = target.health;
    rememberCombatApply(state, eventId, input.tick, {
      ok: true,
      code: "ok",
      replay: false,
      applied: false,
      amount: 0,
      remainingHealth: remaining,
      died: false,
      steps: steps,
      stages: evaluated,
    });
    return {
      ok: true,
      code: "ok",
      replay: false,
      applied: false,
      amount: 0,
      remainingHealth: remaining,
      died: false,
      steps: steps,
      stages: evaluated,
    };
  }

  let remaining = target.health;
  if (input.action === "heal") {
    remaining = applyHealAmount(target.health, target.maxHealth, evaluated.finalAmount);
  } else {
    remaining = applyDamageAmount(target.health, evaluated.finalAmount);
  }
  writeHealth(state, input.targetId, input.targetKind, remaining);
  steps.push("health_mutation");

  const appliedAmount =
    input.action === "heal" ? remaining - target.health : target.health - remaining;
  events.push({
    type: input.action === "heal" ? "heal" : "hit",
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
    targetId: input.targetKind === "enemy" ? canonicalEnemyId(state, input.targetId) : input.targetId,
    targetKind: input.targetKind,
    damage: input.action === "damage" ? appliedAmount : undefined,
    healing: input.action === "heal" ? appliedAmount : undefined,
    remainingHealth: remaining,
    abilityId: input.abilityId,
    x: target.x,
    y: target.y,
  });
  steps.push("combat_event");

  markCombatActivity(state, input, remaining);
  if (input.action === "damage") {
    events.push({
      type: "threat",
      sourceId: input.sourceId,
      sourceKind: input.sourceKind,
      targetId: input.targetKind === "enemy" ? canonicalEnemyId(state, input.targetId) : input.targetId,
      targetKind: input.targetKind,
      damage: appliedAmount,
      remainingHealth: remaining,
      x: target.x,
      y: target.y,
    });
  }
  steps.push("threat_credit");

  const died = input.action === "damage" && remaining <= 0;
  if (died) {
    const tickRate = numericOr(input.tickRate, 10);
    const delay = numericOr(input.respawnDelaySec, state.playerRespawnDelaySec);
    if (input.targetKind === "enemy") {
      const enemy = findEnemy(state.enemies, input.targetId);
      if (enemy !== null) {
        killEnemy(enemy, input.tick, input.sourceId, tickRate, events);
        events.push({
          type: "credit",
          sourceId: input.sourceId,
          sourceKind: input.sourceKind,
          targetId: enemy.id,
          targetKind: "enemy",
          remainingHealth: 0,
          x: enemy.x,
          y: enemy.y,
        });
      }
    } else {
      const player = dict(state.players)[input.targetId];
      if (player !== undefined) {
        killPlayer(player, input.tick, input.sourceId, delay, tickRate, events, input.sourceKind);
      }
    }
  }
  steps.push("death_handling");
  steps.push("reward_hooks");

  const result: CombatApplyResult = {
    ok: true,
    code: "ok",
    replay: false,
    applied: true,
    amount: appliedAmount,
    remainingHealth: remaining,
    died: died,
    steps: steps,
    stages: evaluated,
  };
  rememberCombatApply(state, eventId, input.tick, result);
  return result;
}

export function evaluateCombatFormula(formula: CombatFormula, action: "damage" | "heal", absorb: number): CombatStages {
  const base = Math.max(0, Math.floor(numericOr(formula.base, 0)));
  const sourceStat = numericOr(formula.sourceStatValue, 0);
  const sourceCoeff = numericOr(formula.sourceStatCoefficient, 0);
  const sourceFlat = numericOr(formula.sourceFlat, 0);
  const sourcePercent = numericOr(formula.sourcePercent, 0);
  let afterSource = Math.floor(base + sourceStat * sourceCoeff + sourceFlat);
  afterSource = Math.floor(afterSource * (1 + sourcePercent));
  if (formula.critEnabled === true && formula.critForced === true) {
    const critMult = numericOr(formula.critMultiplier, 1.5);
    afterSource = Math.floor(afterSource * critMult);
  }
  const targetFlat = numericOr(formula.targetFlat, 0);
  const targetPercent = numericOr(formula.targetPercent, 0);
  let afterTarget = Math.floor(afterSource + targetFlat);
  afterTarget = Math.floor(afterTarget * (1 + targetPercent));
  let afterMitigation = afterTarget;
  if (action === "damage") {
    const defense = Math.max(0, numericOr(formula.defense, 0));
    afterMitigation = Math.floor((afterTarget * 100) / (100 + defense));
  }
  const shield = Math.max(0, absorb);
  const afterShields = action === "damage" ? Math.max(0, afterMitigation - shield) : afterMitigation;
  const minResult = Math.max(0, numericOr(formula.minResult, 0));
  const finalAmount = Math.max(minResult, afterShields);
  return {
    base: base,
    afterSource: afterSource,
    afterTarget: afterTarget,
    afterMitigation: afterMitigation,
    afterShields: afterShields,
    finalAmount: finalAmount,
  };
}

export function applyPlayerAttack(input: PlayerAttackInput, events: CombatEvent[]): PlayerAttackDecision {
  const player = input.player;
  if (player === undefined) {
    return { ok: false, code: "player_missing", replay: false };
  }
  if (player.lastAttackRequestId === input.requestId && player.lastAttackRequestId !== "") {
    return {
      ok: player.lastAttackResultOk === true,
      code:
        player.lastAttackResultCode !== undefined && player.lastAttackResultCode !== ""
          ? player.lastAttackResultCode
          : "ok",
      replay: true,
    };
  }
  if (player.health <= 0) {
    rememberAttack(player, input.requestId, "player_dead", false);
    return { ok: false, code: "player_dead", replay: false };
  }
  const enemy = findEnemy(input.enemies, input.targetId);
  if (enemy === null) {
    rememberAttack(player, input.requestId, "invalid_target", false);
    return { ok: false, code: "invalid_target", replay: false };
  }
  if (enemy.health <= 0 || enemy.aiState === "dead") {
    rememberAttack(player, input.requestId, "target_dead", false);
    return { ok: false, code: "target_dead", replay: false };
  }
  if (distance(player.x, player.y, enemy.x, enemy.y) > input.attackRange) {
    rememberAttack(player, input.requestId, "out_of_range", false);
    return { ok: false, code: "out_of_range", replay: false };
  }
  const ticks = cooldownTicks(input.attackCooldownSec, input.tickRate);
  const lastTick = player.lastAttackTick !== undefined ? player.lastAttackTick : NEVER_ATTACKED_TICK;
  if (!isCooldownReady(lastTick, input.tick, ticks)) {
    rememberAttack(player, input.requestId, "on_cooldown", false);
    return { ok: false, code: "on_cooldown", replay: false };
  }

  const match = input.match !== undefined ? input.match : attackStateShim(input);
  const result = applyCombat(
    match,
    {
      action: "damage",
      sourceId: player.userId,
      sourceKind: "player",
      targetId: enemy.id,
      targetKind: "enemy",
      formula: { base: input.attack },
      tick: input.tick,
      eventId: "atk:" + input.requestId,
      tickRate: input.tickRate,
    },
    events,
  );
  if (!result.ok) {
    rememberAttack(player, input.requestId, result.code, false);
    return { ok: false, code: result.code, replay: false };
  }
  player.lastAttackTick = input.tick;
  rememberAttack(player, input.requestId, "ok", true);
  return { ok: true, code: "ok", replay: false };
}

export function applyPlayerRespawn(
  state: StarterZoneState,
  player: MatchPlayer,
  _tick: number,
  events: CombatEvent[],
): void {
  const dest = respawnDestination(state, player);
  restoreRespawnVitals(state, player);
  player.x = dest.x;
  player.y = dest.y;
  player.axisX = 0;
  player.axisY = 0;
  player.deadUntilTick = 0;
  player.inCombat = false;
  player.lastHostileActionTick = NEVER_ATTACKED_TICK;
  player.lastDamageReceivedTick = NEVER_ATTACKED_TICK;
  player.hostileTargetId = "";
  player.friendlyTargetId = "";
  events.push({
    type: "respawn",
    sourceId: "",
    sourceKind: "player",
    targetId: player.userId,
    targetKind: "player",
    remainingHealth: player.health,
    x: player.x,
    y: player.y,
  });
}

export function tickPlayerRespawns(
  state: StarterZoneState,
  tick: number,
  events: CombatEvent[],
): void {
  const ids = Object.keys(dict(state.players));
  ids.sort();
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    if (player === undefined || player.health > 0) {
      continue;
    }
    const until = player.deadUntilTick !== undefined ? player.deadUntilTick : 0;
    if (until <= 0 || tick < until) {
      continue;
    }
    applyPlayerRespawn(state, player, tick, events);
  }
}

export function applyReleaseRespawn(
  state: StarterZoneState,
  player: MatchPlayer | undefined,
  tick: number,
  requestId: string,
  events: CombatEvent[],
): { ok: boolean; code: string; replay: boolean } {
  if (player === undefined) {
    return { ok: false, code: "player_missing", replay: false };
  }
  if (player.lastReleaseRequestId === requestId && player.lastReleaseRequestId !== "") {
    return {
      ok: player.lastReleaseResultOk === true,
      code:
        player.lastReleaseResultCode !== undefined && player.lastReleaseResultCode !== ""
          ? player.lastReleaseResultCode
          : "ok",
      replay: true,
    };
  }
  if (player.health > 0) {
    player.lastReleaseRequestId = requestId;
    player.lastReleaseResultCode = "not_dead";
    player.lastReleaseResultOk = false;
    return { ok: false, code: "not_dead", replay: false };
  }
  applyPlayerRespawn(state, player, tick, events);
  player.lastReleaseRequestId = requestId;
  player.lastReleaseResultCode = "ok";
  player.lastReleaseResultOk = true;
  return { ok: true, code: "ok", replay: false };
}

export function tickCombatFlags(state: StarterZoneState, tick: number): void {
  pruneCombatApplies(state, tick);
  const ids = Object.keys(dict(state.players));
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    if (player === undefined) {
      continue;
    }
    const lastHostile =
      player.lastHostileActionTick !== undefined ? player.lastHostileActionTick : NEVER_ATTACKED_TICK;
    const lastDamage =
      player.lastDamageReceivedTick !== undefined ? player.lastDamageReceivedTick : NEVER_ATTACKED_TICK;
    let last = lastHostile;
    if (lastDamage > last) {
      last = lastDamage;
    }
    player.inCombat = last > NEVER_ATTACKED_TICK && tick - last < IN_COMBAT_TIMEOUT_TICKS;
  }
}

function attackStateShim(input: PlayerAttackInput): StarterZoneState {
  return {
    players: input.player !== undefined ? { [input.player.userId]: input.player } : {},
    enemies: input.enemies,
    combatApplyByEventId: {},
    playerRespawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
  } as StarterZoneState;
}

function findActor(
  state: StarterZoneState,
  id: string,
  kind: "player" | "enemy",
): { alive: boolean; x: number; y: number } | null {
  if (kind === "player") {
    const player = dict(state.players)[id];
    if (player === undefined) {
      return null;
    }
    return { alive: player.health > 0, x: player.x, y: player.y };
  }
  const enemy = findEnemy(state.enemies, id);
  if (enemy === null) {
    return null;
  }
  return { alive: enemy.health > 0 && enemy.aiState !== "dead", x: enemy.x, y: enemy.y };
}

function findVictim(
  state: StarterZoneState,
  id: string,
  kind: "player" | "enemy",
): { alive: boolean; x: number; y: number; health: number; maxHealth: number; effects?: { tags?: string[]; statChannel?: string; magnitude?: number; stacks?: number }[] } | null {
  if (kind === "player") {
    const player = dict(state.players)[id];
    if (player === undefined) {
      return null;
    }
    return {
      alive: player.health > 0,
      x: player.x,
      y: player.y,
      health: player.health,
      maxHealth: player.maxHealth,
      effects: player.effects,
    };
  }
  const enemy = findEnemy(state.enemies, id);
  if (enemy === null) {
    return null;
  }
  return {
    alive: enemy.health > 0 && enemy.aiState !== "dead",
    x: enemy.x,
    y: enemy.y,
    health: enemy.health,
    maxHealth: enemy.maxHealth,
    effects: enemy.effects,
  };
}

function writeHealth(state: StarterZoneState, id: string, kind: "player" | "enemy", health: number): void {
  if (kind === "player") {
    const player = dict(state.players)[id];
    if (player !== undefined) {
      player.health = health;
    }
    return;
  }
  const enemy = findEnemy(state.enemies, id);
  if (enemy !== null) {
    enemy.health = health;
  }
}

function canonicalEnemyId(state: StarterZoneState, id: string): string {
  const enemy = findEnemy(state.enemies, id);
  return enemy !== null ? enemy.id : id;
}

function markCombatActivity(state: StarterZoneState, input: CombatApplyInput, _remaining: number): void {
  if (input.action !== "damage") {
    return;
  }
  if (input.sourceKind === "player") {
    const source = dict(state.players)[input.sourceId];
    if (source !== undefined) {
      source.lastHostileActionTick = input.tick;
      source.inCombat = true;
      if (input.targetKind === "enemy") {
        source.hostileTargetId = canonicalEnemyId(state, input.targetId);
      }
    }
  }
  if (input.targetKind === "player") {
    const target = dict(state.players)[input.targetId];
    if (target !== undefined) {
      target.lastDamageReceivedTick = input.tick;
      target.inCombat = true;
    }
  }
}

function absorbFromEntity(
  effects: { tags?: string[]; statChannel?: string; magnitude?: number; stacks?: number }[] | undefined,
): number {
  if (effects === undefined) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    const channel = effect.statChannel !== undefined ? String(effect.statChannel) : "";
    const tags = effect.tags !== undefined ? effect.tags : [];
    let shielded = channel === "absorb";
    for (let t = 0; t < tags.length; t++) {
      if (tags[t] === "shield") {
        shielded = true;
      }
    }
    if (!shielded) {
      continue;
    }
    const magnitude = numericOr(effect.magnitude, 0);
    const stacks = numericOr(effect.stacks, 1);
    total += magnitude * stacks;
  }
  return Math.max(0, Math.floor(total));
}

function replayCombatApply(state: StarterZoneState, eventId: string): CombatApplyResult | null {
  const map = dict(state.combatApplyByEventId);
  const previous = map[eventId];
  if (previous === undefined) {
    return null;
  }
  return {
    ok: previous.ok,
    code: previous.code,
    replay: true,
    applied: false,
    amount: previous.amount,
    remainingHealth: previous.remainingHealth,
    died: previous.died,
    steps: previous.steps.slice(),
    stages: {
      base: previous.stages.base,
      afterSource: previous.stages.afterSource,
      afterTarget: previous.stages.afterTarget,
      afterMitigation: previous.stages.afterMitigation,
      afterShields: previous.stages.afterShields,
      finalAmount: previous.stages.finalAmount,
    },
  };
}

function rememberCombatApply(
  state: StarterZoneState,
  eventId: string,
  tick: number,
  result: CombatApplyResult,
): void {
  if (eventId.length === 0) {
    return;
  }
  const map = dict(state.combatApplyByEventId);
  map[eventId] = {
    ok: result.ok,
    code: result.code,
    amount: result.amount,
    remainingHealth: result.remainingHealth,
    died: result.died,
    tick: tick,
    steps: result.steps.slice(),
    stages: {
      base: result.stages.base,
      afterSource: result.stages.afterSource,
      afterTarget: result.stages.afterTarget,
      afterMitigation: result.stages.afterMitigation,
      afterShields: result.stages.afterShields,
      finalAmount: result.stages.finalAmount,
    },
  };
  state.combatApplyByEventId = map;
}

function pruneCombatApplies(state: StarterZoneState, tick: number): void {
  const map = dict(state.combatApplyByEventId);
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const row = map[keys[i]];
    if (row === undefined || tick - row.tick >= COMBAT_APPLY_TTL_TICKS) {
      delete map[keys[i]];
    }
  }
  state.combatApplyByEventId = map;
}

function rejectApply(
  state: StarterZoneState,
  eventId: string,
  tick: number,
  steps: string[],
  code: string,
): CombatApplyResult {
  const result: CombatApplyResult = {
    ok: false,
    code: code,
    replay: false,
    applied: false,
    amount: 0,
    remainingHealth: 0,
    died: false,
    steps: steps,
    stages: EMPTY_STAGES,
  };
  rememberCombatApply(state, eventId, tick, result);
  return result;
}

function numericOr(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !isFinite(value)) {
    return fallback;
  }
  return value;
}
