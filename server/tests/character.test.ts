import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  CHARACTER_COLLECTION,
  CHARACTER_KEY,
  CHARACTER_PERMISSION_READ,
  CHARACTER_PERMISSION_WRITE,
  DEFAULT_CHARACTER_NAME,
  type StoredCharacter,
  checkpointCharacterPosition,
  handleCharacterBootstrap,
  parseCharacterBootstrapRequest,
} from "../src/domain/character";
import { buildCharacterWrite } from "../src/nakama/character_store";

class MemoryCharacterStore {
  private readonly records = new Map<string, StoredCharacter>();

  read(userId: string): StoredCharacter | null {
    const found = this.records.get(userId);
    return found === undefined ? null : found;
  }

  write(userId: string, record: StoredCharacter): void {
    const stored: StoredCharacter = {
      characterId: record.characterId,
      name: record.name,
      contentId: record.contentId,
      zoneId: record.zoneId,
      storageVersion: "v1",
      position: { x: record.position.x, y: record.position.y },
      schemaVersion: record.schemaVersion,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    this.records.set(userId, stored);
  }
}

function deps(store = new MemoryCharacterStore(), id = "char-1") {
  return {
    store,
    newId: () => id,
    nowMs: () => 1_700_000_000_000,
    player: content.player,
    zone: content.zones["zone.starter"],
  };
}

test("unauthenticated bootstrap is rejected", () => {
  assert.throws(
    () => handleCharacterBootstrap(undefined, "alice", "{}", deps()),
    /unauthenticated/,
  );
  assert.throws(
    () => handleCharacterBootstrap("", "alice", "{}", deps()),
    /unauthenticated/,
  );
});

test("valid creation uses content stats and starter spawn", () => {
  const response = handleCharacterBootstrap("user-alice", "alice", '{"name":"Alice"}', deps());
  assert.equal(response.created, true);
  assert.equal(response.characterId, "char-1");
  assert.equal(response.name, "Alice");
  assert.equal(response.contentId, "player.base");
  assert.equal(response.zoneId, "zone.starter");
  assert.equal(response.storageVersion, "v1");
  assert.equal(response.baseStats.maxHealth, content.player.maxHealth);
  assert.equal(response.baseStats.attack, content.player.attack);
  assert.equal(response.baseStats.moveSpeed, content.player.moveSpeed);
  assert.equal(response.position.x, content.zones["zone.starter"].playerSpawn.x);
  assert.equal(response.position.y, content.zones["zone.starter"].playerSpawn.y);
});

test("repeated creation returns the original character", () => {
  const store = new MemoryCharacterStore();
  const first = handleCharacterBootstrap("user-alice", "alice", '{"name":"Alice"}', deps(store, "char-1"));
  const second = handleCharacterBootstrap("user-alice", "alice", '{"name":"Bob"}', deps(store, "char-2"));
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.characterId, first.characterId);
  assert.equal(second.name, "Alice");
  assert.equal(second.storageVersion, first.storageVersion);
});

test("invalid names are rejected", () => {
  assert.throws(
    () => handleCharacterBootstrap("user-alice", "alice", '{"name":"ab"}', deps()),
    /invalid_name/,
  );
  assert.throws(
    () => handleCharacterBootstrap("user-alice", "alice", '{"name":"Alice!"}', deps()),
    /invalid_name/,
  );
  assert.throws(
    () => handleCharacterBootstrap("user-alice", "alice", '{"name":"ThisNameIsWayTooLong"}', deps()),
    /invalid_name/,
  );
  assert.throws(
    () => handleCharacterBootstrap("user-alice", "alice", '{"name":123}', deps()),
    /invalid_name/,
  );
});

test("attempted stat injection is rejected", () => {
  assert.throws(
    () => handleCharacterBootstrap("user-alice", "alice", '{"name":"Alice","maxHealth":9999}', deps()),
    /stat_injection:maxHealth/,
  );
  assert.throws(
    () => handleCharacterBootstrap("user-alice", "alice", '{"attack":99}', deps()),
    /stat_injection:attack/,
  );
  assert.throws(
    () => handleCharacterBootstrap("user-alice", "alice", '{"position":{"x":1,"y":1}}', deps()),
    /stat_injection:position/,
  );
  assert.throws(
    () => handleCharacterBootstrap("user-alice", "alice", '{"schemaVersion":0}', deps()),
    /stat_injection:schemaVersion/,
  );
  const created = handleCharacterBootstrap("user-alice", "alice", '{"name":"Alice"}', deps());
  assert.equal(created.baseStats.maxHealth, 100);
  assert.notEqual(created.baseStats.maxHealth, 9999);
});

test("existing character retrieval ignores a new proposed name", () => {
  const store = new MemoryCharacterStore();
  handleCharacterBootstrap("user-bob", "bob", '{"name":"Bob"}', deps(store, "char-bob"));
  const again = handleCharacterBootstrap("user-bob", "bob", "{}", deps(store, "other"));
  assert.equal(again.created, false);
  assert.equal(again.characterId, "char-bob");
  assert.equal(again.name, "Bob");
  assert.equal(again.baseStats.attack, content.player.attack);
});

test("alice and bob receive different characters", () => {
  const store = new MemoryCharacterStore();
  const alice = handleCharacterBootstrap("user-alice", "alice", '{"name":"Alice"}', deps(store, "char-alice"));
  const bob = handleCharacterBootstrap("user-bob", "bob", '{"name":"Bob"}', deps(store, "char-bob"));
  assert.notEqual(alice.characterId, bob.characterId);
  assert.notEqual(alice.name, bob.name);
});

test("empty payload creates a default name from username or Adventurer", () => {
  const fromUser = handleCharacterBootstrap("user-alice", "Alice", "", deps());
  assert.equal(fromUser.name, "Alice");
  const fallback = handleCharacterBootstrap("user-x", "x", "", deps(new MemoryCharacterStore(), "char-x"));
  assert.equal(fallback.name, DEFAULT_CHARACTER_NAME);
});

test("unknown fields and malformed JSON are rejected", () => {
  assert.throws(() => parseCharacterBootstrapRequest("{"), /malformed_json/);
  assert.throws(() => parseCharacterBootstrapRequest("[]"), /malformed_json/);
  assert.throws(() => parseCharacterBootstrapRequest('{"extra":true}'), /unknown_field:extra/);
});

test("character storage writes are server-only", () => {
  const record: StoredCharacter = {
    characterId: "char-1",
    name: "Alice",
    contentId: "player.base",
    zoneId: "zone.starter",
    position: { x: 240, y: 384 },
    storageVersion: "",
    schemaVersion: 1,
    createdAt: 0,
    updatedAt: 0,
  };
  const write = buildCharacterWrite("user-alice", record);
  assert.equal(write.collection, CHARACTER_COLLECTION);
  assert.equal(write.key, CHARACTER_KEY);
  assert.equal(write.userId, "user-alice");
  assert.equal(write.permissionRead, CHARACTER_PERMISSION_READ);
  assert.equal(write.permissionWrite, CHARACTER_PERMISSION_WRITE);
  assert.equal(write.permissionWrite, 0);
  assert.equal(write.value.schemaVersion, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(write.value, "maxHealth"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(write.value, "attack"), false);
});

test("character checkpoints update stored position without client stats", () => {
  const record: StoredCharacter = {
    characterId: "char-1",
    name: "Alice",
    contentId: "player.base",
    zoneId: "zone.starter",
    position: { x: 240, y: 384 },
    storageVersion: "v1",
    schemaVersion: 1,
    createdAt: 0,
    updatedAt: 0,
  };
  const next = checkpointCharacterPosition(record, 640, 400);
  assert.equal(next.position.x, 640);
  assert.equal(next.position.y, 400);
  assert.equal(next.characterId, "char-1");
  const write = buildCharacterWrite("user-alice", next, "v1");
  assert.equal(write.version, "v1");
  assert.equal(write.permissionWrite, 0);
});
