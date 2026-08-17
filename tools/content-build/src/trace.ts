import type { ContentPayload, QuestDef } from "./types";
import { collectDefinitionIds, definitionById } from "./diff";

export interface ReferenceTrace {
  id: string;
  outbound: string[];
  inbound: string[];
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
  return { id: id, outbound: outbound, inbound: inbound };
}

function outboundRefs(payload: ContentPayload, id: string): string[] {
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

function pushMapKeys(refs: string[], map: Record<string, number>): void {
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
