/**
 * Project-owned progression combat simulator.
 * Reuses live content parsers, §4 formulas, mana regen, cooldown recovery,
 * crit expected-value, DoT snapshot rules, and talent modifiers.
 * Does not introduce a second formula table.
 */

import {
  abilityDefinitionsFromContent,
  autoAttackDefinitionsFromContent,
  type AbilityDefinition,
  type AutoAttackDefinition,
} from "./ability";
import {
  hasteScaledAttackInterval,
  hasteScaledCastTime,
  scaledManaCost,
} from "./canonical_combat";
import { classUsesMana, FRENZY_ABILITY_ID } from "./canonical_progression";
import {
  canonicalInputFromClass,
  evaluateCanonicalHit,
  evaluateCanonicalSnapshot,
  formulaCastTime,
  formulaCritExpectedValue,
  regenerateMana,
  scalePower,
  type CanonicalModifier,
  type CanonicalSnapshot,
  type PowerCategory,
} from "./canonical_stats";
import { seededRandom, type CombatRandom } from "./combat_rng";
import type { EffectDefinition } from "./effects";
import { resolveAbilityTalentModifiers, talentModifiersForProgression } from "./talent_modifiers";
import type { ProgressionCatalog } from "./stats";

export const CERT_FIGHT_DURATION_SEC = 60;
export const CERT_DPS_TOLERANCE = 0.05;
export const STANDARD_MOB_HP_L10 = 120;

export const SECTION_12_TARGETS: {
  [branchId: string]: { dps: number; hps?: number; partyHps?: number };
} = {
  "branch.marksman.sniper": { dps: 19.0 },
  "branch.marksman.skirmisher": { dps: 18.9 },
  "branch.mage.fire": { dps: 18.8 },
  "branch.mage.frost": { dps: 17.6 },
  "branch.mystic.curses": { dps: 17.3 },
  "branch.warrior.berserker": { dps: 16.1 },
  "branch.warrior.bulwark": { dps: 14.8 },
  "branch.mystic.charms": { dps: 14.3, hps: 15.9, partyHps: 22.2 },
};

export interface CombatContentBundle {
  abilities: Parameters<typeof abilityDefinitionsFromContent>[0];
  autoAttacks: Parameters<typeof autoAttackDefinitionsFromContent>[0];
}

export interface SimulatorInput {
  catalog: ProgressionCatalog;
  content: CombatContentBundle;
  branchId: string;
  level?: number;
  freeStatAllocations?: { [id: string]: number };
  purchasedClassNodeIds?: ReadonlyArray<string>;
  purchasedBranchNodeRanks?: { [id: string]: number };
  extraModifiers?: ReadonlyArray<CanonicalModifier>;
  durationSec?: number;
  mode: "analytic" | "seeded";
  seed?: number;
  trace?: boolean;
  partyHeal?: boolean;
}

export interface CombatTraceEvent {
  time: number;
  kind: string;
  abilityId?: string;
  amount?: number;
  crit?: boolean;
  mana?: number;
  notes?: string;
}

export interface MetronomeReport {
  abilityId: string;
  cost: number;
  effectiveCast: number;
  spendRate: number;
  regen: number;
  holds: boolean;
  authoredMiss: boolean;
}

export interface SimulationResult {
  classId: string;
  branchId: string;
  mode: "analytic" | "seeded";
  durationSec: number;
  damage: number;
  healing: number;
  absorb: number;
  dps: number;
  hps: number;
  absorbPerSec: number;
  partyHps: number;
  ttk120: number;
  oomAt: number | null;
  manaEnd: number;
  snapshot: CanonicalSnapshot;
  traces: CombatTraceEvent[];
  metronome: MetronomeReport[];
  notes: string[];
}

interface Rotation {
  classId: string;
  autoId: string;
  basicId: string;
  signatureId: string;
  usesMana: boolean;
  frenzy: boolean;
  partyHeal: boolean;
}

interface ResolvedAbility {
  id: string;
  occupy: number;
  cooldown: number;
  manaCost: number;
  hitCount: number;
  isDot: boolean;
  isHeal: boolean;
  isShield: boolean;
  pausesAuto: boolean;
  category: PowerCategory;
  base: number;
  totalDotBase: number;
}

interface AutoResolved {
  id: string;
  interval: number;
  base: number;
  category: PowerCategory;
}

export function loadCombatContent(content: CombatContentBundle): {
  abilities: { [id: string]: AbilityDefinition };
  autoAttacks: { [id: string]: AutoAttackDefinition };
} {
  return {
    abilities: abilityDefinitionsFromContent(content.abilities),
    autoAttacks: autoAttackDefinitionsFromContent(content.autoAttacks),
  };
}

export function withinTolerance(actual: number, expected: number, tolerance: number = CERT_DPS_TOLERANCE): boolean {
  if (!(expected > 0) || !isFinite(expected) || !isFinite(actual)) {
    return false;
  }
  return Math.abs(actual - expected) / expected <= tolerance;
}

export function simulateProgressionFight(input: SimulatorInput): SimulationResult {
  const level = input.level !== undefined ? input.level : 10;
  const duration = input.durationSec !== undefined ? input.durationSec : CERT_FIGHT_DURATION_SEC;
  const loaded = loadCombatContent(input.content);
  const rotation = rotationFor(input.catalog, input.branchId, input.partyHeal === true);
  const progression = {
    purchasedClassNodeIds: input.purchasedClassNodeIds !== undefined ? input.purchasedClassNodeIds : [],
    purchasedBranchNodeRanks: input.purchasedBranchNodeRanks !== undefined ? input.purchasedBranchNodeRanks : {},
  };
  const talentMods = talentModifiersForProgression(input.catalog, progression);
  const extra = input.extraModifiers !== undefined ? input.extraModifiers : [];
  const classDef = input.catalog.classes[rotation.classId];
  const snapshot = evaluateCanonicalSnapshot(
    canonicalInputFromClass(
      classDef,
      level,
      input.freeStatAllocations !== undefined ? input.freeStatAllocations : {},
      talentMods.concat(extra),
    ),
  );
  const notes: string[] = [];
  const metronome = metronomeReports(loaded.abilities, rotation, snapshot, notes);
  if (input.mode === "seeded") {
    return runSeeded(input, loaded, rotation, snapshot, progression, duration, metronome, notes);
  }
  return runAnalytic(input, loaded, rotation, snapshot, progression, duration, metronome, notes);
}

export function formatJsonResult(results: ReadonlyArray<SimulationResult>): string {
  return JSON.stringify({ schema: "progression_simulator_v1", results: results }, null, 2);
}

export function formatHumanReport(results: ReadonlyArray<SimulationResult>): string {
  const lines: string[] = ["Progression balance simulator", ""];
  for (let i = 0; i < results.length; i++) {
    const row = results[i];
    const target = SECTION_12_TARGETS[row.branchId];
    lines.push(row.branchId + " (" + row.mode + ")");
    lines.push("  DPS " + round3(row.dps) + (target !== undefined ? " target " + String(target.dps) : ""));
    if (row.partyHps > 0) {
      lines.push(
        "  party HPS " +
          round3(row.partyHps) +
          (target !== undefined && target.partyHps !== undefined ? " target " + String(target.partyHps) : ""),
      );
    }
    lines.push("  TTK vs 120 HP " + round3(row.ttk120) + "s");
    if (row.oomAt !== null) {
      lines.push("  OOM at " + round3(row.oomAt) + "s");
    }
    for (let m = 0; m < row.metronome.length; m++) {
      const metro = row.metronome[m];
      lines.push(
        "  Metronome " +
          metro.abilityId +
          " " +
          round3(metro.spendRate) +
          " vs regen " +
          String(metro.regen) +
          (metro.holds ? " holds" : metro.authoredMiss ? " authored miss" : " FAIL"),
      );
    }
    for (let n = 0; n < row.notes.length; n++) {
      lines.push("  note: " + row.notes[n]);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function rotationFor(catalog: ProgressionCatalog, branchId: string, partyHeal: boolean): Rotation {
  const branch = catalog.branches[branchId];
  if (branch === undefined) {
    throw new Error("unknown_branch:" + branchId);
  }
  const classDef = catalog.classes[branch.classId];
  if (classDef === undefined) {
    throw new Error("unknown_class:" + branch.classId);
  }
  return {
    classId: branch.classId,
    autoId: classDef.autoAttackId !== undefined ? classDef.autoAttackId : "",
    basicId: classDef.basicAbilityId !== undefined ? classDef.basicAbilityId : "",
    signatureId: branch.signatureAbilityId,
    usesMana: classUsesMana(classDef.resourceType),
    frenzy: branch.signatureAbilityId === FRENZY_ABILITY_ID,
    partyHeal: partyHeal,
  };
}

function runAnalytic(
  input: SimulatorInput,
  loaded: { abilities: { [id: string]: AbilityDefinition }; autoAttacks: { [id: string]: AutoAttackDefinition } },
  rotation: Rotation,
  snapshot: CanonicalSnapshot,
  progression: { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
  duration: number,
  metronome: MetronomeReport[],
  notes: string[],
): SimulationResult {
  const traces: CombatTraceEvent[] = [];
  const auto = resolveAuto(loaded.autoAttacks[rotation.autoId], snapshot);
  const basic = resolveAbility(input.catalog, loaded.abilities, rotation.basicId, snapshot, progression, rotation.partyHeal);
  const signature = resolveAbility(input.catalog, loaded.abilities, rotation.signatureId, snapshot, progression, rotation.partyHeal);
  let damage = 0;
  let healing = 0;
  let absorb = 0;
  let oomAt: number | null = null;
  let manaEnd = snapshot.manaMax;
  const frenzySpeed = rotation.frenzy ? 1.15 : 1;

  if (rotation.usesMana && basic !== null && signature !== null && signature.isDot) {
    const cycle = dotDuration(loaded.abilities[rotation.signatureId], snapshot);
    const fillers = Math.max(0, (cycle - signature.occupy) / (basic.occupy > 0 ? basic.occupy : 1));
    const witherDamage = expectedAmount(snapshot, signature, false);
    const fillerDamage = expectedAmount(snapshot, basic, true) * fillers;
    damage = ((witherDamage + fillerDamage) / cycle) * duration;
    const drain =
      (signature.manaCost / cycle - snapshot.manaRegen * (signature.occupy / cycle)) +
      (basic.manaCost / (basic.occupy > 0 ? basic.occupy : 1) - snapshot.manaRegen) * ((cycle - signature.occupy) / cycle);
    const net = signature.manaCost / cycle + (fillers * basic.manaCost) / cycle - snapshot.manaRegen;
    oomAt = net > 0 && snapshot.manaMax > 0 ? snapshot.manaMax / net : null;
    if (oomAt !== null && oomAt < duration) {
      notes.push("DoT upkeep would OOM at " + round3(oomAt) + "s");
    }
    manaEnd = oomAt !== null && oomAt < duration ? 0 : Math.max(0, snapshot.manaMax - Math.max(0, net) * duration);
    if (input.trace === true) {
      traces.push({
        time: 0,
        kind: "analytic_cycle",
        abilityId: signature.id,
        amount: witherDamage,
        notes: "dot cycle " + round3(cycle) + "s drain " + round3(drain),
      });
    }
  } else if (rotation.usesMana && basic !== null && signature !== null && signature.isShield && rotation.partyHeal) {
    healing = (expectedAmount(snapshot, basic, false) / (basic.occupy > 0 ? basic.occupy : 1)) * duration;
    absorb = signature.cooldown > 0 ? (expectedAmount(snapshot, signature, false) / signature.cooldown) * duration : 0;
    notes.push("Charms party HPS uses mend stream plus charm amortization; mana pressure is reported, not rebalanced");
    const spend = basic.manaCost / (basic.occupy > 0 ? basic.occupy : 1) + (signature.cooldown > 0 ? signature.manaCost / signature.cooldown : 0);
    const drain = spend - snapshot.manaRegen;
    oomAt = drain > 0 && snapshot.manaMax > 0 ? snapshot.manaMax / drain : null;
    manaEnd = oomAt !== null && oomAt < duration ? 0 : Math.max(0, snapshot.manaMax - Math.max(0, drain) * duration);
  } else if (rotation.usesMana && basic !== null && (signature === null || signature.isShield || signature.base <= 0) && (signature === null || !signature.isDot)) {
    const rate = expectedAmount(snapshot, basic, true) / (basic.occupy > 0 ? basic.occupy : 1);
    const drain = basic.manaCost / (basic.occupy > 0 ? basic.occupy : 1) - snapshot.manaRegen;
    oomAt = drain > 0 && snapshot.manaMax > 0 ? snapshot.manaMax / drain : null;
    const live = oomAt !== null && oomAt < duration ? oomAt : duration;
    damage = rate * live;
    manaEnd = oomAt !== null && oomAt < duration ? 0 : Math.max(0, snapshot.manaMax - Math.max(0, drain) * duration);
  } else if (rotation.usesMana && basic !== null && signature !== null && signature.manaCost > 0 && signature.occupy > 0 && signature.base > 0) {
    const spenderDps = expectedAmount(snapshot, signature, true) / signature.occupy;
    const fillerDps = expectedAmount(snapshot, basic, true) / (basic.occupy > 0 ? basic.occupy : 1);
    const drain = signature.manaCost / signature.occupy - snapshot.manaRegen;
    oomAt = drain > 0 && snapshot.manaMax > 0 ? snapshot.manaMax / drain : null;
    const spenderSeconds = oomAt !== null && oomAt < duration ? oomAt : duration;
    const fillerSeconds = duration - spenderSeconds;
    damage = spenderDps * spenderSeconds + fillerDps * fillerSeconds;
    manaEnd = fillerSeconds > 0 ? Math.max(0, 0 + snapshot.manaRegen * fillerSeconds) : 0;
    if (input.trace === true) {
      traces.push({ time: 0, kind: "spender_phase", abilityId: signature.id, amount: spenderDps, notes: round3(spenderSeconds) + "s" });
      traces.push({ time: spenderSeconds, kind: "filler_phase", abilityId: basic.id, amount: fillerDps, notes: round3(fillerSeconds) + "s" });
    }
  } else {
    const autoAmount = auto !== null ? scalePower(auto.base, auto.category, snapshot.stats) * formulaCritExpectedValue(snapshot.critChance, snapshot.critMult) : 0;
    const autoInterval = auto !== null ? auto.interval / frenzySpeed : 1;
    if (signature !== null && signature.pausesAuto && auto !== null) {
      const window = signature.cooldown > 0 ? signature.cooldown : 1;
      const uptime = Math.max(0, 1 - signature.occupy / window);
      damage = (autoAmount / autoInterval) * uptime * duration;
      if (basic !== null && basic.base > 0) {
        const basicWindow = basic.cooldown > 0 ? basic.cooldown : 1;
        damage += (expectedAmount(snapshot, basic, true) / basicWindow) * duration;
      }
      damage += (expectedAmount(snapshot, signature, true) / window) * duration;
    } else {
      if (auto !== null) {
        damage += (autoAmount / autoInterval) * duration;
      }
      if (basic !== null && basic.base > 0 && !basic.isHeal && !basic.isShield) {
        const window = basic.cooldown > 0 ? basic.cooldown : basic.occupy > 0 ? basic.occupy : 1;
        damage += (expectedAmount(snapshot, basic, true) / window) * duration;
      }
      if (signature !== null && signature.base > 0 && !signature.isHeal && !signature.isShield) {
        const window = signature.cooldown > 0 ? signature.cooldown : signature.occupy > 0 ? signature.occupy : 1;
        damage += (expectedAmount(snapshot, signature, true) / window) * duration;
      }
    }
  }

  const dps = duration > 0 ? damage / duration : 0;
  const hps = duration > 0 ? healing / duration : 0;
  const absorbPerSec = duration > 0 ? absorb / duration : 0;
  return finishResult(input, rotation, snapshot, duration, damage, healing, absorb, dps, hps, absorbPerSec, oomAt, manaEnd, traces, metronome, notes);
}

function runSeeded(
  input: SimulatorInput,
  loaded: { abilities: { [id: string]: AbilityDefinition }; autoAttacks: { [id: string]: AutoAttackDefinition } },
  rotation: Rotation,
  snapshot: CanonicalSnapshot,
  progression: { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
  duration: number,
  metronome: MetronomeReport[],
  notes: string[],
): SimulationResult {
  const random = seededRandom(input.seed !== undefined ? input.seed : 1);
  const traces: CombatTraceEvent[] = [];
  const auto = resolveAuto(loaded.autoAttacks[rotation.autoId], snapshot);
  const basic = resolveAbility(input.catalog, loaded.abilities, rotation.basicId, snapshot, progression, rotation.partyHeal);
  const signature = resolveAbility(input.catalog, loaded.abilities, rotation.signatureId, snapshot, progression, rotation.partyHeal);
  const frenzyDef = loaded.abilities[FRENZY_ABILITY_ID];
  const frenzyPerStack =
    frenzyDef !== undefined && frenzyDef.effects.length > 0 ? numberOr(frenzyDef.effects[0].magnitude.value, 0.05) : 0.05;
  const frenzyMax = frenzyDef !== undefined && frenzyDef.effects.length > 0 ? numberOr(frenzyDef.effects[0].maxStacks, 3) : 3;
  const frenzyWindow = frenzyDef !== undefined && frenzyDef.effects.length > 0 ? numberOr(frenzyDef.effects[0].duration, 5) : 5;
  let time = 0;
  let busyUntil = 0;
  let mana = snapshot.manaMax;
  let damage = 0;
  let healing = 0;
  let absorb = 0;
  let oomAt: number | null = null;
  let nextAuto = 0;
  let basicCd = 0;
  let signatureCd = 0;
  let frenzyStacks = 0;
  let frenzyExpire = 0;
  const dots: Array<{ remaining: number; ticks: number; interval: number; next: number; amountPerTick: number }> = [];

  while (time < duration - 1e-9) {
    const speed = frenzyAttackSpeed(rotation.frenzy, frenzyStacks, frenzyPerStack, frenzyMax);
    const autoInterval = auto !== null ? auto.interval / speed : duration;
    const nextDot = nextDotTime(dots, duration);
    let stepTo = Math.min(
      duration,
      time < busyUntil ? busyUntil : duration,
      nextDot,
      auto !== null && time >= busyUntil ? Math.max(nextAuto, time) : duration,
      basic !== null ? Math.max(basicCd, time) : duration,
      signature !== null ? Math.max(signatureCd, time) : duration,
      time + autoInterval,
    );
    if (stepTo <= time) {
      stepTo = Math.min(duration, time + 0.001);
    }
    const dt = stepTo - time;
    mana = regenerateMana(mana, snapshot.manaMax, snapshot.manaRegen, dt);
    advanceDots(dots, stepTo, function (amount) {
      damage += amount;
      if (input.trace === true) {
        traces.push({ time: stepTo, kind: "dot_tick", amount: amount, mana: mana });
      }
    });
    time = stepTo;
    if (time >= frenzyExpire) {
      frenzyStacks = 0;
    }
    if (time + 1e-9 >= duration) {
      break;
    }
    if (time < busyUntil) {
      continue;
    }
    const canSig = signature !== null && time + 1e-9 >= signatureCd && canAfford(mana, signature.manaCost);
    const canBasic = basic !== null && time + 1e-9 >= basicCd && canAfford(mana, basic.manaCost);
    if (canSig && shouldPreferSignature(rotation, signature, mana) && signature !== null) {
      const landed = applyResolved(signature, snapshot, random);
      mana -= signature.manaCost;
      if (signature.manaCost > 0 && mana <= 1e-9 && oomAt === null) {
        oomAt = time;
      }
      signatureCd = time + Math.max(signature.cooldown, signature.occupy);
      busyUntil = time + signature.occupy;
      nextAuto = Math.max(nextAuto, busyUntil);
      damage += landed.damage;
      healing += landed.healing;
      absorb += landed.absorb;
      queueDot(dots, signature, snapshot, time);
      if (rotation.frenzy && landed.damage > 0) {
        frenzyStacks = Math.min(frenzyMax, frenzyStacks + 1);
        frenzyExpire = time + frenzyWindow;
      }
      recordTrace(input, traces, time, signature.id, landed, mana);
      continue;
    }
    if (canBasic && basic !== null) {
      const landed = applyResolved(basic, snapshot, random);
      mana -= basic.manaCost;
      if (basic.manaCost > 0 && mana <= 1e-9 && oomAt === null) {
        oomAt = time;
      }
      basicCd = time + (basic.cooldown > 0 ? basic.cooldown : basic.occupy);
      busyUntil = time + basic.occupy;
      nextAuto = Math.max(nextAuto, busyUntil);
      damage += landed.damage;
      healing += landed.healing;
      absorb += landed.absorb;
      queueDot(dots, basic, snapshot, time);
      if (rotation.frenzy && landed.damage > 0) {
        frenzyStacks = Math.min(frenzyMax, frenzyStacks + 1);
        frenzyExpire = time + frenzyWindow;
      }
      recordTrace(input, traces, time, basic.id, landed, mana);
      continue;
    }
    if (auto !== null && time + 1e-9 >= nextAuto && !rotation.usesMana) {
      const interval = auto.interval / frenzyAttackSpeed(rotation.frenzy, frenzyStacks, frenzyPerStack, frenzyMax);
      const landed = rollDirect(auto.base, auto.category, snapshot, random);
      damage += landed.final;
      nextAuto = time + interval;
      if (rotation.frenzy && landed.final > 0) {
        frenzyStacks = Math.min(frenzyMax, frenzyStacks + 1);
        frenzyExpire = time + frenzyWindow;
      }
      recordTrace(input, traces, time, auto.id, { damage: landed.final, healing: 0, absorb: 0, crit: landed.crit }, mana);
      continue;
    }
    if (stepTo === time) {
      time = Math.min(duration, time + 0.01);
      mana = regenerateMana(mana, snapshot.manaMax, snapshot.manaRegen, 0.01);
    }
  }

  const dps = duration > 0 ? damage / duration : 0;
  const hps = duration > 0 ? healing / duration : 0;
  const absorbPerSec = duration > 0 ? absorb / duration : 0;
  return finishResult(input, rotation, snapshot, duration, damage, healing, absorb, dps, hps, absorbPerSec, oomAt, mana, traces, metronome, notes);
}

function finishResult(
  input: SimulatorInput,
  rotation: Rotation,
  snapshot: CanonicalSnapshot,
  duration: number,
  damage: number,
  healing: number,
  absorb: number,
  dps: number,
  hps: number,
  absorbPerSec: number,
  oomAt: number | null,
  manaEnd: number,
  traces: CombatTraceEvent[],
  metronome: MetronomeReport[],
  notes: string[],
): SimulationResult {
  const partyHps = hps + absorbPerSec;
  const ttk120 = dps > 0 ? STANDARD_MOB_HP_L10 / dps : Number.POSITIVE_INFINITY;
  return {
    classId: rotation.classId,
    branchId: input.branchId,
    mode: input.mode,
    durationSec: duration,
    damage: damage,
    healing: healing,
    absorb: absorb,
    dps: dps,
    hps: hps,
    absorbPerSec: absorbPerSec,
    partyHps: partyHps,
    ttk120: ttk120,
    oomAt: oomAt,
    manaEnd: manaEnd,
    snapshot: snapshot,
    traces: traces,
    metronome: metronome,
    notes: notes,
  };
}

function resolveAbility(
  catalog: ProgressionCatalog,
  abilities: { [id: string]: AbilityDefinition },
  abilityId: string,
  snapshot: CanonicalSnapshot,
  progression: { purchasedClassNodeIds: ReadonlyArray<string>; purchasedBranchNodeRanks: { [id: string]: number } },
  partyHeal: boolean,
): ResolvedAbility | null {
  if (abilityId.length === 0) {
    return null;
  }
  const ability = abilities[abilityId];
  if (ability === undefined) {
    return null;
  }
  const talent = resolveAbilityTalentModifiers(catalog, progression, abilityId, { sourceTags: [] });
  const occupyCast = hasteScaledCastTime(ability.castTime, snapshot.hasteMult, 1);
  const occupyChannel = hasteScaledCastTime(
    ability.channelTime,
    snapshot.hasteMult,
    talent.channelTimeMultiplier > 0 ? 1 / talent.channelTimeMultiplier : 1,
  );
  const occupy = occupyCast + occupyChannel;
  const effect = selectEffect(ability, partyHeal);
  if (effect === null) {
    return {
      id: abilityId,
      occupy: occupy,
      cooldown: ability.individualCooldown,
      manaCost: scaledManaCost(manaCostOf(ability), []) * talent.manaCostMultiplier,
      hitCount: 1,
      isDot: false,
      isHeal: false,
      isShield: false,
      pausesAuto: occupyChannel > 0,
      category: "spell",
      base: 0,
      totalDotBase: 0,
    };
  }
  const isDot = effect.type === "periodic_damage" || effect.type === "periodic_heal";
  const isHeal = effect.type === "direct_heal" || effect.type === "periodic_heal";
  const isShield = effect.type === "shield_absorb" || String(effect.type) === "shield";
  const base = numberOr(effect.magnitude.value, 0);
  const ticks = isDot && effect.tickInterval > 0 ? effect.duration / effect.tickInterval : 0;
  const hitCount =
    talent.hitCountOverride !== undefined && talent.hitCountOverride > 0
      ? talent.hitCountOverride
      : effect.hitCount !== undefined && effect.hitCount > 1
        ? effect.hitCount
        : 1;
  const occupyOverride =
    talent.castTimeOverride !== undefined ? hasteScaledCastTime(talent.castTimeOverride, snapshot.hasteMult, 1) : occupy;
  const scaledBase = isHeal || isShield ? base * talent.healMultiplier * talent.absorbMultiplier : base * talent.damageMultiplier;
  return {
    id: abilityId,
    occupy: occupyOverride,
    cooldown: ability.individualCooldown,
    manaCost: scaledManaCost(manaCostOf(ability), []) * talent.manaCostMultiplier,
    hitCount: hitCount,
    isDot: isDot,
    isHeal: isHeal,
    isShield: isShield,
    pausesAuto: occupyChannel > 0,
    category: powerCategoryOf(effect),
    base: scaledBase,
    totalDotBase: isDot ? scaledBase * ticks : 0,
  };
}

function resolveAuto(auto: AutoAttackDefinition | undefined, snapshot: CanonicalSnapshot): AutoResolved | null {
  if (auto === undefined) {
    return null;
  }
  const category: PowerCategory =
    auto.school === "melee" || auto.school === "ranged" || auto.school === "spell" ? auto.school : "melee";
  return {
    id: auto.id,
    interval: hasteScaledAttackInterval(auto.interval, snapshot.hasteMult, 1),
    base: auto.baseDamage,
    category: category,
  };
}

function expectedAmount(snapshot: CanonicalSnapshot, ability: ResolvedAbility, applyCritEv: boolean): number {
  if (ability.isDot) {
    return scalePower(ability.totalDotBase, ability.category, snapshot.stats);
  }
  const scaled = scalePower(ability.base, ability.category, snapshot.stats) * ability.hitCount;
  if (ability.isHeal || ability.isShield || !applyCritEv) {
    return scaled;
  }
  return scaled * formulaCritExpectedValue(snapshot.critChance, snapshot.critMult);
}

function applyResolved(
  ability: ResolvedAbility,
  snapshot: CanonicalSnapshot,
  random: CombatRandom,
): { damage: number; healing: number; absorb: number; crit: boolean } {
  if (ability.isDot) {
    return { damage: 0, healing: 0, absorb: 0, crit: false };
  }
  let damage = 0;
  let healing = 0;
  let absorb = 0;
  let crit = false;
  for (let i = 0; i < ability.hitCount; i++) {
    const hit = rollDirect(ability.base, ability.category, snapshot, random, ability.isShield);
    crit = crit || hit.crit;
    if (ability.isShield) {
      absorb += hit.final;
    } else if (ability.isHeal) {
      healing += hit.final;
    } else {
      damage += hit.final;
    }
  }
  return { damage: damage, healing: healing, absorb: absorb, crit: crit };
}

function rollDirect(
  base: number,
  category: PowerCategory,
  snapshot: CanonicalSnapshot,
  random: CombatRandom,
  isShield = false,
): { final: number; crit: boolean } {
  return evaluateCanonicalHit({
    base: base,
    category: category,
    stats: snapshot.stats,
    critChance: snapshot.critChance,
    critMult: snapshot.critMult,
    outgoingProduct: 1,
    damageReduction: 0,
    takenProduct: 1,
    critDamageProduct: snapshot.critDamageProduct,
    healDoneProduct: snapshot.healDoneProduct,
    isDot: false,
    isShield: isShield,
    random: random,
  });
}

function selectEffect(ability: AbilityDefinition, partyHeal: boolean): EffectDefinition | null {
  let damage: EffectDefinition | null = null;
  let heal: EffectDefinition | null = null;
  let shield: EffectDefinition | null = null;
  for (let i = 0; i < ability.effects.length; i++) {
    const effect = ability.effects[i];
    if (effect.type === "direct_damage" || effect.type === "periodic_damage") {
      damage = effect;
    } else if (effect.type === "direct_heal" || effect.type === "periodic_heal") {
      heal = effect;
    } else if (effect.type === "shield_absorb" || String(effect.type) === "shield") {
      shield = effect;
    }
  }
  if (partyHeal) {
    if (heal !== null) {
      return heal;
    }
    if (shield !== null) {
      return shield;
    }
  }
  if (damage !== null) {
    return damage;
  }
  if (shield !== null) {
    return shield;
  }
  return heal;
}

function powerCategoryOf(effect: EffectDefinition): PowerCategory {
  if (
    effect.powerCategory === "melee" ||
    effect.powerCategory === "ranged" ||
    effect.powerCategory === "spell" ||
    effect.powerCategory === "curse"
  ) {
    return effect.powerCategory;
  }
  if (effect.powerCategory === "heal") {
    return "heal";
  }
  const statId = effect.magnitude.statId;
  if (statId === "stat.strength") {
    return "melee";
  }
  if (statId === "stat.agility") {
    return "ranged";
  }
  if (statId === "stat.spirit") {
    return "heal";
  }
  return "spell";
}

function manaCostOf(ability: AbilityDefinition): number {
  let total = 0;
  for (let i = 0; i < ability.resourceCosts.length; i++) {
    total += ability.resourceCosts[i].amount;
  }
  return total;
}

function canAfford(mana: number, cost: number): boolean {
  return cost <= 0 || mana + 1e-9 >= cost;
}

function shouldPreferSignature(rotation: Rotation, signature: ResolvedAbility | null, mana: number): boolean {
  if (signature === null) {
    return false;
  }
  if (signature.isShield) {
    return rotation.partyHeal;
  }
  if (rotation.frenzy) {
    return false;
  }
  if (signature.base <= 0 && !signature.isDot) {
    return false;
  }
  return canAfford(mana, signature.manaCost);
}

function frenzyAttackSpeed(enabled: boolean, stacks: number, perStack: number, maxStacks: number): number {
  if (!enabled) {
    return 1;
  }
  const used = stacks < maxStacks ? stacks : maxStacks;
  return 1 + used * perStack;
}

function dotDuration(ability: AbilityDefinition, snapshot: CanonicalSnapshot): number {
  for (let i = 0; i < ability.effects.length; i++) {
    const effect = ability.effects[i];
    if (effect.type === "periodic_damage" && effect.tickInterval > 0) {
      const ticks = effect.duration / effect.tickInterval;
      return ticks * (effect.tickInterval / snapshot.hasteMult);
    }
  }
  return ability.individualCooldown > 0 ? ability.individualCooldown : 8;
}

function queueDot(
  dots: Array<{ remaining: number; ticks: number; interval: number; next: number; amountPerTick: number }>,
  ability: ResolvedAbility,
  snapshot: CanonicalSnapshot,
  time: number,
): void {
  if (!ability.isDot || ability.totalDotBase <= 0) {
    return;
  }
  const total = scalePower(ability.totalDotBase, ability.category, snapshot.stats);
  const ticks = 8;
  const interval = 1 / snapshot.hasteMult;
  dots.push({
    remaining: total,
    ticks: ticks,
    interval: interval,
    next: time + interval,
    amountPerTick: total / ticks,
  });
}

function nextDotTime(dots: Array<{ next: number; ticks: number }>, duration: number): number {
  let soonest = duration;
  for (let i = 0; i < dots.length; i++) {
    if (dots[i].ticks > 0 && dots[i].next < soonest) {
      soonest = dots[i].next;
    }
  }
  return soonest;
}

function advanceDots(
  dots: Array<{ remaining: number; ticks: number; interval: number; next: number; amountPerTick: number }>,
  time: number,
  onTick: (amount: number) => void,
): void {
  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i];
    while (dot.ticks > 0 && dot.next <= time + 1e-9) {
      const amount = dot.amountPerTick;
      dot.remaining -= amount;
      dot.ticks -= 1;
      onTick(amount);
      dot.next += dot.interval;
    }
  }
}

function metronomeReports(
  abilities: { [id: string]: AbilityDefinition },
  rotation: Rotation,
  snapshot: CanonicalSnapshot,
  notes: string[],
): MetronomeReport[] {
  const reports: MetronomeReport[] = [];
  if (!rotation.usesMana || rotation.basicId.length === 0) {
    return reports;
  }
  const ability = abilities[rotation.basicId];
  if (ability === undefined) {
    return reports;
  }
  const cost = manaCostOf(ability);
  const effectiveCast = formulaCastTime(ability.castTime, snapshot.hasteMult);
  const spendRate = effectiveCast > 0 ? cost / effectiveCast : 0;
  const holds = spendRate <= snapshot.manaRegen + 1e-9;
  const authoredMiss = rotation.classId === "class.mystic" && !holds;
  if (authoredMiss) {
    notes.push(
      "Fateweave metronome miss is authored (" + round3(spendRate) + " > " + String(snapshot.manaRegen) + ") and is not rebalanced",
    );
  }
  reports.push({
    abilityId: ability.id,
    cost: cost,
    effectiveCast: effectiveCast,
    spendRate: spendRate,
    regen: snapshot.manaRegen,
    holds: holds,
    authoredMiss: authoredMiss,
  });
  return reports;
}

function recordTrace(
  input: SimulatorInput,
  traces: CombatTraceEvent[],
  time: number,
  abilityId: string,
  landed: { damage: number; healing: number; absorb: number; crit: boolean },
  mana: number,
): void {
  if (input.trace !== true) {
    return;
  }
  traces.push({
    time: time,
    kind: "cast",
    abilityId: abilityId,
    amount: landed.damage + landed.healing + landed.absorb,
    crit: landed.crit,
    mana: mana,
  });
}

function numberOr(value: number | undefined, fallback: number): number {
  if (value === undefined || !isFinite(value)) {
    return fallback;
  }
  return value;
}

function round3(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}
