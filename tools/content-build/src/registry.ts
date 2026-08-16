import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface KindRegistryEntry {
  schema: string;
  definitionSchemaVersion: number;
  idPrefix: string;
}

export interface ContentPackageManifest {
  packageId: string;
  packageVersion: string;
  schemaVersion: number;
  minimumProtocolVersion: number;
  kinds: Record<string, KindRegistryEntry>;
}

export const DEFAULT_MANIFEST: ContentPackageManifest = {
  packageId: "vibecode.foundation",
  packageVersion: "1.0.0",
  schemaVersion: 1,
  minimumProtocolVersion: 1,
  kinds: {
    player: { schema: "player.json", definitionSchemaVersion: 1, idPrefix: "player" },
    item: { schema: "item.json", definitionSchemaVersion: 1, idPrefix: "item" },
    npc: { schema: "npc.json", definitionSchemaVersion: 1, idPrefix: "npc" },
    enemy: { schema: "enemy.json", definitionSchemaVersion: 1, idPrefix: "enemy" },
    quest: { schema: "quest.json", definitionSchemaVersion: 1, idPrefix: "quest" },
    zone: { schema: "zone.json", definitionSchemaVersion: 1, idPrefix: "zone" },
    class: { schema: "class.json", definitionSchemaVersion: 1, idPrefix: "test.class" },
    attribute: { schema: "attribute.json", definitionSchemaVersion: 1, idPrefix: "test.attribute" },
    resource: { schema: "resource.json", definitionSchemaVersion: 1, idPrefix: "test.resource" },
    derived_stat: { schema: "derived_stat.json", definitionSchemaVersion: 1, idPrefix: "test.stat" },
    level_curve: { schema: "level_curve.json", definitionSchemaVersion: 1, idPrefix: "test.curve" },
    class_progression: { schema: "class_progression.json", definitionSchemaVersion: 1, idPrefix: "test.progression" },
    equipment_slot: { schema: "equipment_slot.json", definitionSchemaVersion: 1, idPrefix: "slot" },
    ability: { schema: "ability.json", definitionSchemaVersion: 1, idPrefix: "test.ability" },
  },
};

export function loadPackageManifest(path: string): ContentPackageManifest {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as ContentPackageManifest;
  if (typeof parsed.packageId !== "string" || parsed.packageId.length === 0) {
    throw new Error("package_manifest_invalid:packageId");
  }
  if (typeof parsed.packageVersion !== "string" || parsed.packageVersion.length === 0) {
    throw new Error("package_manifest_invalid:packageVersion");
  }
  if (typeof parsed.schemaVersion !== "number") {
    throw new Error("package_manifest_invalid:schemaVersion");
  }
  if (typeof parsed.minimumProtocolVersion !== "number") {
    throw new Error("package_manifest_invalid:minimumProtocolVersion");
  }
  if (parsed.kinds === null || typeof parsed.kinds !== "object" || Array.isArray(parsed.kinds)) {
    throw new Error("package_manifest_invalid:kinds");
  }
  return parsed;
}

export function defaultManifestPath(root: string): string {
  return join(root, "content", "package.manifest.json");
}

export function kindNames(manifest: ContentPackageManifest): string[] {
  return Object.keys(manifest.kinds).sort();
}

export function schemaFilesForManifest(manifest: ContentPackageManifest): string[] {
  const files = ["common.json"];
  const kinds = kindNames(manifest);
  for (let i = 0; i < kinds.length; i++) {
    const schema = manifest.kinds[kinds[i]].schema;
    if (files.indexOf(schema) === -1) {
      files.push(schema);
    }
  }
  return files;
}
