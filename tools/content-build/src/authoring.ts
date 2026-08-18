import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadSourceDocuments } from "./load";
import { starterTemplate, type AuthoringType, type ClientFileWrite, type SourcePatch } from "./templates";
import type { SourceDocument } from "./types";

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export function createFromTemplate(options: {
  root: string;
  sourceDir: string;
  type: AuthoringType;
  id: string;
}): string[] {
  const result = starterTemplate(options.type, options.id);
  const written = writeDocuments(options.sourceDir, result.documents);
  applyPatches(options.sourceDir, result.patches);
  writeClientFiles(options.root, result.clientFiles);
  return written;
}

export function copyDefinition(options: { sourceDir: string; fromId: string; toId: string }): string {
  const loaded = loadSourceDocuments(options.sourceDir);
  if (loaded.issues.length > 0) {
    throw new Error(loaded.issues.map((entry) => entry.code).join("\n"));
  }
  const source = findDoc(loaded.documents, options.fromId);
  if (source === undefined) {
    throw new Error("unknown_id:" + options.fromId);
  }
  const destPath = join(options.sourceDir, options.toId + ".json");
  if (existsSync(destPath)) {
    throw new Error("already_exists:" + options.toId);
  }
  const copied = JSON.parse(JSON.stringify(source.data)) as Record<string, unknown>;
  copied["id"] = options.toId;
  writeJson(destPath, copied);
  return destPath;
}

export function migrateSource(sourceDir: string, expectedVersion: number): { updated: string[]; skipped: string[] } {
  const loaded = loadSourceDocuments(sourceDir);
  if (loaded.issues.length > 0) {
    throw new Error(loaded.issues.map((entry) => entry.code).join("\n"));
  }
  const updated: string[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < loaded.documents.length; i++) {
    const doc = loaded.documents[i];
    const current = doc.data["schemaVersion"];
    if (typeof current === "number" && current !== expectedVersion) {
      throw new Error("unsupported_schema_version:" + String(doc.data["id"]) + ":" + String(current));
    }
    if (typeof current === "number" && current === expectedVersion) {
      skipped.push(String(doc.data["id"]));
      continue;
    }
    const next = { ...doc.data, schemaVersion: expectedVersion };
    writeJson(join(sourceDir, doc.fileName), next);
    updated.push(String(doc.data["id"]));
  }
  updated.sort();
  skipped.sort();
  return { updated: updated, skipped: skipped };
}

function writeDocuments(sourceDir: string, documents: SourceDocument[]): string[] {
  const written: string[] = [];
  for (let i = 0; i < documents.length; i++) {
    const dest = join(sourceDir, documents[i].fileName);
    if (existsSync(dest)) {
      throw new Error("already_exists:" + documents[i].fileName);
    }
    writeJson(dest, documents[i].data);
    written.push(dest);
  }
  return written;
}

function applyPatches(sourceDir: string, patches: SourcePatch[]): void {
  for (let i = 0; i < patches.length; i++) {
    const path = join(sourceDir, patches[i].id + ".json");
    if (!existsSync(path)) {
      throw new Error("unknown_id:" + patches[i].id);
    }
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    writeJson(path, patches[i].apply(parsed));
  }
}

function writeClientFiles(root: string, files: ClientFileWrite[]): void {
  for (let i = 0; i < files.length; i++) {
    const dest = join(root, files[i].relativePath);
    if (files[i].mergeJson === true && existsSync(dest)) {
      const existing = JSON.parse(readFileSync(dest, "utf8")) as Record<string, unknown>;
      const incoming = JSON.parse(files[i].contents) as Record<string, unknown>;
      writeJson(dest, deepMerge(existing, incoming));
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, files[i].contents, "utf8");
  }
}

function deepMerge(base: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const left = out[key];
    const right = extra[key];
    if (
      left !== null &&
      right !== null &&
      typeof left === "object" &&
      typeof right === "object" &&
      !Array.isArray(left) &&
      !Array.isArray(right)
    ) {
      out[key] = deepMerge(left as Record<string, unknown>, right as Record<string, unknown>);
    } else {
      out[key] = right;
    }
  }
  return out;
}

function findDoc(documents: SourceDocument[], id: string): SourceDocument | undefined {
  for (let i = 0; i < documents.length; i++) {
    if (documents[i].data["id"] === id) {
      return documents[i];
    }
  }
  return undefined;
}
