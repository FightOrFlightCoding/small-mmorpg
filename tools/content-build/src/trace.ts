import type { ContentPayload } from "./types";
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
    return refs;
  }
  const enemy = payload.enemies[id];
  if (enemy) {
    refs.push(enemy.visualId);
    for (let i = 0; i < enemy.loot.length; i++) {
      refs.push(enemy.loot[i].itemId);
    }
    return refs;
  }
  const quest = payload.quests[id];
  if (quest) {
    refs.push(quest.acceptNpcId);
    refs.push(quest.turnInNpcId);
    for (let o = 0; o < quest.objectives.length; o++) {
      refs.push(quest.objectives[o].itemId);
    }
    for (let c = 0; c < quest.consume.length; c++) {
      refs.push(quest.consume[c].itemId);
    }
    for (let r = 0; r < quest.rewards.items.length; r++) {
      refs.push(quest.rewards.items[r].itemId);
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
