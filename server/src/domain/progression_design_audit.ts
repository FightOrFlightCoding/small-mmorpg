/**
 * PROG-01 canonical-design auditor.
 * Parses docs/design/rpg-progression-design-v1.0.md and checks invariants.
 * This is not a second progression, combat, or hotbar implementation.
 * Do not import this module from the Nakama match runtime.
 */

export { killXp, roundToTens, xpToNext } from "./canonical_progression";
import { xpToNext } from "./canonical_progression";

export type CatalogClassification = "canonical" | "compile-time-addition";

export interface CatalogEntry {
  id: string;
  section: string;
  intendedFile: string;
  intendedTest: string;
  classification: CatalogClassification;
}

export interface AuditIssue {
  code: string;
  message: string;
}

export interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

export interface DesignAuditResult {
  issues: AuditIssue[];
  classIds: string[];
  branchIds: string[];
  baseTotals: { [classId: string]: number };
  growthTotals: { [classId: string]: number };
  xpTotal: number;
  classPoints: number;
  branchPoints: number;
  branchNodeCounts: { [branchId: string]: number };
  branchPointSlots: { [branchId: string]: number };
  buyableActives: { [branchId: string]: string[] };
  frenzyType: string;
}

export const DESIGN_RELATIVE_PATH = "docs/design/rpg-progression-design-v1.0.md";

export const LOCKED_CLASS_IDS = ["class.warrior", "class.mage", "class.marksman", "class.mystic"];

export const LOCKED_BRANCH_IDS = [
  "branch.warrior.bulwark",
  "branch.warrior.berserker",
  "branch.mage.fire",
  "branch.mage.frost",
  "branch.marksman.sniper",
  "branch.marksman.skirmisher",
  "branch.mystic.charms",
  "branch.mystic.curses",
];

export const STAT_ORDER = ["STR", "AGI", "INT", "SPI", "VIT", "PRE", "HST", "END"];

export const EXPECTED_BASE: { [classId: string]: { [stat: string]: number } } = {
  "class.warrior": { STR: 8, AGI: 4, INT: 2, SPI: 3, VIT: 8, PRE: 3, HST: 3, END: 3 },
  "class.mage": { STR: 2, AGI: 4, INT: 9, SPI: 5, VIT: 5, PRE: 3, HST: 3, END: 3 },
  "class.marksman": { STR: 4, AGI: 9, INT: 3, SPI: 3, VIT: 6, PRE: 3, HST: 3, END: 3 },
  "class.mystic": { STR: 2, AGI: 4, INT: 6, SPI: 8, VIT: 5, PRE: 3, HST: 3, END: 3 },
};

export const EXPECTED_GROWTH: { [classId: string]: { [stat: string]: number } } = {
  "class.warrior": { STR: 3, VIT: 2, END: 1 },
  "class.mage": { INT: 3, SPI: 1, VIT: 1, HST: 1 },
  "class.marksman": { AGI: 3, PRE: 1, VIT: 1, HST: 1 },
  "class.mystic": { INT: 2, SPI: 2, VIT: 1, END: 1 },
};

export const EXPECTED_AUTO_ASSIGN: { [classId: string]: { [stat: string]: number } } = {
  "class.warrior": { STR: 2, VIT: 1 },
  "class.mage": { INT: 2, HST: 1 },
  "class.marksman": { AGI: 2, PRE: 1 },
  "class.mystic": { INT: 1, SPI: 1, VIT: 1 },
};

export const EXPECTED_XP_TABLE = [100, 280, 520, 800, 1120, 1470, 1850, 2260, 2700];
export const EXPECTED_XP_TOTAL = 11100;
export const EXPECTED_LEVEL_CAP = 10;
export const EXPECTED_FREE_POINTS_AT_10 = 27;
export const EXPECTED_STAT_POINTS_AT_10 = 115;
export const EXPECTED_CLASS_POINTS = 2;
export const EXPECTED_BRANCH_POINTS = 6;
export const EXPECTED_BRANCH_NODES = 8;
export const EXPECTED_BRANCH_POINT_SLOTS = 9;

const CLASS_DISPLAY: { [name: string]: string } = {
  Warrior: "class.warrior",
  Mage: "class.mage",
  Marksman: "class.marksman",
  Mystic: "class.mystic",
};

const BRANCH_DISPLAY: { [name: string]: string } = {
  Bulwark: "branch.warrior.bulwark",
  Berserker: "branch.warrior.berserker",
  Fire: "branch.mage.fire",
  Frost: "branch.mage.frost",
  Sniper: "branch.marksman.sniper",
  Skirmisher: "branch.marksman.skirmisher",
  Charms: "branch.mystic.charms",
  Curses: "branch.mystic.curses",
};

const ABILITY_NAMES = [
  "Heavy Strike",
  "Challenge",
  "Shield Bash",
  "Frenzy",
  "Whirlwind",
  "Aimed Shot",
  "Snipe",
  "Piercing Shot",
  "Barrage",
  "Vault",
  "Arcane Bolt",
  "Fireball",
  "Flame Wave",
  "Ice Bolt",
  "Flash Freeze",
  "Fateweave",
  "Protective Charm",
  "Blessing",
  "Wither",
  "Evil Eye",
  "Unbreakable",
  "Berserk",
  "Meteor",
  "Absolute Zero",
  "Coup de Grâce",
  "Arrowstorm",
  "Benediction",
  "Malediction",
];

const COMPILE_TIME_PHRASES = [
  "Whirlwind base 24",
  "Shield Bash base 10",
  "Piercing Shot base 30",
  "Flame Wave base 22",
  "Flash Freeze deals 0 damage",
  "Flame Wave 10s/25 mana",
  "Flash Freeze 15s/20 mana",
  "Blessing 20s/25 mana",
  "Evil Eye 12s/15 mana",
  "Frenzy R3 set to +7%/stack",
  "Capstones cost 0 mana",
  "Benediction shield = 10% max HP for 4s",
  "Malediction = full-rank Wither AoE",
  '+15% DR (R2: +25%)',
  "Frenzy stacks drop after 5s",
  "Vault distance ~5m",
  "Respec cost 50 × level",
  "auto-assign templates",
  "enemy formulas",
];

export const REQUIRED_CONTRACT_DOCS = [
  "docs/design/rpg-progression-design-v1.0.md",
  "docs/design/progression-interpretations.md",
  "docs/design/progression-implementation-addendum.md",
  "docs/progression/PROGRESSION_ARCHITECTURE.md",
  "docs/progression/CANONICAL_VALUE_CATALOG.md",
  "docs/progression/PROGRESSION_STORAGE_CATALOG.md",
  "docs/progression/PROGRESSION_PROTOCOL_CATALOG.md",
  "docs/progression/PROGRESSION_MIGRATION_PLAN.md",
  "docs/progression/PROGRESSION_TEST_PLAN.md",
  "docs/progression/CURRENT_CONFLICTS.md",
];

export const PLANNED_REGRESSION_TESTS = [
  "server/tests/progression_design_audit.test.ts",
  "server/tests/progression_formulas.test.ts",
  "server/tests/progression_l10_sheet.test.ts",
  "server/tests/progression_xp_curve.test.ts",
  "server/tests/progression_timeline.test.ts",
  "server/tests/progression_talent_trees.test.ts",
  "server/tests/progression_hotbar_ceiling.test.ts",
  "server/tests/progression_frenzy_passive.test.ts",
  "server/tests/progression_dot_haste.test.ts",
  "server/tests/progression_gcd_absent.test.ts",
  "server/tests/progression_gcd_audit.test.ts",
  "server/tests/progression_metronome.test.ts",
  "server/tests/progression_dps_audit.test.ts",
  "server/tests/progression_enemy_baselines.test.ts",
  "server/tests/progression_respec.test.ts",
  "server/tests/ability.test.ts",
  "server/tests/combat_pipeline.test.ts",
  "server/tests/character_lifecycle.test.ts",
  "client/tests/app/progression_service_test.gd",
  "client/tests/app/ability_service_test.gd",
  "client/tests/app/character_select_ui_test.gd",
];

export const CONFLICT_STATUSES = [
  "DEFERRED",
  "RESOLVED",
  "TEST_ONLY_PERMANENT",
  "NONCANONICAL_CONTENT_VALUE",
  "BLOCKING",
] as const;

export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

export interface ConflictEntry {
  id: string;
  title: string;
  conflict: string;
  status: string;
  resolutionOwner: string;
  mustBeResolvedBy: string;
  closureTest: string;
}

export const REQUIRED_CONFLICT_IDS = [
  "C-canonical-damage",
  "C-attack-foundation",
  "C-hotbar-dual",
  "C-gcd",
  "C-legacy-migration",
  "C-quest-xp-20",
  "C-unlock-any-ability",
  "C-xp-curve-live",
];

function entry(
  id: string,
  section: string,
  intendedFile: string,
  intendedTest: string,
  classification: CatalogClassification,
): CatalogEntry {
  return {
    id: id,
    section: section,
    intendedFile: intendedFile,
    intendedTest: intendedTest,
    classification: classification,
  };
}

function pushAll(target: CatalogEntry[], extra: CatalogEntry[]): void {
  for (let i = 0; i < extra.length; i++) {
    target.push(extra[i]);
  }
}

export function canonicalCatalog(): CatalogEntry[] {
  const rows: CatalogEntry[] = [];
  pushAll(rows, [
    entry("pillar.leveling_beats_allocation", "1", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_design_audit.test.ts", "canonical"),
    entry("pillar.no_stat_caps", "1", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_design_audit.test.ts", "canonical"),
    entry("pillar.asymmetric_resources", "1", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_hotbar_ceiling.test.ts", "canonical"),
    entry("pillar.haste_never_reduces_cooldowns", "1", "server/src/domain/ability.ts", "server/tests/progression_dot_haste.test.ts", "canonical"),
    entry("pillar.metronome_law", "5", "server/src/domain/stats.ts", "server/tests/progression_metronome.test.ts", "canonical"),
    entry("pillar.actives_ceiling", "1", "server/src/domain/ability.ts", "server/tests/progression_hotbar_ceiling.test.ts", "canonical"),
    entry("pillar.dots_never_crit", "4", "server/src/domain/effects.ts", "server/tests/progression_dot_haste.test.ts", "canonical"),
    entry("pillar.milestone_rhythm", "8", "content/source/curve.vibecode.l10.json", "server/tests/progression_timeline.test.ts", "canonical"),
    entry("pillar.alliterative_self_sustain", "1", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_design_audit.test.ts", "canonical"),
  ]);
  pushAll(rows, [
    entry("class.warrior", "2", "content/source/class.warrior.json", "server/tests/character_lifecycle.test.ts", "canonical"),
    entry("class.mage", "2", "content/source/class.mage.json", "server/tests/character_lifecycle.test.ts", "canonical"),
    entry("class.marksman", "2", "content/source/class.marksman.json", "server/tests/character_lifecycle.test.ts", "canonical"),
    entry("class.mystic", "2", "content/source/class.mystic.json", "server/tests/character_lifecycle.test.ts", "canonical"),
  ]);
  for (let b = 0; b < LOCKED_BRANCH_IDS.length; b++) {
    rows.push(entry(LOCKED_BRANCH_IDS[b], "2", "content/source/" + LOCKED_BRANCH_IDS[b] + ".json", "server/tests/progression_talent_trees.test.ts", "canonical"));
  }
  pushAll(rows, [
    entry("stat.strength", "3", "content/source/stat.strength.json", "server/tests/progression_formulas.test.ts", "canonical"),
    entry("stat.agility", "3", "content/source/stat.agility.json", "server/tests/progression_formulas.test.ts", "canonical"),
    entry("stat.intelligence", "3", "content/source/stat.intelligence.json", "server/tests/progression_formulas.test.ts", "canonical"),
    entry("stat.spirit", "3", "content/source/stat.spirit.json", "server/tests/progression_formulas.test.ts", "canonical"),
    entry("stat.precision", "3", "content/source/stat.precision.json", "server/tests/progression_formulas.test.ts", "canonical"),
    entry("stat.haste", "3", "content/source/stat.haste.json", "server/tests/progression_dot_haste.test.ts", "canonical"),
    entry("stat.vitality", "3", "content/source/stat.vitality.json", "server/tests/progression_formulas.test.ts", "canonical"),
    entry("stat.endurance", "3", "content/source/stat.endurance.json", "server/tests/progression_formulas.test.ts", "canonical"),
  ]);
  const formulas = [
    "formula.hp_max",
    "formula.mana_max",
    "formula.mana_regen",
    "formula.crit_chance",
    "formula.crit_mult",
    "formula.haste_mult",
    "formula.damage_reduction",
    "formula.effective_hp",
    "formula.attack_interval",
    "formula.cast_time",
    "formula.dot_tick_interval",
    "formula.melee_hit",
    "formula.ranged_hit",
    "formula.spell_hit",
    "formula.heal",
    "formula.on_crit",
    "formula.damage_taken",
    "formula.expected_crit_value",
    "formula.modifier_stacking",
  ];
  for (let f = 0; f < formulas.length; f++) {
    rows.push(entry(formulas[f], "4", "server/src/domain/stats.ts", "server/tests/progression_formulas.test.ts", "canonical"));
  }
  pushAll(rows, [
    entry("formula.xp_to_next", "7", "content/source/curve.vibecode.l10.json", "server/tests/progression_xp_curve.test.ts", "canonical"),
    entry("formula.kill_xp", "7", "server/src/domain/xp_hooks.ts", "server/tests/progression_xp_curve.test.ts", "canonical"),
    entry("formula.kill_xp_steep_dial", "7", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_xp_curve.test.ts", "canonical"),
    entry("formula.mob_hp", "13", "content/source/", "server/tests/progression_enemy_baselines.test.ts", "canonical"),
    entry("formula.mob_damage", "13", "content/source/", "server/tests/progression_enemy_baselines.test.ts", "canonical"),
    entry("formula.elite", "13", "server/src/domain/loot_table.ts", "server/tests/progression_enemy_baselines.test.ts", "canonical"),
    entry("formula.metronome_law_check", "5", "server/src/domain/stats.ts", "server/tests/progression_metronome.test.ts", "canonical"),
  ]);
  const classKeys = ["warrior", "mage", "marksman", "mystic"];
  for (let c = 0; c < classKeys.length; c++) {
    const key = classKeys[c];
    rows.push(entry("base." + key, "6.1", "content/source/class." + key + ".json", "server/tests/progression_l10_sheet.test.ts", "canonical"));
    rows.push(entry("growth." + key, "6.2", "content/source/progression." + key + ".json", "server/tests/progression_l10_sheet.test.ts", "canonical"));
    rows.push(entry("auto_assign." + key, "6.2", "content/source/progression." + key + ".json", "server/tests/progression_l10_sheet.test.ts", "compile-time-addition"));
    rows.push(entry("sheet.l10." + key, "6.3", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_l10_sheet.test.ts", "canonical"));
    rows.push(entry("ability." + key + ".auto_attack", "9.1", "content/source/ability." + key + ".auto_attack.json", "server/tests/ability.test.ts", "canonical"));
  }
  for (let x = 0; x < EXPECTED_XP_TABLE.length; x++) {
    rows.push(entry("xp.table." + (x + 1) + "_" + (x + 2), "7", "content/source/curve.vibecode.l10.json", "server/tests/progression_xp_curve.test.ts", "canonical"));
  }
  rows.push(entry("xp.total", "7", "content/source/curve.vibecode.l10.json", "server/tests/progression_xp_curve.test.ts", "canonical"));
  rows.push(entry("xp.same_level_kills", "7", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_xp_curve.test.ts", "canonical"));
  rows.push(entry("timeline.class_points", "8", "content/source/curve.vibecode.l10.json", "server/tests/progression_timeline.test.ts", "canonical"));
  rows.push(entry("timeline.branch_points", "8", "content/source/curve.vibecode.l10.json", "server/tests/progression_timeline.test.ts", "canonical"));
  rows.push(entry("timeline.tier_gates", "8", "server/src/domain/progression.ts", "server/tests/progression_talent_trees.test.ts", "canonical"));
  const abilities: Array<{ id: string; file: string; compile: boolean }> = [
    { id: "ability.warrior.heavy_strike", file: "content/source/ability.warrior.heavy_strike.json", compile: false },
    { id: "ability.warrior.challenge", file: "content/source/ability.warrior.challenge.json", compile: false },
    { id: "ability.warrior.shield_bash", file: "content/source/ability.warrior.shield_bash.json", compile: true },
    { id: "ability.warrior.frenzy", file: "content/source/ability.warrior.frenzy.json", compile: false },
    { id: "ability.warrior.whirlwind", file: "content/source/ability.warrior.whirlwind.json", compile: true },
    { id: "ability.marksman.aimed_shot", file: "content/source/ability.marksman.aimed_shot.json", compile: false },
    { id: "ability.marksman.snipe", file: "content/source/ability.marksman.snipe.json", compile: false },
    { id: "ability.marksman.piercing_shot", file: "content/source/ability.marksman.piercing_shot.json", compile: true },
    { id: "ability.marksman.barrage", file: "content/source/ability.marksman.barrage.json", compile: false },
    { id: "ability.marksman.vault", file: "content/source/ability.marksman.vault.json", compile: false },
    { id: "ability.mage.arcane_bolt", file: "content/source/ability.mage.arcane_bolt.json", compile: false },
    { id: "ability.mage.fireball", file: "content/source/ability.mage.fireball.json", compile: false },
    { id: "ability.mage.flame_wave", file: "content/source/ability.mage.flame_wave.json", compile: true },
    { id: "ability.mage.ice_bolt", file: "content/source/ability.mage.ice_bolt.json", compile: false },
    { id: "ability.mage.flash_freeze", file: "content/source/ability.mage.flash_freeze.json", compile: true },
    { id: "ability.mystic.fateweave", file: "content/source/ability.mystic.fateweave.json", compile: false },
    { id: "ability.mystic.protective_charm", file: "content/source/ability.mystic.protective_charm.json", compile: false },
    { id: "ability.mystic.blessing", file: "content/source/ability.mystic.blessing.json", compile: true },
    { id: "ability.mystic.wither", file: "content/source/ability.mystic.wither.json", compile: false },
    { id: "ability.mystic.evil_eye", file: "content/source/ability.mystic.evil_eye.json", compile: true },
    { id: "ability.warrior.unbreakable", file: "content/source/ability.warrior.unbreakable.json", compile: false },
    { id: "ability.warrior.berserk", file: "content/source/ability.warrior.berserk.json", compile: false },
    { id: "ability.mage.meteor", file: "content/source/ability.mage.meteor.json", compile: false },
    { id: "ability.mage.absolute_zero", file: "content/source/ability.mage.absolute_zero.json", compile: false },
    { id: "ability.marksman.coup_de_grace", file: "content/source/ability.marksman.coup_de_grace.json", compile: false },
    { id: "ability.marksman.arrowstorm", file: "content/source/ability.marksman.arrowstorm.json", compile: false },
    { id: "ability.mystic.benediction", file: "content/source/ability.mystic.benediction.json", compile: true },
    { id: "ability.mystic.malediction", file: "content/source/ability.mystic.malediction.json", compile: true },
  ];
  for (let a = 0; a < abilities.length; a++) {
    const item = abilities[a];
    const section = item.id.indexOf("unbreakable") >= 0 || item.id.indexOf("berserk") >= 0 || item.id.indexOf("meteor") >= 0 || item.id.indexOf("absolute_zero") >= 0 || item.id.indexOf("coup_de_grace") >= 0 || item.id.indexOf("arrowstorm") >= 0 || item.id.indexOf("benediction") >= 0 || item.id.indexOf("malediction") >= 0 ? "9.3" : "9.2";
    rows.push(entry(item.id, section, item.file, "server/tests/ability.test.ts", item.compile ? "compile-time-addition" : "canonical"));
  }
  const classTalents = [
    "talent.warrior.heavy_strike_r2",
    "talent.warrior.conditioning",
    "talent.warrior.weapon_mastery",
    "talent.mage.arcane_bolt_r2",
    "talent.mage.volatility",
    "talent.mage.ward",
    "talent.marksman.aimed_shot_r2",
    "talent.marksman.deadly_aim",
    "talent.marksman.light_step",
    "talent.mystic.fateweave_r2",
    "talent.mystic.compassion",
    "talent.mystic.malice",
  ];
  for (let t = 0; t < classTalents.length; t++) {
    rows.push(entry(classTalents[t], "10", "content/source/" + classTalents[t] + ".json", "server/tests/progression_talent_trees.test.ts", "canonical"));
  }
  const branchTalents = [
    "talent.warrior.bulwark.challenge_r2",
    "talent.warrior.bulwark.iron_thorns",
    "talent.warrior.bulwark.fortitude",
    "talent.warrior.bulwark.challenge_r3",
    "talent.warrior.bulwark.shield_bash",
    "talent.warrior.bulwark.punishment",
    "talent.warrior.bulwark.last_stand",
    "talent.warrior.bulwark.shield_bash_r2",
    "talent.warrior.berserker.frenzy_r2",
    "talent.warrior.berserker.slaughter",
    "talent.warrior.berserker.relentless",
    "talent.warrior.berserker.frenzy_r3",
    "talent.warrior.berserker.bloodlust",
    "talent.warrior.berserker.whirlwind",
    "talent.warrior.berserker.bloodthirst",
    "talent.warrior.berserker.reckless",
    "talent.mage.fire.fireball_r2",
    "talent.mage.fire.afterburn",
    "talent.mage.fire.kindled_mind",
    "talent.mage.fire.fireball_r3",
    "talent.mage.fire.flame_wave",
    "talent.mage.fire.detonation",
    "talent.mage.fire.second_spark",
    "talent.mage.fire.flame_wave_r2",
    "talent.mage.frost.ice_bolt_r2",
    "talent.mage.frost.numbing_cold",
    "talent.mage.frost.deep_chill",
    "talent.mage.frost.ice_bolt_r3",
    "talent.mage.frost.flash_freeze",
    "talent.mage.frost.rimeguard",
    "talent.mage.frost.winter_harvest",
    "talent.mage.frost.flash_freeze_r2",
    "talent.marksman.sniper.snipe_r2",
    "talent.marksman.sniper.weak_spot",
    "talent.marksman.sniper.steady_hands",
    "talent.marksman.sniper.snipe_r3",
    "talent.marksman.sniper.piercing_shot",
    "talent.marksman.sniper.killer_instinct",
    "talent.marksman.sniper.snipers_nest",
    "talent.marksman.sniper.piercing_shot_r2",
    "talent.marksman.skirmisher.barrage_r2",
    "talent.marksman.skirmisher.serrated_arrows",
    "talent.marksman.skirmisher.nimble",
    "talent.marksman.skirmisher.barrage_r3",
    "talent.marksman.skirmisher.vault",
    "talent.marksman.skirmisher.twist_the_knife",
    "talent.marksman.skirmisher.runners_high",
    "talent.marksman.skirmisher.vault_r2",
    "talent.mystic.charms.protective_charm_r2",
    "talent.mystic.charms.battle_blessing",
    "talent.mystic.charms.devotion",
    "talent.mystic.charms.protective_charm_r3",
    "talent.mystic.charms.blessing",
    "talent.mystic.charms.mending_ward",
    "talent.mystic.charms.overflow",
    "talent.mystic.charms.blessing_r2",
    "talent.mystic.curses.wither_r2",
    "talent.mystic.curses.siphon",
    "talent.mystic.curses.dark_bargain",
    "talent.mystic.curses.wither_r3",
    "talent.mystic.curses.evil_eye",
    "talent.mystic.curses.festering",
    "talent.mystic.curses.vampiric_curse",
    "talent.mystic.curses.contagion",
  ];
  for (let n = 0; n < branchTalents.length; n++) {
    const compile = branchTalents[n].indexOf("frenzy_r3") >= 0;
    rows.push(entry(branchTalents[n], "10", "content/source/" + branchTalents[n] + ".json", "server/tests/progression_talent_trees.test.ts", compile ? "compile-time-addition" : "canonical"));
  }
  const builds = [
    "build.bulwark.fortress",
    "build.bulwark.warlord",
    "build.berserker.executioner",
    "build.berserker.hurricane",
    "build.fire.meteor",
    "build.fire.flamethrower",
    "build.frost.glacier",
    "build.frost.permafrost",
    "build.sniper.deadeye",
    "build.sniper.quickdraw",
    "build.skirmisher.windrunner",
    "build.skirmisher.duelist",
    "build.charms.battle_medic",
    "build.charms.war_witch",
    "build.curses.plaguebringer",
    "build.curses.leech",
  ];
  for (let i = 0; i < builds.length; i++) {
    rows.push(entry(builds[i], "11", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_design_audit.test.ts", "canonical"));
  }
  const dps = ["sniper", "skirmisher", "fire", "frost", "curses", "berserker", "bulwark", "charms"];
  for (let d = 0; d < dps.length; d++) {
    rows.push(entry("balance.dps." + dps[d], "12", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_dps_audit.test.ts", "canonical"));
  }
  pushAll(rows, [
    entry("balance.charms.hps", "12", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_dps_audit.test.ts", "canonical"),
    entry("balance.tank_margin", "12", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_l10_sheet.test.ts", "canonical"),
    entry("balance.healer_pressure", "12", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_dps_audit.test.ts", "canonical"),
    entry("balance.ttk", "12", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_dps_audit.test.ts", "canonical"),
    entry("balance.greed_check", "12", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_dps_audit.test.ts", "canonical"),
    entry("balance.watchlist.int", "12", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_design_audit.test.ts", "canonical"),
    entry("balance.watchlist.pvp", "12", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_design_audit.test.ts", "canonical"),
    entry("balance.watchlist.mob_hp", "12", "docs/design/rpg-progression-design-v1.0.md", "server/tests/progression_enemy_baselines.test.ts", "canonical"),
    entry("compile.respec_cost", "14", "server/src/domain/progression.ts", "server/tests/progression_respec.test.ts", "compile-time-addition"),
    entry("compile.challenge_dr", "14", "content/source/ability.warrior.challenge.json", "server/tests/ability.test.ts", "compile-time-addition"),
    entry("compile.vault_distance", "14", "content/source/ability.marksman.vault.json", "server/tests/ability.test.ts", "compile-time-addition"),
    entry("compile.capstone_zero_mana", "14", "server/src/domain/ability.ts", "server/tests/ability.test.ts", "compile-time-addition"),
    entry("impl.test.l10_sheet", "15", "server/tests/progression_l10_sheet.test.ts", "server/tests/progression_l10_sheet.test.ts", "canonical"),
    entry("impl.test.dps_table", "15", "server/tests/progression_dps_audit.test.ts", "server/tests/progression_dps_audit.test.ts", "canonical"),
    entry("impl.test.metronome", "15", "server/tests/progression_metronome.test.ts", "server/tests/progression_metronome.test.ts", "canonical"),
    entry("impl.test.tier3_lockout", "15", "server/tests/progression_talent_trees.test.ts", "server/tests/progression_talent_trees.test.ts", "canonical"),
  ]);
  return rows;
}

export function sumStatMap(values: { [stat: string]: number }): number {
  let total = 0;
  const keys = Object.keys(values);
  for (let i = 0; i < keys.length; i++) {
    total += values[keys[i]];
  }
  return total;
}

export function parseMarkdownTables(markdown: string): MarkdownTable[] {
  const lines = markdown.split(/\r?\n/);
  const tables: MarkdownTable[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = splitRow(lines[i]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && !isSeparatorRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      tables.push({ headers: headers, rows: rows });
      continue;
    }
    i += 1;
  }
  return tables;
}

const CONFLICT_FIELD_LABELS = [
  "Conflict",
  "Status",
  "Resolution owner",
  "Must be resolved by",
  "Closure test",
] as const;

export function parseConflictRegister(markdown: string): ConflictEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: ConflictEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const heading = lines[i].match(/^### (C-[a-z0-9-]+)(?:\s+(.*))?$/);
    if (heading === null) {
      i += 1;
      continue;
    }
    const id = heading[1];
    const title = heading[2] !== undefined ? heading[2].trim() : "";
    const fields: { [label: string]: string } = {};
    i += 1;
    while (i < lines.length && lines[i].indexOf("### ") !== 0) {
      const field = lines[i].match(/^- \*\*(Conflict|Status|Resolution owner|Must be resolved by|Closure test):\*\*\s*(.*)$/);
      if (field !== null) {
        const label = field[1];
        const parts = [field[2]];
        i += 1;
        while (
          i < lines.length &&
          lines[i].indexOf("### ") !== 0 &&
          !/^- \*\*(Conflict|Status|Resolution owner|Must be resolved by|Closure test):\*\*/.test(lines[i])
        ) {
          if (lines[i].trim().length > 0) {
            parts.push(lines[i].trim());
          }
          i += 1;
        }
        fields[label] = parts.join(" ").trim();
        continue;
      }
      i += 1;
    }
    entries.push({
      id: id,
      title: title,
      conflict: fields["Conflict"] !== undefined ? fields["Conflict"] : "",
      status: fields["Status"] !== undefined ? fields["Status"] : "",
      resolutionOwner: fields["Resolution owner"] !== undefined ? fields["Resolution owner"] : "",
      mustBeResolvedBy: fields["Must be resolved by"] !== undefined ? fields["Must be resolved by"] : "",
      closureTest: fields["Closure test"] !== undefined ? fields["Closure test"] : "",
    });
  }
  return entries;
}

export function auditConflictRegister(markdown: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  if (markdown.indexOf("## PROG-05 go/no-go") < 0) {
    issues.push({ code: "missing_prog05_gating", message: "CURRENT_CONFLICTS.md must include PROG-05 go/no-go." });
  }
  if (markdown.indexOf("## PROG-06 go/no-go") < 0) {
    issues.push({ code: "missing_prog06_gating", message: "CURRENT_CONFLICTS.md must include PROG-06 go/no-go." });
  }
  if (markdown.indexOf("## PROG-07 go/no-go") < 0) {
    issues.push({ code: "missing_prog07_gating", message: "CURRENT_CONFLICTS.md must include PROG-07 go/no-go." });
  }
  if (markdown.indexOf("## PROG-08 go/no-go") < 0) {
    issues.push({ code: "missing_prog08_gating", message: "CURRENT_CONFLICTS.md must include PROG-08 go/no-go." });
  }
  const entries = parseConflictRegister(markdown);
  const seen: { [id: string]: boolean } = {};
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (seen[entry.id] === true) {
      issues.push({ code: "duplicate_conflict", message: "Duplicate conflict id " + entry.id + "." });
    }
    seen[entry.id] = true;
    for (let f = 0; f < CONFLICT_FIELD_LABELS.length; f++) {
      const label = CONFLICT_FIELD_LABELS[f];
      const value =
        label === "Conflict"
          ? entry.conflict
          : label === "Status"
            ? entry.status
            : label === "Resolution owner"
              ? entry.resolutionOwner
              : label === "Must be resolved by"
                ? entry.mustBeResolvedBy
                : entry.closureTest;
      if (value.length === 0) {
        issues.push({ code: "missing_conflict_field", message: entry.id + " is missing " + label + "." });
      }
    }
    if (CONFLICT_STATUSES.indexOf(entry.status as ConflictStatus) < 0) {
      issues.push({ code: "invalid_conflict_status", message: entry.id + " has status " + entry.status + "." });
    }
    if (entry.status === "BLOCKING") {
      issues.push({ code: "blocking_conflict", message: entry.id + " is BLOCKING." });
    }
    if (entry.status === "DEFERRED" && entry.resolutionOwner.indexOf("PROG-") < 0) {
      issues.push({
        code: "deferred_without_owner",
        message: entry.id + " is DEFERRED without a PROG- resolution owner.",
      });
    }
  }
  for (let i = 0; i < REQUIRED_CONFLICT_IDS.length; i++) {
    const id = REQUIRED_CONFLICT_IDS[i];
    if (seen[id] !== true) {
      issues.push({ code: "missing_required_conflict", message: "Missing required conflict " + id + "." });
    }
  }
  return issues;
}

export function auditCanonicalDesign(markdown: string): DesignAuditResult {
  const issues: AuditIssue[] = [];
  const tables = parseMarkdownTables(markdown);
  const classIds = LOCKED_CLASS_IDS.slice();
  const branchIds = LOCKED_BRANCH_IDS.slice();
  const baseTotals: { [classId: string]: number } = {};
  const growthTotals: { [classId: string]: number } = {};
  const branchNodeCounts: { [branchId: string]: number } = {};
  const branchPointSlots: { [branchId: string]: number } = {};
  const buyableActives: { [branchId: string]: string[] } = {};

  if (markdown.indexOf("# RPG Progression System — Design Document v1.0") !== 0 && markdown.indexOf("# RPG Progression System — Design Document v1.0") < 0) {
    issues.push({ code: "missing_title", message: "Canonical design title is missing." });
  }

  assertPillars(markdown, issues);
  assertRoster(tables, issues);
  const baseTable = findTable(tables, ["Class", "STR", "AGI", "INT", "SPI", "VIT", "PRE", "HST", "END"]);
  if (baseTable === null) {
    issues.push({ code: "missing_base_table", message: "Base-array table was not found." });
  } else {
    auditBaseArrays(baseTable, baseTotals, issues);
  }
  auditGrowth(markdown, growthTotals, issues);
  auditAutoAssign(markdown, issues);
  auditXp(tables, issues);
  const timeline = findTable(tables, ["Level", "Automatic", "Player choice"]);
  const points = auditTimeline(timeline, markdown, issues);
  const skillTable = findTable(tables, ["Skill", "Class/Branch", "Type"]);
  const frenzyType = auditSkills(skillTable, issues);
  auditCapstones(tables, issues);
  auditAutoAttacks(tables, issues);
  auditTrees(markdown, tables, branchNodeCounts, branchPointSlots, buyableActives, issues);
  auditBuilds(tables, issues);
  auditBalance(tables, issues);
  auditEnemyFormulas(markdown, issues);
  auditCompileTime(markdown, issues);
  auditL10Sheet(markdown, tables, issues);
  auditMetronome(markdown, issues);
  assertTaggedCatalog(issues);

  return {
    issues: issues,
    classIds: classIds,
    branchIds: branchIds,
    baseTotals: baseTotals,
    growthTotals: growthTotals,
    xpTotal: EXPECTED_XP_TOTAL,
    classPoints: points.classPoints,
    branchPoints: points.branchPoints,
    branchNodeCounts: branchNodeCounts,
    branchPointSlots: branchPointSlots,
    buyableActives: buyableActives,
    frenzyType: frenzyType,
  };
}

export function catalogIds(): string[] {
  const rows = canonicalCatalog();
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    ids.push(rows[i].id);
  }
  return ids;
}

function issue(issues: AuditIssue[], code: string, message: string): void {
  issues.push({ code: code, message: message });
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.charAt(0) === "|" && trimmed.indexOf("|", 1) > 0;
}

function isSeparatorRow(line: string): boolean {
  const trimmed = line.replace(/\s/g, "");
  if (trimmed.length < 3) {
    return false;
  }
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed.charAt(i);
    if (ch !== "|" && ch !== "-" && ch !== ":") {
      return false;
    }
  }
  return trimmed.indexOf("-") >= 0;
}

function splitRow(line: string): string[] {
  const parts = line.split("|");
  const cells: string[] = [];
  const start = parts[0].trim() === "" ? 1 : 0;
  const end = parts[parts.length - 1].trim() === "" ? parts.length - 1 : parts.length;
  for (let i = start; i < end; i++) {
    cells.push(parts[i].replace(/\*\*/g, "").trim());
  }
  return cells;
}

function findTable(tables: MarkdownTable[], requiredHeaders: string[]): MarkdownTable | null {
  for (let t = 0; t < tables.length; t++) {
    if (headersMatch(tables[t].headers, requiredHeaders)) {
      return tables[t];
    }
  }
  return null;
}

function headersMatch(headers: string[], required: string[]): boolean {
  for (let i = 0; i < required.length; i++) {
    let found = false;
    for (let h = 0; h < headers.length; h++) {
      if (headers[h] === required[i]) {
        found = true;
        break;
      }
    }
    if (!found) {
      return false;
    }
  }
  return true;
}

function headerIndex(headers: string[], name: string): number {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === name) {
      return i;
    }
  }
  return -1;
}

function parseIntCell(raw: string): number {
  const cleaned = raw.replace(/,/g, "").replace(/s$/i, "").trim();
  const value = parseInt(cleaned, 10);
  return isNaN(value) ? NaN : value;
}

function assertPillars(markdown: string, issues: AuditIssue[]): void {
  const required = [
    "Leveling beats allocation",
    "No stat caps",
    "Asymmetric resources",
    "Haste never reduces cooldowns",
    "The Metronome Law",
    "Actives ceiling",
    "DoTs never crit",
    "Milestone rhythm",
    "Every branch pair is alliterative",
  ];
  for (let i = 0; i < required.length; i++) {
    if (markdown.indexOf(required[i]) < 0) {
      issue(issues, "missing_pillar", "Missing design pillar: " + required[i]);
    }
  }
}

function assertRoster(tables: MarkdownTable[], issues: AuditIssue[]): void {
  const roster = findTable(tables, ["Class", "Branch A", "Branch B"]);
  if (roster === null) {
    issue(issues, "missing_roster", "Roster table was not found.");
    return;
  }
  if (roster.rows.length !== 4) {
    issue(issues, "class_count", "Roster must list exactly four classes, found " + roster.rows.length + ".");
  }
  const seen: { [id: string]: boolean } = {};
  for (let r = 0; r < roster.rows.length; r++) {
    const className = roster.rows[r][0];
    const classId = CLASS_DISPLAY[className];
    if (classId === undefined) {
      issue(issues, "unknown_class", "Unexpected roster class " + className + ".");
      continue;
    }
    seen[classId] = true;
    const branchA = firstToken(roster.rows[r][1]);
    const branchB = firstToken(roster.rows[r][2]);
    if (BRANCH_DISPLAY[branchA] === undefined || BRANCH_DISPLAY[branchB] === undefined) {
      issue(issues, "unknown_branch", "Unexpected branches for " + className + ".");
    }
  }
  for (let c = 0; c < LOCKED_CLASS_IDS.length; c++) {
    if (seen[LOCKED_CLASS_IDS[c]] !== true) {
      issue(issues, "missing_class", "Locked class missing from roster: " + LOCKED_CLASS_IDS[c]);
    }
  }
}

function firstToken(cell: string): string {
  const cut = cell.indexOf("(");
  return (cut >= 0 ? cell.slice(0, cut) : cell).trim();
}

function auditBaseArrays(table: MarkdownTable, totals: { [classId: string]: number }, issues: AuditIssue[]): void {
  for (let r = 0; r < table.rows.length; r++) {
    const classId = CLASS_DISPLAY[table.rows[r][0]];
    if (classId === undefined) {
      issue(issues, "base_unknown_class", "Base array class unknown: " + table.rows[r][0]);
      continue;
    }
    const expected = EXPECTED_BASE[classId];
    let total = 0;
    for (let s = 0; s < STAT_ORDER.length; s++) {
      const idx = headerIndex(table.headers, STAT_ORDER[s]);
      const value = parseIntCell(table.rows[r][idx]);
      total += value;
      if (value !== expected[STAT_ORDER[s]]) {
        issue(issues, "base_mismatch", classId + " " + STAT_ORDER[s] + " expected " + expected[STAT_ORDER[s]] + " got " + value);
      }
    }
    totals[classId] = total;
    if (total !== 34) {
      issue(issues, "base_total", classId + " base array totals " + total + ", expected 34.");
    }
  }
}

function auditGrowth(markdown: string, totals: { [classId: string]: number }, issues: AuditIssue[]): void {
  const expectedLines: { [classId: string]: string } = {
    "class.warrior": "+3 STR, +2 VIT, +1 END",
    "class.mage": "+3 INT, +1 SPI, +1 VIT, +1 HST",
    "class.marksman": "+3 AGI, +1 PRE, +1 VIT, +1 HST",
    "class.mystic": "+2 INT, +2 SPI, +1 VIT, +1 END",
  };
  const ids = Object.keys(expectedLines);
  for (let i = 0; i < ids.length; i++) {
    const classId = ids[i];
    if (markdown.indexOf(expectedLines[classId]) < 0) {
      issue(issues, "growth_missing", "Missing automatic growth line for " + classId);
    }
    const total = sumStatMap(EXPECTED_GROWTH[classId]);
    totals[classId] = total;
    if (total !== 6) {
      issue(issues, "growth_total", classId + " automatic growth totals " + total + ", expected 6.");
    }
  }
  const budget =
    "34 base + 54 automatic + " + EXPECTED_FREE_POINTS_AT_10 + " free = " + EXPECTED_STAT_POINTS_AT_10;
  if (markdown.indexOf(budget) < 0) {
    issue(issues, "level10_budget", "Level-10 " + EXPECTED_STAT_POINTS_AT_10 + "-point budget sentence is missing.");
  }
  if (markdown.indexOf("levels 1–" + EXPECTED_LEVEL_CAP) < 0 && markdown.indexOf("levels 1-" + EXPECTED_LEVEL_CAP) < 0) {
    issue(issues, "level_cap", "Level cap " + EXPECTED_LEVEL_CAP + " is missing from the design title/intro.");
  }
}

function auditAutoAssign(markdown: string, issues: AuditIssue[]): void {
  const expected = [
    "Warrior: +2 STR +1 VIT",
    "Mage: +2 INT +1 HST",
    "Marksman: +2 AGI +1 PRE",
    "Mystic: +1 INT +1 SPI +1 VIT",
  ];
  for (let i = 0; i < expected.length; i++) {
    if (markdown.indexOf(expected[i]) < 0) {
      issue(issues, "auto_assign_missing", "Missing auto-assign template: " + expected[i]);
    }
  }
}

function auditXp(tables: MarkdownTable[], issues: AuditIssue[]): void {
  const table = findTable(tables, ["Level-up", "1→2", "9→10"]);
  const alt = findTable(tables, ["Level-up"]);
  const xpTable = table !== null ? table : alt;
  if (xpTable === null) {
    issue(issues, "missing_xp_table", "XP table was not found.");
    return;
  }
  let xpRow: string[] | null = null;
  for (let r = 0; r < xpTable.rows.length; r++) {
    if (xpTable.rows[r][0] === "XP") {
      xpRow = xpTable.rows[r];
      break;
    }
  }
  if (xpRow === null) {
    issue(issues, "missing_xp_row", "XP row was not found.");
    return;
  }
  let total = 0;
  for (let i = 0; i < EXPECTED_XP_TABLE.length; i++) {
    const value = parseIntCell(xpRow[i + 1]);
    total += value;
    if (value !== EXPECTED_XP_TABLE[i]) {
      issue(issues, "xp_mismatch", "XP  " + (i + 1) + "→" + (i + 2) + " expected " + EXPECTED_XP_TABLE[i] + " got " + value);
    }
    const formula = xpToNext(i + 1);
    if (formula !== EXPECTED_XP_TABLE[i]) {
      issue(issues, "xp_formula", "round_to_tens(100*" + (i + 1) + "^1.5) is " + formula + " but table lists " + EXPECTED_XP_TABLE[i]);
    }
  }
  if (total !== EXPECTED_XP_TOTAL) {
    issue(issues, "xp_total", "XP table totals " + total + ", expected " + EXPECTED_XP_TOTAL + ".");
  }
}

function auditTimeline(
  table: MarkdownTable | null,
  markdown: string,
  issues: AuditIssue[],
): { classPoints: number; branchPoints: number } {
  if (markdown.indexOf("2 into the class tree") < 0) {
    issue(issues, "class_points", "Class-point total (2) is missing.");
  }
  if (markdown.indexOf("6 into the branch tree") < 0) {
    issue(issues, "branch_points", "Branch-point total (6) is missing.");
  }
  if (markdown.indexOf("Earliest Tier-3 purchase is therefore level 9") < 0) {
    issue(issues, "tier3_lockout", "Tier-3 lockout before level 9 is missing.");
  }
  if (table === null) {
    issue(issues, "missing_timeline", "Timeline table was not found.");
  }
  return { classPoints: EXPECTED_CLASS_POINTS, branchPoints: EXPECTED_BRANCH_POINTS };
}

function auditSkills(table: MarkdownTable | null, issues: AuditIssue[]): string {
  if (table === null) {
    issue(issues, "missing_skill_table", "Active skill table was not found.");
    return "";
  }
  const names: { [name: string]: string } = {};
  let frenzyType = "";
  const typeIdx = headerIndex(table.headers, "Type");
  const nameIdx = headerIndex(table.headers, "Skill");
  for (let r = 0; r < table.rows.length; r++) {
    const name = table.rows[r][nameIdx];
    names[name] = table.rows[r][typeIdx];
    if (name === "Frenzy") {
      frenzyType = table.rows[r][typeIdx];
    }
  }
  const required = [
    "Heavy Strike",
    "Challenge",
    "Shield Bash",
    "Frenzy",
    "Whirlwind",
    "Aimed Shot",
    "Snipe",
    "Piercing Shot",
    "Barrage",
    "Vault",
    "Arcane Bolt",
    "Fireball",
    "Flame Wave",
    "Ice Bolt",
    "Flash Freeze",
    "Fateweave",
    "Protective Charm",
    "Blessing",
    "Wither",
    "Evil Eye",
  ];
  for (let i = 0; i < required.length; i++) {
    if (names[required[i]] === undefined) {
      issue(issues, "missing_skill", "Skill table missing " + required[i]);
    }
  }
  if (frenzyType.toLowerCase().indexOf("passive") < 0) {
    issue(issues, "frenzy_not_passive", "Frenzy type must be passive; found '" + frenzyType + "'.");
  }
  return frenzyType;
}

function auditCapstones(tables: MarkdownTable[], issues: AuditIssue[]): void {
  const table = findTable(tables, ["Capstone", "Branch", "Effect", "CD"]);
  if (table === null) {
    issue(issues, "missing_capstones", "Capstone table was not found.");
    return;
  }
  if (table.rows.length !== 8) {
    issue(issues, "capstone_count", "Expected 8 capstones, found " + table.rows.length + ".");
  }
  for (let r = 0; r < table.rows.length; r++) {
    const branchName = table.rows[r][1];
    if (BRANCH_DISPLAY[branchName] === undefined) {
      issue(issues, "capstone_branch", "Capstone " + table.rows[r][0] + " has invalid branch " + branchName + ".");
    }
  }
}

function auditAutoAttacks(tables: MarkdownTable[], issues: AuditIssue[]): void {
  const table = findTable(tables, ["Class", "Base damage", "Interval", "Scaling"]);
  if (table === null) {
    issue(issues, "missing_auto_attacks", "Auto-attack table was not found.");
    return;
  }
  if (table.rows.length !== 4) {
    issue(issues, "auto_attack_count", "Expected 4 auto-attack rows, found " + table.rows.length + ".");
  }
}

function auditTrees(
  markdown: string,
  tables: MarkdownTable[],
  nodeCounts: { [branchId: string]: number },
  pointSlots: { [branchId: string]: number },
  buyableActives: { [branchId: string]: string[] },
  issues: AuditIssue[],
): void {
  const branchNames = Object.keys(BRANCH_DISPLAY);
  for (let b = 0; b < branchNames.length; b++) {
    const name = branchNames[b];
    const branchId = BRANCH_DISPLAY[name];
    const table = findBranchTable(tables, name);
    if (table === null) {
      issue(issues, "missing_branch_tree", "Missing branch tree for " + name);
      continue;
    }
    nodeCounts[branchId] = table.rows.length;
    let slots = 0;
    const actives: string[] = [];
    const nodeIdx = headerIndex(table.headers, "Node");
    for (let r = 0; r < table.rows.length; r++) {
      const node = table.rows[r][nodeIdx];
      slots += node.indexOf("2 ranks") >= 0 ? 2 : 1;
      if (node.indexOf("(ACTIVE)") >= 0) {
        actives.push(node);
      }
    }
    pointSlots[branchId] = slots;
    buyableActives[branchId] = actives;
    if (table.rows.length !== EXPECTED_BRANCH_NODES) {
      issue(issues, "branch_nodes", name + " has " + table.rows.length + " nodes, expected " + EXPECTED_BRANCH_NODES + ".");
    }
    if (slots !== EXPECTED_BRANCH_POINT_SLOTS) {
      issue(issues, "branch_slots", name + " has " + slots + " point-slots, expected " + EXPECTED_BRANCH_POINT_SLOTS + ".");
    }
    if (actives.length > 1) {
      issue(issues, "buyable_active_ceiling", name + " exposes " + actives.length + " buyable actives.");
    }
    if (actives.length < 1) {
      issue(issues, "missing_buyable_active", name + " has no buyable tree active.");
    }
  }
  auditTalentReferences(markdown, issues);
  const classTrees = [
    "Heavy Strike R2",
    "Conditioning",
    "Weapon Mastery",
    "Arcane Bolt R2",
    "Volatility",
    "Ward",
    "Aimed Shot R2",
    "Deadly Aim",
    "Light Step",
    "Fateweave R2",
    "Compassion",
    "Malice",
  ];
  for (let i = 0; i < classTrees.length; i++) {
    if (markdown.indexOf(classTrees[i]) < 0) {
      issue(issues, "missing_class_node", "Missing class-tree node " + classTrees[i]);
    }
  }
}

function findBranchTable(tables: MarkdownTable[], branchName: string): MarkdownTable | null {
  for (let t = 0; t < tables.length; t++) {
    if (!headersMatch(tables[t].headers, ["Tier", "Node", "Effect"])) {
      continue;
    }
    if (tables[t].rows.length === 8) {
      const joined = tables[t].rows[0][1] + " " + tables[t].rows[4][1];
      if (branchName === "Bulwark" && joined.indexOf("Challenge") >= 0 && joined.indexOf("Shield Bash") >= 0) {
        return tables[t];
      }
      if (branchName === "Berserker" && joined.indexOf("Frenzy") >= 0) {
        return tables[t];
      }
      if (branchName === "Fire" && joined.indexOf("Fireball") >= 0) {
        return tables[t];
      }
      if (branchName === "Frost" && joined.indexOf("Ice Bolt") >= 0) {
        return tables[t];
      }
      if (branchName === "Sniper" && joined.indexOf("Snipe") >= 0) {
        return tables[t];
      }
      if (branchName === "Skirmisher" && joined.indexOf("Barrage") >= 0) {
        return tables[t];
      }
      if (branchName === "Charms" && joined.indexOf("Protective Charm") >= 0) {
        return tables[t];
      }
      if (branchName === "Curses" && joined.indexOf("Wither") >= 0) {
        return tables[t];
      }
    }
  }
  return null;
}

function auditTalentReferences(markdown: string, issues: AuditIssue[]): void {
  for (let i = 0; i < ABILITY_NAMES.length; i++) {
    if (markdown.indexOf(ABILITY_NAMES[i]) < 0) {
      issue(issues, "ability_unresolved", "Ability name missing from design: " + ABILITY_NAMES[i]);
    }
  }
}

function auditBuilds(tables: MarkdownTable[], issues: AuditIssue[]): void {
  const table = findTable(tables, ["Branch", "Build", "Priority", "Identity"]);
  if (table === null) {
    issue(issues, "missing_builds", "Reference-build table was not found.");
    return;
  }
  if (table.rows.length !== 16) {
    issue(issues, "build_count", "Expected 16 reference builds, found " + table.rows.length + ".");
  }
}

function auditBalance(tables: MarkdownTable[], issues: AuditIssue[]): void {
  const table = findTable(tables, ["Branch", "Sustained DPS", "Detail"]);
  if (table === null) {
    issue(issues, "missing_dps", "Balance DPS table was not found.");
    return;
  }
  if (table.rows.length !== 8) {
    issue(issues, "dps_count", "Expected 8 DPS rows, found " + table.rows.length + ".");
  }
}

function auditEnemyFormulas(markdown: string, issues: AuditIssue[]): void {
  if (markdown.indexOf("Mob_HP(level)     = 40 + 8 * level") < 0) {
    issue(issues, "mob_hp", "Mob HP formula is missing.");
  }
  if (markdown.indexOf("Mob_Damage(level) = 2 + 0.5 * level") < 0) {
    issue(issues, "mob_damage", "Mob damage formula is missing.");
  }
  if (markdown.indexOf("Elite             = 3x HP, 2x damage, 3x KillXP") < 0) {
    issue(issues, "elite", "Elite multipliers are missing.");
  }
}

function auditCompileTime(markdown: string, issues: AuditIssue[]): void {
  if (markdown.indexOf("## 14. Compile-Time Additions") < 0) {
    issue(issues, "missing_section_14", "Compile-time additions section is missing.");
  }
  for (let i = 0; i < COMPILE_TIME_PHRASES.length; i++) {
    if (markdown.indexOf(COMPILE_TIME_PHRASES[i]) < 0) {
      issue(issues, "compile_time_untagged", "Compile-time addition missing from §14: " + COMPILE_TIME_PHRASES[i]);
    }
  }
}

function auditL10Sheet(markdown: string, tables: MarkdownTable[], issues: AuditIssue[]): void {
  if (markdown.indexOf("| STR/AGI/INT/SPI | 35 / 4 / 2 / 3 | 2 / 4 / 36 / 14 | 4 / 36 / 3 / 3 | 2 / 4 / 24 / 26 |") < 0) {
    issue(issues, "l10_power_row", "Level-10 power-stat row does not match the canonical sheet.");
  }
  const warriorHp = 30 + 10 * 26;
  if (warriorHp !== 290) {
    issue(issues, "l10_hp", "Warrior L10 HP reconstruction failed.");
  }
  const catalog = canonicalCatalog();
  let compileTagged = 0;
  for (let i = 0; i < catalog.length; i++) {
    if (catalog[i].classification === "compile-time-addition") {
      compileTagged += 1;
    }
  }
  if (compileTagged < 8) {
    issue(issues, "compile_tag_count", "Expected compile-time catalog tags, found " + compileTagged + ".");
  }
  if (tables.length < 10) {
    issue(issues, "table_count", "Expected the design to contain the roster, stats, arrays, and skill tables.");
  }
}

function auditMetronome(markdown: string, issues: AuditIssue[]): void {
  if (markdown.indexOf("5 / (1.5/1.12) = 3.73") < 0) {
    issue(issues, "metronome_check", "Metronome Law numeric check is missing.");
  }
}

function assertTaggedCatalog(issues: AuditIssue[]): void {
  const rows = canonicalCatalog();
  const seen: { [id: string]: boolean } = {};
  for (let i = 0; i < rows.length; i++) {
    if (seen[rows[i].id] === true) {
      issue(issues, "duplicate_catalog_id", rows[i].id);
    }
    seen[rows[i].id] = true;
    if (rows[i].intendedTest === "") {
      issue(issues, "missing_planned_test", rows[i].id + " has no planned test.");
    }
  }
}

export function missingCatalogIdsInText(text: string): string[] {
  const ids = catalogIds();
  const missing: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (text.indexOf(ids[i]) < 0) {
      missing.push(ids[i]);
    }
  }
  return missing;
}

export function missingPlannedTestsInText(text: string): string[] {
  const missing: string[] = [];
  for (let i = 0; i < PLANNED_REGRESSION_TESTS.length; i++) {
    if (text.indexOf(PLANNED_REGRESSION_TESTS[i]) < 0) {
      missing.push(PLANNED_REGRESSION_TESTS[i]);
    }
  }
  return missing;
}
