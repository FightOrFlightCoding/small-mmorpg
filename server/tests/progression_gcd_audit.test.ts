import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { content } from "../src/generated/content";

const SERVER_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(SERVER_ROOT, "..");

function walk(dir: string, files: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i].name;
    if (name === "node_modules" || name === "addons" || name === "dist-test" || name === "dist-cli" || name === "build") {
      continue;
    }
    const full = join(dir, name);
    if (entries[i].isDirectory()) {
      walk(full, files);
      continue;
    }
    if (name.endsWith(".ts") || name.endsWith(".gd") || name.endsWith(".json")) {
      files.push(full);
    }
  }
}

test("production bundles have no GCD dependency on progression abilities", () => {
  const ids = Object.keys(content.abilities);
  let production = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id.indexOf("test.") === 0) {
      continue;
    }
    const def = content.abilities[id as keyof typeof content.abilities];
    production += 1;
    assert.equal(def.globalCooldown, 0, id);
  }
  assert.ok(production >= 20);
});

test("production source search finds no progression GCD coupling", () => {
  const files: string[] = [];
  walk(join(REPO_ROOT, "content", "source"), files);
  walk(join(SERVER_ROOT, "src", "domain"), files);
  walk(join(REPO_ROOT, "client", "scripts"), files);
  const offenders: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const path = files[i];
    if (path.indexOf("test.ability") >= 0 || path.indexOf("ability.ts") >= 0) {
      continue;
    }
    const body = readFileSync(path, "utf8");
    if (path.indexOf("content/source/ability.") >= 0 && path.indexOf("test.") < 0) {
      const match = body.match(/"globalCooldown"\s*:\s*([0-9.]+)/);
      if (match !== null && Number(match[1]) !== 0) {
        offenders.push(path + " globalCooldown=" + match[1]);
      }
    }
    if (path.indexOf("canonical_combat.ts") >= 0 || path.indexOf("combat_pipeline.ts") >= 0 || path.indexOf("combat_events.ts") >= 0) {
      assert.equal(/globalCooldown|global_cooldown|\bgcd\b/.test(body), false, path);
    }
  }
  assert.deepEqual(offenders, []);
  assert.ok(content.abilities["test.ability.basic_melee"].globalCooldown > 0);
});
