import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { content, developmentOnly } from "../src/generated/content";
import { PROGRESSION_PERMISSION_WRITE } from "../src/domain/progression_store";
import { catalogFromContent } from "../src/domain/stats";
import { LOCKED_CLASS_IDS, parseConflictRegister } from "../src/domain/progression_design_audit";

const SERVER_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(SERVER_ROOT, "..");
const catalog = catalogFromContent(content);

function walk(dir: string, files: string[]): void {
  if (!existsSync(dir)) {
    return;
  }
  const entries = readdirSync(dir, { withFileTypes: true });
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i].name;
    if (name === "node_modules" || name === "addons" || name === "dist-test" || name === "dist-cli" || name === "build" || name === ".git") {
      continue;
    }
    const full = join(dir, name);
    if (entries[i].isDirectory()) {
      walk(full, files);
      continue;
    }
    if (name.endsWith(".ts") || name.endsWith(".gd") || name.endsWith(".md") || name.endsWith(".godot") || name.endsWith(".json")) {
      files.push(full);
    }
  }
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("production roster is four classes including mystic with no three-class restriction", () => {
  const ids = Object.keys(content.classes).filter(function (id) {
    return id.indexOf("class.") === 0;
  });
  ids.sort();
  assert.deepEqual(ids, ["class.mage", "class.marksman", "class.mystic", "class.warrior"]);
  assert.equal(content.classes["class.mystic"].rosterSelectable, true);
  assert.equal(content.classes["class.warrior"].rosterSelectable, true);
  assert.equal(content.classes["class.mage"].rosterSelectable, true);
  assert.equal(content.classes["class.marksman"].rosterSelectable, true);
  assert.deepEqual(LOCKED_CLASS_IDS.slice().sort(), ids);
});

test("no duplicate progression service and client never writes progression", () => {
  assert.equal(PROGRESSION_PERMISSION_WRITE, 0);
  const service = join(REPO_ROOT, "client", "scripts", "progression", "progression_service.gd");
  assert.equal(existsSync(service), true);
  const scripts: string[] = [];
  walk(join(REPO_ROOT, "client", "scripts"), scripts);
  const writers: string[] = [];
  const services: string[] = [];
  for (let i = 0; i < scripts.length; i++) {
    const path = scripts[i];
    const body = read(path);
    if (path.endsWith("progression_service.gd")) {
      services.push(path);
    }
    if (/write_storage_objects/.test(body) || /writeStorageObjects/.test(body)) {
      writers.push(path);
    }
  }
  assert.equal(services.length, 1);
  assert.deepEqual(writers, []);
});

test("generic combat modules do not hard-code class behavior haste-cooldown or DoT crit", () => {
  const combatFiles = [
    join(SERVER_ROOT, "src", "domain", "canonical_combat.ts"),
    join(SERVER_ROOT, "src", "domain", "combat_pipeline.ts"),
    join(SERVER_ROOT, "src", "domain", "combat_events.ts"),
    join(SERVER_ROOT, "src", "domain", "effects.ts"),
  ];
  for (let i = 0; i < combatFiles.length; i++) {
    const body = read(combatFiles[i]);
    assert.equal(/class\.warrior|class\.mage|class\.marksman|class\.mystic/.test(body), false, combatFiles[i]);
    assert.equal(/remainingTicks\s*\/\s*haste|cooldown.*\/\s*hasteMult/.test(body), false, combatFiles[i]);
  }
  const hit = read(join(SERVER_ROOT, "src", "domain", "canonical_stats.ts"));
  assert.equal(hit.indexOf("input.isDot !== true") >= 0, true);
});

test("no progression plugin and no test-only class in the production class.* roster", () => {
  const project = read(join(REPO_ROOT, "client", "project.godot"));
  assert.equal(/ProgressionPlugin|rpg-stats|skill.tree plugin/i.test(project), false);
  const fixtures = Object.keys(content.classes).filter(function (id) {
    return id.indexOf("test.class.") === 0;
  });
  assert.ok(fixtures.length > 0);
  for (let i = 0; i < fixtures.length; i++) {
    assert.equal(fixtures[i].indexOf("test.class."), 0);
  }
  const blocked = ["class.warrior", "class.mage", "class.marksman", "class.mystic"];
  for (let i = 0; i < developmentOnly.length; i++) {
    assert.equal(blocked.indexOf(developmentOnly[i]) < 0, true, developmentOnly[i]);
  }
  assert.ok(catalog.classes["class.mystic"] !== undefined);
});

test("conflict register has no DEFERRED production rows at PROG-15", () => {
  const markdown = read(join(REPO_ROOT, "docs", "progression", "CURRENT_CONFLICTS.md"));
  const entries = parseConflictRegister(markdown);
  const deferred: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].status === "DEFERRED") {
      deferred.push(entries[i].id);
    }
  }
  assert.deepEqual(deferred, []);
});
