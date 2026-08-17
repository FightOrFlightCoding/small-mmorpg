import { canonicalize } from "./canonical";
import type { ContentPayload } from "./types";

export interface ContentDiffEntry {
  id: string;
  change: "added" | "removed" | "changed";
}

export interface ContentDiffReport {
  added: string[];
  removed: string[];
  changed: string[];
  entries: ContentDiffEntry[];
}

export function collectDefinitionIds(payload: ContentPayload): string[] {
  const ids = [payload.player.id];
  pushKeys(ids, payload.items);
  pushKeys(ids, payload.npcs);
  pushKeys(ids, payload.enemies);
  pushKeys(ids, payload.quests);
  pushKeys(ids, payload.zones);
  pushKeys(ids, payload.classes);
  pushKeys(ids, payload.attributes);
  pushKeys(ids, payload.resources);
  pushKeys(ids, payload.derivedStats);
  pushKeys(ids, payload.levelCurves);
  pushKeys(ids, payload.classProgressions);
  pushKeys(ids, payload.equipmentSlots);
  pushKeys(ids, payload.abilities);
  pushKeys(ids, payload.aiProfiles);
  pushKeys(ids, payload.lootTables);
  pushKeys(ids, payload.spawns);
  ids.sort();
  return ids;
}

export function definitionById(payload: ContentPayload, id: string): unknown | undefined {
  if (payload.player.id === id) {
    return payload.player;
  }
  if (payload.items[id]) {
    return payload.items[id];
  }
  if (payload.npcs[id]) {
    return payload.npcs[id];
  }
  if (payload.enemies[id]) {
    return payload.enemies[id];
  }
  if (payload.quests[id]) {
    return payload.quests[id];
  }
  if (payload.zones[id]) {
    return payload.zones[id];
  }
  if (payload.classes[id]) {
    return payload.classes[id];
  }
  if (payload.attributes[id]) {
    return payload.attributes[id];
  }
  if (payload.resources[id]) {
    return payload.resources[id];
  }
  if (payload.derivedStats[id]) {
    return payload.derivedStats[id];
  }
  if (payload.levelCurves[id]) {
    return payload.levelCurves[id];
  }
  if (payload.classProgressions[id]) {
    return payload.classProgressions[id];
  }
  if (payload.equipmentSlots[id]) {
    return payload.equipmentSlots[id];
  }
  if (payload.abilities[id]) {
    return payload.abilities[id];
  }
  if (payload.aiProfiles[id]) {
    return payload.aiProfiles[id];
  }
  if (payload.lootTables[id]) {
    return payload.lootTables[id];
  }
  if (payload.spawns[id]) {
    return payload.spawns[id];
  }
  return undefined;
}

export function diffPayloads(from: ContentPayload, to: ContentPayload): ContentDiffReport {
  const fromIds = collectDefinitionIds(from);
  const toIds = collectDefinitionIds(to);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const fromSet: { [id: string]: boolean } = {};
  const toSet: { [id: string]: boolean } = {};
  for (let i = 0; i < fromIds.length; i++) {
    fromSet[fromIds[i]] = true;
  }
  for (let j = 0; j < toIds.length; j++) {
    toSet[toIds[j]] = true;
  }
  for (let r = 0; r < fromIds.length; r++) {
    const id = fromIds[r];
    if (!toSet[id]) {
      removed.push(id);
    }
  }
  for (let a = 0; a < toIds.length; a++) {
    const id = toIds[a];
    if (!fromSet[id]) {
      added.push(id);
      continue;
    }
    const left = JSON.stringify(canonicalize(definitionById(from, id)));
    const right = JSON.stringify(canonicalize(definitionById(to, id)));
    if (left !== right) {
      changed.push(id);
    }
  }
  added.sort();
  removed.sort();
  changed.sort();
  const entries: ContentDiffEntry[] = [];
  for (let i = 0; i < added.length; i++) {
    entries.push({ id: added[i], change: "added" });
  }
  for (let j = 0; j < removed.length; j++) {
    entries.push({ id: removed[j], change: "removed" });
  }
  for (let k = 0; k < changed.length; k++) {
    entries.push({ id: changed[k], change: "changed" });
  }
  return { added: added, removed: removed, changed: changed, entries: entries };
}

function pushKeys(ids: string[], map: Record<string, { id: string }>): void {
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    ids.push(keys[i]);
  }
}
