import { issue, type ContentIssue } from "./issues";
import type {
  AbilityDef,
  AutoAttackDefinitionDef,
  BranchDefinitionDef,
  ClassDef,
  ContentPayload,
  EffectDefinitionDef,
  TalentNodeDef,
  TalentTreeDef,
} from "./types";

const STAT_IDS = [
  "stat.strength",
  "stat.agility",
  "stat.intelligence",
  "stat.spirit",
  "stat.vitality",
  "stat.precision",
  "stat.haste",
  "stat.endurance",
] as const;

const CANONICAL_CLASS_IDS = ["class.warrior", "class.mage", "class.marksman", "class.mystic"] as const;

const PHYSICAL_CLASS_IDS = ["class.warrior", "class.marksman"] as const;

const CASTER_CLASS_IDS = ["class.mage", "class.mystic"] as const;

const SUPPORTED_EFFECT_TYPES: { [type: string]: boolean } = {
  direct_damage: true,
  direct_heal: true,
  resource_change: true,
  timed_stat_modifier: true,
  periodic_damage: true,
  periodic_heal: true,
  stun: true,
  root: true,
  taunt: true,
  interrupt: true,
  slow: true,
  shield: true,
  movement: true,
  reflect_damage: true,
  propagate_effect: true,
  cooldown_reset_on_kill: true,
  guaranteed_crit: true,
  passive_stacker: true,
};

const BASE_TOTAL = 34;
const GROWTH_TOTAL = 6;
const AUTO_ASSIGN_TOTAL = 3;
const CLASS_TREE_NODES = 3;
const CLASS_TREE_POINTS = 2;
const BRANCH_TREE_NODES = 8;
const BRANCH_POINT_SLOTS = 9;
const BRANCH_POINTS_AVAILABLE = 6;
const XP_TABLE = [100, 280, 520, 800, 1120, 1470, 1850, 2260, 2700];
const XP_TOTAL = 11100;

const REQUIRED_CANONICAL_IDS = [
  ...STAT_IDS,
  ...CANONICAL_CLASS_IDS,
  "branch.warrior.bulwark",
  "branch.warrior.berserker",
  "branch.mage.fire",
  "branch.mage.frost",
  "branch.marksman.sniper",
  "branch.marksman.skirmisher",
  "branch.mystic.charms",
  "branch.mystic.curses",
  "curve.vibecode.l10",
  "timeline.vibecode.l10",
  "ability.warrior.auto_attack",
  "ability.mage.auto_attack",
  "ability.marksman.auto_attack",
  "ability.mystic.auto_attack",
  "ability.warrior.heavy_strike",
  "ability.warrior.challenge",
  "ability.warrior.shield_bash",
  "ability.warrior.frenzy",
  "ability.warrior.whirlwind",
  "ability.marksman.aimed_shot",
  "ability.marksman.snipe",
  "ability.marksman.piercing_shot",
  "ability.marksman.barrage",
  "ability.marksman.vault",
  "ability.mage.arcane_bolt",
  "ability.mage.fireball",
  "ability.mage.flame_wave",
  "ability.mage.ice_bolt",
  "ability.mage.flash_freeze",
  "ability.mystic.fateweave",
  "ability.mystic.protective_charm",
  "ability.mystic.blessing",
  "ability.mystic.wither",
  "ability.mystic.evil_eye",
  "ability.warrior.unbreakable",
  "ability.warrior.berserk",
  "ability.mage.meteor",
  "ability.mage.absolute_zero",
  "ability.marksman.coup_de_grace",
  "ability.marksman.arrowstorm",
  "ability.mystic.benediction",
  "ability.mystic.malediction",
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
  "tree.warrior.class",
  "tree.mage.class",
  "tree.marksman.class",
  "tree.mystic.class",
  "tree.warrior.bulwark",
  "tree.warrior.berserker",
  "tree.mage.fire",
  "tree.mage.frost",
  "tree.marksman.sniper",
  "tree.marksman.skirmisher",
  "tree.mystic.charms",
  "tree.mystic.curses",
  "enemy.scaling.standard",
  "enemy.scaling.elite",
  "xp.reward.kill",
  "resource.none",
  "mod.stat.strength",
  "mod.stat.agility",
  "mod.stat.intelligence",
  "mod.stat.spirit",
  "mod.stat.vitality",
  "mod.stat.precision",
  "mod.stat.haste",
  "mod.stat.endurance",
];

const COMPILE_TIME_IDS: { [id: string]: boolean } = {
  "ability.warrior.shield_bash": true,
  "ability.warrior.whirlwind": true,
  "ability.marksman.piercing_shot": true,
  "ability.mage.flame_wave": true,
  "ability.mage.flash_freeze": true,
  "ability.mystic.blessing": true,
  "ability.mystic.evil_eye": true,
  "ability.mystic.benediction": true,
  "ability.mystic.malediction": true,
  "talent.warrior.berserker.frenzy_r3": true,
};

export function checkCanonicalProgression(payload: ContentPayload, issues: ContentIssue[]): void {
  checkRequiredIds(payload, issues);
  checkStats(payload, issues);
  checkCanonicalClasses(payload, issues);
  checkBranches(payload, issues);
  checkLevelCurve(payload, issues);
  checkTimeline(payload, issues);
  checkTalentTrees(payload, issues);
  checkAbilitiesAndEffects(payload, issues);
  checkAutoAttacks(payload, issues);
  checkReferenceBuilds(payload, issues);
  checkEnemyScaling(payload, issues);
  checkXpRewards(payload, issues);
  checkEquipmentCategories(payload, issues);
}

function payloadHas(payload: ContentPayload, id: string): boolean {
  if (payload.player.id === id) {
    return true;
  }
  return (
    payload.items[id] !== undefined ||
    payload.npcs[id] !== undefined ||
    payload.enemies[id] !== undefined ||
    payload.quests[id] !== undefined ||
    payload.zones[id] !== undefined ||
    payload.classes[id] !== undefined ||
    payload.attributes[id] !== undefined ||
    payload.resources[id] !== undefined ||
    payload.derivedStats[id] !== undefined ||
    payload.levelCurves[id] !== undefined ||
    payload.classProgressions[id] !== undefined ||
    payload.equipmentSlots[id] !== undefined ||
    payload.abilities[id] !== undefined ||
    payload.stats[id] !== undefined ||
    payload.branches[id] !== undefined ||
    payload.progressionTimelines[id] !== undefined ||
    payload.autoAttacks[id] !== undefined ||
    payload.effectDefinitions[id] !== undefined ||
    payload.talentTrees[id] !== undefined ||
    payload.talentNodes[id] !== undefined ||
    payload.referenceBuilds[id] !== undefined ||
    payload.enemyScalingProfiles[id] !== undefined ||
    payload.xpRewards[id] !== undefined ||
    payload.equipmentModifierCategories[id] !== undefined ||
    payload.aiProfiles[id] !== undefined ||
    payload.lootTables[id] !== undefined ||
    payload.spawns[id] !== undefined ||
    payload.vendors[id] !== undefined
  );
}

function checkRequiredIds(payload: ContentPayload, issues: ContentIssue[]): void {
  for (let i = 0; i < REQUIRED_CANONICAL_IDS.length; i++) {
    const id = REQUIRED_CANONICAL_IDS[i];
    if (!payloadHas(payload, id)) {
      issues.push(issue("missing_canonical_value:" + id));
    }
  }
}

function checkStats(payload: ContentPayload, issues: ContentIssue[]): void {
  for (let i = 0; i < STAT_IDS.length; i++) {
    const id = STAT_IDS[i];
    const stat = payload.stats[id];
    if (!stat) {
      continue;
    }
    if (!stat.displayNameKey || !stat.descriptionKey) {
      issues.push(issue("missing_localization_key:" + id));
    }
  }
}

function statSum(map: Record<string, number> | undefined): number {
  if (map === undefined) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < STAT_IDS.length; i++) {
    const value = map[STAT_IDS[i]];
    if (typeof value === "number") {
      total += value;
    }
  }
  return total;
}

function checkCanonicalClasses(payload: ContentPayload, issues: ContentIssue[]): void {
  for (let i = 0; i < CANONICAL_CLASS_IDS.length; i++) {
    const id = CANONICAL_CLASS_IDS[i];
    const def = payload.classes[id];
    if (!def) {
      continue;
    }
    checkClassFields(def, issues);
    if (statSum(def.baseStats) !== BASE_TOTAL) {
      issues.push(issue("base_array_total:" + id));
    }
    if (statSum(def.automaticGrowth) !== GROWTH_TOTAL) {
      issues.push(issue("growth_total:" + id));
    }
    if (def.autoAssignTemplate !== undefined && statSum(def.autoAssignTemplate.amounts) !== AUTO_ASSIGN_TOTAL) {
      issues.push(issue("auto_assign_total:" + id));
    }
    if (def.autoAssignTemplate !== undefined && def.autoAssignTemplate.compileTimeAddition !== true) {
      issues.push(issue("compile_time_addition_tag:" + id));
    }
    if (def.resourceType === undefined) {
      issues.push(issue("resource_compatibility:" + id));
    }
  }
  for (let p = 0; p < PHYSICAL_CLASS_IDS.length; p++) {
    const def = payload.classes[PHYSICAL_CLASS_IDS[p]];
    if (def && def.resourceType !== "resource.none") {
      issues.push(issue("physical_class_mana:" + PHYSICAL_CLASS_IDS[p]));
    }
  }
  for (let c = 0; c < CASTER_CLASS_IDS.length; c++) {
    const def = payload.classes[CASTER_CLASS_IDS[c]];
    if (!def || def.resourceType === undefined || !payload.resources[def.resourceType] || payload.resources[def.resourceType].role !== "mana") {
      issues.push(issue("caster_mana_definition:" + CASTER_CLASS_IDS[c]));
    }
  }
}

function checkClassFields(def: ClassDef, issues: ContentIssue[]): void {
  const requiredKeys = [
    def.displayNameKey,
    def.descriptionKey,
    def.resourceType,
    def.autoAttackId,
    def.basicAbilityId,
    def.classTreeId,
    def.visualSetId,
  ];
  for (let i = 0; i < requiredKeys.length; i++) {
    if (!requiredKeys[i]) {
      issues.push(issue("missing_localization_key:" + def.id));
      break;
    }
  }
  if (!def.baseStats || !def.automaticGrowth || !def.autoAssignTemplate || !def.branchIds || def.branchIds.length !== 2) {
    issues.push(issue("missing_class_canonical_fields:" + def.id));
  }
}

function checkBranches(payload: ContentPayload, issues: ContentIssue[]): void {
  const ids = Object.keys(payload.branches);
  const byClass: { [classId: string]: BranchDefinitionDef[] } = {};
  for (let i = 0; i < ids.length; i++) {
    const branch = payload.branches[ids[i]];
    if (!branch.displayNameKey || !branch.roleKey) {
      issues.push(issue("missing_localization_key:" + branch.id));
    }
    if (!payload.classes[branch.classId]) {
      issues.push(issue("missing_reference:" + branch.classId));
    }
    if (!abilityExists(payload, branch.signatureAbilityId)) {
      issues.push(issue("missing_reference:" + branch.signatureAbilityId));
    }
    if (!abilityExists(payload, branch.capstoneAbilityId)) {
      issues.push(issue("missing_reference:" + branch.capstoneAbilityId));
    }
    if (!payload.talentTrees[branch.branchTreeId]) {
      issues.push(issue("missing_reference:" + branch.branchTreeId));
    }
    const list = byClass[branch.classId] !== undefined ? byClass[branch.classId] : [];
    list.push(branch);
    byClass[branch.classId] = list;
  }
  const classIds = Object.keys(byClass);
  for (let c = 0; c < classIds.length; c++) {
    const pair = byClass[classIds[c]];
    if (pair.length !== 2) {
      continue;
    }
    const left = pair[0].displayName.charAt(0).toLowerCase();
    const right = pair[1].displayName.charAt(0).toLowerCase();
    if (left !== right) {
      issues.push(issue("alliterative_branch_names:" + classIds[c]));
    }
  }
}

function abilityExists(payload: ContentPayload, id: string): boolean {
  return payload.abilities[id] !== undefined || payload.autoAttacks[id] !== undefined;
}

function checkLevelCurve(payload: ContentPayload, issues: ContentIssue[]): void {
  const curve = payload.levelCurves["curve.vibecode.l10"];
  if (!curve) {
    return;
  }
  if (curve.maxLevel !== 10 || curve.xpRequired.length !== 9) {
    issues.push(issue("invalid_level_curve:curve.vibecode.l10"));
  }
  let sum = 0;
  for (let i = 0; i < curve.xpRequired.length; i++) {
    if (curve.xpRequired[i] !== XP_TABLE[i]) {
      issues.push(issue("missing_canonical_value:xp.table"));
    }
    sum += curve.xpRequired[i];
  }
  if (sum !== XP_TOTAL) {
    issues.push(issue("missing_canonical_value:xp.total"));
  }
}

function checkTimeline(payload: ContentPayload, issues: ContentIssue[]): void {
  const timeline = payload.progressionTimelines["timeline.vibecode.l10"];
  if (!timeline) {
    return;
  }
  if (timeline.classPoints !== 2 || timeline.branchPoints !== 6) {
    issues.push(issue("point_slot_count:timeline.vibecode.l10"));
  }
  if (timeline.automaticGrowthPerLevel !== 6 || timeline.freePointsPerLevel !== 3) {
    issues.push(issue("missing_canonical_value:timeline.growth"));
  }
}

function checkTalentTrees(payload: ContentPayload, issues: ContentIssue[]): void {
  const treeIds = Object.keys(payload.talentTrees);
  for (let t = 0; t < treeIds.length; t++) {
    const tree = payload.talentTrees[treeIds[t]];
    checkTree(payload, tree, issues);
  }
  const nodeIds = Object.keys(payload.talentNodes);
  for (let n = 0; n < nodeIds.length; n++) {
    checkTalentNode(payload, payload.talentNodes[nodeIds[n]], issues);
  }
}

function checkTree(payload: ContentPayload, tree: TalentTreeDef, issues: ContentIssue[]): void {
  if (!tree.displayNameKey) {
    issues.push(issue("missing_localization_key:" + tree.id));
  }
  let slots = 0;
  let actives = 0;
  if (tree.nodeIds.length !== (tree.treeKind === "class" ? CLASS_TREE_NODES : BRANCH_TREE_NODES)) {
    issues.push(issue("point_slot_count:" + tree.id));
  }
  for (let i = 0; i < tree.nodeIds.length; i++) {
    const node = payload.talentNodes[tree.nodeIds[i]];
    if (!node) {
      issues.push(issue("missing_reference:" + tree.nodeIds[i]));
      continue;
    }
    if (node.treeId !== tree.id) {
      issues.push(issue("talent_rank_chain:" + node.id));
    }
    slots += node.maxRank * node.pointCostPerRank;
    if (node.grantsActiveAbilityId !== undefined) {
      actives += 1;
    }
  }
  if (tree.treeKind === "class") {
    if (tree.pointsAvailable !== CLASS_TREE_POINTS) {
      issues.push(issue("point_slot_count:" + tree.id));
    }
  } else {
    if (slots !== BRANCH_POINT_SLOTS || tree.pointsAvailable !== BRANCH_POINTS_AVAILABLE) {
      issues.push(issue("point_slot_count:" + tree.id));
    }
    const maxActives = tree.maxActiveGrants !== undefined ? tree.maxActiveGrants : 1;
    if (actives > maxActives) {
      issues.push(issue("max_branch_active_count:" + tree.id));
    }
  }
}

function checkTalentNode(payload: ContentPayload, node: TalentNodeDef, issues: ContentIssue[]): void {
  if (!node.displayNameKey || !node.descriptionKey) {
    issues.push(issue("missing_localization_key:" + node.id));
  }
  if (node.tier < 1 || node.tier > 3) {
    issues.push(issue("invalid_tier:" + node.id));
  }
  const prereq = node.prerequisites !== undefined ? node.prerequisites : [];
  for (let p = 0; p < prereq.length; p++) {
    if (!payload.talentNodes[prereq[p].nodeId]) {
      issues.push(issue("missing_reference:" + prereq[p].nodeId));
    }
  }
  if (node.rankReplacement !== undefined && node.rankReplacement.nodeId !== undefined && !payload.talentNodes[node.rankReplacement.nodeId]) {
    issues.push(issue("talent_rank_chain:" + node.id));
  }
  if (node.grantsActiveAbilityId !== undefined && !payload.abilities[node.grantsActiveAbilityId]) {
    issues.push(issue("ability_ownership:" + node.id));
  }
  if (COMPILE_TIME_IDS[node.id] === true && node.compileTimeAddition !== true) {
    issues.push(issue("compile_time_addition_tag:" + node.id));
  }
}

function checkAbilitiesAndEffects(payload: ContentPayload, issues: ContentIssue[]): void {
  const ids = Object.keys(payload.abilities);
  for (let i = 0; i < ids.length; i++) {
    checkAbilityShape(payload, payload.abilities[ids[i]], issues);
  }
  const effectIds = Object.keys(payload.effectDefinitions);
  for (let e = 0; e < effectIds.length; e++) {
    checkEffectBody(payload.effectDefinitions[effectIds[e]], issues);
  }
}

function checkAbilityShape(payload: ContentPayload, ability: AbilityDef, issues: ContentIssue[]): void {
  if (!ability.displayNameKey || !ability.descriptionKey) {
    issues.push(issue("missing_localization_key:" + ability.id));
  }
  if (ability.castTime < 0 || ability.channelTime < 0 || ability.delay !== undefined && ability.delay < 0) {
    issues.push(issue("invalid_negative_timing:" + ability.id));
  }
  if (ability.globalCooldown < 0 || ability.individualCooldown < 0) {
    issues.push(issue("invalid_cooldown:" + ability.id));
  }
  if (ability.ownerClassId !== undefined && !payload.classes[ability.ownerClassId]) {
    issues.push(issue("ability_ownership:" + ability.id));
  }
  if (ability.ownerBranchId !== undefined && !payload.branches[ability.ownerBranchId]) {
    issues.push(issue("ability_ownership:" + ability.id));
  }
  if (ability.resourceCosts.length > 0 && ability.ownerClassId !== undefined) {
    const cls = payload.classes[ability.ownerClassId];
    if (cls && cls.resourceType === "resource.none") {
      issues.push(issue("resource_compatibility:" + ability.id));
    }
  }
  if (COMPILE_TIME_IDS[ability.id] === true && ability.compileTimeAddition !== true) {
    issues.push(issue("compile_time_addition_tag:" + ability.id));
  }
  for (let e = 0; e < ability.effects.length; e++) {
    const type = ability.effects[e].type;
    if (SUPPORTED_EFFECT_TYPES[type] !== true) {
      issues.push(issue("unsupported_effect_type:" + ability.id + ":" + type));
    }
  }
  const effectIds = ability.effectIds !== undefined ? ability.effectIds : [];
  for (let i = 0; i < effectIds.length; i++) {
    if (!payload.effectDefinitions[effectIds[i]]) {
      issues.push(issue("missing_reference:" + effectIds[i]));
    }
  }
  if (ability.id.indexOf("ability.") === 0 && ability.runtimeEnabled !== false) {
    issues.push(issue("runtime_enabled:" + ability.id));
  }
}

function checkEffectBody(def: EffectDefinitionDef, issues: ContentIssue[]): void {
  if (!def.displayNameKey) {
    issues.push(issue("missing_localization_key:" + def.id));
  }
  if (SUPPORTED_EFFECT_TYPES[def.effect.type] !== true) {
    issues.push(issue("unsupported_effect_type:" + def.id + ":" + def.effect.type));
  }
}

function checkAutoAttacks(payload: ContentPayload, issues: ContentIssue[]): void {
  const ids = Object.keys(payload.autoAttacks);
  for (let i = 0; i < ids.length; i++) {
    const attack = payload.autoAttacks[ids[i]];
    checkAutoAttack(payload, attack, issues);
  }
}

function checkAutoAttack(payload: ContentPayload, attack: AutoAttackDefinitionDef, issues: ContentIssue[]): void {
  if (!attack.displayNameKey || !attack.descriptionKey) {
    issues.push(issue("missing_localization_key:" + attack.id));
  }
  if (attack.interval <= 0) {
    issues.push(issue("invalid_cooldown:" + attack.id));
  }
  if (!payload.classes[attack.ownerClassId]) {
    issues.push(issue("ability_ownership:" + attack.id));
  }
  if (!payload.stats[attack.scalingStatId]) {
    issues.push(issue("missing_reference:" + attack.scalingStatId));
  }
  if (attack.runtimeEnabled !== false) {
    issues.push(issue("runtime_enabled:" + attack.id));
  }
}

function checkReferenceBuilds(payload: ContentPayload, issues: ContentIssue[]): void {
  const ids = Object.keys(payload.referenceBuilds);
  if (ids.length !== 16) {
    issues.push(issue("missing_canonical_value:reference_builds"));
  }
  for (let i = 0; i < ids.length; i++) {
    const build = payload.referenceBuilds[ids[i]];
    if (!build.displayNameKey || !build.identityKey) {
      issues.push(issue("missing_localization_key:" + build.id));
    }
    if (!payload.branches[build.branchId]) {
      issues.push(issue("missing_reference:" + build.branchId));
    }
    for (let s = 0; s < build.statPriority.length; s++) {
      if (!payload.stats[build.statPriority[s]]) {
        issues.push(issue("missing_reference:" + build.statPriority[s]));
      }
    }
  }
}

function checkEnemyScaling(payload: ContentPayload, issues: ContentIssue[]): void {
  const standard = payload.enemyScalingProfiles["enemy.scaling.standard"];
  if (!standard) {
    return;
  }
  if (standard.hpIntercept !== 40 || standard.hpPerLevel !== 8 || standard.damageIntercept !== 2 || standard.damagePerLevel !== 0.5) {
    issues.push(issue("missing_canonical_value:enemy.scaling.standard"));
  }
  const elite = payload.enemyScalingProfiles["enemy.scaling.elite"];
  if (elite && (elite.hpMultiplier !== 3 || elite.damageMultiplier !== 2 || elite.killXpMultiplier !== 3)) {
    issues.push(issue("missing_canonical_value:enemy.scaling.elite"));
  }
}

function checkXpRewards(payload: ContentPayload, issues: ContentIssue[]): void {
  const kill = payload.xpRewards["xp.reward.kill"];
  if (!kill) {
    return;
  }
  if (kill.formula.intercept !== 8 || kill.formula.perLevel !== 2) {
    issues.push(issue("missing_canonical_value:xp.reward.kill"));
  }
}

function checkEquipmentCategories(payload: ContentPayload, issues: ContentIssue[]): void {
  for (let i = 0; i < STAT_IDS.length; i++) {
    const id = "mod." + STAT_IDS[i];
    const category = payload.equipmentModifierCategories[id];
    if (!category) {
      continue;
    }
    if (category.statId !== STAT_IDS[i]) {
      issues.push(issue("missing_reference:" + category.statId));
    }
  }
}
