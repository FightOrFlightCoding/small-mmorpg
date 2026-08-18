import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { copyDefinition, createFromTemplate, migrateSource, writeJson } from "./authoring";
import {
  exportEnemyStats,
  exportLevelCurves,
  exportLootEntries,
  exportVendorStock,
  importEnemyStats,
  importLevelCurves,
  importLootEntries,
  importVendorStock,
  type CsvKind,
} from "./csv";
import { diffPayloads } from "./diff";
import { toContentBundle } from "./emit";
import { compileContentPackage, generateContent, resolveOptions } from "./generate";
import { loadSourceDocuments } from "./load";
import { loadPackageManifest } from "./registry";
import { defaultIdFor, isAuthoringType } from "./templates";
import { traceReferences } from "./trace";
import { unusedReport } from "./unused";
import { defaultClientAssetPaths, loadAssetIndex } from "./assets";
import { validateDocuments } from "./validate";
import type { ContentPayload, EnemyDef, LevelCurveDef, LootTableDef, SourceDocument, VendorDef } from "./types";

function readArg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) {
    return undefined;
  }
  return argv[index + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.indexOf(name) !== -1;
}

function defaultRoot(): string {
  return resolve(__dirname, "..", "..", "..", "..");
}

function commandOf(argv: string[]): string {
  if (argv.length === 0 || argv[0].indexOf("--") === 0) {
    return "generate";
  }
  return argv[0];
}

function restArgs(argv: string[], command: string): string[] {
  if (argv.length > 0 && argv[0] === command) {
    return argv.slice(1);
  }
  return argv;
}

function isoTimestamp(): string {
  return new Date().toISOString();
}

function generate(argv: string[]): void {
  const rootArg = readArg(argv, "--root") ?? defaultRoot();
  const includeDevelopment = hasFlag(argv, "--include-dev");
  const buildTimestamp = isoTimestamp();
  const bundle = generateContent({
    root: resolve(rootArg),
    sourceDir: readArg(argv, "--source"),
    schemaDir: readArg(argv, "--schemas"),
    serverOut: readArg(argv, "--server-out"),
    clientOut: readArg(argv, "--client-out"),
    manifestPath: readArg(argv, "--manifest"),
    includeDevelopment: includeDevelopment,
    buildTimestamp: buildTimestamp,
  });
  process.stdout.write("content_hash=" + bundle.contentHash + "\n");
  process.stdout.write("package_id=" + bundle.packageId + "\n");
  process.stdout.write("package_version=" + bundle.packageVersion + "\n");
  process.stdout.write("schema_version=" + String(bundle.schemaVersion) + "\n");
  process.stdout.write("minimum_protocol_version=" + String(bundle.minimumProtocolVersion) + "\n");
  process.stdout.write("build_timestamp=" + buildTimestamp + "\n");
  process.stdout.write("development_only=" + bundle.developmentOnly.join(",") + "\n");
}

function validate(argv: string[]): void {
  const pkg = compileContentPackage({
    root: resolve(readArg(argv, "--root") ?? defaultRoot()),
    sourceDir: readArg(argv, "--source"),
    schemaDir: readArg(argv, "--schemas"),
    manifestPath: readArg(argv, "--manifest"),
    includeDevelopment: hasFlag(argv, "--include-dev"),
  });
  process.stdout.write("ok\n");
  process.stdout.write("content_hash=" + pkg.contentHash + "\n");
  process.stdout.write("definitions=" + String(countDefs(pkg.definitions)) + "\n");
}

function diff(argv: string[]): void {
  const root = resolve(readArg(argv, "--root") ?? defaultRoot());
  const options = resolveOptions({ root: root });
  const leftSource = readArg(argv, "--from") ?? options.sourceDir;
  const rightSource = readArg(argv, "--to") ?? options.sourceDir;
  const manifest = loadPackageManifest(options.manifestPath);
  const leftDocs = loadSourceDocuments(leftSource);
  const rightDocs = loadSourceDocuments(rightSource);
  if (leftDocs.issues.length > 0 || rightDocs.issues.length > 0) {
    const issues = leftDocs.issues.concat(rightDocs.issues);
    throw new Error(issues.map((entry) => entry.code).join("\n"));
  }
  const assets = loadAssetIndex(defaultClientAssetPaths(root));
  const left = validateDocuments(options.schemaDir, leftDocs.documents, { manifest: manifest, assets: assets });
  const right = validateDocuments(options.schemaDir, rightDocs.documents, { manifest: manifest, assets: assets });
  const report = diffPayloads(left, right);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

function references(argv: string[]): void {
  const id = readArg(argv, "--id") ?? positional(argv, 0);
  if (id === undefined || id.length === 0) {
    throw new Error("trace_missing_id");
  }
  const pkg = compileContentPackage({
    root: resolve(readArg(argv, "--root") ?? defaultRoot()),
    sourceDir: readArg(argv, "--source"),
    schemaDir: readArg(argv, "--schemas"),
    manifestPath: readArg(argv, "--manifest"),
    includeDevelopment: hasFlag(argv, "--include-dev"),
  });
  const report = traceReferences(pkg.definitions, id);
  if (report === null) {
    throw new Error("unknown_id:" + id);
  }
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

function unused(argv: string[]): void {
  const root = resolve(readArg(argv, "--root") ?? defaultRoot());
  const pkg = compileContentPackage({
    root: root,
    sourceDir: readArg(argv, "--source"),
    schemaDir: readArg(argv, "--schemas"),
    manifestPath: readArg(argv, "--manifest"),
    includeDevelopment: hasFlag(argv, "--include-dev"),
  });
  const report = unusedReport(pkg.definitions, loadAssetIndex(defaultClientAssetPaths(root)));
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

function createNew(argv: string[]): void {
  const type = positional(argv, 0);
  if (type === undefined || !isAuthoringType(type)) {
    throw new Error("unknown_type:" + String(type));
  }
  const root = resolve(readArg(argv, "--root") ?? defaultRoot());
  const options = resolveOptions({ root: root, sourceDir: readArg(argv, "--source") });
  const id = readArg(argv, "--id") ?? defaultIdFor(type);
  const written = createFromTemplate({
    root: root,
    sourceDir: options.sourceDir,
    type: type,
    id: id,
  });
  process.stdout.write("created=" + written.join(",") + "\n");
}

function copyCmd(argv: string[]): void {
  const fromId = positional(argv, 0);
  const toId = readArg(argv, "--to") ?? readArg(argv, "--id") ?? positional(argv, 1);
  if (fromId === undefined || toId === undefined) {
    throw new Error("copy_missing_id");
  }
  const root = resolve(readArg(argv, "--root") ?? defaultRoot());
  const options = resolveOptions({ root: root, sourceDir: readArg(argv, "--source") });
  const dest = copyDefinition({ sourceDir: options.sourceDir, fromId: fromId, toId: toId });
  process.stdout.write("copied=" + dest + "\n");
}

function migrateCmd(argv: string[]): void {
  const root = resolve(readArg(argv, "--root") ?? defaultRoot());
  const options = resolveOptions({ root: root, sourceDir: readArg(argv, "--source") });
  const manifest = loadPackageManifest(options.manifestPath);
  const result = migrateSource(options.sourceDir, manifest.schemaVersion);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

function packageCmd(argv: string[]): void {
  const pkg = compileContentPackage({
    root: resolve(readArg(argv, "--root") ?? defaultRoot()),
    sourceDir: readArg(argv, "--source"),
    schemaDir: readArg(argv, "--schemas"),
    manifestPath: readArg(argv, "--manifest"),
    includeDevelopment: hasFlag(argv, "--include-dev"),
    buildTimestamp: isoTimestamp(),
  });
  process.stdout.write(JSON.stringify(toContentBundle(pkg), null, 2) + "\n");
}

function csvExport(argv: string[]): void {
  const kind = requireCsvKind(argv);
  const pkg = compileContentPackage({
    root: resolve(readArg(argv, "--root") ?? defaultRoot()),
    sourceDir: readArg(argv, "--source"),
    schemaDir: readArg(argv, "--schemas"),
    manifestPath: readArg(argv, "--manifest"),
    includeDevelopment: hasFlag(argv, "--include-dev"),
  });
  const csv = csvFromPayload(pkg.definitions, kind);
  const out = readArg(argv, "--out");
  if (out !== undefined) {
    writeFileSync(out, csv, "utf8");
  } else {
    process.stdout.write(csv);
  }
}

function csvImport(argv: string[]): void {
  const kind = requireCsvKind(argv);
  const from = readArg(argv, "--from") ?? readArg(argv, "--file");
  if (from === undefined) {
    throw new Error("csv_missing_from");
  }
  const root = resolve(readArg(argv, "--root") ?? defaultRoot());
  const options = resolveOptions({ root: root, sourceDir: readArg(argv, "--source") });
  const loaded = loadSourceDocuments(options.sourceDir);
  if (loaded.issues.length > 0) {
    throw new Error(loaded.issues.map((entry) => entry.code).join("\n"));
  }
  const pkg = compileContentPackage({
    root: root,
    sourceDir: options.sourceDir,
    schemaDir: options.schemaDir,
    manifestPath: options.manifestPath,
    includeDevelopment: true,
  });
  const csv = readFileSync(from, "utf8");
  applyCsvImport(options.sourceDir, loaded.documents, pkg.definitions, kind, csv);
  process.stdout.write("imported=" + kind + "\n");
}

function csvFromPayload(payload: ContentPayload, kind: CsvKind): string {
  if (kind === "level_curve") {
    return exportLevelCurves(payload.levelCurves);
  }
  if (kind === "vendor_stock") {
    return exportVendorStock(payload.vendors);
  }
  if (kind === "enemy_stats") {
    return exportEnemyStats(payload.enemies);
  }
  return exportLootEntries(payload.lootTables);
}

function applyCsvImport(
  sourceDir: string,
  documents: SourceDocument[],
  payload: ContentPayload,
  kind: CsvKind,
  csv: string,
): void {
  if (kind === "level_curve") {
    writeKindMap(sourceDir, documents, importLevelCurves(payload.levelCurves, csv) as Record<string, LevelCurveDef>);
    return;
  }
  if (kind === "vendor_stock") {
    writeKindMap(sourceDir, documents, importVendorStock(payload.vendors, csv) as Record<string, VendorDef>);
    return;
  }
  if (kind === "enemy_stats") {
    writeKindMap(sourceDir, documents, importEnemyStats(payload.enemies, csv) as Record<string, EnemyDef>);
    return;
  }
  writeKindMap(sourceDir, documents, importLootEntries(payload.lootTables, csv) as Record<string, LootTableDef>);
}

function writeKindMap(sourceDir: string, documents: SourceDocument[], next: Record<string, { id: string }>): void {
  const ids = Object.keys(next);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const original = findDoc(documents, id);
    if (original === undefined) {
      continue;
    }
    const merged = { ...original.data, ...(next[id] as unknown as Record<string, unknown>) };
    writeJson(join(sourceDir, original.fileName), merged);
  }
}

function findDoc(documents: SourceDocument[], id: string): SourceDocument | undefined {
  for (let i = 0; i < documents.length; i++) {
    if (documents[i].data["id"] === id) {
      return documents[i];
    }
  }
  return undefined;
}

function requireCsvKind(argv: string[]): CsvKind {
  const kind = readArg(argv, "--type") ?? readArg(argv, "--kind") ?? positional(argv, 0);
  if (kind === "level_curve" || kind === "vendor_stock" || kind === "enemy_stats" || kind === "loot_entries") {
    return kind;
  }
  throw new Error("unknown_csv_type:" + String(kind));
}

function positional(argv: string[], index: number): string | undefined {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].indexOf("--") === 0) {
      i += 1;
      continue;
    }
    values.push(argv[i]);
  }
  return values[index];
}

function countDefs(payload: ContentPayload): number {
  return (
    1 +
    Object.keys(payload.items).length +
    Object.keys(payload.npcs).length +
    Object.keys(payload.enemies).length +
    Object.keys(payload.quests).length +
    Object.keys(payload.zones).length +
    Object.keys(payload.classes).length +
    Object.keys(payload.attributes).length +
    Object.keys(payload.resources).length +
    Object.keys(payload.derivedStats).length +
    Object.keys(payload.levelCurves).length +
    Object.keys(payload.classProgressions).length +
    Object.keys(payload.equipmentSlots).length +
    Object.keys(payload.abilities).length +
    Object.keys(payload.aiProfiles).length +
    Object.keys(payload.lootTables).length +
    Object.keys(payload.spawns).length +
    Object.keys(payload.vendors).length
  );
}

function main(): void {
  const argv = process.argv.slice(2);
  const command = commandOf(argv);
  const rest = restArgs(argv, command);
  if (command === "generate" || command === "build") {
    generate(rest);
    return;
  }
  if (command === "validate") {
    validate(rest);
    return;
  }
  if (command === "diff") {
    diff(rest);
    return;
  }
  if (command === "trace" || command === "references") {
    references(rest);
    return;
  }
  if (command === "unused") {
    unused(rest);
    return;
  }
  if (command === "new") {
    createNew(rest);
    return;
  }
  if (command === "copy") {
    copyCmd(rest);
    return;
  }
  if (command === "migrate") {
    migrateCmd(rest);
    return;
  }
  if (command === "package") {
    packageCmd(rest);
    return;
  }
  if (command === "csv-export") {
    csvExport(rest);
    return;
  }
  if (command === "csv-import") {
    csvImport(rest);
    return;
  }
  throw new Error("unknown_command:" + command);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "content_build_failed";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
}
