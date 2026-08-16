import { resolve } from "node:path";
import { diffPayloads } from "./diff";
import { compileContentPackage, generateContent, resolveOptions } from "./generate";
import { loadSourceDocuments } from "./load";
import { loadPackageManifest } from "./registry";
import { traceReferences } from "./trace";
import { validateDocuments } from "./validate";

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
  const left = validateDocuments(options.schemaDir, leftDocs.documents, { manifest: manifest });
  const right = validateDocuments(options.schemaDir, rightDocs.documents, { manifest: manifest });
  const report = diffPayloads(left, right);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

function trace(argv: string[]): void {
  const id = readArg(argv, "--id");
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

function main(): void {
  const argv = process.argv.slice(2);
  const command = commandOf(argv);
  const rest = restArgs(argv, command);
  if (command === "generate") {
    generate(rest);
    return;
  }
  if (command === "diff") {
    diff(rest);
    return;
  }
  if (command === "trace") {
    trace(rest);
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
