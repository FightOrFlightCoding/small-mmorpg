import { join } from "node:path";
import { writeOutputs, buildBundle } from "./emit";
import { loadSourceDocuments } from "./load";
import type { ContentBundle } from "./types";
import { validateDocuments } from "./validate";
import { ContentValidationError } from "./issues";

export interface GenerateOptions {
  root: string;
  sourceDir?: string;
  schemaDir?: string;
  serverOut?: string;
  clientOut?: string;
}

export function resolveOptions(options: GenerateOptions): Required<GenerateOptions> {
  return {
    root: options.root,
    sourceDir: options.sourceDir ?? join(options.root, "content", "source"),
    schemaDir: options.schemaDir ?? join(options.root, "content", "schemas"),
    serverOut: options.serverOut ?? join(options.root, "server", "src", "generated", "content.ts"),
    clientOut: options.clientOut ?? join(options.root, "client", "content", "bundle.json"),
  };
}

export function generateContent(options: GenerateOptions): ContentBundle {
  const resolved = resolveOptions(options);
  const loaded = loadSourceDocuments(resolved.sourceDir);
  if (loaded.issues.length > 0) {
    throw new ContentValidationError(loaded.issues);
  }
  const payload = validateDocuments(resolved.schemaDir, loaded.documents);
  const bundle = buildBundle(payload);
  writeOutputs(resolved.serverOut, resolved.clientOut, bundle);
  return bundle;
}
