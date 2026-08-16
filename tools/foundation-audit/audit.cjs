#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "expected.json"), "utf8"));
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function walk(relDir, filter) {
  const abs = path.join(repoRoot, relDir);
  if (!fs.existsSync(abs)) {
    return [];
  }
  const out = [];
  const stack = [abs];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = path.relative(repoRoot, full).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === "dist-test" ||
          entry.name === "build" ||
          entry.name === "generated"
        ) {
          continue;
        }
        stack.push(full);
        continue;
      }
      if (filter(rel)) {
        out.push(rel);
      }
    }
  }
  return out.sort();
}

function parsePackageDeps(rel) {
  const pkg = JSON.parse(read(rel));
  return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
}

function checkExactDependencies() {
  for (const [spec, version] of Object.entries(expected.exactDependencies)) {
    const [file, name] = spec.split(":");
    const deps = parsePackageDeps(file);
    if (deps[name] !== version) {
      fail(`unpinned or drifted dependency ${file} ${name}: expected ${version}, got ${deps[name]}`);
    }
  }
  for (const spec of expected.lockfileRangeDependencies) {
    const [file, name] = spec.split(":");
    const deps = parsePackageDeps(file);
    if (typeof deps[name] !== "string" || !deps[name].startsWith("^")) {
      fail(`expected lockfile-ranged dependency ${spec} to use a caret range`);
    }
  }
  if (!fs.existsSync(path.join(repoRoot, "server/package-lock.json"))) {
    fail("server/package-lock.json is missing");
  }
  if (!fs.existsSync(path.join(repoRoot, "tools/content-build/package-lock.json"))) {
    fail("tools/content-build/package-lock.json is missing");
  }
}

function checkDockerPins() {
  const compose = read("infra/docker-compose.yml");
  const dockerfile = read("server/Dockerfile");
  if (!compose.includes(expected.dockerImages.postgres)) {
    fail(`infra/docker-compose.yml does not pin ${expected.dockerImages.postgres}`);
  }
  if (!dockerfile.includes("node:20.20.2")) {
    fail(`server/Dockerfile does not pin ${expected.dockerImages.nodeBuilder}`);
  }
  if (!dockerfile.includes("heroiclabs/nakama:3.40.0") && !compose.includes("vibecode-nakama:3.40.0")) {
    fail("Nakama 3.40.0 image pin missing from Docker files");
  }
}

function parseTsOpcodes(source, objectName) {
  const block = source.match(new RegExp(`export const ${objectName} = \\{([\\s\\S]*?)\\} as const;`));
  if (!block) {
    fail(`could not parse ${objectName} from protocol.ts`);
    return {};
  }
  const found = {};
  const re = /([A-Z_]+):\s*(\d+)/g;
  let match;
  while ((match = re.exec(block[1])) !== null) {
    found[match[1]] = Number(match[2]);
  }
  return found;
}

function parseGdOpcodes(source, prefix) {
  const found = {};
  const re = new RegExp(`const ${prefix}_([A-Z_]+): int = (\\d+)`, "g");
  let match;
  while ((match = re.exec(source)) !== null) {
    found[match[1]] = Number(match[2]);
  }
  return found;
}

function assertUnique(map, label) {
  const seen = new Map();
  for (const [name, value] of Object.entries(map)) {
    if (seen.has(value)) {
      fail(`duplicate ${label} ${value}: ${seen.get(value)} and ${name}`);
    }
    seen.set(value, name);
  }
}

function assertMapsEqual(actual, expectedMap, label) {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expectedMap).sort();
  if (actualKeys.join(",") !== expectedKeys.join(",")) {
    fail(`${label} names differ: code=${actualKeys.join(",")} catalog=${expectedKeys.join(",")}`);
    return;
  }
  for (const key of expectedKeys) {
    if (actual[key] !== expectedMap[key]) {
      fail(`${label} ${key}: code=${actual[key]} catalog=${expectedMap[key]}`);
    }
  }
}

function checkOpcodes() {
  const ts = read("server/src/domain/protocol.ts");
  const gd = read("client/scripts/network/protocol.gd");
  const tsClient = parseTsOpcodes(ts, "ClientOpcode");
  const tsServer = parseTsOpcodes(ts, "ServerOpcode");
  const gdClient = parseGdOpcodes(gd, "CLIENT");
  const gdServer = parseGdOpcodes(gd, "SERVER");
  assertUnique(tsClient, "client opcode");
  assertUnique(tsServer, "server opcode");
  assertMapsEqual(tsClient, expected.clientOpcodes, "server ClientOpcode");
  assertMapsEqual(tsServer, expected.serverOpcodes, "server ServerOpcode");
  assertMapsEqual(gdClient, expected.clientOpcodes, "client CLIENT_*");
  assertMapsEqual(gdServer, expected.serverOpcodes, "client SERVER_*");
}

function checkRpcsAndHooks() {
  const main = read("server/src/main.ts");
  const rpcIds = [...main.matchAll(/registerRpc\("([^"]+)"/g)].map((m) => m[1]);
  if (rpcIds.join(",") !== expected.rpcs.join(",")) {
    fail(`RPC identifiers differ: code=${rpcIds.join(",")} catalog=${expected.rpcs.join(",")}`);
  }
  const before = [...main.matchAll(/registerRtBefore\("([^"]+)"/g)].map((m) => m[1]);
  if (before.join(",") !== expected.realtimeBeforeHooks.join(",")) {
    fail(`realtime before hooks differ: code=${before.join(",")} catalog=${expected.realtimeBeforeHooks.join(",")}`);
  }
  if (/registerRtAfter\(/.test(main)) {
    fail("undocumented registerRtAfter hook present");
  }
  if (/registerMatchmaker/.test(main) || /AuthenticateDevice/.test(main) || /registerNotification/.test(main)) {
    fail("undocumented matchmaker, auth, or notification hook present");
  }
}

function checkStorage() {
  const files = walk("server/src", (rel) => rel.endsWith(".ts"));
  const collections = new Set();
  const keys = new Set();
  const texts = [];
  for (const rel of files) {
    const text = read(rel);
    texts.push(text);
    for (const match of text.matchAll(/collection:\s*"([a-z_]+)"/g)) {
      collections.add(match[1]);
    }
    for (const match of text.matchAll(/[A-Z_]+_COLLECTION\s*=\s*"([a-z_]+)"/g)) {
      collections.add(match[1]);
    }
    for (const match of text.matchAll(/[A-Z_]+_KEY\s*=\s*"([a-z_]+)"/g)) {
      keys.add(match[1]);
    }
    for (const match of text.matchAll(/key:\s*"([a-z_]+)"/g)) {
      keys.add(match[1]);
    }
    for (const match of text.matchAll(/permissionWrite:\s*([0-9]+)/g)) {
      if (Number(match[1]) !== 0) {
        fail(`client-writable canonical record in ${rel}: permissionWrite ${match[1]}`);
      }
    }
  }
  const expectedCollections = new Set(expected.storageRecords.map((row) => row.collection));
  const expectedKeys = new Set(expected.storageRecords.map((row) => row.key));
  for (const collection of collections) {
    if (!expectedCollections.has(collection)) {
      fail(`undocumented storage collection ${collection}`);
    }
  }
  for (const key of keys) {
    if (!expectedKeys.has(key)) {
      fail(`undocumented storage key ${key}`);
    }
  }
  for (const row of expected.storageRecords) {
    if (!collections.has(row.collection)) {
      fail(`catalogued collection missing from code: ${row.collection}`);
    }
    if (!keys.has(row.key)) {
      fail(`catalogued key missing from code: ${row.key}`);
    }
  }
  const joined = texts.join("\n");
  if (!joined.includes("WALLET_CURRENCY_GOLD")) {
    fail("wallet currency gold is missing from server runtime");
  }
  const writeFns = [
    "server/src/domain/character.ts",
    "server/src/domain/inventory_store.ts",
    "server/src/domain/quest_store.ts",
    "server/src/domain/equipment_store.ts",
    "server/src/domain/wallet_ref.ts",
    "server/src/domain/progression_store.ts",
  ];
  for (const rel of writeFns) {
    const text = read(rel);
    if (!/schemaVersion/.test(text) && rel !== "server/src/domain/wallet_ref.ts") {
      fail(`${rel} is missing gameplay schemaVersion on canonical writes`);
    }
  }
  const walletRef = read("server/src/domain/wallet_ref.ts");
  if (!/WALLET_REF_KEY/.test(walletRef)) {
    fail("wallet_ref storage key is missing");
  }
  const registry = read("server/src/nakama/starter_zone_registry.ts");
  if (/schemaVersion/.test(registry)) {
    fail("match/starter_zone gained a gameplay schemaVersion; it is a match locator, not a player save");
  }
}

function checkClientDoesNotWriteStorage() {
  const files = walk("client/scripts", (rel) => rel.endsWith(".gd"));
  for (const rel of files) {
    const text = read(rel);
    if (/write_storage|storage_write|writeStorage/.test(text)) {
      fail(`client storage write API used in ${rel}`);
    }
  }
}

function checkContentHash() {
  const bundle = JSON.parse(read("client/content/bundle.json"));
  const generated = read("server/src/generated/content.ts");
  const match = generated.match(/export const contentHash = "([a-f0-9]{64})"/);
  if (!match) {
    fail("server generated contentHash missing");
    return;
  }
  if (bundle.contentHash !== match[1]) {
    fail(`generated content mismatch client=${bundle.contentHash} server=${match[1]}`);
  }
  if (bundle.contentHash !== expected.contentHash) {
    fail("content hash drifted from catalogued digest");
  }
  if (bundle.schemaVersion !== expected.contentSchemaVersion) {
    fail(`content schemaVersion drifted: ${bundle.schemaVersion}`);
  }
}

function checkProductionContent() {
  const dir = path.join(repoRoot, "content/source");
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (files.join(",") !== expected.productionContentFiles.join(",")) {
    fail(`content/source leakage or drift: ${files.join(",")} vs ${expected.productionContentFiles.join(",")}`);
  }
  for (const name of files) {
    if (expected.productionContentFiles.indexOf(name) === -1 && (name.startsWith("test.") || name.includes(".test."))) {
      fail(`test content leaked into production source: ${name}`);
    }
  }
}

function checkHardcodedIds() {
  const scanFiles = [
    ...walk("server/src", (rel) => rel.endsWith(".ts")),
    ...walk("client/scripts", (rel) => rel.endsWith(".gd")),
    ...walk(
      "client/content",
      (rel) => !rel.endsWith("bundle.json") && (rel.endsWith(".gd") || rel.endsWith(".json") || rel.endsWith(".dialogue")),
    ),
  ];
  for (const [id, allow] of Object.entries(expected.hardcodedIds)) {
    const allowed = new Set(allow);
    const found = [];
    for (const rel of scanFiles) {
      if (read(rel).includes(id)) {
        found.push(rel);
      }
    }
    for (const rel of found) {
      if (!allowed.has(rel)) {
        fail(`untracked hardcoded ${id} in ${rel}`);
      }
    }
    for (const rel of allow) {
      if (!found.includes(rel)) {
        fail(`catalogued hardcoded ${id} missing from ${rel}`);
      }
    }
  }
}

function checkVendorAddons() {
  const result = spawnSync("git", ["diff", "--name-only", "HEAD", "--", "client/addons"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0 && result.status !== null) {
    fail(`git diff client/addons failed: ${result.stderr}`);
    return;
  }
  const dirty = (result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.endsWith(".import") && !line.endsWith(".uid"));
  if (dirty.length > 0) {
    fail(`vendor addon changes: ${dirty.join(", ")}`);
  }
}

checkExactDependencies();
checkDockerPins();
checkOpcodes();
checkRpcsAndHooks();
checkStorage();
checkClientDoesNotWriteStorage();
checkContentHash();
checkProductionContent();
checkHardcodedIds();
checkVendorAddons();

if (failures.length > 0) {
  for (const message of failures) {
    console.error(`FOUNDATION_AUDIT_FAIL: ${message}`);
  }
  process.exit(1);
}

console.log("FOUNDATION_AUDIT_OK");
console.log(`content_hash=${expected.contentHash}`);
console.log(`storage_records=${expected.storageRecords.length}`);
console.log(`client_opcodes=${Object.keys(expected.clientOpcodes).length}`);
console.log(`server_opcodes=${Object.keys(expected.serverOpcodes).length}`);
console.log(`rpcs=${expected.rpcs.length}`);
