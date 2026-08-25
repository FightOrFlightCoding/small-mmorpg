import type { AbilityEffectDef } from "./types";

const STR = "stat.strength";
const AGI = "stat.agility";
const INT = "stat.intelligence";
const SPI = "stat.spirit";
const VIT = "stat.vitality";
const PRE = "stat.precision";
const HST = "stat.haste";
const END = "stat.endurance";

const MELEE_RANGE = 40;
const RANGED_RANGE = 180;
const SNIPE_RANGE = 234;
const AOE_RADIUS = 40;
const CONE_ANGLE = 60;
const LINE_LENGTH = 180;
const LINE_WIDTH = 16;
const VAULT_DISTANCE = 80;
const PARTY_RADIUS = 80;

type Doc = Record<string, unknown>;

export function canonicalDocuments(): Doc[] {
  const docs: Doc[] = [];
  pushAll(docs, statDocs());
  docs.push(resourceNone());
  docs.push(levelCurve());
  docs.push(timeline());
  pushAll(docs, xpDocs());
  pushAll(docs, enemyDocs());
  pushAll(docs, modifierDocs());
  const packed = combatPack();
  pushAll(docs, packed.effects);
  pushAll(docs, packed.autoAttacks);
  pushAll(docs, packed.abilities);
  pushAll(docs, treeDocs());
  pushAll(docs, nodeDocs());
  pushAll(docs, branchDocs());
  pushAll(docs, buildDocs());
  docs.push(mysticClass());
  docs.push(mysticProgression());
  return docs;
}

export const IMPLEMENTATION_ADDENDUM_ROWS: Array<{
  id: string;
  value: string;
  purpose: string;
  reason: string;
  affectsBalance: string;
  tests: string;
}> = [
  {
    id: "project.ability.range.ranged",
    value: "180 (test.ability.ranged_bolt)",
    purpose: "Canonical ranged/spell range when design omits units",
    reason: "Schema requires range; reuse live bolt range",
    affectsBalance: "yes, if later enabled",
    tests: "tools/content-build/tests/content-build.test.ts",
  },
  {
    id: "project.ability.range.snipe",
    value: "234 (180 * 1.3)",
    purpose: "Snipe +30% range from §9.2",
    reason: "Design gives percent, not absolute range",
    affectsBalance: "yes, if later enabled",
    tests: "tools/content-build/tests/content-build.test.ts",
  },
  {
    id: "project.ability.aoe.radius",
    value: "40 (project melee range)",
    purpose: "Whirlwind, Challenge, Flash Freeze, Meteor, party auras fallback radius",
    reason: "Design says melee/nearby without px",
    affectsBalance: "yes, if later enabled",
    tests: "tools/content-build/tests/content-build.test.ts",
  },
  {
    id: "project.ability.cone.angle_deg",
    value: "60",
    purpose: "Flame Wave cone width",
    reason: "Schema requires cone angle; design omits it",
    affectsBalance: "yes, if later enabled",
    tests: "tools/content-build/tests/content-build.test.ts",
  },
  {
    id: "project.ability.line.length",
    value: "180",
    purpose: "Piercing Shot line length",
    reason: "Design omits line length; match ranged range",
    affectsBalance: "yes, if later enabled",
    tests: "tools/content-build/tests/content-build.test.ts",
  },
  {
    id: "project.ability.line.width",
    value: "16 (zone.starter tileSize)",
    purpose: "Piercing Shot line width",
    reason: "Schema completeness",
    affectsBalance: "no until enabled",
    tests: "tools/content-build/tests/content-build.test.ts",
  },
  {
    id: "project.ability.vault.distance_px",
    value: "80 (5 * tileSize 16)",
    purpose: "Vault ~5m mapped onto 16px tiles",
    reason: "Design meters; world is tiled pixels",
    affectsBalance: "yes, if later enabled",
    tests: "tools/content-build/tests/content-build.test.ts",
  },
  {
    id: "project.ability.party.radius",
    value: "80 (5 * tileSize 16)",
    purpose: "Blessing/Benediction/Malediction nearby allies/enemies",
    reason: "Design omits party radius",
    affectsBalance: "yes, if later enabled",
    tests: "tools/content-build/tests/content-build.test.ts",
  },
];

function pushAll(target: Doc[], extra: Doc[]): void {
  for (let i = 0; i < extra.length; i++) {
    target.push(extra[i]);
  }
}

function statDocs(): Doc[] {
  return [
    stat("stat.strength", "Strength", "STR", [
      { type: "melee_damage_percent", perPoint: 0.01 },
      { type: "crit_damage_percent", perPoint: 0.01 },
    ]),
    stat("stat.agility", "Agility", "AGI", [{ type: "ranged_damage_percent", perPoint: 0.01 }]),
    stat("stat.intelligence", "Intelligence", "INT", [
      { type: "spell_damage_percent", perPoint: 0.01 },
      { type: "max_mana_flat", perPoint: 4, castersOnly: true },
    ]),
    stat("stat.spirit", "Spirit", "SPI", [
      { type: "heal_percent", perPoint: 0.01 },
      { type: "mana_regen_per_sec", perPoint: 0.2, castersOnly: true },
    ]),
    stat("stat.precision", "Precision", "PRE", [{ type: "crit_chance_percent", perPoint: 0.5 }]),
    stat("stat.haste", "Haste", "HST", [{ type: "haste_percent", perPoint: 0.01 }]),
    stat("stat.vitality", "Vitality", "VIT", [{ type: "max_hp_flat", perPoint: 10 }]),
    stat("stat.endurance", "Endurance", "END", [{ type: "damage_reduction_percent", perPoint: 0.5 }]),
  ];
}

function stat(
  id: string,
  displayName: string,
  abbreviation: string,
  perPointEffects: Array<{ type: string; perPoint: number; castersOnly?: boolean }>,
): Doc {
  return {
    id,
    kind: "stat_definition",
    displayName,
    displayNameKey: id + ".display_name",
    descriptionKey: id + ".description",
    abbreviation,
    perPointEffects,
    classification: "canonical",
  };
}

function resourceNone(): Doc {
  return {
    id: "resource.none",
    kind: "resource",
    displayName: "None",
    displayNameKey: "resource.none.display_name",
    descriptionKey: "resource.none.description",
    role: "generic",
  };
}

function levelCurve(): Doc {
  return {
    id: "curve.vibecode.l10",
    kind: "level_curve",
    maxLevel: 10,
    xpRequired: [100, 280, 520, 800, 1120, 1470, 1850, 2260, 2700],
    attributePointsPerLevel: [3, 3, 3, 3, 3, 3, 3, 3, 3],
    skillPointsPerLevel: [0, 1, 1, 1, 1, 1, 1, 1, 1],
    automaticUnlocks: [],
  };
}

function timeline(): Doc {
  return {
    id: "timeline.vibecode.l10",
    kind: "progression_timeline",
    displayName: "Vibecode 1-10",
    displayNameKey: "timeline.vibecode.l10.display_name",
    descriptionKey: "timeline.vibecode.l10.description",
    levelCurveId: "curve.vibecode.l10",
    automaticGrowthPerLevel: 6,
    freePointsPerLevel: 3,
    classPoints: 2,
    branchPoints: 6,
    tierGates: [
      { tier: 1, minLevel: 5, minPointsSpent: 0 },
      { tier: 2, minPointsSpent: 2 },
      { tier: 3, minLevel: 9, minPointsSpent: 4 },
    ],
    unlocks: [
      { level: 1, grant: "auto_attack" },
      { level: 2, grant: "basic_ability" },
      { level: 3, grant: "class_point" },
      { level: 4, grant: "class_point" },
      { level: 5, grant: "branch_unlock" },
      { level: 5, grant: "branch_point" },
      { level: 6, grant: "branch_point" },
      { level: 7, grant: "branch_point" },
      { level: 8, grant: "branch_point" },
      { level: 9, grant: "branch_point" },
      { level: 10, grant: "branch_point" },
      { level: 10, grant: "capstone" },
    ],
    classification: "canonical",
  };
}

function xpDocs(): Doc[] {
  return [
    {
      id: "xp.reward.kill",
      kind: "xp_reward",
      displayName: "Kill XP",
      displayNameKey: "xp.reward.kill.display_name",
      descriptionKey: "xp.reward.kill.description",
      formula: { kind: "kill_xp_linear", intercept: 8, perLevel: 2 },
      inUse: false,
      classification: "canonical",
    },
    {
      id: "xp.reward.kill_steep_dial",
      kind: "xp_reward",
      displayName: "Kill XP steep dial",
      displayNameKey: "xp.reward.kill_steep_dial.display_name",
      descriptionKey: "xp.reward.kill_steep_dial.description",
      formula: { kind: "kill_xp_linear", intercept: 8, perLevel: 3 },
      inUse: false,
      classification: "canonical",
    },
  ];
}

function enemyDocs(): Doc[] {
  return [
    scaling("enemy.scaling.standard", "Standard", 1, 1, 1, false),
    scaling("enemy.scaling.elite", "Elite", 3, 2, 3, true),
  ];
}

function scaling(
  id: string,
  name: string,
  hpMult: number,
  dmgMult: number,
  xpMult: number,
  compile: boolean,
): Doc {
  return {
    id,
    kind: "enemy_scaling_profile",
    displayName: name,
    displayNameKey: id + ".display_name",
    descriptionKey: id + ".description",
    hpIntercept: 40,
    hpPerLevel: 8,
    damageIntercept: 2,
    damagePerLevel: 0.5,
    swingInterval: 2,
    killXpIntercept: 8,
    killXpPerLevel: 2,
    hpMultiplier: hpMult,
    damageMultiplier: dmgMult,
    killXpMultiplier: xpMult,
    classification: compile ? "compile-time-addition" : "canonical",
    compileTimeAddition: compile,
  };
}

function modifierDocs(): Doc[] {
  const ids = [STR, AGI, INT, SPI, VIT, PRE, HST, END];
  const names = ["Strength", "Agility", "Intelligence", "Spirit", "Vitality", "Precision", "Haste", "Endurance"];
  const docs: Doc[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = "mod." + ids[i];
    docs.push({
      id,
      kind: "equipment_modifier_category",
      displayName: names[i],
      displayNameKey: id + ".display_name",
      descriptionKey: id + ".description",
      statId: ids[i],
      channel: ids[i],
      classification: "canonical",
    });
  }
  return docs;
}

function hit(
  id: string,
  type: AbilityEffectDef["type"],
  school: AbilityEffectDef["school"],
  value: number,
  extra: Partial<AbilityEffectDef> = {},
): AbilityEffectDef {
  const effect: AbilityEffectDef = {
    id,
    type,
    source: "caster",
    target: extra.target !== undefined ? extra.target : "primary",
    magnitude: extra.magnitude !== undefined ? extra.magnitude : { kind: "constant", value: value },
    duration: extra.duration !== undefined ? extra.duration : 0,
    tickInterval: extra.tickInterval !== undefined ? extra.tickInterval : 0,
    stackPolicy: extra.stackPolicy !== undefined ? extra.stackPolicy : "replace",
    maxStacks: extra.maxStacks !== undefined ? extra.maxStacks : 1,
    refreshPolicy: extra.refreshPolicy !== undefined ? extra.refreshPolicy : "refresh",
    removalReason: extra.removalReason !== undefined ? extra.removalReason : "expired",
    tags: extra.tags !== undefined ? extra.tags : school !== undefined ? [school] : [],
  };
  if (school !== undefined) {
    effect.school = school;
  }
  const keys = Object.keys(extra) as Array<keyof AbilityEffectDef>;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (
      key === "id" ||
      key === "type" ||
      key === "source" ||
      key === "target" ||
      key === "magnitude" ||
      key === "duration" ||
      key === "tickInterval" ||
      key === "stackPolicy" ||
      key === "maxStacks" ||
      key === "refreshPolicy" ||
      key === "removalReason" ||
      key === "tags" ||
      key === "school"
    ) {
      continue;
    }
    (effect as unknown as Record<string, unknown>)[key] = extra[key];
  }
  return effect;
}

function visualsFor(school: string): { animationAssetId: string; iconAssetId: string; soundAssetId: string } {
  if (school === "melee") {
    return {
      animationAssetId: "visual.ability_melee",
      iconAssetId: "visual.ability_melee_icon",
      soundAssetId: "visual.ability_melee_sound",
    };
  }
  if (school === "heal" || school === "buff") {
    return {
      animationAssetId: "visual.ability_heal",
      iconAssetId: "visual.ability_heal_icon",
      soundAssetId: "visual.ability_heal_sound",
    };
  }
  if (school === "dot" || school === "debuff") {
    return {
      animationAssetId: "visual.ability_dot",
      iconAssetId: "visual.ability_dot_icon",
      soundAssetId: "visual.ability_dot_sound",
    };
  }
  if (school === "buff_only") {
    return {
      animationAssetId: "visual.ability_buff",
      iconAssetId: "visual.ability_buff_icon",
      soundAssetId: "visual.ability_buff_sound",
    };
  }
  return {
    animationAssetId: "visual.ability_bolt",
    iconAssetId: "visual.ability_bolt_icon",
    soundAssetId: "visual.ability_bolt_sound",
  };
}

function effectIdFor(abilityId: string, effectId: string): string {
  return "effect." + abilityId.slice("ability.".length) + "." + effectId;
}

function packAbilityEffects(abilityId: string, effects: AbilityEffectDef[], compile: boolean): { effects: Doc[]; effectIds: string[] } {
  const docs: Doc[] = [];
  const effectIds: string[] = [];
  for (let i = 0; i < effects.length; i++) {
    const eid = effectIdFor(abilityId, effects[i].id);
    effectIds.push(eid);
    docs.push({
      id: eid,
      kind: "effect_definition",
      displayName: effects[i].id,
      displayNameKey: eid + ".display_name",
      descriptionKey: eid + ".description",
      ownerAbilityId: abilityId,
      effect: effects[i],
      classification: compile ? "compile-time-addition" : "canonical",
      compileTimeAddition: compile,
    });
  }
  return { effects: docs, effectIds };
}

interface AbilitySpec {
  id: string;
  name: string;
  classId: string;
  branchId?: string;
  category: "basic" | "signature" | "capstone" | "tree_active" | "passive";
  school: "melee" | "ranged" | "spell" | "heal" | "none";
  visual: string;
  range: number;
  cd: number;
  cast?: number;
  channel?: number;
  mana?: number;
  areaShape?: "none" | "circle" | "cone" | "line" | "ground";
  areaRadius?: number;
  coneAngleDegrees?: number;
  lineLength?: number;
  lineWidth?: number;
  delay?: number;
  hitCount?: number;
  independentCrit?: boolean;
  targetMode?: "self" | "entity" | "ground_point";
  relation?: "self" | "friendly" | "hostile" | "any";
  compile?: boolean;
  effects: AbilityEffectDef[];
}

function combatPack(): { effects: Doc[]; autoAttacks: Doc[]; abilities: Doc[] } {
  const effects: Doc[] = [];
  const autoAttacks: Doc[] = [];
  const abilities: Doc[] = [];

  function addAuto(id: string, name: string, classId: string, dmg: number, interval: number, statId: string, school: "melee" | "ranged" | "spell", range: number): void {
    const body = hit("hit", "direct_damage", school, dmg, {
      magnitude: { kind: "stat_id", statId: statId, value: dmg, scale: 0.01 },
    });
    const packed = packAbilityEffects(id, [body], false);
    pushAll(effects, packed.effects);
    const vis = visualsFor(school);
    autoAttacks.push({
      id,
      kind: "auto_attack_definition",
      displayName: name,
      displayNameKey: id + ".display_name",
      descriptionKey: id + ".description",
      ownerClassId: classId,
      baseDamage: dmg,
      interval,
      scalingStatId: statId,
      school,
      range,
      targetMode: "entity",
      relationFilter: "hostile",
      runtimeEnabled: false,
      effects: [body],
      effectIds: packed.effectIds,
      animationAssetId: vis.animationAssetId,
      iconAssetId: vis.iconAssetId,
      soundAssetId: vis.soundAssetId,
      classification: "canonical",
    });
  }

  addAuto("ability.warrior.auto_attack", "Warrior Auto Attack", "class.warrior", 12, 2, STR, "melee", MELEE_RANGE);
  addAuto("ability.mage.auto_attack", "Mage Auto Attack", "class.mage", 6, 2, INT, "spell", RANGED_RANGE);
  addAuto("ability.marksman.auto_attack", "Marksman Auto Attack", "class.marksman", 10, 1.8, AGI, "ranged", RANGED_RANGE);
  addAuto("ability.mystic.auto_attack", "Mystic Auto Attack", "class.mystic", 6, 2, INT, "spell", RANGED_RANGE);

  const specs: AbilitySpec[] = [
    {
      id: "ability.warrior.heavy_strike",
      name: "Heavy Strike",
      classId: "class.warrior",
      category: "basic",
      school: "melee",
      visual: "melee",
      range: MELEE_RANGE,
      cd: 6,
      effects: [hit("hit", "direct_damage", "melee", 28, { magnitude: { kind: "stat_id", statId: STR, value: 28, scale: 0.01 } })],
    },
    {
      id: "ability.warrior.challenge",
      name: "Challenge",
      classId: "class.warrior",
      branchId: "branch.warrior.bulwark",
      category: "signature",
      school: "melee",
      visual: "buff_only",
      range: MELEE_RANGE,
      cd: 15,
      areaShape: "circle",
      areaRadius: AOE_RADIUS,
      targetMode: "self",
      relation: "hostile",
      effects: [
        hit("taunt", "taunt", "melee", 0, { target: "area", duration: 4, tags: ["taunt"] }),
        hit("dr", "timed_stat_modifier", "none", 0.15, {
          target: "self",
          duration: 4,
          statChannel: "damage_reduction",
          tags: ["buff"],
          classification: "compile-time-addition",
          compileTimeAddition: true,
        }),
      ],
    },
    {
      id: "ability.warrior.shield_bash",
      name: "Shield Bash",
      classId: "class.warrior",
      branchId: "branch.warrior.bulwark",
      category: "tree_active",
      school: "melee",
      visual: "melee",
      range: MELEE_RANGE,
      cd: 12,
      compile: true,
      effects: [
        hit("hit", "direct_damage", "melee", 10, { magnitude: { kind: "stat_id", statId: STR, value: 10, scale: 0.01 } }),
        hit("interrupt", "interrupt", "melee", 0, { tags: ["interrupt"] }),
        hit("stun", "stun", "melee", 0, { duration: 1, tags: ["control"] }),
      ],
    },
    {
      id: "ability.warrior.frenzy",
      name: "Frenzy",
      classId: "class.warrior",
      branchId: "branch.warrior.berserker",
      category: "passive",
      school: "none",
      visual: "buff_only",
      range: 0,
      cd: 0,
      targetMode: "self",
      relation: "self",
      effects: [
        hit("stacks", "passive_stacker", "none", 0.05, {
          target: "self",
          duration: 5,
          maxStacks: 3,
          stackPolicy: "stack",
          tags: ["frenzy", "passive"],
        }),
      ],
    },
    {
      id: "ability.warrior.whirlwind",
      name: "Whirlwind",
      classId: "class.warrior",
      branchId: "branch.warrior.berserker",
      category: "tree_active",
      school: "melee",
      visual: "melee",
      range: MELEE_RANGE,
      cd: 10,
      areaShape: "circle",
      areaRadius: AOE_RADIUS,
      targetMode: "self",
      relation: "hostile",
      compile: true,
      effects: [hit("hit", "direct_damage", "melee", 24, { target: "area", magnitude: { kind: "stat_id", statId: STR, value: 24, scale: 0.01 } })],
    },
    {
      id: "ability.marksman.aimed_shot",
      name: "Aimed Shot",
      classId: "class.marksman",
      category: "basic",
      school: "ranged",
      visual: "ranged",
      range: RANGED_RANGE,
      cd: 6,
      effects: [hit("hit", "direct_damage", "ranged", 22, { magnitude: { kind: "stat_id", statId: AGI, value: 22, scale: 0.01 } })],
    },
    {
      id: "ability.marksman.snipe",
      name: "Snipe",
      classId: "class.marksman",
      branchId: "branch.marksman.sniper",
      category: "signature",
      school: "ranged",
      visual: "ranged",
      range: SNIPE_RANGE,
      cd: 10,
      channel: 1.5,
      effects: [hit("hit", "direct_damage", "ranged", 45, { magnitude: { kind: "stat_id", statId: AGI, value: 45, scale: 0.01 } })],
    },
    {
      id: "ability.marksman.piercing_shot",
      name: "Piercing Shot",
      classId: "class.marksman",
      branchId: "branch.marksman.sniper",
      category: "tree_active",
      school: "ranged",
      visual: "ranged",
      range: RANGED_RANGE,
      cd: 14,
      areaShape: "line",
      lineLength: LINE_LENGTH,
      lineWidth: LINE_WIDTH,
      targetMode: "entity",
      relation: "hostile",
      compile: true,
      effects: [hit("hit", "direct_damage", "ranged", 30, { target: "area", magnitude: { kind: "stat_id", statId: AGI, value: 30, scale: 0.01 } })],
    },
    {
      id: "ability.marksman.barrage",
      name: "Barrage",
      classId: "class.marksman",
      branchId: "branch.marksman.skirmisher",
      category: "signature",
      school: "ranged",
      visual: "ranged",
      range: RANGED_RANGE,
      cd: 5,
      hitCount: 3,
      independentCrit: true,
      effects: [
        hit("hit", "direct_damage", "ranged", 6, {
          hitCount: 3,
          independentCrit: true,
          magnitude: { kind: "stat_id", statId: AGI, value: 6, scale: 0.01 },
        }),
      ],
    },
    {
      id: "ability.marksman.vault",
      name: "Vault",
      classId: "class.marksman",
      branchId: "branch.marksman.skirmisher",
      category: "tree_active",
      school: "none",
      visual: "buff_only",
      range: 0,
      cd: 15,
      targetMode: "self",
      relation: "self",
      effects: [
        hit("leap", "movement", "none", 0, {
          target: "self",
          movementKind: "leap",
          movementDistance: VAULT_DISTANCE,
          tags: ["mobility"],
        }),
        hit("haste", "timed_stat_modifier", "none", 0.3, {
          target: "self",
          duration: 2,
          statChannel: "move_speed",
          tags: ["buff"],
        }),
      ],
    },
    {
      id: "ability.mage.arcane_bolt",
      name: "Arcane Bolt",
      classId: "class.mage",
      category: "basic",
      school: "spell",
      visual: "spell",
      range: RANGED_RANGE,
      cd: 0,
      cast: 1.5,
      mana: 5,
      effects: [hit("hit", "direct_damage", "spell", 16, { magnitude: { kind: "stat_id", statId: INT, value: 16, scale: 0.01 } })],
    },
    {
      id: "ability.mage.fireball",
      name: "Fireball",
      classId: "class.mage",
      branchId: "branch.mage.fire",
      category: "signature",
      school: "spell",
      visual: "spell",
      range: RANGED_RANGE,
      cd: 0,
      cast: 2.5,
      mana: 20,
      effects: [hit("hit", "direct_damage", "spell", 34, { magnitude: { kind: "stat_id", statId: INT, value: 34, scale: 0.01 }, tags: ["spell", "fire"] })],
    },
    {
      id: "ability.mage.flame_wave",
      name: "Flame Wave",
      classId: "class.mage",
      branchId: "branch.mage.fire",
      category: "tree_active",
      school: "spell",
      visual: "spell",
      range: RANGED_RANGE,
      cd: 10,
      cast: 1.5,
      mana: 25,
      areaShape: "cone",
      areaRadius: AOE_RADIUS,
      coneAngleDegrees: CONE_ANGLE,
      compile: true,
      effects: [hit("hit", "direct_damage", "spell", 22, { target: "area", magnitude: { kind: "stat_id", statId: INT, value: 22, scale: 0.01 }, tags: ["spell", "fire"] })],
    },
    {
      id: "ability.mage.ice_bolt",
      name: "Ice Bolt",
      classId: "class.mage",
      branchId: "branch.mage.frost",
      category: "signature",
      school: "spell",
      visual: "spell",
      range: RANGED_RANGE,
      cd: 0,
      cast: 2,
      mana: 15,
      effects: [
        hit("hit", "direct_damage", "spell", 24, { magnitude: { kind: "stat_id", statId: INT, value: 24, scale: 0.01 }, tags: ["spell", "frost"] }),
        hit("slow", "slow", "spell", 0.3, { duration: 3, tags: ["slow", "frost"] }),
      ],
    },
    {
      id: "ability.mage.flash_freeze",
      name: "Flash Freeze",
      classId: "class.mage",
      branchId: "branch.mage.frost",
      category: "tree_active",
      school: "spell",
      visual: "spell",
      range: MELEE_RANGE,
      cd: 15,
      mana: 20,
      areaShape: "circle",
      areaRadius: AOE_RADIUS,
      targetMode: "self",
      relation: "hostile",
      compile: true,
      effects: [hit("root", "root", "spell", 0, { target: "area", duration: 2, tags: ["root", "frost"] })],
    },
    {
      id: "ability.mystic.fateweave",
      name: "Fateweave",
      classId: "class.mystic",
      category: "basic",
      school: "spell",
      visual: "spell",
      range: RANGED_RANGE,
      cd: 0,
      cast: 1.8,
      mana: 12,
      relation: "any",
      effects: [
        hit("harm", "direct_damage", "spell", 20, {
          magnitude: { kind: "stat_id", statId: INT, value: 20, scale: 0.01 },
          conditions: [{ type: "target_relation", relation: "hostile" }],
          tags: ["spell", "harm"],
        }),
        hit("mend", "direct_heal", "heal", 22, {
          magnitude: { kind: "stat_id", statId: SPI, value: 22, scale: 0.01 },
          conditions: [{ type: "target_relation", relation: "friendly" }],
          tags: ["heal", "mend"],
        }),
      ],
    },
    {
      id: "ability.mystic.protective_charm",
      name: "Protective Charm",
      classId: "class.mystic",
      branchId: "branch.mystic.charms",
      category: "signature",
      school: "heal",
      visual: "heal",
      range: RANGED_RANGE,
      cd: 8,
      mana: 18,
      relation: "friendly",
      effects: [
        hit("shield", "shield", "heal", 40, {
          duration: 6,
          magnitude: { kind: "stat_id", statId: SPI, value: 40, scale: 0.01 },
          tags: ["shield"],
        }),
      ],
    },
    {
      id: "ability.mystic.blessing",
      name: "Blessing",
      classId: "class.mystic",
      branchId: "branch.mystic.charms",
      category: "tree_active",
      school: "heal",
      visual: "buff_only",
      range: PARTY_RADIUS,
      cd: 20,
      mana: 25,
      areaShape: "circle",
      areaRadius: PARTY_RADIUS,
      targetMode: "self",
      relation: "friendly",
      compile: true,
      effects: [
        hit("buff", "timed_stat_modifier", "none", 0.1, {
          target: "area",
          duration: 10,
          statChannel: "damage_dealt",
          tags: ["buff"],
        }),
      ],
    },
    {
      id: "ability.mystic.wither",
      name: "Wither",
      classId: "class.mystic",
      branchId: "branch.mystic.curses",
      category: "signature",
      school: "spell",
      visual: "dot",
      range: RANGED_RANGE,
      cd: 0,
      cast: 1.5,
      mana: 14,
      effects: [
        hit("dot", "periodic_damage", "spell", 4.5, {
          duration: 8,
          tickInterval: 1,
          magnitude: { kind: "stat_id", statId: INT, value: 4.5, scale: 0.01 },
          tags: ["dot", "wither"],
        }),
      ],
    },
    {
      id: "ability.mystic.evil_eye",
      name: "Evil Eye",
      classId: "class.mystic",
      branchId: "branch.mystic.curses",
      category: "tree_active",
      school: "spell",
      visual: "debuff",
      range: RANGED_RANGE,
      cd: 12,
      mana: 15,
      compile: true,
      effects: [
        hit("taken", "timed_stat_modifier", "none", 0.15, {
          duration: 8,
          statChannel: "damage_taken",
          tags: ["debuff"],
        }),
      ],
    },
    {
      id: "ability.warrior.unbreakable",
      name: "Unbreakable",
      classId: "class.warrior",
      branchId: "branch.warrior.bulwark",
      category: "capstone",
      school: "none",
      visual: "buff_only",
      range: 0,
      cd: 90,
      targetMode: "self",
      relation: "self",
      effects: [
        hit("dr", "timed_stat_modifier", "none", 0.5, {
          target: "self",
          duration: 8,
          statChannel: "damage_reduction",
          tags: ["buff", "capstone"],
        }),
      ],
    },
    {
      id: "ability.warrior.berserk",
      name: "Berserk",
      classId: "class.warrior",
      branchId: "branch.warrior.berserker",
      category: "capstone",
      school: "none",
      visual: "buff_only",
      range: 0,
      cd: 90,
      targetMode: "self",
      relation: "self",
      effects: [
        hit("dealt", "timed_stat_modifier", "none", 0.5, {
          target: "self",
          duration: 10,
          statChannel: "damage_dealt",
          tags: ["buff", "capstone"],
        }),
        hit("taken", "timed_stat_modifier", "none", 0.2, {
          target: "self",
          duration: 10,
          statChannel: "damage_taken",
          tags: ["debuff", "capstone"],
        }),
      ],
    },
    {
      id: "ability.mage.meteor",
      name: "Meteor",
      classId: "class.mage",
      branchId: "branch.mage.fire",
      category: "capstone",
      school: "spell",
      visual: "spell",
      range: RANGED_RANGE,
      cd: 90,
      delay: 1.5,
      areaShape: "ground",
      areaRadius: AOE_RADIUS,
      targetMode: "ground_point",
      relation: "hostile",
      effects: [
        hit("blast", "direct_damage", "spell", 60, {
          target: "area",
          delay: 1.5,
          guaranteedCrit: true,
          magnitude: { kind: "stat_id", statId: INT, value: 60, scale: 0.01 },
          tags: ["spell", "fire", "capstone"],
        }),
        hit("always_crit", "guaranteed_crit", "spell", 0, { tags: ["crit"] }),
      ],
    },
    {
      id: "ability.mage.absolute_zero",
      name: "Absolute Zero",
      classId: "class.mage",
      branchId: "branch.mage.frost",
      category: "capstone",
      school: "spell",
      visual: "spell",
      range: AOE_RADIUS,
      cd: 90,
      areaShape: "circle",
      areaRadius: AOE_RADIUS,
      targetMode: "self",
      relation: "hostile",
      effects: [hit("freeze", "stun", "spell", 0, { target: "area", duration: 4, tags: ["freeze", "capstone"] })],
    },
    {
      id: "ability.marksman.coup_de_grace",
      name: "Coup de Grâce",
      classId: "class.marksman",
      branchId: "branch.marksman.sniper",
      category: "capstone",
      school: "ranged",
      visual: "ranged",
      range: RANGED_RANGE,
      cd: 60,
      effects: [
        hit("hit", "direct_damage", "ranged", 70, {
          guaranteedCrit: true,
          cooldownResetOnKill: true,
          magnitude: { kind: "stat_id", statId: AGI, value: 70, scale: 0.01 },
          tags: ["ranged", "capstone"],
        }),
        hit("reset", "cooldown_reset_on_kill", "ranged", 0, { tags: ["reset"] }),
      ],
    },
    {
      id: "ability.marksman.arrowstorm",
      name: "Arrowstorm",
      classId: "class.marksman",
      branchId: "branch.marksman.skirmisher",
      category: "capstone",
      school: "none",
      visual: "buff_only",
      range: 0,
      cd: 90,
      targetMode: "self",
      relation: "self",
      effects: [
        hit("as", "timed_stat_modifier", "none", 0.4, {
          target: "self",
          duration: 8,
          statChannel: "attack_speed",
          tags: ["buff", "capstone"],
        }),
        hit("bleeds", "timed_stat_modifier", "none", 1, {
          target: "self",
          duration: 8,
          statChannel: "bleed_tick_rate",
          tags: ["buff", "capstone"],
        }),
      ],
    },
    {
      id: "ability.mystic.benediction",
      name: "Benediction",
      classId: "class.mystic",
      branchId: "branch.mystic.charms",
      category: "capstone",
      school: "heal",
      visual: "heal",
      range: PARTY_RADIUS,
      cd: 90,
      areaShape: "circle",
      areaRadius: PARTY_RADIUS,
      targetMode: "self",
      relation: "friendly",
      compile: true,
      effects: [
        hit("heal", "direct_heal", "heal", 0, {
          target: "area",
          healthPercent: 0.3,
          tags: ["heal", "capstone"],
        }),
        hit("shield", "shield", "heal", 0, {
          target: "area",
          duration: 4,
          healthPercent: 0.1,
          tags: ["shield", "capstone"],
        }),
      ],
    },
    {
      id: "ability.mystic.malediction",
      name: "Malediction",
      classId: "class.mystic",
      branchId: "branch.mystic.curses",
      category: "capstone",
      school: "spell",
      visual: "dot",
      range: PARTY_RADIUS,
      cd: 90,
      areaShape: "circle",
      areaRadius: PARTY_RADIUS,
      targetMode: "self",
      relation: "hostile",
      compile: true,
      effects: [
        hit("wither", "periodic_damage", "spell", 4.5, {
          target: "area",
          duration: 8,
          tickInterval: 1,
          magnitude: { kind: "stat_id", statId: INT, value: 4.5, scale: 0.01 },
          tags: ["dot", "wither", "capstone"],
        }),
        hit("weaken", "timed_stat_modifier", "none", -0.15, {
          target: "area",
          duration: 8,
          statChannel: "damage_dealt",
          tags: ["debuff", "capstone"],
        }),
        hit("spread", "propagate_effect", "spell", 0, {
          propagateOn: "death",
          tags: ["propagate"],
        }),
      ],
    },
  ];

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const compile = spec.compile === true;
    const packed = packAbilityEffects(spec.id, spec.effects, compile);
    pushAll(effects, packed.effects);
    const vis = visualsFor(spec.visual);
    const doc: Doc = {
      id: spec.id,
      kind: "ability",
      displayName: spec.name,
      displayNameKey: spec.id + ".display_name",
      descriptionKey: spec.id + ".description",
      targetMode: spec.targetMode !== undefined ? spec.targetMode : "entity",
      relationFilter: spec.relation !== undefined ? spec.relation : "hostile",
      range: spec.range,
      minimumRange: 0,
      areaShape: spec.areaShape !== undefined ? spec.areaShape : "none",
      areaRadius: spec.areaRadius !== undefined ? spec.areaRadius : 0,
      castTime: spec.cast !== undefined ? spec.cast : 0,
      channelTime: spec.channel !== undefined ? spec.channel : 0,
      globalCooldown: 0,
      individualCooldown: spec.cd,
      resourceCosts:
        spec.mana !== undefined && spec.mana > 0 ? [{ resourceId: "test.resource.mana", amount: spec.mana }] : [],
      movementInterruptsCast: (spec.cast !== undefined && spec.cast > 0) || (spec.channel !== undefined && spec.channel > 0),
      damageInterruptsCast: spec.channel !== undefined && spec.channel > 0,
      requiredLevel: spec.category === "capstone" ? 10 : spec.category === "signature" || spec.category === "tree_active" ? 5 : spec.category === "basic" ? 2 : 1,
      requiredClassTags: [spec.classId],
      prerequisites: [],
      effects: spec.effects,
      effectIds: packed.effectIds,
      animationAssetId: vis.animationAssetId,
      iconAssetId: vis.iconAssetId,
      soundAssetId: vis.soundAssetId,
      skillPointCost: 0,
      maxRank: 1,
      runtimeEnabled: false,
      abilityCategory: spec.category,
      ownerClassId: spec.classId,
      school: spec.school,
      classification: compile ? "compile-time-addition" : "canonical",
      compileTimeAddition: compile,
    };
    if (spec.branchId !== undefined) {
      doc.ownerBranchId = spec.branchId;
    }
    if (spec.coneAngleDegrees !== undefined) {
      doc.coneAngleDegrees = spec.coneAngleDegrees;
    }
    if (spec.lineLength !== undefined) {
      doc.lineLength = spec.lineLength;
    }
    if (spec.lineWidth !== undefined) {
      doc.lineWidth = spec.lineWidth;
    }
    if (spec.delay !== undefined) {
      doc.delay = spec.delay;
    }
    if (spec.hitCount !== undefined) {
      doc.hitCount = spec.hitCount;
    }
    if (spec.independentCrit !== undefined) {
      doc.independentCrit = spec.independentCrit;
    }
    abilities.push(doc);
  }
  return { effects, autoAttacks, abilities };
}

function treeDocs(): Doc[] {
  const classTrees: Array<[string, string, string[]]> = [
    ["tree.warrior.class", "class.warrior", ["talent.warrior.heavy_strike_r2", "talent.warrior.conditioning", "talent.warrior.weapon_mastery"]],
    ["tree.mage.class", "class.mage", ["talent.mage.arcane_bolt_r2", "talent.mage.volatility", "talent.mage.ward"]],
    ["tree.marksman.class", "class.marksman", ["talent.marksman.aimed_shot_r2", "talent.marksman.deadly_aim", "talent.marksman.light_step"]],
    ["tree.mystic.class", "class.mystic", ["talent.mystic.fateweave_r2", "talent.mystic.compassion", "talent.mystic.malice"]],
  ];
  const branchTrees: Array<[string, string, string[]]> = [
    [
      "tree.warrior.bulwark",
      "branch.warrior.bulwark",
      [
        "talent.warrior.bulwark.challenge_r2",
        "talent.warrior.bulwark.iron_thorns",
        "talent.warrior.bulwark.fortitude",
        "talent.warrior.bulwark.challenge_r3",
        "talent.warrior.bulwark.shield_bash",
        "talent.warrior.bulwark.punishment",
        "talent.warrior.bulwark.last_stand",
        "talent.warrior.bulwark.shield_bash_r2",
      ],
    ],
    [
      "tree.warrior.berserker",
      "branch.warrior.berserker",
      [
        "talent.warrior.berserker.frenzy_r2",
        "talent.warrior.berserker.slaughter",
        "talent.warrior.berserker.relentless",
        "talent.warrior.berserker.frenzy_r3",
        "talent.warrior.berserker.bloodlust",
        "talent.warrior.berserker.whirlwind",
        "talent.warrior.berserker.bloodthirst",
        "talent.warrior.berserker.reckless",
      ],
    ],
    [
      "tree.mage.fire",
      "branch.mage.fire",
      [
        "talent.mage.fire.fireball_r2",
        "talent.mage.fire.afterburn",
        "talent.mage.fire.kindled_mind",
        "talent.mage.fire.fireball_r3",
        "talent.mage.fire.flame_wave",
        "talent.mage.fire.detonation",
        "talent.mage.fire.second_spark",
        "talent.mage.fire.flame_wave_r2",
      ],
    ],
    [
      "tree.mage.frost",
      "branch.mage.frost",
      [
        "talent.mage.frost.ice_bolt_r2",
        "talent.mage.frost.numbing_cold",
        "talent.mage.frost.deep_chill",
        "talent.mage.frost.ice_bolt_r3",
        "talent.mage.frost.flash_freeze",
        "talent.mage.frost.rimeguard",
        "talent.mage.frost.winter_harvest",
        "talent.mage.frost.flash_freeze_r2",
      ],
    ],
    [
      "tree.marksman.sniper",
      "branch.marksman.sniper",
      [
        "talent.marksman.sniper.snipe_r2",
        "talent.marksman.sniper.weak_spot",
        "talent.marksman.sniper.steady_hands",
        "talent.marksman.sniper.snipe_r3",
        "talent.marksman.sniper.piercing_shot",
        "talent.marksman.sniper.killer_instinct",
        "talent.marksman.sniper.snipers_nest",
        "talent.marksman.sniper.piercing_shot_r2",
      ],
    ],
    [
      "tree.marksman.skirmisher",
      "branch.marksman.skirmisher",
      [
        "talent.marksman.skirmisher.barrage_r2",
        "talent.marksman.skirmisher.serrated_arrows",
        "talent.marksman.skirmisher.nimble",
        "talent.marksman.skirmisher.barrage_r3",
        "talent.marksman.skirmisher.vault",
        "talent.marksman.skirmisher.twist_the_knife",
        "talent.marksman.skirmisher.runners_high",
        "talent.marksman.skirmisher.vault_r2",
      ],
    ],
    [
      "tree.mystic.charms",
      "branch.mystic.charms",
      [
        "talent.mystic.charms.protective_charm_r2",
        "talent.mystic.charms.battle_blessing",
        "talent.mystic.charms.devotion",
        "talent.mystic.charms.protective_charm_r3",
        "talent.mystic.charms.blessing",
        "talent.mystic.charms.mending_ward",
        "talent.mystic.charms.overflow",
        "talent.mystic.charms.blessing_r2",
      ],
    ],
    [
      "tree.mystic.curses",
      "branch.mystic.curses",
      [
        "talent.mystic.curses.wither_r2",
        "talent.mystic.curses.siphon",
        "talent.mystic.curses.dark_bargain",
        "talent.mystic.curses.wither_r3",
        "talent.mystic.curses.evil_eye",
        "talent.mystic.curses.festering",
        "talent.mystic.curses.vampiric_curse",
        "talent.mystic.curses.contagion",
      ],
    ],
  ];
  const docs: Doc[] = [];
  for (let i = 0; i < classTrees.length; i++) {
    const row = classTrees[i];
    docs.push(tree(row[0], "class", row[1], 2, row[2], undefined));
  }
  const gates = [
    { tier: 1, minLevel: 5, minPointsSpent: 0 },
    { tier: 2, minPointsSpent: 2 },
    { tier: 3, minLevel: 9, minPointsSpent: 4 },
  ];
  for (let i = 0; i < branchTrees.length; i++) {
    const row = branchTrees[i];
    docs.push(tree(row[0], "branch", row[1], 6, row[2], gates));
  }
  return docs;
}

function tree(
  id: string,
  treeKind: "class" | "branch",
  ownerId: string,
  points: number,
  nodeIds: string[],
  gates: Array<{ tier: number; minLevel?: number; minPointsSpent: number }> | undefined,
): Doc {
  const doc: Doc = {
    id,
    kind: "talent_tree",
    displayName: id,
    displayNameKey: id + ".display_name",
    descriptionKey: id + ".description",
    treeKind,
    ownerId,
    pointsAvailable: points,
    nodeIds,
    classification: "canonical",
  };
  if (treeKind === "branch") {
    doc.maxActiveGrants = 1;
  }
  if (gates !== undefined) {
    doc.tierGates = gates;
  }
  return doc;
}

function node(
  id: string,
  name: string,
  treeId: string,
  tier: number,
  extra: Record<string, unknown> = {},
): Doc {
  const doc: Doc = {
    id,
    kind: "talent_node",
    displayName: name,
    displayNameKey: id + ".display_name",
    descriptionKey: id + ".description",
    treeId,
    tier,
    maxRank: extra.maxRank !== undefined ? extra.maxRank : 1,
    pointCostPerRank: extra.pointCostPerRank !== undefined ? extra.pointCostPerRank : 1,
    classification: extra.compileTimeAddition === true ? "compile-time-addition" : "canonical",
  };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    doc[keys[i]] = extra[keys[i]];
  }
  return doc;
}

function nodeDocs(): Doc[] {
  return [
    node("talent.warrior.heavy_strike_r2", "Heavy Strike R2", "tree.warrior.class", 1, {
      abilityModifications: [{ abilityId: "ability.warrior.heavy_strike", modifiers: [{ type: "ability_damage_percent", value: 0.25 }] }],
    }),
    node("talent.warrior.conditioning", "Conditioning", "tree.warrior.class", 1, {
      passiveModifiers: [{ type: "max_hp_flat", value: 30 }],
    }),
    node("talent.warrior.weapon_mastery", "Weapon Mastery", "tree.warrior.class", 1, {
      passiveModifiers: [{ type: "auto_attack_damage_percent", value: 0.08 }],
    }),
    node("talent.mage.arcane_bolt_r2", "Arcane Bolt R2", "tree.mage.class", 1, {
      abilityModifications: [{ abilityId: "ability.mage.arcane_bolt", modifiers: [{ type: "ability_damage_percent", value: 0.25 }] }],
    }),
    node("talent.mage.volatility", "Volatility", "tree.mage.class", 1, {
      passiveModifiers: [{ type: "crit_damage_flat", value: 0.1 }],
    }),
    node("talent.mage.ward", "Ward", "tree.mage.class", 1, {
      passiveModifiers: [{ type: "damage_reduction_percent", value: 0.05 }],
    }),
    node("talent.marksman.aimed_shot_r2", "Aimed Shot R2", "tree.marksman.class", 1, {
      abilityModifications: [{ abilityId: "ability.marksman.aimed_shot", modifiers: [{ type: "ability_damage_percent", value: 0.25 }] }],
    }),
    node("talent.marksman.deadly_aim", "Deadly Aim", "tree.marksman.class", 1, {
      passiveModifiers: [{ type: "crit_damage_flat", value: 0.1 }],
    }),
    node("talent.marksman.light_step", "Light Step", "tree.marksman.class", 1, {
      passiveModifiers: [{ type: "move_speed_percent", value: 0.08 }],
    }),
    node("talent.mystic.fateweave_r2", "Fateweave R2", "tree.mystic.class", 1, {
      abilityModifications: [
        { abilityId: "ability.mystic.fateweave", modifiers: [{ type: "ability_damage_percent", value: 0.25 }, { type: "ability_heal_percent", value: 0.25 }] },
      ],
    }),
    node("talent.mystic.compassion", "Compassion", "tree.mystic.class", 1, {
      abilityModifications: [{ abilityId: "ability.mystic.fateweave", modifiers: [{ type: "ability_heal_percent", value: 0.2 }] }],
    }),
    node("talent.mystic.malice", "Malice", "tree.mystic.class", 1, {
      abilityModifications: [{ abilityId: "ability.mystic.fateweave", modifiers: [{ type: "ability_damage_percent", value: 0.2 }] }],
    }),
    node("talent.warrior.bulwark.challenge_r2", "Challenge R2", "tree.warrior.bulwark", 1, {
      rankReplacement: { abilityId: "ability.warrior.challenge" },
      abilityModifications: [
        { abilityId: "ability.warrior.challenge", modifiers: [{ type: "ability_duration", value: 6 }, { type: "damage_reduction_percent", value: 0.25 }] },
      ],
    }),
    node("talent.warrior.bulwark.iron_thorns", "Iron Thorns", "tree.warrior.bulwark", 1, {
      passiveModifiers: [{ type: "reflect_melee_percent", value: 0.15 }],
    }),
    node("talent.warrior.bulwark.fortitude", "Fortitude", "tree.warrior.bulwark", 1, {
      maxRank: 2,
      passiveModifiers: [{ type: "max_hp_percent", value: 0.05 }],
    }),
    node("talent.warrior.bulwark.challenge_r3", "Challenge R3", "tree.warrior.bulwark", 2, {
      prerequisites: [{ nodeId: "talent.warrior.bulwark.challenge_r2", minRank: 1 }],
      rankReplacement: { nodeId: "talent.warrior.bulwark.challenge_r2", abilityId: "ability.warrior.challenge" },
      abilityModifications: [{ abilityId: "ability.warrior.challenge", modifiers: [{ type: "damage_dealt_percent", value: -0.1 }] }],
    }),
    node("talent.warrior.bulwark.shield_bash", "Shield Bash", "tree.warrior.bulwark", 2, {
      grantsActiveAbilityId: "ability.warrior.shield_bash",
    }),
    node("talent.warrior.bulwark.punishment", "Punishment", "tree.warrior.bulwark", 2, {
      abilityModifications: [{ abilityId: "ability.warrior.heavy_strike", modifiers: [{ type: "ability_damage_percent", value: 0.25 }] }],
      conditionalModifiers: [
        {
          conditions: [{ type: "target_has_tag", tag: "taunt" }],
          modifiers: [{ type: "ability_damage_percent", abilityId: "ability.warrior.heavy_strike", value: 0.25 }],
        },
      ],
    }),
    node("talent.warrior.bulwark.last_stand", "Last Stand", "tree.warrior.bulwark", 3, {
      conditionalModifiers: [
        {
          conditions: [{ type: "target_health_percent", comparison: "below", value: 20 }],
          modifiers: [{ type: "max_hp_percent", value: 0.25 }],
        },
      ],
    }),
    node("talent.warrior.bulwark.shield_bash_r2", "Shield Bash R2", "tree.warrior.bulwark", 3, {
      prerequisites: [{ nodeId: "talent.warrior.bulwark.shield_bash", minRank: 1 }],
      rankReplacement: { nodeId: "talent.warrior.bulwark.shield_bash", abilityId: "ability.warrior.shield_bash" },
      abilityModifications: [{ abilityId: "ability.warrior.shield_bash", modifiers: [{ type: "ability_stun_duration", value: 2 }] }],
    }),
    node("talent.warrior.berserker.frenzy_r2", "Frenzy R2", "tree.warrior.berserker", 1, {
      rankReplacement: { abilityId: "ability.warrior.frenzy" },
      abilityModifications: [{ abilityId: "ability.warrior.frenzy", modifiers: [{ type: "frenzy_max_stacks", value: 5 }] }],
    }),
    node("talent.warrior.berserker.slaughter", "Slaughter", "tree.warrior.berserker", 1, {
      conditionalModifiers: [
        {
          conditions: [{ type: "target_health_percent", comparison: "below", value: 30 }],
          modifiers: [{ type: "ability_damage_percent", abilityId: "ability.warrior.heavy_strike", value: 0.3 }],
        },
      ],
    }),
    node("talent.warrior.berserker.relentless", "Relentless", "tree.warrior.berserker", 1, {
      maxRank: 2,
      passiveModifiers: [{ type: "cooldown_recovery_percent", value: 0.1 }],
    }),
    node("talent.warrior.berserker.frenzy_r3", "Frenzy R3", "tree.warrior.berserker", 2, {
      prerequisites: [{ nodeId: "talent.warrior.berserker.frenzy_r2", minRank: 1 }],
      rankReplacement: { nodeId: "talent.warrior.berserker.frenzy_r2", abilityId: "ability.warrior.frenzy" },
      compileTimeAddition: true,
      abilityModifications: [{ abilityId: "ability.warrior.frenzy", modifiers: [{ type: "frenzy_per_stack_percent", value: 0.07 }] }],
    }),
    node("talent.warrior.berserker.bloodlust", "Bloodlust", "tree.warrior.berserker", 2, {
      conditionalModifiers: [
        {
          conditions: [{ type: "effect_active", tag: "frenzy" }],
          modifiers: [{ type: "crit_damage_flat", value: 0.15 }],
        },
      ],
    }),
    node("talent.warrior.berserker.whirlwind", "Whirlwind", "tree.warrior.berserker", 2, {
      grantsActiveAbilityId: "ability.warrior.whirlwind",
    }),
    node("talent.warrior.berserker.bloodthirst", "Bloodthirst", "tree.warrior.berserker", 3, {
      conditionalModifiers: [
        {
          conditions: [{ type: "effect_active", tag: "frenzy" }],
          modifiers: [{ type: "lifesteal_percent", value: 0.04 }],
        },
      ],
    }),
    node("talent.warrior.berserker.reckless", "Reckless", "tree.warrior.berserker", 3, {
      passiveModifiers: [
        { type: "damage_dealt_percent", value: 0.1 },
        { type: "damage_taken_percent", value: 0.05 },
      ],
    }),
    node("talent.mage.fire.fireball_r2", "Fireball R2", "tree.mage.fire", 1, {
      abilityModifications: [{ abilityId: "ability.mage.fireball", modifiers: [{ type: "ability_damage_percent", value: 0.25 }] }],
    }),
    node("talent.mage.fire.afterburn", "Afterburn", "tree.mage.fire", 1, {
      abilityModifications: [{ abilityId: "ability.mage.fireball", modifiers: [{ type: "ability_damage_percent", value: 0.25 }] }],
    }),
    node("talent.mage.fire.kindled_mind", "Kindled Mind", "tree.mage.fire", 1, {
      maxRank: 2,
      passiveModifiers: [{ type: "mana_cost_percent", value: -0.1 }],
    }),
    node("talent.mage.fire.fireball_r3", "Fireball R3", "tree.mage.fire", 2, {
      prerequisites: [{ nodeId: "talent.mage.fire.fireball_r2", minRank: 1 }],
      rankReplacement: { nodeId: "talent.mage.fire.fireball_r2", abilityId: "ability.mage.fireball" },
      abilityModifications: [{ abilityId: "ability.mage.fireball", modifiers: [{ type: "ability_cast_time", value: 2 }] }],
    }),
    node("talent.mage.fire.flame_wave", "Flame Wave", "tree.mage.fire", 2, {
      grantsActiveAbilityId: "ability.mage.flame_wave",
    }),
    node("talent.mage.fire.detonation", "Detonation", "tree.mage.fire", 2, {
      passiveModifiers: [{ type: "crit_damage_flat", value: 0.15 }],
    }),
    node("talent.mage.fire.second_spark", "Second Spark", "tree.mage.fire", 3, {
      passiveModifiers: [{ type: "mana_refund_percent_of_max", value: 0.08 }],
    }),
    node("talent.mage.fire.flame_wave_r2", "Flame Wave R2", "tree.mage.fire", 3, {
      prerequisites: [{ nodeId: "talent.mage.fire.flame_wave", minRank: 1 }],
      rankReplacement: { nodeId: "talent.mage.fire.flame_wave", abilityId: "ability.mage.flame_wave" },
      abilityModifications: [{ abilityId: "ability.mage.flame_wave", modifiers: [{ type: "ability_damage_percent", value: 12 }] }],
    }),
    node("talent.mage.frost.ice_bolt_r2", "Ice Bolt R2", "tree.mage.frost", 1, {
      abilityModifications: [{ abilityId: "ability.mage.ice_bolt", modifiers: [{ type: "ability_damage_percent", value: 0.25 }] }],
    }),
    node("talent.mage.frost.numbing_cold", "Numbing Cold", "tree.mage.frost", 1, {
      passiveModifiers: [{ type: "damage_dealt_percent", value: -0.1 }],
    }),
    node("talent.mage.frost.deep_chill", "Deep Chill", "tree.mage.frost", 1, {
      maxRank: 2,
      abilityModifications: [{ abilityId: "ability.mage.ice_bolt", modifiers: [{ type: "ability_slow_duration", value: 1 }] }],
    }),
    node("talent.mage.frost.ice_bolt_r3", "Ice Bolt R3", "tree.mage.frost", 2, {
      prerequisites: [{ nodeId: "talent.mage.frost.ice_bolt_r2", minRank: 1 }],
      rankReplacement: { nodeId: "talent.mage.frost.ice_bolt_r2", abilityId: "ability.mage.ice_bolt" },
      conditionalModifiers: [
        {
          conditions: [{ type: "target_has_tag", tag: "slow" }],
          modifiers: [{ type: "ability_damage_percent", abilityId: "ability.mage.ice_bolt", value: 0.2 }],
        },
      ],
    }),
    node("talent.mage.frost.flash_freeze", "Flash Freeze", "tree.mage.frost", 2, {
      grantsActiveAbilityId: "ability.mage.flash_freeze",
    }),
    node("talent.mage.frost.rimeguard", "Rimeguard", "tree.mage.frost", 2, {
      conditionalModifiers: [
        {
          conditions: [{ type: "effect_active", tag: "slow" }],
          modifiers: [{ type: "damage_reduction_percent", value: 0.08 }],
        },
      ],
    }),
    node("talent.mage.frost.winter_harvest", "Winter Harvest", "tree.mage.frost", 3, {
      passiveModifiers: [{ type: "mana_regen_flat", value: 0.5 }],
    }),
    node("talent.mage.frost.flash_freeze_r2", "Flash Freeze R2", "tree.mage.frost", 3, {
      prerequisites: [{ nodeId: "talent.mage.frost.flash_freeze", minRank: 1 }],
      rankReplacement: { nodeId: "talent.mage.frost.flash_freeze", abilityId: "ability.mage.flash_freeze" },
      abilityModifications: [
        { abilityId: "ability.mage.flash_freeze", modifiers: [{ type: "ability_root_duration", value: 3 }, { type: "ability_radius_percent", value: 0.5 }] },
      ],
    }),
    node("talent.marksman.sniper.snipe_r2", "Snipe R2", "tree.marksman.sniper", 1, {
      abilityModifications: [{ abilityId: "ability.marksman.snipe", modifiers: [{ type: "ability_damage_percent", value: 0.25 }] }],
    }),
    node("talent.marksman.sniper.weak_spot", "Weak Spot", "tree.marksman.sniper", 1, {
      conditionalModifiers: [
        {
          conditions: [{ type: "target_health_percent", comparison: "above", value: 80 }],
          modifiers: [{ type: "ability_damage_percent", value: 0.3 }],
        },
      ],
    }),
    node("talent.marksman.sniper.steady_hands", "Steady Hands", "tree.marksman.sniper", 1, {
      maxRank: 2,
      abilityModifications: [{ abilityId: "ability.marksman.snipe", modifiers: [{ type: "ability_channel_time", value: -0.15 }] }],
    }),
    node("talent.marksman.sniper.snipe_r3", "Snipe R3", "tree.marksman.sniper", 2, {
      prerequisites: [{ nodeId: "talent.marksman.sniper.snipe_r2", minRank: 1 }],
      rankReplacement: { nodeId: "talent.marksman.sniper.snipe_r2", abilityId: "ability.marksman.snipe" },
      abilityModifications: [{ abilityId: "ability.marksman.snipe", modifiers: [{ type: "ability_crit_chance_flat", value: 0.15 }] }],
    }),
    node("talent.marksman.sniper.piercing_shot", "Piercing Shot", "tree.marksman.sniper", 2, {
      grantsActiveAbilityId: "ability.marksman.piercing_shot",
    }),
    node("talent.marksman.sniper.killer_instinct", "Killer Instinct", "tree.marksman.sniper", 2, {
      conditionalModifiers: [
        {
          conditions: [{ type: "no_enemy_in_range", range: MELEE_RANGE }],
          modifiers: [{ type: "crit_damage_flat", value: 0.15 }],
        },
      ],
    }),
    node("talent.marksman.sniper.snipers_nest", "Sniper's Nest", "tree.marksman.sniper", 3, {
      conditionalModifiers: [
        {
          conditions: [{ type: "standing_still", duration: 2 }],
          modifiers: [
            { type: "damage_dealt_percent", value: 0.1 },
            { type: "cooldown_recovery_percent", value: 0.25 },
          ],
        },
      ],
    }),
    node("talent.marksman.sniper.piercing_shot_r2", "Piercing Shot R2", "tree.marksman.sniper", 3, {
      prerequisites: [{ nodeId: "talent.marksman.sniper.piercing_shot", minRank: 1 }],
      rankReplacement: { nodeId: "talent.marksman.sniper.piercing_shot", abilityId: "ability.marksman.piercing_shot" },
      abilityModifications: [{ abilityId: "ability.marksman.piercing_shot", modifiers: [{ type: "ability_slow_percent", value: 0.3 }, { type: "ability_slow_duration", value: 2 }] }],
    }),
    node("talent.marksman.skirmisher.barrage_r2", "Barrage R2", "tree.marksman.skirmisher", 1, {
      abilityModifications: [{ abilityId: "ability.marksman.barrage", modifiers: [{ type: "ability_hit_count", value: 4 }] }],
    }),
    node("talent.marksman.skirmisher.serrated_arrows", "Serrated Arrows", "tree.marksman.skirmisher", 1, {
      abilityModifications: [{ abilityId: "ability.marksman.barrage", modifiers: [{ type: "ability_damage_percent", value: 0.2 }] }],
    }),
    node("talent.marksman.skirmisher.nimble", "Nimble", "tree.marksman.skirmisher", 1, {
      maxRank: 2,
      passiveModifiers: [{ type: "cooldown_recovery_percent", value: 0.1 }],
    }),
    node("talent.marksman.skirmisher.barrage_r3", "Barrage R3", "tree.marksman.skirmisher", 2, {
      prerequisites: [{ nodeId: "talent.marksman.skirmisher.barrage_r2", minRank: 1 }],
      rankReplacement: { nodeId: "talent.marksman.skirmisher.barrage_r2", abilityId: "ability.marksman.barrage" },
      abilityModifications: [{ abilityId: "ability.marksman.barrage", modifiers: [{ type: "ability_damage_percent", value: 0.2 }] }],
    }),
    node("talent.marksman.skirmisher.vault", "Vault", "tree.marksman.skirmisher", 2, {
      grantsActiveAbilityId: "ability.marksman.vault",
    }),
    node("talent.marksman.skirmisher.twist_the_knife", "Twist the Knife", "tree.marksman.skirmisher", 2, {
      conditionalModifiers: [
        {
          conditions: [{ type: "target_has_tag", tag: "bleed" }],
          modifiers: [{ type: "crit_damage_flat", value: 0.15 }],
        },
      ],
    }),
    node("talent.marksman.skirmisher.runners_high", "Runner's High", "tree.marksman.skirmisher", 3, {
      passiveModifiers: [{ type: "cooldown_recovery_percent", value: 0.15 }],
    }),
    node("talent.marksman.skirmisher.vault_r2", "Vault R2", "tree.marksman.skirmisher", 3, {
      prerequisites: [{ nodeId: "talent.marksman.skirmisher.vault", minRank: 1 }],
      rankReplacement: { nodeId: "talent.marksman.skirmisher.vault", abilityId: "ability.marksman.vault" },
      abilityModifications: [{ abilityId: "ability.marksman.vault", modifiers: [{ type: "ability_slow_percent", value: 0.3 }, { type: "ability_slow_duration", value: 3 }] }],
    }),
    node("talent.mystic.charms.protective_charm_r2", "Protective Charm R2", "tree.mystic.charms", 1, {
      abilityModifications: [{ abilityId: "ability.mystic.protective_charm", modifiers: [{ type: "ability_absorb_percent", value: 0.3 }] }],
    }),
    node("talent.mystic.charms.battle_blessing", "Battle Blessing", "tree.mystic.charms", 1, {
      abilityModifications: [{ abilityId: "ability.mystic.fateweave", modifiers: [{ type: "ability_damage_percent", value: 0.25 }] }],
    }),
    node("talent.mystic.charms.devotion", "Devotion", "tree.mystic.charms", 1, {
      maxRank: 2,
      passiveModifiers: [{ type: "heal_done_percent", value: 0.08 }],
    }),
    node("talent.mystic.charms.protective_charm_r3", "Protective Charm R3", "tree.mystic.charms", 2, {
      prerequisites: [{ nodeId: "talent.mystic.charms.protective_charm_r2", minRank: 1 }],
      rankReplacement: { nodeId: "talent.mystic.charms.protective_charm_r2", abilityId: "ability.mystic.protective_charm" },
      abilityModifications: [{ abilityId: "ability.mystic.protective_charm", modifiers: [{ type: "on_shield_break_heal_percent", value: 0.15 }] }],
    }),
    node("talent.mystic.charms.blessing", "Blessing", "tree.mystic.charms", 2, {
      grantsActiveAbilityId: "ability.mystic.blessing",
    }),
    node("talent.mystic.charms.mending_ward", "Mending Ward", "tree.mystic.charms", 2, {
      abilityModifications: [{ abilityId: "ability.mystic.protective_charm", modifiers: [{ type: "ability_heal_percent", value: 0.02 }] }],
    }),
    node("talent.mystic.charms.overflow", "Overflow", "tree.mystic.charms", 3, {
      passiveModifiers: [{ type: "lifesteal_percent", value: 0.2 }],
    }),
    node("talent.mystic.charms.blessing_r2", "Blessing R2", "tree.mystic.charms", 3, {
      prerequisites: [{ nodeId: "talent.mystic.charms.blessing", minRank: 1 }],
      rankReplacement: { nodeId: "talent.mystic.charms.blessing", abilityId: "ability.mystic.blessing" },
      abilityModifications: [{ abilityId: "ability.mystic.blessing", modifiers: [{ type: "damage_reduction_percent", value: 0.08 }] }],
    }),
    node("talent.mystic.curses.wither_r2", "Wither R2", "tree.mystic.curses", 1, {
      abilityModifications: [{ abilityId: "ability.mystic.wither", modifiers: [{ type: "ability_damage_percent", value: 0.25 }] }],
    }),
    node("talent.mystic.curses.siphon", "Siphon", "tree.mystic.curses", 1, {
      abilityModifications: [{ abilityId: "ability.mystic.fateweave", modifiers: [{ type: "lifesteal_percent", value: 0.15 }] }],
    }),
    node("talent.mystic.curses.dark_bargain", "Dark Bargain", "tree.mystic.curses", 1, {
      maxRank: 2,
      passiveModifiers: [{ type: "mana_cost_percent", value: -0.1 }],
    }),
    node("talent.mystic.curses.wither_r3", "Wither R3", "tree.mystic.curses", 2, {
      prerequisites: [{ nodeId: "talent.mystic.curses.wither_r2", minRank: 1 }],
      rankReplacement: { nodeId: "talent.mystic.curses.wither_r2", abilityId: "ability.mystic.wither" },
      abilityModifications: [{ abilityId: "ability.mystic.wither", modifiers: [{ type: "damage_dealt_percent", value: -0.1 }] }],
    }),
    node("talent.mystic.curses.evil_eye", "Evil Eye", "tree.mystic.curses", 2, {
      grantsActiveAbilityId: "ability.mystic.evil_eye",
    }),
    node("talent.mystic.curses.festering", "Festering", "tree.mystic.curses", 2, {
      passiveModifiers: [{ type: "dot_tick_rate_percent", value: 0.2 }],
    }),
    node("talent.mystic.curses.vampiric_curse", "Vampiric Curse", "tree.mystic.curses", 3, {
      passiveModifiers: [{ type: "lifesteal_percent", value: 0.1 }],
    }),
    node("talent.mystic.curses.contagion", "Contagion", "tree.mystic.curses", 3, {
      abilityModifications: [
        {
          abilityId: "ability.mystic.wither",
          modifiers: [{ type: "propagate_effect", effectId: "effect.mystic.wither.dot" }],
        },
      ],
    }),
  ];
}

function branchDocs(): Doc[] {
  return [
    branch("branch.warrior.bulwark", "class.warrior", "Bulwark", "tank", "ability.warrior.challenge", "ability.warrior.unbreakable", "tree.warrior.bulwark", [
      "build.bulwark.fortress",
      "build.bulwark.warlord",
    ]),
    branch("branch.warrior.berserker", "class.warrior", "Berserker", "melee_dps", "ability.warrior.frenzy", "ability.warrior.berserk", "tree.warrior.berserker", [
      "build.berserker.executioner",
      "build.berserker.hurricane",
    ]),
    branch("branch.mage.fire", "class.mage", "Fire", "caster_dps", "ability.mage.fireball", "ability.mage.meteor", "tree.mage.fire", [
      "build.fire.meteor",
      "build.fire.flamethrower",
    ]),
    branch("branch.mage.frost", "class.mage", "Frost", "control", "ability.mage.ice_bolt", "ability.mage.absolute_zero", "tree.mage.frost", [
      "build.frost.glacier",
      "build.frost.permafrost",
    ]),
    branch("branch.marksman.sniper", "class.marksman", "Sniper", "ranged_dps", "ability.marksman.snipe", "ability.marksman.coup_de_grace", "tree.marksman.sniper", [
      "build.sniper.deadeye",
      "build.sniper.quickdraw",
    ]),
    branch("branch.marksman.skirmisher", "class.marksman", "Skirmisher", "ranged_dps", "ability.marksman.barrage", "ability.marksman.arrowstorm", "tree.marksman.skirmisher", [
      "build.skirmisher.windrunner",
      "build.skirmisher.duelist",
    ]),
    branch("branch.mystic.charms", "class.mystic", "Charms", "healer", "ability.mystic.protective_charm", "ability.mystic.benediction", "tree.mystic.charms", [
      "build.charms.battle_medic",
      "build.charms.war_witch",
    ]),
    branch("branch.mystic.curses", "class.mystic", "Curses", "caster_dps", "ability.mystic.wither", "ability.mystic.malediction", "tree.mystic.curses", [
      "build.curses.plaguebringer",
      "build.curses.leech",
    ]),
  ];
}

function branch(
  id: string,
  classId: string,
  name: string,
  _role: string,
  signature: string,
  capstone: string,
  treeId: string,
  builds: string[],
): Doc {
  return {
    id,
    kind: "branch_definition",
    classId,
    displayName: name,
    displayNameKey: id + ".display_name",
    descriptionKey: id + ".description",
    roleKey: id + ".role",
    signatureAbilityId: signature,
    capstoneAbilityId: capstone,
    branchTreeId: treeId,
    recommendedBuildIds: builds,
    classification: "canonical",
  };
}

function buildDocs(): Doc[] {
  return [
    build("build.bulwark.fortress", "Fortress", "branch.warrior.bulwark", [VIT, END], "Unkillable wall", [
      "talent.warrior.bulwark.fortitude",
    ]),
    build("build.bulwark.warlord", "Warlord", "branch.warrior.bulwark", [VIT, STR], "Off-tank that still hurts", [
      "talent.warrior.bulwark.punishment",
    ]),
    build("build.berserker.executioner", "Executioner", "branch.warrior.berserker", [STR, PRE], "Few, huge crits", [
      "talent.warrior.berserker.slaughter",
      "talent.warrior.berserker.bloodlust",
    ]),
    build("build.berserker.hurricane", "Hurricane", "branch.warrior.berserker", [STR, HST, VIT], "Whirlwind machine", [
      "talent.warrior.berserker.relentless",
    ]),
    build("build.fire.meteor", "Meteor", "branch.mage.fire", [INT, PRE], "Crit-fishing burst", [
      "talent.mage.fire.detonation",
      "talent.mage.fire.second_spark",
    ]),
    build("build.fire.flamethrower", "Flamethrower", "branch.mage.fire", [INT, HST, SPI], "Sustained spray", [
      "talent.mage.fire.kindled_mind",
    ]),
    build("build.frost.glacier", "Glacier", "branch.mage.frost", [INT, END], "Attrition kiter", [
      "talent.mage.frost.numbing_cold",
      "talent.mage.frost.rimeguard",
    ]),
    build("build.frost.permafrost", "Permafrost", "branch.mage.frost", [INT, HST], "Max control uptime", [
      "talent.mage.frost.deep_chill",
    ]),
    build("build.sniper.deadeye", "Deadeye", "branch.marksman.sniper", [AGI, PRE], "One-shot fantasy", [
      "talent.marksman.sniper.weak_spot",
      "talent.marksman.sniper.killer_instinct",
    ]),
    build("build.sniper.quickdraw", "Quickdraw", "branch.marksman.sniper", [AGI, HST], "Shorter wind-ups", [
      "talent.marksman.sniper.steady_hands",
    ]),
    build("build.skirmisher.windrunner", "Windrunner", "branch.marksman.skirmisher", [AGI, HST, VIT], "Endless skirmish", [
      "talent.marksman.skirmisher.runners_high",
      "talent.marksman.skirmisher.serrated_arrows",
    ]),
    build("build.skirmisher.duelist", "Duelist", "branch.marksman.skirmisher", [AGI, PRE], "Mobile crit-fisher", [
      "talent.marksman.skirmisher.twist_the_knife",
    ]),
    build("build.charms.battle_medic", "Battle Medic", "branch.mystic.charms", [SPI, VIT], "Frontline healer", [
      "talent.mystic.charms.devotion",
      "talent.mystic.charms.mending_ward",
    ]),
    build("build.charms.war_witch", "War Witch", "branch.mystic.charms", [SPI, INT], "Off-heals, real solo damage", [
      "talent.mystic.charms.battle_blessing",
    ]),
    build("build.curses.plaguebringer", "Plaguebringer", "branch.mystic.curses", [INT, HST], "Faster DoT ticks", [
      "talent.mystic.curses.festering",
      "talent.mystic.curses.contagion",
    ]),
    build("build.curses.leech", "Leech", "branch.mystic.curses", [INT, SPI], "Drain-sustain attrition", [
      "talent.mystic.curses.siphon",
      "talent.mystic.curses.vampiric_curse",
    ]),
  ];
}

function build(id: string, name: string, branchId: string, priority: string[], _identity: string, paired: string[]): Doc {
  return {
    id,
    kind: "reference_build",
    displayName: name,
    displayNameKey: id + ".display_name",
    descriptionKey: id + ".description",
    branchId,
    statPriority: priority,
    identityKey: id + ".identity",
    pairedNodeIds: paired,
    classification: "canonical",
  };
}

function mysticClass(): Doc {
  return {
    id: "class.mystic",
    kind: "class",
    displayName: "Mystic",
    shortDescription: "Support caster. Canonical roster data only; not selectable yet.",
    displayNameKey: "class.mystic.display_name",
    shortDescriptionKey: "class.mystic.short_description",
    longDescriptionKey: "class.mystic.long_description",
    descriptionKey: "class.mystic.long_description",
    roleSummaryKey: "class.mystic.role_summary",
    placeholderIconAssetId: "visual.class_mystic",
    placeholderVisualSetId: "visual.class_mystic",
    placeholderThemeKey: "theme.class.mystic",
    selectOrder: 4,
    visualAssetSetId: "visual.class_mystic",
    visualSetId: "visual.class_mystic",
    rosterSelectable: false,
    progressionId: "progression.mystic",
    levelCurveId: "test.curve.standard",
    canonicalLevelCurveId: "curve.vibecode.l10",
    startingAttributes: {
      "test.attribute.might": 2,
      "test.attribute.vitality": 4,
      "test.attribute.focus": 7,
    },
    startingResources: {
      "test.resource.health": 80,
      "test.resource.mana": 60,
    },
    attributePointPolicy: { pointsAtCreate: 0 },
    skillPointPolicy: { pointsAtCreate: 0 },
    startingEquipment: [{ itemId: "item.training_sword", quantity: 1 }],
    startingAbilities: ["test.ability.basic_melee", "test.ability.ranged_bolt"],
    allowedEquipmentTags: ["main_hand", "head", "chest", "legs", "feet"],
    tags: ["mystic", "caster"],
    baseStats: {
      [STR]: 2,
      [AGI]: 4,
      [INT]: 6,
      [SPI]: 8,
      [VIT]: 5,
      [PRE]: 3,
      [HST]: 3,
      [END]: 3,
    },
    automaticGrowth: {
      [STR]: 0,
      [AGI]: 0,
      [INT]: 2,
      [SPI]: 2,
      [VIT]: 1,
      [PRE]: 0,
      [HST]: 0,
      [END]: 1,
    },
    autoAssignTemplate: {
      amounts: { [INT]: 1, [SPI]: 1, [VIT]: 1 },
      classification: "compile-time-addition",
      compileTimeAddition: true,
    },
    resourceType: "test.resource.mana",
    autoAttackId: "ability.mystic.auto_attack",
    basicAbilityId: "ability.mystic.fateweave",
    classTreeId: "tree.mystic.class",
    branchIds: ["branch.mystic.charms", "branch.mystic.curses"],
  };
}

function mysticProgression(): Doc {
  return {
    id: "progression.mystic",
    kind: "class_progression",
    classId: "class.mystic",
    levelCurveId: "test.curve.standard",
    startingAttributes: {
      "test.attribute.might": 2,
      "test.attribute.vitality": 4,
      "test.attribute.focus": 7,
    },
    attributeGrowth: {
      "test.attribute.might": 0,
      "test.attribute.vitality": 0,
      "test.attribute.focus": 1,
    },
    startingResources: {
      "test.resource.health": 80,
      "test.resource.mana": 60,
    },
    resourceGrowth: {
      "test.resource.health": 2,
      "test.resource.mana": 6,
    },
    startingDerived: {
      "test.stat.attack": 2,
    },
    allowedAttributeIds: ["test.attribute.might", "test.attribute.vitality", "test.attribute.focus"],
    attributePointRules: { pointsAtCreate: 0 },
    skillPointRules: { pointsAtCreate: 0 },
  };
}
