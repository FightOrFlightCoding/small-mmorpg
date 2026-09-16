import { cooldownRecoveryRate } from "./canonical_combat";
import { applyCanonicalRespec } from "./canonical_respec";
import { pendingBranchSelection, usesCanonicalLeveling } from "./canonical_leveling";
import { identifiedModifiersFromEffectMap, isMaxLevel, levelCurveFor, xpRequiredForLevel } from "./stats";
import { talentModifiersForProgression } from "./talent_modifiers";
import {
  cloneProgression,
  grantXp,
  initializeProgression,
  setAutoAssign,
  type CharacterProgression,
} from "./progression";
import {
  exportProgressionSnapshot,
  validateProgressionRecord,
} from "./canonical_leftover_migration";
import type { GmApplyResult, GmCommandRequest } from "./gm";
import type { MatchPlayer, StarterZoneState } from "./match_state";
import { dict } from "./maps";

export function applyGmProgressionCommand(
  state: StarterZoneState,
  player: MatchPlayer,
  request: GmCommandRequest,
): GmApplyResult | null {
  if (request.command === "inspect_progression") {
    return inspectProgression(player);
  }
  if (request.command === "grant_xp_event") {
    return grantNamedXp(player, request, state);
  }
  if (request.command === "grant_exact_test_xp") {
    return grantExactXp(player, request, state);
  }
  if (request.command === "reset_progression_fixture") {
    return resetFixture(player, request, state);
  }
  if (request.command === "set_auto_assign") {
    return gmSetAutoAssign(player, request);
  }
  if (request.command === "open_branch_selection") {
    return openBranchSelection(player, state);
  }
  if (request.command === "reset_full_build") {
    return resetFullBuild(player, request, state);
  }
  if (request.command === "simulate_level_up") {
    return simulateLevelUp(player, request, state);
  }
  if (request.command === "inspect_active_effects") {
    return inspectEffects(player);
  }
  if (request.command === "inspect_cooldown_recovery") {
    return inspectCooldownRecovery(player, state);
  }
  if (request.command === "run_progression_validation") {
    return runValidation(player, state);
  }
  return null;
}

function emptyApply(code: string): GmApplyResult {
  return {
    ok: code === "ok",
    code: code,
    result: {},
    persistInventory: false,
    persistProgression: false,
    persistQuests: false,
    goldDelta: 0,
    repairLocation: false,
  };
}

function requireProgression(player: MatchPlayer): CharacterProgression | null {
  return player.progression !== undefined ? player.progression : null;
}

function inspectProgression(player: MatchPlayer): GmApplyResult {
  const progression = requireProgression(player);
  if (progression === null) {
    return emptyApply("progression_missing");
  }
  const result = emptyApply("ok");
  result.result = exportProgressionSnapshot(progression) as unknown as { [key: string]: unknown };
  return result;
}

function grantNamedXp(player: MatchPlayer, request: GmCommandRequest, state: StarterZoneState): GmApplyResult {
  const eventId = request.eventId !== undefined ? request.eventId : "";
  if (eventId.length === 0) {
    return emptyApply("invalid_event");
  }
  return applyAdminGrant(player, request, state, eventId, request.amount !== undefined ? request.amount : 0);
}

function grantExactXp(player: MatchPlayer, request: GmCommandRequest, state: StarterZoneState): GmApplyResult {
  return applyAdminGrant(player, request, state, "gm-exact:" + request.requestId, request.amount !== undefined ? request.amount : 0);
}

function applyAdminGrant(
  player: MatchPlayer,
  request: GmCommandRequest,
  state: StarterZoneState,
  eventId: string,
  amount: number,
): GmApplyResult {
  if (player.progression === undefined) {
    return emptyApply("progression_missing");
  }
  if (!(amount >= 0) || amount !== Math.floor(amount)) {
    return emptyApply("invalid_amount");
  }
  if (state.progressionCatalog === undefined) {
    return emptyApply("progression_missing");
  }
  const granted = grantXp(
    player.progression,
    state.progressionCatalog,
    player.classId !== undefined ? player.classId : "",
    {
      characterId: player.characterId,
      amount: amount,
      reasonType: "admin",
      reasonId: request.requestId,
      eventId: eventId,
    },
  );
  player.progression = granted.progression;
  const result = emptyApply(granted.code);
  result.persistProgression = granted.changed || granted.replay;
  result.result = {
    amount: amount,
    replay: granted.replay,
    levelsGained: granted.levelsGained,
    eventId: eventId,
    level: granted.progression.level,
    xpIntoLevel: granted.progression.xpIntoLevel,
  };
  return result;
}

const CANONICAL_LEVEL_1_FIXTURES = ["canonical_level_1", "level1"];

function resetFixture(player: MatchPlayer, request: GmCommandRequest, state: StarterZoneState): GmApplyResult {
  if (state.progressionCatalog === undefined) {
    return emptyApply("progression_missing");
  }
  const fixtureId = request.fixtureId !== undefined && request.fixtureId.length > 0 ? request.fixtureId : "canonical_level_1";
  if (CANONICAL_LEVEL_1_FIXTURES.indexOf(fixtureId) < 0) {
    return emptyApply("invalid_fixture");
  }
  const classId = player.classId !== undefined ? player.classId : "";
  const created = initializeProgression(state.progressionCatalog, classId);
  if (player.progression !== undefined) {
    created.createdAt = player.progression.createdAt;
  }
  created.classId = classId;
  player.progression = created;
  const result = emptyApply("ok");
  result.persistProgression = true;
  result.result = exportProgressionSnapshot(created) as unknown as { [key: string]: unknown };
  result.result.fixtureId = fixtureId;
  return result;
}

function gmSetAutoAssign(player: MatchPlayer, request: GmCommandRequest): GmApplyResult {
  if (player.progression === undefined) {
    return emptyApply("progression_missing");
  }
  if (request.enabled === undefined) {
    return emptyApply("invalid_flag");
  }
  const applied = setAutoAssign(player.progression, {
    requestId: request.requestId,
    enabled: request.enabled === true,
  });
  player.progression = applied.progression;
  const result = emptyApply(applied.code);
  result.persistProgression = applied.changed || applied.replay;
  result.result = { enabled: applied.progression.autoAssignEnabled, replay: applied.replay };
  return result;
}

function openBranchSelection(player: MatchPlayer, state: StarterZoneState): GmApplyResult {
  if (player.progression === undefined) {
    return emptyApply("progression_missing");
  }
  const classId = player.classId !== undefined ? player.classId : "";
  const pending = pendingBranchSelection(player.progression.level, player.progression.branchId);
  const classDef = state.progressionCatalog !== undefined ? state.progressionCatalog.classes[classId] : undefined;
  const branches = classDef !== undefined && classDef.branchIds !== undefined ? classDef.branchIds.slice() : [];
  if (player.progression.level < 5) {
    const locked = emptyApply("branch_locked");
    locked.result = { pending: false, branches: branches };
    return locked;
  }
  const result = emptyApply("ok");
  result.result = {
    pending: pending,
    branchId: player.progression.branchId,
    branches: branches,
  };
  return result;
}

function resetFullBuild(player: MatchPlayer, request: GmCommandRequest, state: StarterZoneState): GmApplyResult {
  if (player.progression === undefined) {
    return emptyApply("progression_missing");
  }
  if (state.progressionCatalog === undefined) {
    return emptyApply("progression_missing");
  }
  const current = cloneProgression(player.progression);
  const maps = current.respecByRequestId !== undefined ? current.respecByRequestId : {};
  const previous = maps[request.requestId];
  if (previous !== undefined) {
    const replayed = emptyApply(previous.code);
    replayed.result = { replay: true };
    return replayed;
  }
  const classId = player.classId !== undefined ? player.classId : "";
  const applied = applyCanonicalRespec(
    current,
    state.progressionCatalog,
    classId,
    player.characterId,
    request.requestId,
    "gm.reset_full_build",
    0,
  );
  maps[request.requestId] = { ok: applied.ok, code: applied.code };
  current.respecByRequestId = maps;
  player.progression = current;
  const result = emptyApply(applied.code);
  result.persistProgression = true;
  result.result = {
    goldCost: 0,
    previousBranch: applied.snapshot.previousBranch,
    pendingBranchSelection: pendingBranchSelection(current.level, current.branchId),
  };
  return result;
}

function simulateLevelUp(player: MatchPlayer, request: GmCommandRequest, state: StarterZoneState): GmApplyResult {
  if (player.progression === undefined) {
    return emptyApply("progression_missing");
  }
  if (state.progressionCatalog === undefined) {
    return emptyApply("progression_missing");
  }
  const classId = player.classId !== undefined ? player.classId : "";
  const curve = levelCurveFor(state.progressionCatalog, classId);
  if (curve === null || isMaxLevel(curve, player.progression.level)) {
    return emptyApply("at_max_level");
  }
  const required = xpRequiredForLevel(curve, player.progression.level);
  const amount = required > player.progression.currentXp ? required - player.progression.currentXp : required;
  return applyAdminGrant(player, request, state, "gm-level:" + request.requestId, amount);
}

function inspectEffects(player: MatchPlayer): GmApplyResult {
  const result = emptyApply("ok");
  const source = player.effects !== undefined ? player.effects : [];
  const effects: { [key: string]: unknown }[] = [];
  for (let i = 0; i < source.length; i++) {
    effects.push({
      effectId: source[i].effectId,
      abilityId: source[i].abilityId,
      type: source[i].type,
      stacks: source[i].stacks,
      remainingTicks: source[i].remainingTicks,
      tags: source[i].tags,
    });
  }
  result.result = { effects: effects };
  return result;
}

function inspectCooldownRecovery(player: MatchPlayer, state: StarterZoneState): GmApplyResult {
  const result = emptyApply("ok");
  const map = dict(player.abilityCooldowns);
  const remaining: { [abilityId: string]: number } = {};
  const ids = Object.keys(map);
  for (let i = 0; i < ids.length; i++) {
    remaining[ids[i]] = map[ids[i]];
  }
  const identified =
    state.progressionCatalog !== undefined && player.progression !== undefined
      ? talentModifiersForProgression(state.progressionCatalog, player.progression).concat(
          identifiedModifiersFromEffectMap({}),
        )
      : [];
  result.result = {
    abilityCooldowns: remaining,
    cooldownRecoveryRate: cooldownRecoveryRate(identified),
    usesCanonicalLeveling:
      state.progressionCatalog !== undefined && player.classId !== undefined
        ? usesCanonicalLeveling(state.progressionCatalog, player.classId)
        : false,
  };
  return result;
}

function runValidation(player: MatchPlayer, state: StarterZoneState): GmApplyResult {
  if (player.progression === undefined) {
    return emptyApply("progression_missing");
  }
  const classId = player.classId !== undefined ? player.classId : "";
  const report = validateProgressionRecord(player.progression, classId, state.progressionCatalog);
  const result = emptyApply(report.ok ? "ok" : report.code);
  result.result = { ok: report.ok, code: report.code, issues: report.issues };
  return result;
}
