import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  confirmNameReservation,
  reservationWrite,
  validateCharacterName,
} from "../src/domain/character_name";
import { CHARACTER_SLOT_LIMIT, SOFT_DELETE_RETENTION_MS } from "../src/domain/character_roster";
import {
  invalidateTicket,
  issueSelectionTicket,
  validateJoinSelection,
  validateSelectionTicket,
} from "../src/domain/character_ticket";
import { migrationDefaultClassId, type ClassDefinition } from "../src/domain/class_catalog";
import { catalogFromContent } from "../src/domain/stats";
import { initializeProgression, migrateToCanonicalProgression, type CharacterProgression } from "../src/domain/progression";
import { assembleAccountExport } from "../src/domain/account_export";
import {
  CANONICAL_AUTO_ASSIGN_DEFAULT,
  CANONICAL_PROGRESSION_SCHEMA_VERSION,
  unspentBranchPoints,
  unspentClassPoints,
  unspentFreeStatPoints,
} from "../src/domain/canonical_progression";
import {
  createCharacterRecord,
  handleCharacterCreate,
  handleCharacterDeleteRequest,
  handleCharacterList,
  handleCharacterNameAvailable,
  handleCharacterPurge,
  handleCharacterRestore,
  handleCharacterSelect,
  handleCharacterSoftDelete,
  handleCharacterBootstrapViaRoster,
  migrateLegacyCharacterIntoRoster,
  reserveCanonicalName,
  type CharacterLifecycleDeps,
} from "../src/domain/character_lifecycle";
import { createStoredCharacter, type StoredCharacter } from "../src/domain/character";
import { acquireGameplayLease } from "../src/domain/gameplay_lease";
import type { CharacterRoster } from "../src/domain/character_roster";
import type { NameReservation } from "../src/domain/character_name";
import type { SelectionTicket } from "../src/domain/character_ticket";

const CLASSES: { [id: string]: ClassDefinition } = {
  "class.warrior": {
    id: "class.warrior",
    startingEquipment: [{ itemId: "item.training_sword", quantity: 1 }],
    legacyMigrationDefault: true,
  },
  "class.marksman": {
    id: "class.marksman",
    startingEquipment: [{ itemId: "item.training_sword", quantity: 1 }],
  },
  "class.mage": {
    id: "class.mage",
    startingEquipment: [{ itemId: "item.training_sword", quantity: 1 }],
  },
  "class.mystic": {
    id: "class.mystic",
    startingEquipment: [{ itemId: "item.training_sword", quantity: 1 }],
  },
  "fixture.class.alpha": {
    id: "fixture.class.alpha",
    startingEquipment: [{ itemId: "item.training_sword", quantity: 1 }],
  },
  "fixture.class.beta": {
    id: "fixture.class.beta",
    startingEquipment: [{ itemId: "item.training_sword", quantity: 1 }],
  },
};

class MemoryLifecycle implements CharacterLifecycleDeps {
  now = 1_700_000_000_000;
  ids: string[] = [];
  tokens: string[] = [];
  idCursor = 0;
  tokenCursor = 0;
  player = content.player;
  zone = content.zones["zone.starter"];
  classes = CLASSES;
  rosters = new Map<string, CharacterRoster>();
  legacy = new Map<string, StoredCharacter>();
  characters = new Map<string, StoredCharacter>();
  reservations = new Map<string, NameReservation>();
  selections = new Map<string, SelectionTicket>();
  copied: string[] = [];
  initialized: string[] = [];
  onReservationWrite: ((reservation: NameReservation) => void) | null = null;
  idempotency = new Map<string, { [key: string]: unknown }>();
  leases = new Map<string, import("../src/domain/gameplay_lease").GameplayLease>();
  purgeJobs = new Map<string, import("../src/domain/character_purge").CharacterPurgeJob>();
  purgedSteps: string[] = [];
  starterGrants = 0;
  progressions = new Map<string, CharacterProgression>();
  progressionCatalog = catalogFromContent(content);

  nowMs = () => this.now;
  newId = () => {
    const id = this.ids[this.idCursor] !== undefined ? this.ids[this.idCursor] : "char-" + String(this.idCursor + 1);
    this.idCursor += 1;
    return id;
  };
  newReservationToken = () => {
    const token = this.tokens[this.tokenCursor] !== undefined ? this.tokens[this.tokenCursor] : "token-" + String(this.tokenCursor + 1);
    this.tokenCursor += 1;
    return token;
  };
  readRoster = (userId: string) => {
    const found = this.rosters.get(userId);
    return found !== undefined ? found : null;
  };
  writeRoster = (userId: string, roster: CharacterRoster) => {
    this.rosters.set(userId, roster);
  };
  readLegacyCharacter = (userId: string) => this.legacy.get(userId) ?? null;
  readCharacter = (userId: string, characterId: string) => this.characters.get(userId + ":" + characterId) ?? null;
  writeCharacter = (userId: string, record: StoredCharacter) => {
    this.characters.set(userId + ":" + record.characterId, record);
  };
  deleteCharacterRecord = (userId: string, characterId: string) => {
    this.characters.delete(userId + ":" + characterId);
  };
  readReservation = (canonicalName: string) => this.reservations.get(canonicalName) ?? null;
  writeReservation = (reservation: NameReservation) => {
    this.reservations.set(reservation.canonicalName, reservation);
    if (this.onReservationWrite !== null) {
      this.onReservationWrite(reservation);
    }
  };
  confirmReservation = (canonicalName: string) => this.reservations.get(canonicalName) ?? null;
  deleteReservation = (canonicalName: string) => {
    this.reservations.delete(canonicalName);
  };
  readSelection = (userId: string) => this.selections.get(userId) ?? null;
  writeSelection = (userId: string, ticket: SelectionTicket) => {
    this.selections.set(userId, ticket);
  };
  copyGameplayFromLegacy = (userId: string, characterId: string) => {
    this.copied.push(userId + ":" + characterId);
  };
  initializeNewCharacterGameplay = (_userId: string, record: StoredCharacter) => {
    this.initialized.push(record.characterId);
    this.starterGrants += 1;
    const classId = record.classId !== undefined ? record.classId : "";
    const progression = initializeProgression(this.progressionCatalog, classId);
    progression.schemaVersion = 1;
    progression.createdAt = this.now;
    progression.updatedAt = this.now;
    this.progressions.set(_userId + ":" + record.characterId, progression);
  };
  readProgression = (userId: string, characterId: string) => {
    return this.progressions.get(userId + ":" + characterId) ?? null;
  };
  writeProgression = (userId: string, characterId: string, progression: CharacterProgression) => {
    this.progressions.set(userId + ":" + characterId, progression);
  };
  readIdempotency = (userId: string, operation: string, key: string) => {
    return this.idempotency.get(userId + ":" + operation + ":" + key) ?? null;
  };
  writeIdempotency = (userId: string, operation: string, key: string, result: { [key: string]: unknown }) => {
    this.idempotency.set(userId + ":" + operation + ":" + key, result);
  };
  readLease = (userId: string) => this.leases.get(userId) ?? null;
  writeLease = (userId: string, lease: import("../src/domain/gameplay_lease").GameplayLease | null) => {
    if (lease === null) {
      this.leases.delete(userId);
      return;
    }
    this.leases.set(userId, lease);
  };
  readPurgeJob = (userId: string, characterId: string) => this.purgeJobs.get(userId + ":" + characterId) ?? null;
  writePurgeJob = (userId: string, job: import("../src/domain/character_purge").CharacterPurgeJob) => {
    this.purgeJobs.set(userId + ":" + job.characterId, job);
  };
  deletePurgeJob = (userId: string, characterId: string) => {
    this.purgeJobs.delete(userId + ":" + characterId);
  };
  applyPurgeStep = (userId: string, record: StoredCharacter, step: import("../src/domain/character_purge").PurgeStep) => {
    this.purgedSteps.push(record.characterId + ":" + step);
    if (step === "progression") {
      this.progressions.delete(userId + ":" + record.characterId);
    }
  };
}

function createPayload(name: string, classId: string, idempotencyKey?: string): string {
  const body: { [key: string]: string } = { name: name, classId: classId };
  if (idempotencyKey !== undefined) {
    body.idempotencyKey = idempotencyKey;
  }
  return JSON.stringify(body);
}

function idPayload(characterId: string): string {
  return JSON.stringify({ characterId: characterId });
}

function deletePayload(characterId: string, confirmationName: string, idempotencyKey?: string): string {
  const body: { [key: string]: string } = { characterId: characterId, confirmationName: confirmationName };
  if (idempotencyKey !== undefined) {
    body.idempotencyKey = idempotencyKey;
  }
  return JSON.stringify(body);
}

test("character names follow the centralized policy", () => {
  assert.equal(validateCharacterName("Alice").ok, true);
  assert.equal(validateCharacterName("  Bob  ").ok, true);
  assert.equal(validateCharacterName("Mary Jane").ok, true);
  assert.equal(validateCharacterName("O'Brien").ok, true);
  assert.equal(validateCharacterName("A-B").ok, true);
  assert.equal(validateCharacterName("ab").ok, false);
  assert.equal(validateCharacterName("Alice!").ok, false);
  assert.equal(validateCharacterName("A  B").ok, false);
  assert.equal(validateCharacterName("-Alice").ok, false);
  assert.equal(validateCharacterName("Alice-").ok, false);
  assert.equal(validateCharacterName("Alice_Bob").ok, false);
});

test("character creation stores class and reserves the canonical name", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["char-a"];
  const created = handleCharacterCreate("user-a", createPayload("Alice", "fixture.class.beta"), mem);
  assert.equal(created.characterId, "char-a");
  assert.equal(created.classId, "fixture.class.beta");
  assert.equal(created.canonicalName, "alice");
  assert.equal(mem.initialized.join(","), "char-a");
  const listed = handleCharacterList("user-a", mem);
  assert.equal(listed.slotLimit, CHARACTER_SLOT_LIMIT);
  assert.equal(listed.liveCount, 1);
  assert.equal(listed.characters[0].classId, "fixture.class.beta");
});

test("slot limit rejects a sixth live character", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["c1", "c2", "c3", "c4", "c5", "c6"];
  handleCharacterCreate("user-a", createPayload("One", "class.warrior"), mem);
  handleCharacterCreate("user-a", createPayload("Two", "class.marksman"), mem);
  handleCharacterCreate("user-a", createPayload("Three", "class.mage"), mem);
  handleCharacterCreate("user-a", createPayload("Four", "class.warrior"), mem);
  handleCharacterCreate("user-a", createPayload("Five", "class.warrior"), mem);
  assert.throws(
    () => handleCharacterCreate("user-a", createPayload("Six", "class.warrior"), mem),
    /slot_limit/,
  );
});

test("invalid names and classes are rejected", () => {
  const mem = new MemoryLifecycle();
  assert.throws(() => handleCharacterCreate("user-a", createPayload("ab", "fixture.class.alpha"), mem), /invalid_name/);
  assert.throws(
    () => handleCharacterCreate("user-a", createPayload("Alice", "fixture.class.missing"), mem),
    /invalid_class/,
  );
});

test("canonical duplicate names are rejected", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["c1", "c2"];
  handleCharacterCreate("user-a", createPayload("Alice", "fixture.class.alpha"), mem);
  assert.throws(
    () => handleCharacterCreate("user-b", createPayload("alice", "fixture.class.beta"), mem),
    /name_taken/,
  );
});

test("concurrent duplicate name: last writer wins and the loser is name_taken", () => {
  const first = reservationWrite("alice", "c1", "user-a", "token-a");
  const second = reservationWrite("alice", "c2", "user-b", "token-b");
  let current: NameReservation | null = null;
  current = first;
  current = second;
  assert.equal(confirmNameReservation(first, current), false);
  assert.equal(confirmNameReservation(second, current), true);

  const mem = new MemoryLifecycle();
  mem.ids = ["c1", "c2"];
  mem.tokens = ["token-a", "token-b"];
  mem.onReservationWrite = function (reservation) {
    if (reservation.token === "token-a") {
      mem.reservations.set(reservation.canonicalName, reservationWrite("alice", "c2", "user-b", "token-b"));
    }
  };
  assert.throws(
    () => createCharacterRecord("user-a", "Alice", "fixture.class.alpha", mem),
    /name_taken/,
  );
});

test("character selection issues a ticket and rejects foreign, deleted, and expired tickets", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["char-a", "ticket-1"];
  handleCharacterCreate("user-a", createPayload("Alice", "fixture.class.alpha"), mem);
  const selected = handleCharacterSelect("user-a", idPayload("char-a"), mem);
  assert.equal(selected.characterId, "char-a");
  assert.equal(selected.ticketId, "ticket-1");
  assert.throws(() => handleCharacterSelect("user-b", idPayload("char-a"), mem), /character_missing/);

  handleCharacterSoftDelete("user-a", deletePayload("char-a", "Alice"), mem);
  assert.throws(() => handleCharacterSelect("user-a", idPayload("char-a"), mem), /character_deleted/);
  handleCharacterRestore("user-a", idPayload("char-a"), mem);
  const restoredSelect = handleCharacterSelect("user-a", idPayload("char-a"), mem);
  assert.equal(restoredSelect.characterId, "char-a");

  const expired = issueSelectionTicket("t-exp", "user-a", "char-a", 1000, 10);
  const expiredCheck = validateSelectionTicket(expired, "user-a", 1020);
  assert.equal(expiredCheck.ok, false);
  if (!expiredCheck.ok) {
    assert.equal(expiredCheck.reason, "selection_expired");
  }
  const joinExpired = validateJoinSelection("t-exp", expired, "user-a", mem.readCharacter("user-a", "char-a"), 1020);
  assert.equal(joinExpired.ok, false);
  if (!joinExpired.ok) {
    assert.equal(joinExpired.reason, "selection_expired");
  }
  const foreignTicket = issueSelectionTicket("t-f", "user-a", "char-a", 1000, 5000);
  const foreignJoin = validateJoinSelection("t-f", foreignTicket, "user-b", mem.readCharacter("user-a", "char-a"), 1001);
  assert.equal(foreignJoin.ok, false);
  if (!foreignJoin.ok) {
    assert.equal(foreignJoin.reason, "selection_foreign");
  }
  const live = handleCharacterSelect("user-a", idPayload("char-a"), mem);
  const stored = mem.readSelection("user-a");
  assert.notEqual(stored, null);
  if (stored !== null) {
    mem.writeSelection("user-a", invalidateTicket(stored, mem.now));
  }
  const invalidatedJoin = validateJoinSelection(
    live.ticketId,
    mem.readSelection("user-a"),
    "user-a",
    mem.readCharacter("user-a", "char-a"),
    mem.now + 1,
  );
  assert.equal(invalidatedJoin.ok, false);
  if (!invalidatedJoin.ok) {
    assert.equal(invalidatedJoin.reason, "selection_invalidated");
  }
});

test("Prompt 18 characters migrate into the first slot without granting a new starter item", () => {
  const mem = new MemoryLifecycle();
  const legacy = createStoredCharacter("char-alice", "Alice", content.player, content.zones["zone.starter"], "v1", 10, "user-alice", "");
  legacy.classId = "";
  mem.legacy.set("user-alice", legacy);
  mem.writeCharacter("user-alice", legacy);
  const roster = migrateLegacyCharacterIntoRoster("user-alice", mem);
  assert.equal(roster.characterIds[0], "char-alice");
  const migrated = mem.readCharacter("user-alice", "char-alice");
  assert.notEqual(migrated, null);
  if (migrated !== null) {
    assert.equal(migrated.classId, migrationDefaultClassId(CLASSES));
    assert.equal(migrated.canonicalName, "alice");
    assert.equal(migrated.accountUserId, "user-alice");
  }
  const reserved = mem.readReservation("alice");
  assert.notEqual(reserved, null);
  if (reserved !== null) {
    assert.equal(reserved.characterId, "char-alice");
    assert.equal(reserved.accountUserId, "user-alice");
  }
  assert.equal(mem.copied.join(","), "user-alice:char-alice");
  assert.equal(mem.initialized.length, 0);
  const listed = handleCharacterList("user-alice", mem);
  assert.equal(listed.liveCount, 1);
  const boot = handleCharacterBootstrapViaRoster("user-alice", "alice", '{"name":"Ignored"}', mem);
  assert.equal(boot.created, false);
  assert.equal(boot.characterId, "char-alice");
  assert.equal(boot.name, "Alice");
});

test("reserveCanonicalName rejects a lost race", () => {
  const mem = new MemoryLifecycle();
  reserveCanonicalName("alice", "c1", "user-a", "token-a", mem);
  assert.throws(() => reserveCanonicalName("alice", "c2", "user-b", "token-b", mem), /name_taken/);
});

test("create warrior marksman mage and mystic and return catalog summaries", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["w", "m", "g", "y"];
  const warrior = handleCharacterCreate("user-a", createPayload("Blade", "class.warrior"), mem);
  const marksman = handleCharacterCreate("user-a", createPayload("Bow", "class.marksman"), mem);
  const mage = handleCharacterCreate("user-a", createPayload("Staff", "class.mage"), mem);
  const mystic = handleCharacterCreate("user-a", createPayload("Charm", "class.mystic"), mem);
  assert.equal(warrior.classId, "class.warrior");
  assert.equal(marksman.classId, "class.marksman");
  assert.equal(mage.classId, "class.mage");
  assert.equal(mystic.classId, "class.mystic");
  assert.equal(warrior.displayName, "Blade");
  assert.equal(warrior.status, "ACTIVE");
  assert.equal(warrior.level, 1);
  assert.equal(warrior.branchId, "");
  const listed = handleCharacterList("user-a", mem);
  assert.equal(listed.liveCount, 4);
  assert.equal(listed.characters[0].lastLocationNameKey.length > 0, true);
  assert.equal(listed.characters[0].branchId, "");
  assert.equal(listed.characters[3].classId, "class.mystic");
  assert.equal(listed.characters[3].level, 1);
});

test("character create rejects client stat and level injection", () => {
  const mem = new MemoryLifecycle();
  assert.throws(
    () => handleCharacterCreate("user-a", JSON.stringify({ name: "Forge", classId: "class.warrior", level: 10 }), mem),
    /stat_injection:level/,
  );
  assert.throws(
    () =>
      handleCharacterCreate(
        "user-a",
        JSON.stringify({ name: "Forge", classId: "class.warrior", allocatedAttributes: { "stat.strength": 99 } }),
        mem,
      ),
    /stat_injection:allocatedAttributes/,
  );
  assert.throws(
    () =>
      handleCharacterCreate(
        "user-a",
        JSON.stringify({ name: "Forge", classId: "class.warrior", xpIntoLevel: 500, currentXp: 500 }),
        mem,
      ),
    /stat_injection:xpIntoLevel/,
  );
  assert.throws(
    () =>
      handleCharacterCreate(
        "user-a",
        JSON.stringify({ name: "Forge", classId: "class.warrior", startingAbilities: ["ability.warrior.whirlwind"] }),
        mem,
      ),
    /stat_injection:startingAbilities/,
  );
});

test("new production characters persist canonical level-1 progression", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["w", "m", "g", "y"];
  const classIds = ["class.warrior", "class.marksman", "class.mage", "class.mystic"];
  const names = ["Blade", "Bow", "Staff", "Charm"];
  for (let i = 0; i < classIds.length; i++) {
    handleCharacterCreate("user-a", createPayload(names[i], classIds[i]), mem);
    const stored = mem.readProgression("user-a", mem.ids[i]);
    assert.notEqual(stored, null);
    if (stored === null) {
      continue;
    }
    assert.equal(stored.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION);
    assert.equal(stored.classId, classIds[i]);
    assert.equal(stored.branchId, "");
    assert.equal(stored.level, 1);
    assert.equal(stored.xpIntoLevel, 0);
    assert.equal(stored.lifetimeXp, 0);
    assert.equal(stored.currentXp, 0);
    assert.deepEqual(stored.freeStatAllocations, {});
    assert.deepEqual(stored.purchasedClassNodeIds, []);
    assert.deepEqual(stored.purchasedBranchNodeRanks, {});
    assert.equal(stored.autoAssignEnabled, CANONICAL_AUTO_ASSIGN_DEFAULT);
    assert.deepEqual(stored.hotbarAssignments, []);
    assert.deepEqual(stored.unlockedAbilityIds, []);
    assert.equal(unspentClassPoints(stored.purchasedClassNodeIds, stored.level), 0);
    assert.equal(unspentBranchPoints(stored.purchasedBranchNodeRanks, stored.level), 0);
    assert.equal(unspentFreeStatPoints(stored.freeStatAllocations, stored.level), 0);
    assert.equal(stored.createdAt, mem.now);
    assert.equal(stored.updatedAt, mem.now);
  }
});

test("starting-state create is idempotent and does not regrant", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["char-dup", "char-other"];
  handleCharacterCreate("user-a", createPayload("Idem", "class.warrior", "key-1"), mem);
  const first = mem.readProgression("user-a", "char-dup");
  handleCharacterCreate("user-a", createPayload("Idem", "class.warrior", "key-1"), mem);
  const second = mem.readProgression("user-a", "char-dup");
  assert.equal(mem.initialized.length, 1);
  assert.deepEqual(second, first);
  assert.equal(mem.readProgression("user-a", "char-other"), null);
});

test("existing v1 warrior migrates without changing class or resetting xp", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["char-old"];
  handleCharacterCreate("user-a", createPayload("Blade", "class.warrior"), mem);
  const v1: CharacterProgression = {
    ...initializeProgression(mem.progressionCatalog, "class.warrior"),
    progressionSchemaVersion: 1,
    level: 5,
    currentXp: 12,
    lifetimeXp: 387,
    xpIntoLevel: 0,
    unlockedAbilityIds: ["test.ability.basic_melee"],
    hotbar: ["ability.warrior.heavy_strike", "ability.warrior.frenzy", "test.ability.basic_melee", "", "", "", "", ""],
    allocatedAttributes: { "test.attribute.might": 2 },
    unspentAttributePoints: 2,
    unspentSkillPoints: 4,
    createdAt: 10,
    updatedAt: 10,
  };
  mem.writeProgression("user-a", "char-old", v1);
  const listed = handleCharacterList("user-a", mem);
  assert.equal(listed.characters[0].classId, "class.warrior");
  assert.equal(listed.characters[0].level, 5);
  assert.equal(listed.characters[0].branchId, "");
  const migrated = mem.readProgression("user-a", "char-old");
  assert.notEqual(migrated, null);
  if (migrated === null) {
    return;
  }
  assert.equal(migrated.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION);
  assert.equal(migrated.classId, "class.warrior");
  assert.equal(migrated.level, 5);
  assert.equal(migrated.currentXp, 12);
  assert.equal(migrated.xpIntoLevel, 12);
  assert.equal(migrated.lifetimeXp, 387);
  assert.deepEqual(migrated.unlockedAbilityIds, ["test.ability.basic_melee"]);
  assert.deepEqual(migrated.hotbarAssignments, ["ability.warrior.heavy_strike"]);
  assert.deepEqual(migrated.purchasedClassNodeIds, []);
  assert.equal(migrated.branchId, "");
  const again = migrateToCanonicalProgression(migrated, "class.warrior", mem.now + 50, mem.progressionCatalog);
  assert.equal(again.changed, false);
});

test("account export includes the canonical progression record without secrets", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["char-a"];
  handleCharacterCreate("user-a", createPayload("Scout", "class.mage"), mem);
  const progression = mem.readProgression("user-a", "char-a");
  const payload = assembleAccountExport({
    accountUserId: "user-a",
    exportedAt: mem.now,
    characters: [
      {
        catalog: mem.readCharacter("user-a", "char-a"),
        progression: progression,
      },
    ],
    gold: 0,
    settings: {},
  });
  const characters = payload.characters as Array<{ progression: CharacterProgression }>;
  assert.equal(characters.length, 1);
  assert.equal(characters[0].progression.classId, "class.mage");
  assert.equal(characters[0].progression.progressionSchemaVersion, CANONICAL_PROGRESSION_SCHEMA_VERSION);
  assert.equal(characters[0].progression.level, 1);
  assert.equal(JSON.stringify(payload).indexOf("hmac"), -1);
});

test("Archer archer ARCHER collide on one canonical reservation", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["c1", "c2", "c3"];
  handleCharacterCreate("user-a", createPayload("Archer", "class.warrior"), mem);
  assert.throws(() => handleCharacterCreate("user-b", createPayload("archer", "class.mage"), mem), /name_taken/);
  assert.throws(() => handleCharacterCreate("user-c", createPayload("ARCHER", "class.marksman"), mem), /name_taken/);
  const reserved = mem.readReservation("archer");
  assert.notEqual(reserved, null);
  if (reserved !== null) {
    assert.equal(reserved.characterId, "c1");
    assert.equal(reserved.accountUserId, "user-a");
    assert.equal(reserved.reservationState, "HELD");
    assert.equal(typeof reserved.createdAt, "number");
    assert.equal(reserved.schemaVersion, 1);
  }
});

test("duplicate create idempotency returns the same character", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["char-dup", "char-other"];
  const first = handleCharacterCreate("user-a", createPayload("Idem", "class.warrior", "key-1"), mem);
  const second = handleCharacterCreate("user-a", createPayload("Idem", "class.warrior", "key-1"), mem);
  assert.equal(second.characterId, first.characterId);
  assert.equal(mem.initialized.length, 1);
  const listed = handleCharacterList("user-a", mem);
  assert.equal(listed.liveCount, 1);
});

test("soft-deleted and leased characters cannot be selected", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["char-a", "char-b", "t1", "t2"];
  handleCharacterCreate("user-a", createPayload("Alice", "class.warrior"), mem);
  handleCharacterCreate("user-a", createPayload("Bob", "class.mage"), mem);
  mem.writeLease("user-a", acquireGameplayLease({ accountUserId: "user-a", characterId: "char-a", matchId: "m1", nowMs: mem.now }));
  assert.throws(() => handleCharacterSelect("user-a", idPayload("char-b"), mem), /account_busy/);
  mem.writeLease("user-a", null);
  handleCharacterDeleteRequest("user-a", deletePayload("char-a", "Alice", "del-1"), mem);
  assert.throws(() => handleCharacterSelect("user-a", idPayload("char-a"), mem), /character_deleted/);
});

test("delete requires exact name, rejects gameplay lease, and frees a slot", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["c1", "c2", "c3", "c4", "c5", "c6"];
  handleCharacterCreate("user-a", createPayload("One", "class.warrior"), mem);
  mem.writeLease("user-a", acquireGameplayLease({ accountUserId: "user-a", characterId: "c1", matchId: "m1", nowMs: mem.now }));
  assert.throws(() => handleCharacterDeleteRequest("user-a", deletePayload("c1", "One"), mem), /gameplay_lease/);
  mem.writeLease("user-a", null);
  assert.throws(() => handleCharacterDeleteRequest("user-a", deletePayload("c1", "Wrong"), mem), /confirmation_mismatch/);
  const deleted = handleCharacterDeleteRequest("user-a", deletePayload("c1", "One", "d1"), mem);
  assert.equal(deleted.status, "SOFT_DELETED");
  assert.equal(deleted.softDeleteExpiresAt, mem.now + SOFT_DELETE_RETENTION_MS);
  assert.equal(mem.readReservation("one")?.characterId, "c1");
  const listed = handleCharacterList("user-a", mem);
  assert.equal(listed.liveCount, 0);
  handleCharacterCreate("user-a", createPayload("Two", "class.mage"), mem);
  assert.equal(handleCharacterList("user-a", mem).liveCount, 1);
});

test("soft-deleted names stay reserved and tell the owner to restore", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["c1", "c2"];
  handleCharacterCreate("user-a", createPayload("One", "class.warrior"), mem);
  handleCharacterDeleteRequest("user-a", deletePayload("c1", "One"), mem);
  assert.throws(() => handleCharacterCreate("user-a", createPayload("One", "class.mage"), mem), /name_held_deleted/);
  assert.throws(() => handleCharacterCreate("user-b", createPayload("One", "class.mage"), mem), /name_taken/);
  const check = handleCharacterNameAvailable("user-a", JSON.stringify({ displayName: "One" }), mem);
  assert.equal(check.available, false);
  assert.equal(check.reason, "name_held_deleted");
});

test("restore requires a free slot and keeps progression inventory", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["c1", "c2", "c3", "c4", "c5", "c6"];
  handleCharacterCreate("user-a", createPayload("Keep", "class.warrior"), mem);
  handleCharacterDeleteRequest("user-a", deletePayload("c1", "Keep"), mem);
  const grants = mem.starterGrants;
  const before = mem.readProgression("user-a", "c1");
  assert.notEqual(before, null);
  if (before !== null) {
    before.level = 4;
    before.lifetimeXp = 225;
    before.currentXp = 5;
    before.xpIntoLevel = 5;
    mem.writeProgression("user-a", "c1", before);
  }
  const restored = handleCharacterRestore("user-a", idPayload("c1"), mem);
  assert.equal(restored.status, "ACTIVE");
  assert.equal(mem.starterGrants, grants);
  const after = mem.readProgression("user-a", "c1");
  assert.equal(after?.level, 4);
  assert.equal(after?.lifetimeXp, 225);
  assert.equal(after?.classId, "class.warrior");
  handleCharacterDeleteRequest("user-a", deletePayload("c1", "Keep"), mem);
  handleCharacterCreate("user-a", createPayload("Aone", "class.warrior"), mem);
  handleCharacterCreate("user-a", createPayload("Atwo", "class.warrior"), mem);
  handleCharacterCreate("user-a", createPayload("Athr", "class.warrior"), mem);
  handleCharacterCreate("user-a", createPayload("Afor", "class.warrior"), mem);
  handleCharacterCreate("user-a", createPayload("Afiv", "class.warrior"), mem);
  assert.throws(() => handleCharacterRestore("user-a", idPayload("c1"), mem), /slot_limit/);
});

test("purge after retention releases the name and recovers a partial job", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["c1"];
  handleCharacterCreate("user-a", createPayload("Gone", "class.warrior"), mem);
  handleCharacterDeleteRequest("user-a", deletePayload("c1", "Gone"), mem);
  mem.now += SOFT_DELETE_RETENTION_MS + 1;
  mem.purgeJobs.set("user-a:c1", {
    characterId: "c1",
    accountUserId: "user-a",
    completedSteps: ["inventory"],
    startedAt: mem.now,
    updatedAt: mem.now,
    schemaVersion: 1,
  });
  const purged = handleCharacterPurge("user-a", idPayload("c1"), mem);
  assert.equal(purged.purged, true);
  assert.equal(mem.readReservation("gone"), null);
  assert.equal(mem.readRoster("user-a")?.characterIds.indexOf("c1"), -1);
  assert.equal(mem.readCharacter("user-a", "c1"), null);
  assert.equal(mem.readProgression("user-a", "c1"), null);
  assert.equal(mem.purgedSteps.indexOf("c1:progression") >= 0, true);
  handleCharacterCreate("user-b", createPayload("Gone", "class.mage"), mem);
  assert.equal(mem.readReservation("gone")?.accountUserId, "user-b");
});

test("name availability is advisory and does not reserve", () => {
  const mem = new MemoryLifecycle();
  const available = handleCharacterNameAvailable("user-a", JSON.stringify({ displayName: "Scout" }), mem);
  assert.equal(available.available, true);
  assert.equal(available.canonicalName, "scout");
  handleCharacterCreate("user-a", createPayload("Scout", "class.warrior"), mem);
  const taken = handleCharacterNameAvailable("user-b", JSON.stringify({ name: "SCOUT" }), mem);
  assert.equal(taken.available, false);
  assert.equal(mem.readReservation("scout")?.characterId !== undefined, true);
});

test("Prompt 18 empty class migrates to warrior without a second starter grant", () => {
  const mem = new MemoryLifecycle();
  const legacy = createStoredCharacter("char-alice", "Alice", content.player, content.zones["zone.starter"], "v1", 10, "user-alice", "");
  legacy.classId = "";
  mem.legacy.set("user-alice", legacy);
  mem.writeCharacter("user-alice", legacy);
  migrateLegacyCharacterIntoRoster("user-alice", mem);
  const migrated = mem.readCharacter("user-alice", "char-alice");
  assert.equal(migrated?.classId, "class.warrior");
  assert.equal(mem.initialized.length, 0);
});

test("character list summaries omit inventory quest and private storage", () => {
  const mem = new MemoryLifecycle();
  handleCharacterCreate("user-a", createPayload("Safe", "class.warrior"), mem);
  const listed = handleCharacterList("user-a", mem);
  const row = listed.characters[0] as unknown as { [key: string]: unknown };
  assert.equal(row.inventory, undefined);
  assert.equal(row.quests, undefined);
  assert.equal(row.equipment, undefined);
  assert.equal(row.gold, undefined);
  assert.equal(typeof row.characterId, "string");
  assert.equal(typeof row.displayName, "string");
  assert.equal(typeof row.classId, "string");
  assert.equal(typeof row.level, "number");
  assert.equal(typeof row.lastLocationNameKey, "string");
  assert.equal(typeof row.lastPlayedAt, "number");
  assert.equal(typeof row.createdAt, "number");
  assert.equal(typeof row.status, "string");
  assert.equal(typeof row.softDeleteExpiresAt, "number");
  assert.equal(typeof row.activePresenceState, "string");
  assert.equal(typeof row.playAvailableAt, "number");
});

test("selection ticket replay after invalidation is rejected", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["char-a", "ticket-1"];
  handleCharacterCreate("user-a", createPayload("Replay", "class.warrior"), mem);
  const selected = handleCharacterSelect("user-a", idPayload("char-a"), mem);
  const stored = mem.readSelection("user-a");
  assert.notEqual(stored, null);
  if (stored === null) {
    return;
  }
  mem.writeSelection("user-a", invalidateTicket(stored, mem.now));
  const replay = validateJoinSelection(
    selected.ticketId,
    mem.readSelection("user-a"),
    "user-a",
    mem.readCharacter("user-a", "char-a"),
    mem.now + 1,
  );
  assert.equal(replay.ok, false);
  if (!replay.ok) {
    assert.equal(replay.reason, "selection_invalidated");
  }
});

test("starting gameplay is initialized once on create and not on restore", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["char-a"];
  handleCharacterCreate("user-a", createPayload("Once", "class.warrior"), mem);
  assert.equal(mem.starterGrants, 1);
  handleCharacterDeleteRequest("user-a", deletePayload("char-a", "Once"), mem);
  handleCharacterRestore("user-a", idPayload("char-a"), mem);
  assert.equal(mem.starterGrants, 1);
});

