import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AssetIndex } from "./validate";

export interface ClientAssetPaths {
  visualMap: string;
  dialogueMap: string;
  assetManifest: string;
}

export function defaultClientAssetPaths(root: string): ClientAssetPaths {
  return {
    visualMap: join(root, "client", "content", "visual_map.json"),
    dialogueMap: join(root, "client", "content", "dialogue_map.json"),
    assetManifest: join(root, "client", "content", "asset_manifest.json"),
  };
}

export function loadAssetIndex(paths: ClientAssetPaths): AssetIndex | undefined {
  if (!existsSync(paths.visualMap) || !existsSync(paths.dialogueMap)) {
    return undefined;
  }
  const visualIds: { [id: string]: boolean } = {};
  const dialogueIds: { [id: string]: boolean } = {};
  const visualMap = JSON.parse(readFileSync(paths.visualMap, "utf8")) as { [id: string]: unknown };
  const visualKeys = Object.keys(visualMap);
  for (let i = 0; i < visualKeys.length; i++) {
    visualIds[visualKeys[i]] = true;
  }
  const dialogueMap = JSON.parse(readFileSync(paths.dialogueMap, "utf8")) as { [id: string]: string };
  const dialogueKeys = Object.keys(dialogueMap);
  for (let d = 0; d < dialogueKeys.length; d++) {
    dialogueIds[dialogueKeys[d]] = true;
  }
  if (existsSync(paths.assetManifest)) {
    collectManifestVisuals(JSON.parse(readFileSync(paths.assetManifest, "utf8")), visualIds);
  }
  return { visualIds: visualIds, dialogueIds: dialogueIds };
}

function collectManifestVisuals(manifest: unknown, visualIds: { [id: string]: boolean }): void {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    return;
  }
  const root = manifest as { [key: string]: unknown };
  addVisual(visualIds, root["spriteVisualId"]);
  addVisual(visualIds, root["fallbackVisualId"]);
  addVisual(visualIds, root["shadowVisualId"]);
  addVisual(visualIds, root["visualId"]);
  const keys = Object.keys(root);
  for (let i = 0; i < keys.length; i++) {
    const value = root[keys[i]];
    if (typeof value === "string") {
      addVisual(visualIds, value);
      continue;
    }
    if (value !== null && typeof value === "object") {
      collectManifestVisuals(value, visualIds);
    }
  }
}

function addVisual(visualIds: { [id: string]: boolean }, value: unknown): void {
  if (typeof value === "string" && value.indexOf("visual.") === 0) {
    visualIds[value] = true;
  }
}
