import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { migrateAccount, type AccountMigrationResult, type AccountSaveSnapshot } from "../domain/migration";
import { deepStableEqual } from "../domain/save_schema";

interface FixtureFile {
  userId?: string;
  characterId?: string;
  gold?: number;
  character?: unknown;
  inventory?: unknown;
  equipment?: unknown;
  quests?: unknown;
  walletRef?: unknown;
  characterPresent?: boolean;
  inventoryPresent?: boolean;
  equipmentPresent?: boolean;
  questsPresent?: boolean;
  walletRefPresent?: boolean;
}

interface CliOptions {
  command: string;
  fixture?: string;
  out?: string;
  account?: string;
  character?: string;
  allLocal: boolean;
  consoleUrl: string;
  consoleUser: string;
  consolePassword: string;
}

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

function parseOptions(argv: string[]): CliOptions {
  const command = argv[0] === "status" || argv[0] === "dry-run" || argv[0] === "apply" || argv[0] === "verify" ? argv[0] : "";
  if (command === "") {
    throw new Error("usage: migrate status|dry-run|apply|verify [--fixture path] [--account userId] [--character characterId] [--all-local]");
  }
  return {
    command: command,
    fixture: readArg(argv, "--fixture"),
    out: readArg(argv, "--out"),
    account: readArg(argv, "--account") ?? readArg(argv, "--user-id"),
    character: readArg(argv, "--character"),
    allLocal:
      hasFlag(argv, "--all-local") ||
      (readArg(argv, "--character") !== undefined &&
        readArg(argv, "--account") === undefined &&
        readArg(argv, "--user-id") === undefined &&
        readArg(argv, "--fixture") === undefined),
    consoleUrl: readArg(argv, "--console-url") ?? "http://127.0.0.1:7351",
    consoleUser: readArg(argv, "--console-user") ?? "admin",
    consolePassword: readArg(argv, "--console-password") ?? "password",
  };
}

function snapshotFromFixture(data: FixtureFile): AccountSaveSnapshot {
  return {
    userId: data.userId ?? "fixture-user",
    character: data.character,
    inventory: data.inventory,
    equipment: data.equipment,
    quests: data.quests,
    walletRef: data.walletRef,
    gold: data.gold,
    characterPresent: data.characterPresent ?? data.character !== undefined,
    inventoryPresent: data.inventoryPresent ?? data.inventory !== undefined,
    equipmentPresent: data.equipmentPresent ?? data.equipment !== undefined,
    questsPresent: data.questsPresent ?? data.quests !== undefined,
    walletRefPresent: data.walletRefPresent ?? data.walletRef !== undefined,
  };
}

function resolveFixturePath(path: string): string {
  const posix = path.replace(/\\/g, "/");
  const candidates = [path];
  if (!isAbsolute(path)) {
    candidates.push(join(process.cwd(), path));
    if (posix.indexOf("server/") === 0) {
      const stripped = posix.slice("server/".length);
      candidates.push(stripped);
      candidates.push(join(process.cwd(), stripped));
    }
    candidates.push(join(process.cwd(), "..", path));
  }
  for (let i = 0; i < candidates.length; i++) {
    const resolved = normalize(candidates[i]);
    if (existsSync(resolved)) {
      return resolved;
    }
  }
  return path;
}

function loadFixture(path: string): FixtureFile {
  return JSON.parse(readFileSync(resolveFixturePath(path), "utf8")) as FixtureFile;
}

function matchesCharacter(snapshot: AccountSaveSnapshot, characterId: string, migrated: AccountMigrationResult): boolean {
  if (characterId.length === 0) {
    return true;
  }
  if (migrated.characterId === characterId) {
    return true;
  }
  if (snapshot.character !== null && typeof snapshot.character === "object" && !Array.isArray(snapshot.character)) {
    const value = snapshot.character as { [key: string]: unknown };
    return value.characterId === characterId;
  }
  return false;
}

function printResult(command: string, result: AccountMigrationResult): void {
  process.stdout.write(
    JSON.stringify(
      {
        command: command,
        ok: result.ok,
        reason: result.reason,
        userId: result.userId,
        characterId: result.characterId,
        changed: result.changed,
        gold: result.gold,
        records: result.records.map((row) => ({
          kind: row.kind,
          ok: row.result.ok,
          reason: row.result.reason,
          changed: row.result.changed,
          missing: row.result.missing,
          fromVersion: row.result.fromVersion,
          toVersion: row.result.toVersion,
          migrationIds: row.result.migrationIds,
        })),
      },
      null,
      2,
    ) + "\n",
  );
}

function applySnapshot(snapshot: AccountSaveSnapshot): AccountSaveSnapshot {
  const result = migrateAccount(snapshot);
  if (!result.ok) {
    return snapshot;
  }
  const next: AccountSaveSnapshot = {
    userId: snapshot.userId,
    gold: snapshot.gold,
    characterPresent: snapshot.characterPresent,
    inventoryPresent: snapshot.inventoryPresent,
    equipmentPresent: snapshot.equipmentPresent,
    questsPresent: snapshot.questsPresent,
    walletRefPresent: true,
  };
  for (let i = 0; i < result.records.length; i++) {
    const row = result.records[i];
    if (row.result.missing || row.result.value === null) {
      continue;
    }
    if (row.kind === "character") {
      next.character = row.result.value;
      next.characterPresent = true;
    }
    if (row.kind === "inventory") {
      next.inventory = row.result.value;
      next.inventoryPresent = true;
    }
    if (row.kind === "equipment") {
      next.equipment = row.result.value;
      next.equipmentPresent = true;
    }
    if (row.kind === "quests") {
      next.quests = row.result.value;
      next.questsPresent = true;
    }
    if (row.kind === "wallet_ref") {
      next.walletRef = row.result.value;
      next.walletRefPresent = true;
    }
  }
  return next;
}

function httpJson(method: string, urlString: string, user: string, password: string, body?: unknown): Promise<unknown> {
  const url = new URL(urlString);
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  const auth = Buffer.from(user + ":" + password).toString("base64");
  const lib = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise(function (resolve, reject) {
    const req = lib(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          Authorization: "Basic " + auth,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": payload !== undefined ? Buffer.byteLength(payload) : 0,
        },
      },
      function (res) {
        const chunks: Buffer[] = [];
        res.on("data", function (chunk) {
          chunks.push(chunk as Buffer);
        });
        res.on("end", function () {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode !== undefined && res.statusCode >= 400) {
            reject(new Error("console_http_" + String(res.statusCode) + ":" + text));
            return;
          }
          if (text.length === 0) {
            resolve({});
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error("console_malformed_json"));
          }
        });
      },
    );
    req.on("error", reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

async function readLiveSnapshot(
  options: CliOptions,
  userId: string,
): Promise<AccountSaveSnapshot> {
  const base = options.consoleUrl.replace(/\/$/, "");
  const character = await httpJson(
    "GET",
    base + "/v2/console/storage?collection=player&key=character&user_id=" + encodeURIComponent(userId),
    options.consoleUser,
    options.consolePassword,
  );
  const inventory = await httpJson(
    "GET",
    base + "/v2/console/storage?collection=player&key=inventory&user_id=" + encodeURIComponent(userId),
    options.consoleUser,
    options.consolePassword,
  );
  const equipment = await httpJson(
    "GET",
    base + "/v2/console/storage?collection=player&key=equipment&user_id=" + encodeURIComponent(userId),
    options.consoleUser,
    options.consolePassword,
  );
  const quests = await httpJson(
    "GET",
    base + "/v2/console/storage?collection=player&key=quests&user_id=" + encodeURIComponent(userId),
    options.consoleUser,
    options.consolePassword,
  );
  const walletRef = await httpJson(
    "GET",
    base + "/v2/console/storage?collection=player&key=wallet_ref&user_id=" + encodeURIComponent(userId),
    options.consoleUser,
    options.consolePassword,
  );
  let gold = 0;
  try {
    gold = goldFromAccount(
      await httpJson(
        "GET",
        base + "/v2/console/account/" + encodeURIComponent(userId),
        options.consoleUser,
        options.consolePassword,
      ),
    );
  } catch {
    gold = 0;
  }
  return {
    userId: userId,
    character: firstValue(character),
    inventory: firstValue(inventory),
    equipment: firstValue(equipment),
    quests: firstValue(quests),
    walletRef: firstValue(walletRef),
    gold: gold,
    characterPresent: firstValue(character) !== undefined,
    inventoryPresent: firstValue(inventory) !== undefined,
    equipmentPresent: firstValue(equipment) !== undefined,
    questsPresent: firstValue(quests) !== undefined,
    walletRefPresent: firstValue(walletRef) !== undefined,
  };
}

function firstValue(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object") {
    return undefined;
  }
  const data = payload as { objects?: Array<{ value?: unknown }>; value?: unknown };
  if (Array.isArray(data.objects) && data.objects.length > 0) {
    return coerceJsonValue(data.objects[0].value);
  }
  if (Object.prototype.hasOwnProperty.call(data, "value")) {
    return coerceJsonValue(data.value);
  }
  return undefined;
}

function coerceJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

function goldFromAccount(payload: unknown): number {
  if (payload === null || typeof payload !== "object") {
    return 0;
  }
  const root = payload as { [key: string]: unknown };
  const account = root.account !== null && typeof root.account === "object" ? (root.account as { [key: string]: unknown }) : root;
  const wallet = account.wallet !== undefined ? account.wallet : root.wallet;
  if (typeof wallet === "number" && isFinite(wallet)) {
    return wallet;
  }
  if (typeof wallet === "string") {
    try {
      return goldFromWalletObject(JSON.parse(wallet));
    } catch {
      return 0;
    }
  }
  return goldFromWalletObject(wallet);
}

function goldFromWalletObject(wallet: unknown): number {
  if (wallet === null || typeof wallet !== "object" || Array.isArray(wallet)) {
    return 0;
  }
  const data = wallet as { [key: string]: unknown };
  if (typeof data.gold === "number" && isFinite(data.gold)) {
    return data.gold;
  }
  return 0;
}

async function writeLiveRecord(
  options: CliOptions,
  userId: string,
  key: string,
  value: { [key: string]: unknown },
): Promise<void> {
  const base = options.consoleUrl.replace(/\/$/, "");
  await httpJson("PUT", base + "/v2/console/storage", options.consoleUser, options.consolePassword, {
    collection: "player",
    key: key,
    user_id: userId,
    value: value,
    permission_read: 1,
    permission_write: 0,
  });
}

async function listLocalUserIds(options: CliOptions): Promise<string[]> {
  const base = options.consoleUrl.replace(/\/$/, "");
  const payload = await httpJson(
    "GET",
    base + "/v2/console/account?filter=vibecode",
    options.consoleUser,
    options.consolePassword,
  );
  const ids: string[] = [];
  const users = extractUsers(payload);
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const custom = typeof user.custom_id === "string" ? user.custom_id : "";
    const username = typeof user.username === "string" ? user.username : "";
    if (
      custom.indexOf("vibecode-dev-") === 0 ||
      custom.indexOf("vibecode-local-") === 0 ||
      username === "alice" ||
      username === "bob"
    ) {
      if (typeof user.id === "string") {
        ids.push(user.id);
      }
    }
  }
  return ids;
}

function extractUsers(payload: unknown): Array<{ [key: string]: unknown }> {
  if (payload === null || typeof payload !== "object") {
    return [];
  }
  const data = payload as { users?: unknown; accounts?: unknown };
  const list = Array.isArray(data.users) ? data.users : Array.isArray(data.accounts) ? data.accounts : [];
  const users: Array<{ [key: string]: unknown }> = [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (row !== null && typeof row === "object" && !Array.isArray(row)) {
      const record = row as { [key: string]: unknown };
      if (record.user !== null && typeof record.user === "object") {
        users.push(record.user as { [key: string]: unknown });
      } else {
        users.push(record);
      }
    }
  }
  return users;
}

async function collectSnapshots(options: CliOptions): Promise<AccountSaveSnapshot[]> {
  if (options.fixture !== undefined) {
    return [snapshotFromFixture(loadFixture(options.fixture))];
  }
  const userIds: string[] = [];
  if (options.account !== undefined) {
    userIds.push(options.account);
  }
  if (options.allLocal) {
    const local = await listLocalUserIds(options);
    for (let i = 0; i < local.length; i++) {
      if (userIds.indexOf(local[i]) === -1) {
        userIds.push(local[i]);
      }
    }
  }
  if (userIds.length === 0) {
    throw new Error("migrate_no_target");
  }
  const snapshots: AccountSaveSnapshot[] = [];
  for (let i = 0; i < userIds.length; i++) {
    snapshots.push(await readLiveSnapshot(options, userIds[i]));
  }
  return snapshots;
}

async function applyLive(options: CliOptions, snapshot: AccountSaveSnapshot, result: AccountMigrationResult): Promise<void> {
  if (!result.ok || !result.changed) {
    return;
  }
  for (let i = 0; i < result.records.length; i++) {
    const row = result.records[i];
    if (!row.result.ok || row.result.value === null || !row.result.changed) {
      continue;
    }
    const key =
      row.kind === "character"
        ? "character"
        : row.kind === "inventory"
          ? "inventory"
          : row.kind === "equipment"
            ? "equipment"
            : row.kind === "quests"
              ? "quests"
              : "wallet_ref";
    await writeLiveRecord(options, snapshot.userId, key, row.result.value);
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const snapshots = await collectSnapshots(options);
  let anyFail = false;
  for (let i = 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i];
    const result = migrateAccount(snapshot);
    if (options.character !== undefined && !matchesCharacter(snapshot, options.character, result)) {
      continue;
    }
    if (options.command === "verify") {
      const again = migrateAccount(applySnapshot(snapshot));
      if (!again.ok || again.changed) {
        anyFail = true;
      }
      if (result.ok && again.ok && result.records[0].result.value !== null && again.records[0].result.value !== null) {
        if (!deepStableEqual(applySnapshot(snapshot).character, again.records[0].result.value) && again.changed) {
          anyFail = true;
        }
      }
      printResult("verify", again.ok && !again.changed ? again : result);
      continue;
    }
    printResult(options.command, result);
    if (!result.ok) {
      anyFail = true;
      continue;
    }
    if (options.command === "apply") {
      if (options.fixture !== undefined) {
        const next = applySnapshot(snapshot);
        const outPath = options.out ?? resolveFixturePath(options.fixture);
        writeFileSync(
          outPath,
          JSON.stringify(
            {
              userId: next.userId,
              gold: next.gold,
              character: next.character,
              inventory: next.inventory,
              equipment: next.equipment,
              quests: next.quests,
              walletRef: next.walletRef,
            },
            null,
            2,
          ) + "\n",
        );
      } else {
        await applyLive(options, snapshot, result);
      }
    }
  }
  if (anyFail) {
    process.exitCode = 1;
  }
}

main().catch(function (error) {
  const message = error instanceof Error ? error.message : "migrate_failed";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});
