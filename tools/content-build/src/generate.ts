import { join } from "node:path";
import { writeOutputs, buildPackage, toContentBundle } from "./emit";
import { loadSourceDocuments } from "./load";
import { defaultManifestPath, loadPackageManifest, type ContentPackageManifest } from "./registry";
import type { ContentBundle, ContentPackage } from "./types";
import { developmentOnlyIds, validateDocuments } from "./validate";
import { ContentValidationError } from "./issues";
import { defaultClientAssetPaths, loadAssetIndex } from "./assets";

export interface GenerateOptions {
  root: string;
  sourceDir?: string;
  schemaDir?: string;
  serverOut?: string;
  clientOut?: string;
  manifestPath?: string;
  includeDevelopment?: boolean;
  buildTimestamp?: string;
}

export function resolveOptions(options: GenerateOptions): Required<GenerateOptions> {
  return {
    root: options.root,
    sourceDir: options.sourceDir ?? join(options.root, "content", "source"),
    schemaDir: options.schemaDir ?? join(options.root, "content", "schemas"),
    serverOut: options.serverOut ?? join(options.root, "server", "src", "generated", "content.ts"),
    clientOut: options.clientOut ?? join(options.root, "client", "content", "bundle.json"),
    manifestPath: options.manifestPath ?? defaultManifestPath(options.root),
    includeDevelopment: options.includeDevelopment === true,
    buildTimestamp: options.buildTimestamp ?? "",
  };
}

export function loadManifest(options: GenerateOptions): ContentPackageManifest {
  const resolved = resolveOptions(options);
  return loadPackageManifest(resolved.manifestPath);
}

export function compileContentPackage(options: GenerateOptions): ContentPackage {
  const resolved = resolveOptions(options);
  const loaded = loadSourceDocuments(resolved.sourceDir);
  if (loaded.issues.length > 0) {
    throw new ContentValidationError(loaded.issues);
  }
  const manifest = loadPackageManifest(resolved.manifestPath);
  const payload = validateDocuments(resolved.schemaDir, loaded.documents, {
    manifest: manifest,
    includeDevelopment: resolved.includeDevelopment,
    assets: loadAssetIndex(defaultClientAssetPaths(resolved.root)),
  });
  return buildPackage(payload, {
    manifest: manifest,
    developmentOnly: resolved.includeDevelopment ? [] : developmentOnlyIds(loaded.documents),
    buildTimestamp: resolved.buildTimestamp,
  });
}

export function generateContent(options: GenerateOptions): ContentBundle {
  const resolved = resolveOptions(options);
  const pkg = compileContentPackage(resolved);
  const bundle = toContentBundle(pkg);
  writeOutputs(resolved.serverOut, resolved.clientOut, bundle);
  return bundle;
}
