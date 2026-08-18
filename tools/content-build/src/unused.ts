import { collectDefinitionIds } from "./diff";
import { outboundRefs } from "./trace";
import type { ContentPayload } from "./types";
import type { AssetIndex } from "./validate";

const ROOT_KINDS: { [kind: string]: boolean } = {
  player: true,
  zone: true,
  class: true,
  attribute: true,
  resource: true,
  derived_stat: true,
  equipment_slot: true,
  level_curve: true,
  ai_profile: true,
  class_progression: true,
};

export interface UnusedReport {
  unused: string[];
  unusedAssets: string[];
}

export function kindOf(payload: ContentPayload, id: string): string {
  if (payload.player.id === id) {
    return "player";
  }
  if (payload.items[id]) {
    return "item";
  }
  if (payload.npcs[id]) {
    return "npc";
  }
  if (payload.enemies[id]) {
    return "enemy";
  }
  if (payload.quests[id]) {
    return "quest";
  }
  if (payload.zones[id]) {
    return "zone";
  }
  if (payload.classes[id]) {
    return "class";
  }
  if (payload.attributes[id]) {
    return "attribute";
  }
  if (payload.resources[id]) {
    return "resource";
  }
  if (payload.derivedStats[id]) {
    return "derived_stat";
  }
  if (payload.levelCurves[id]) {
    return "level_curve";
  }
  if (payload.classProgressions[id]) {
    return "class_progression";
  }
  if (payload.equipmentSlots[id]) {
    return "equipment_slot";
  }
  if (payload.abilities[id]) {
    return "ability";
  }
  if (payload.aiProfiles[id]) {
    return "ai_profile";
  }
  if (payload.lootTables[id]) {
    return "loot_table";
  }
  if (payload.spawns[id]) {
    return "spawn";
  }
  if (payload.vendors[id]) {
    return "vendor";
  }
  return "unknown";
}

export function unusedReport(payload: ContentPayload, assets?: AssetIndex): UnusedReport {
  const inbound: { [id: string]: number } = {};
  const ids = collectDefinitionIds(payload);
  const referencedVisuals: { [id: string]: boolean } = {};
  for (let i = 0; i < ids.length; i++) {
    inbound[ids[i]] = 0;
  }
  for (let i = 0; i < ids.length; i++) {
    const refs = outboundRefs(payload, ids[i]);
    for (let r = 0; r < refs.length; r++) {
      const target = refs[r];
      if (target.indexOf("visual.") === 0) {
        referencedVisuals[target] = true;
      }
      if (inbound[target] === undefined) {
        continue;
      }
      inbound[target] += 1;
    }
  }
  const unused: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const kind = kindOf(payload, id);
    if (ROOT_KINDS[kind] === true) {
      continue;
    }
    if (kind === "spawn" && payload.spawns[id] !== undefined && payload.zones[payload.spawns[id].zoneId]) {
      continue;
    }
    if (inbound[id] === undefined || inbound[id] > 0) {
      continue;
    }
    unused.push(id);
  }
  unused.sort();
  const unusedAssets: string[] = [];
  if (assets !== undefined) {
    const visualKeys = Object.keys(assets.visualIds).sort();
    for (let v = 0; v < visualKeys.length; v++) {
      if (referencedVisuals[visualKeys[v]] !== true) {
        unusedAssets.push(visualKeys[v]);
      }
    }
  }
  return { unused: unused, unusedAssets: unusedAssets };
}
