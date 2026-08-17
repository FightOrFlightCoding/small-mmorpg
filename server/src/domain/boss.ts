import type { CombatEvent } from "./combat";
import { applyEffectDefinition, enemyAsTarget, writeTarget } from "./effects";
import { dict } from "./maps";
import type { BossPhaseContent, MatchEnemy, StarterZoneState } from "./match_state";
import { activateSpawn, despawnSpawn, resetEnemyToSpawn } from "./spawn_controller";
import { livingPlayersExist, profileForEnemy } from "./threat";

export function tickBossPhases(
  state: StarterZoneState,
  enemy: MatchEnemy,
  tick: number,
  tickRate: number,
  events: CombatEvent[],
): void {
  const phases = phaseList(enemy);
  if (phases.length === 0) {
    return;
  }
  if (enemy.health <= 0) {
    return;
  }
  const entered = enemy.combatEnteredTick !== undefined ? enemy.combatEnteredTick : 0;
  const combatSec = entered > 0 ? (tick - entered) / tickRate : 0;
  const healthPercent = enemy.maxHealth > 0 ? (enemy.health / enemy.maxHealth) * 100 : 0;
  const flags = dict(enemy.phaseFlags);
  const addDeaths = enemy.addDeaths !== undefined ? enemy.addDeaths : 0;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (phase.id === enemy.phaseId) {
      continue;
    }
    if (!phaseReady(phase, healthPercent, combatSec, addDeaths, flags)) {
      continue;
    }
    enterPhase(state, enemy, phase, tick, events);
    return;
  }
}

export function maybeResetBoss(
  state: StarterZoneState,
  enemy: MatchEnemy,
  events: CombatEvent[],
): boolean {
  const profile = profileForEnemy(state, enemy);
  if (profile.style !== "boss") {
    return false;
  }
  if (enemy.health <= 0) {
    return false;
  }
  const inCombat = (enemy.combatEnteredTick !== undefined && enemy.combatEnteredTick > 0) || enemy.aggroTarget !== "";
  if (!inCombat) {
    return false;
  }
  if (livingPlayersExist(state.players)) {
    return false;
  }
  resetBoss(state, enemy, events);
  return true;
}

export function resetBoss(state: StarterZoneState, enemy: MatchEnemy, events: CombatEvent[]): void {
  const phases = phaseList(enemy);
  for (let i = 0; i < phases.length; i++) {
    const spawnId = phases[i].triggerSpawnId;
    if (typeof spawnId === "string" && spawnId.length > 0) {
      despawnSpawn(state, spawnId);
    }
  }
  resetEnemyToSpawn(enemy, true);
  events.push({
    type: "message",
    sourceId: enemy.id,
    sourceKind: "enemy",
    targetId: enemy.id,
    targetKind: "enemy",
    remainingHealth: enemy.health,
    x: enemy.x,
    y: enemy.y,
    message: "The encounter resets.",
  });
}

function enterPhase(
  state: StarterZoneState,
  enemy: MatchEnemy,
  phase: BossPhaseContent,
  tick: number,
  events: CombatEvent[],
): void {
  enemy.phaseId = phase.id;
  if (typeof phase.setFlag === "string" && phase.setFlag.length > 0) {
    const flags = dict(enemy.phaseFlags);
    flags[phase.setFlag] = true;
    enemy.phaseFlags = flags;
  }
  const loadout = Array.isArray(enemy.abilityLoadout) ? enemy.abilityLoadout.slice() : [];
  const removed = Array.isArray(phase.removeAbilityIds) ? phase.removeAbilityIds : [];
  const kept: string[] = [];
  for (let i = 0; i < loadout.length; i++) {
    if (removed.indexOf(loadout[i]) === -1) {
      kept.push(loadout[i]);
    }
  }
  const added = Array.isArray(phase.addAbilityIds) ? phase.addAbilityIds : [];
  for (let a = 0; a < added.length; a++) {
    if (kept.indexOf(added[a]) === -1) {
      kept.push(added[a]);
    }
  }
  enemy.abilityLoadout = kept;
  if (typeof phase.moveSpeed === "number" && isFinite(phase.moveSpeed)) {
    enemy.moveSpeed = phase.moveSpeed;
  }
  if (typeof phase.aggroRadius === "number" && isFinite(phase.aggroRadius)) {
    enemy.aggroRadius = phase.aggroRadius;
  }
  if (typeof phase.attackRange === "number" && isFinite(phase.attackRange)) {
    enemy.attackRange = phase.attackRange;
  }
  if (typeof phase.triggerSpawnId === "string" && phase.triggerSpawnId.length > 0) {
    activateSpawn(state, phase.triggerSpawnId, dict(state.enemiesById));
  }
  if (phase.applyEffect !== undefined) {
    const target = enemyAsTarget(enemy);
    applyEffectDefinition(
      state,
      phase.applyEffect,
      "phase:" + phase.id,
      { id: enemy.id, kind: "enemy" },
      target,
      null,
      enemy.damage,
      tick,
      events,
    );
    writeTarget(state, target);
  }
  if (typeof phase.combatMessage === "string" && phase.combatMessage.length > 0) {
    events.push({
      type: "message",
      sourceId: enemy.id,
      sourceKind: "enemy",
      targetId: enemy.id,
      targetKind: "enemy",
      remainingHealth: enemy.health,
      x: enemy.x,
      y: enemy.y,
      message: phase.combatMessage,
    });
  }
}

function phaseReady(
  phase: BossPhaseContent,
  healthPercent: number,
  combatSec: number,
  addDeaths: number,
  flags: { [id: string]: boolean },
): boolean {
  let gated = false;
  if (typeof phase.healthPercentAtOrBelow === "number" && isFinite(phase.healthPercentAtOrBelow)) {
    gated = true;
    if (healthPercent > phase.healthPercentAtOrBelow) {
      return false;
    }
  }
  if (typeof phase.combatTimeSecAtOrAbove === "number" && isFinite(phase.combatTimeSecAtOrAbove)) {
    gated = true;
    if (combatSec < phase.combatTimeSecAtOrAbove) {
      return false;
    }
  }
  if (typeof phase.addDeathsAtOrAbove === "number" && isFinite(phase.addDeathsAtOrAbove)) {
    gated = true;
    if (addDeaths < phase.addDeathsAtOrAbove) {
      return false;
    }
  }
  if (typeof phase.requireFlag === "string" && phase.requireFlag.length > 0) {
    gated = true;
    if (flags[phase.requireFlag] !== true) {
      return false;
    }
  }
  return gated;
}

function phaseList(enemy: MatchEnemy): ReadonlyArray<BossPhaseContent> {
  const phases = enemy.phases;
  if (!Array.isArray(phases)) {
    return [];
  }
  return phases;
}
