import type { ContentPayload, QuestDef } from "./types";
import { collectDefinitionIds, definitionById } from "./diff";

export interface ReferenceTrace {
  id: string;
  outbound: string[];
  inbound: string[];
  usedBy: UsedByReport;
}

export function traceReferences(payload: ContentPayload, id: string): ReferenceTrace | null {
  if (definitionById(payload, id) === undefined) {
    return null;
  }
  const outbound = unique(outboundRefs(payload, id));
  const inbound: string[] = [];
  const ids = collectDefinitionIds(payload);
  for (let i = 0; i < ids.length; i++) {
    const other = ids[i];
    if (other === id) {
      continue;
    }
    const refs = outboundRefs(payload, other);
    if (refs.indexOf(id) !== -1) {
      inbound.push(other);
    }
  }
  inbound.sort();
  return {
    id: id,
    outbound: outbound,
    inbound: inbound,
    usedBy: categorizeInbound(payload, inbound),
  };
}

export interface UsedByReport {
  quests: string[];
  classes: string[];
  lootTables: string[];
  zones: string[];
  npcs: string[];
  enemies: string[];
  vendors: string[];
  abilities: string[];
  spawns: string[];
  other: string[];
}

export function categorizeInbound(payload: ContentPayload, inbound: string[]): UsedByReport {
  const report: UsedByReport = {
    quests: [],
    classes: [],
    lootTables: [],
    zones: [],
    npcs: [],
    enemies: [],
    vendors: [],
    abilities: [],
    spawns: [],
    other: [],
  };
  for (let i = 0; i < inbound.length; i++) {
    const other = inbound[i];
    if (payload.quests[other]) {
      report.quests.push(other);
    } else if (payload.classes[other]) {
      report.classes.push(other);
    } else if (payload.lootTables[other]) {
      report.lootTables.push(other);
    } else if (payload.zones[other]) {
      report.zones.push(other);
    } else if (payload.npcs[other]) {
      report.npcs.push(other);
    } else if (payload.enemies[other]) {
      report.enemies.push(other);
    } else if (payload.vendors[other]) {
      report.vendors.push(other);
    } else if (payload.abilities[other]) {
      report.abilities.push(other);
    } else if (payload.spawns[other]) {
      report.spawns.push(other);
    } else {
      report.other.push(other);
    }
  }
  return report;
}

export function outboundRefs(payload: ContentPayload, id: string): string[] {
  const refs: string[] = [];
  if (payload.player.id === id) {
    refs.push(payload.player.visualId);
    if (payload.player.basicAbilityId !== undefined) {
      refs.push(payload.player.basicAbilityId);
    }
    return refs;
  }
  const item = payload.items[id];
  if (item) {
    refs.push(item.visualId);
    return refs;
  }
  const npc = payload.npcs[id];
  if (npc) {
    refs.push(npc.visualId);
    refs.push(npc.zoneId);
    refs.push(npc.dialogueId);
    for (let s = 0; s < npc.services.length; s++) {
      const service = npc.services[s];
      if (service.vendorId !== undefined) {
        refs.push(service.vendorId);
      }
      const questIds = service.questIds !== undefined ? service.questIds : [];
      for (let q = 0; q < questIds.length; q++) {
        refs.push(questIds[q]);
      }
    }
    return refs;
  }
  const enemy = payload.enemies[id];
  if (enemy) {
    refs.push(enemy.visualId);
    refs.push(enemy.aiProfileId);
    refs.push(enemy.lootTableId);
    const loadout = enemy.abilityLoadout !== undefined ? enemy.abilityLoadout : [];
    for (let a = 0; a < loadout.length; a++) {
      refs.push(loadout[a]);
    }
    const drops = enemy.loot !== undefined ? enemy.loot : [];
    for (let i = 0; i < drops.length; i++) {
      refs.push(drops[i].itemId);
    }
    const phases = enemy.phases !== undefined ? enemy.phases : [];
    for (let p = 0; p < phases.length; p++) {
      const added = phases[p].addAbilityIds;
      if (added !== undefined) {
        for (let i = 0; i < added.length; i++) {
          refs.push(added[i]);
        }
      }
      const trigger = phases[p].triggerSpawnId;
      if (trigger !== undefined) {
        refs.push(trigger);
      }
    }
    return refs;
  }
  const quest = payload.quests[id];
  if (quest) {
    refs.push(quest.acceptNpcId);
    refs.push(quest.turnInNpcId);
    if (quest.startNpcId !== undefined) {
      refs.push(quest.startNpcId);
    }
    const objectives = questObjectivesForTrace(quest);
    for (let o = 0; o < objectives.length; o++) {
      const objective = objectives[o];
      if (objective.itemId !== undefined) {
        refs.push(objective.itemId);
      }
      if (objective.npcId !== undefined) {
        refs.push(objective.npcId);
      }
      if (objective.enemyId !== undefined) {
        refs.push(objective.enemyId);
      }
      if (objective.zoneId !== undefined) {
        refs.push(objective.zoneId);
      }
    }
    const consume = quest.consume !== undefined ? quest.consume : [];
    for (let c = 0; c < consume.length; c++) {
      refs.push(consume[c].itemId);
    }
    const rewardItems = quest.rewards.items !== undefined ? quest.rewards.items : [];
    for (let r = 0; r < rewardItems.length; r++) {
      refs.push(rewardItems[r].itemId);
    }
    const unlocks = quest.rewards.abilityUnlockIds !== undefined ? quest.rewards.abilityUnlockIds : [];
    for (let u = 0; u < unlocks.length; u++) {
      refs.push(unlocks[u]);
    }
    return refs;
  }
  const zone = payload.zones[id];
  if (zone) {
    refs.push(zone.visualId);
    for (let n = 0; n < zone.npcs.length; n++) {
      refs.push(zone.npcs[n].npcId);
    }
    for (let e = 0; e < zone.enemies.length; e++) {
      refs.push(zone.enemies[e].enemyId);
      const spawnId = zone.enemies[e].spawnId;
      if (spawnId !== undefined) {
        refs.push(spawnId);
      }
    }
    return refs;
  }
  const classDef = payload.classes[id];
  if (classDef) {
    refs.push(classDef.visualAssetSetId);
    refs.push(classDef.progressionId);
    if (classDef.visualSetId !== undefined) {
      refs.push(classDef.visualSetId);
    }
    if (classDef.resourceType !== undefined) {
      refs.push(classDef.resourceType);
    }
    if (classDef.autoAttackId !== undefined) {
      refs.push(classDef.autoAttackId);
    }
    if (classDef.basicAbilityId !== undefined) {
      refs.push(classDef.basicAbilityId);
    }
    if (classDef.classTreeId !== undefined) {
      refs.push(classDef.classTreeId);
    }
    if (classDef.canonicalLevelCurveId !== undefined) {
      refs.push(classDef.canonicalLevelCurveId);
    }
    const branchIds = classDef.branchIds !== undefined ? classDef.branchIds : [];
    for (let b = 0; b < branchIds.length; b++) {
      refs.push(branchIds[b]);
    }
    pushMapKeys(refs, classDef.baseStats);
    pushMapKeys(refs, classDef.automaticGrowth);
    if (classDef.autoAssignTemplate !== undefined) {
      pushMapKeys(refs, classDef.autoAssignTemplate.amounts);
    }
    for (let i = 0; i < classDef.startingEquipment.length; i++) {
      refs.push(classDef.startingEquipment[i].itemId);
    }
    for (let a = 0; a < classDef.startingAbilities.length; a++) {
      refs.push(classDef.startingAbilities[a]);
    }
    return refs;
  }
  const ability = payload.abilities[id];
  if (ability) {
    refs.push(ability.animationAssetId);
    refs.push(ability.iconAssetId);
    refs.push(ability.soundAssetId);
    for (let r = 0; r < ability.resourceCosts.length; r++) {
      refs.push(ability.resourceCosts[r].resourceId);
    }
    for (let p = 0; p < ability.prerequisites.length; p++) {
      refs.push(ability.prerequisites[p]);
    }
    for (let e = 0; e < ability.effects.length; e++) {
      const statId = ability.effects[e].magnitude.statId;
      if (statId !== undefined) {
        refs.push(statId);
      }
      const propagate = ability.effects[e].propagateEffectId;
      if (propagate !== undefined) {
        refs.push(propagate);
      }
    }
    const effectIds = ability.effectIds !== undefined ? ability.effectIds : [];
    for (let i = 0; i < effectIds.length; i++) {
      refs.push(effectIds[i]);
    }
    if (ability.ownerClassId !== undefined) {
      refs.push(ability.ownerClassId);
    }
    if (ability.ownerBranchId !== undefined) {
      refs.push(ability.ownerBranchId);
    }
    return refs;
  }
  const table = payload.lootTables[id];
  if (table) {
    for (let i = 0; i < table.entries.length; i++) {
      refs.push(table.entries[i].itemDefinitionId);
    }
    return refs;
  }
  const spawn = payload.spawns[id];
  if (spawn) {
    refs.push(spawn.zoneId);
    refs.push(spawn.enemyId);
    return refs;
  }
  const vendor = payload.vendors[id];
  if (vendor) {
    for (let i = 0; i < vendor.stock.length; i++) {
      refs.push(vendor.stock[i].itemId);
    }
    return refs;
  }
  const progression = payload.classProgressions[id];
  if (progression) {
    refs.push(progression.classId);
    refs.push(progression.levelCurveId);
    pushMapKeys(refs, progression.startingAttributes);
    pushMapKeys(refs, progression.attributeGrowth);
    pushMapKeys(refs, progression.startingResources);
    if (progression.resourceGrowth !== undefined) {
      pushMapKeys(refs, progression.resourceGrowth);
    }
    pushMapKeys(refs, progression.startingDerived);
    for (let a = 0; a < progression.allowedAttributeIds.length; a++) {
      refs.push(progression.allowedAttributeIds[a]);
    }
    return refs;
  }
  const stat = payload.stats[id];
  if (stat) {
    return refs;
  }
  const branch = payload.branches[id];
  if (branch) {
    refs.push(branch.classId);
    refs.push(branch.signatureAbilityId);
    refs.push(branch.capstoneAbilityId);
    refs.push(branch.branchTreeId);
    for (let i = 0; i < branch.recommendedBuildIds.length; i++) {
      refs.push(branch.recommendedBuildIds[i]);
    }
    return refs;
  }
  const timeline = payload.progressionTimelines[id];
  if (timeline) {
    refs.push(timeline.levelCurveId);
    return refs;
  }
  const autoAttack = payload.autoAttacks[id];
  if (autoAttack) {
    refs.push(autoAttack.ownerClassId);
    refs.push(autoAttack.scalingStatId);
    refs.push(autoAttack.animationAssetId);
    refs.push(autoAttack.iconAssetId);
    refs.push(autoAttack.soundAssetId);
    for (let e = 0; e < autoAttack.effects.length; e++) {
      const sid = autoAttack.effects[e].magnitude.statId;
      if (sid !== undefined) {
        refs.push(sid);
      }
    }
    const effectIds = autoAttack.effectIds !== undefined ? autoAttack.effectIds : [];
    for (let i = 0; i < effectIds.length; i++) {
      refs.push(effectIds[i]);
    }
    return refs;
  }
  const effectDef = payload.effectDefinitions[id];
  if (effectDef) {
    if (effectDef.ownerAbilityId !== undefined) {
      refs.push(effectDef.ownerAbilityId);
    }
    const sid = effectDef.effect.magnitude.statId;
    if (sid !== undefined) {
      refs.push(sid);
    }
    if (effectDef.effect.propagateEffectId !== undefined) {
      refs.push(effectDef.effect.propagateEffectId);
    }
    return refs;
  }
  const tree = payload.talentTrees[id];
  if (tree) {
    refs.push(tree.ownerId);
    for (let n = 0; n < tree.nodeIds.length; n++) {
      refs.push(tree.nodeIds[n]);
    }
    return refs;
  }
  const node = payload.talentNodes[id];
  if (node) {
    refs.push(node.treeId);
    const prereq = node.prerequisites !== undefined ? node.prerequisites : [];
    for (let p = 0; p < prereq.length; p++) {
      refs.push(prereq[p].nodeId);
    }
    if (node.rankReplacement !== undefined) {
      if (node.rankReplacement.nodeId !== undefined) {
        refs.push(node.rankReplacement.nodeId);
      }
      if (node.rankReplacement.abilityId !== undefined) {
        refs.push(node.rankReplacement.abilityId);
      }
    }
    if (node.grantsActiveAbilityId !== undefined) {
      refs.push(node.grantsActiveAbilityId);
    }
    const mods = node.abilityModifications !== undefined ? node.abilityModifications : [];
    for (let m = 0; m < mods.length; m++) {
      refs.push(mods[m].abilityId);
    }
    return refs;
  }
  const build = payload.referenceBuilds[id];
  if (build) {
    refs.push(build.branchId);
    for (let s = 0; s < build.statPriority.length; s++) {
      refs.push(build.statPriority[s]);
    }
    const paired = build.pairedNodeIds !== undefined ? build.pairedNodeIds : [];
    for (let p = 0; p < paired.length; p++) {
      refs.push(paired[p]);
    }
    return refs;
  }
  const category = payload.equipmentModifierCategories[id];
  if (category) {
    refs.push(category.statId);
    return refs;
  }
  const derived = payload.derivedStats[id];
  if (derived) {
    for (let c = 0; c < derived.components.length; c++) {
      const componentId = derived.components[c].id;
      if (componentId !== undefined) {
        refs.push(componentId);
      }
    }
  }
  return refs;
}

function questObjectivesForTrace(quest: QuestDef): NonNullable<QuestDef["objectives"]> {
  const fromStages: NonNullable<QuestDef["objectives"]> = [];
  if (quest.stages !== undefined) {
    for (let s = 0; s < quest.stages.length; s++) {
      const stage = quest.stages[s];
      for (let o = 0; o < stage.objectives.length; o++) {
        fromStages.push(stage.objectives[o]);
      }
    }
  }
  if (fromStages.length > 0) {
    return fromStages;
  }
  return quest.objectives !== undefined ? quest.objectives : [];
}

function pushMapKeys(refs: string[], map: Record<string, number> | undefined): void {
  if (map === undefined) {
    return;
  }
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    refs.push(keys[i]);
  }
}

function unique(values: string[]): string[] {
  const seen: { [id: string]: boolean } = {};
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (seen[value]) {
      continue;
    }
    seen[value] = true;
    out.push(value);
  }
  out.sort();
  return out;
}
