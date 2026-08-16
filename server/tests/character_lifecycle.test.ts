import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  confirmNameReservation,
  reservationWrite,
  validateCharacterName,
} from "../src/domain/character_name";
import { CHARACTER_SLOT_LIMIT } from "../src/domain/character_roster";
import {
  invalidateTicket,
  issueSelectionTicket,
  validateJoinSelection,
  validateSelectionTicket,
} from "../src/domain/character_ticket";
import { migrationDefaultClassId, type ClassDefinition } from "../src/domain/class_catalog";
import {
  createCharacterRecord,
  handleCharacterCreate,
  handleCharacterList,
  handleCharacterRestore,
  handleCharacterSelect,
  handleCharacterSoftDelete,
  handleCharacterBootstrapViaRoster,
  migrateLegacyCharacterIntoRoster,
  reserveCanonicalName,
  type CharacterLifecycleDeps,
} from "../src/domain/character_lifecycle";
import { createStoredCharacter, type StoredCharacter } from "../src/domain/character";
import type { CharacterRoster } from "../src/domain/character_roster";
import type { NameReservation } from "../src/domain/character_name";
import type { SelectionTicket } from "../src/domain/character_ticket";

const CLASSES: { [id: string]: ClassDefinition } = {
  "fixture.class.alpha": {
    id: "fixture.class.alpha",
    startingEquipment: [{ itemId: "item.training_sword", quantity: 1 }],
    legacyMigrationDefault: true,
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
  readReservation = (canonicalName: string) => this.reservations.get(canonicalName) ?? null;
  writeReservation = (reservation: NameReservation) => {
    this.reservations.set(reservation.canonicalName, reservation);
    if (this.onReservationWrite !== null) {
      this.onReservationWrite(reservation);
    }
  };
  confirmReservation = (canonicalName: string) => this.reservations.get(canonicalName) ?? null;
  readSelection = (userId: string) => this.selections.get(userId) ?? null;
  writeSelection = (userId: string, ticket: SelectionTicket) => {
    this.selections.set(userId, ticket);
  };
  copyGameplayFromLegacy = (userId: string, characterId: string) => {
    this.copied.push(userId + ":" + characterId);
  };
  initializeNewCharacterGameplay = (_userId: string, record: StoredCharacter) => {
    this.initialized.push(record.characterId);
  };
}

function createPayload(name: string, classId: string): string {
  return JSON.stringify({ name: name, classId: classId });
}

function idPayload(characterId: string): string {
  return JSON.stringify({ characterId: characterId });
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

test("slot limit rejects a fourth live character", () => {
  const mem = new MemoryLifecycle();
  mem.ids = ["c1", "c2", "c3", "c4"];
  handleCharacterCreate("user-a", createPayload("One", "fixture.class.alpha"), mem);
  handleCharacterCreate("user-a", createPayload("Two", "fixture.class.alpha"), mem);
  handleCharacterCreate("user-a", createPayload("Three", "fixture.class.alpha"), mem);
  assert.throws(
    () => handleCharacterCreate("user-a", createPayload("Four", "fixture.class.alpha"), mem),
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

  handleCharacterSoftDelete("user-a", idPayload("char-a"), mem);
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
