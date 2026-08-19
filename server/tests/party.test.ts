import assert from "node:assert/strict";
import test from "node:test";
import {
  INVITE_TTL_MS,
  MAX_PARTY_SIZE,
  PARTY_DISCONNECT_GRACE_MS,
  PARTY_IDLE_TTL_MS,
  acceptPartyInvite,
  createParty,
  declinePartyInvite,
  disbandParty,
  expireParty,
  getPartyState,
  inviteToParty,
  kickPartyMember,
  leaveParty,
  markPartyConnection,
  memoryPartyRepository,
  parsePartyRpcPayload,
  partyDomainFailureCode,
  partyRecordFromStorage,
  accountOwnsPartyMembership,
  promotePartyLeader,
  type PartyActor,
} from "../src/domain/party";
import { applyPartyMatchSignal, type MatchPartyCache } from "../src/domain/party_credit";
import { releaseCaveOwnershipForDisbandedParty } from "../src/domain/cave_ownership";

function actor(id: string, name: string): PartyActor {
  return { accountUserId: "acc-" + id, characterId: "char-" + id, displayName: name };
}

function req(n: number): string {
  return "request" + String(n) + "ab";
}

test("party create invite accept leave and disband", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  const bob = actor("b", "Bob");
  const created = createParty(repo, alice, 1000, "p_one", req(1));
  assert.equal(created.ok, true);
  assert.equal(created.party?.members.length, 1);
  assert.equal(created.party?.leaderCharacterId, alice.characterId);
  const invited = inviteToParty(repo, alice, bob, 1000, req(2));
  assert.equal(invited.ok, true);
  const accepted = acceptPartyInvite(repo, bob, "p_one", 1100, req(3));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.party?.members.length, 2);
  const left = leaveParty(repo, bob, 1200, req(4));
  assert.equal(left.ok, true);
  assert.equal(left.party?.members.length, 1);
  const disbanded = disbandParty(repo, alice, 1300, req(5));
  assert.equal(disbanded.ok, true);
  assert.equal(disbanded.deleted, true);
  assert.equal(disbanded.partyId, "p_one");
  assert.equal(getPartyState(repo, alice, 1400).party, undefined);
});

test("party decline and expired invite", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  const bob = actor("b", "Bob");
  createParty(repo, alice, 1000, "p_one", req(1));
  inviteToParty(repo, alice, bob, 1000, req(2));
  const declined = declinePartyInvite(repo, bob, "p_one", 1100, req(3));
  assert.equal(declined.ok, true);
  inviteToParty(repo, alice, bob, 2000, req(4));
  const expired = acceptPartyInvite(repo, bob, "p_one", 2000 + INVITE_TTL_MS + 1, req(5));
  assert.equal(expired.ok, false);
  assert.equal(expired.code, "invite_expired");
});

test("party full and already in party", () => {
  const repo = memoryPartyRepository();
  const leader = actor("l", "Leader");
  createParty(repo, leader, 1000, "p_one", req(1));
  for (let i = 0; i < MAX_PARTY_SIZE - 1; i++) {
    const member = actor("m" + String(i), "M" + String(i));
    inviteToParty(repo, leader, member, 1000, req(10 + i));
    assert.equal(acceptPartyInvite(repo, member, "p_one", 1000, req(20 + i)).ok, true);
  }
  const extra = actor("x", "Extra");
  const full = inviteToParty(repo, leader, extra, 1000, req(30));
  assert.equal(full.ok, false);
  assert.equal(full.code, "party_full");
  const other = createParty(repo, extra, 1000, "p_two", req(31));
  assert.equal(other.ok, true);
  const already = createParty(repo, leader, 1000, "p_three", req(32));
  assert.equal(already.ok, false);
  assert.equal(already.code, "already_in_party");
});

test("kick promote and leader disconnect grace reconnect", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  const bob = actor("b", "Bob");
  createParty(repo, alice, 1000, "p_one", req(1));
  inviteToParty(repo, alice, bob, 1000, req(2));
  acceptPartyInvite(repo, bob, "p_one", 1100, req(3));
  const kicked = kickPartyMember(repo, bob, alice.characterId, 1200, req(4));
  assert.equal(kicked.ok, false);
  assert.equal(kicked.code, "not_leader");
  assert.equal(kickPartyMember(repo, alice, bob.characterId, 1200, req(5)).ok, true);
  inviteToParty(repo, alice, bob, 1300, req(6));
  acceptPartyInvite(repo, bob, "p_one", 1300, req(7));
  assert.equal(promotePartyLeader(repo, alice, bob.characterId, 1400, req(8)).ok, true);
  assert.equal(getPartyState(repo, bob, 1400).party?.leaderCharacterId, bob.characterId);
  markPartyConnection(repo, bob, 1500, "disconnect_grace");
  const during = getPartyState(repo, alice, 1500 + PARTY_DISCONNECT_GRACE_MS - 1);
  assert.equal(during.party?.leaderCharacterId, bob.characterId);
  markPartyConnection(repo, bob, 1600, "online");
  assert.equal(getPartyState(repo, alice, 1600).party?.leaderCharacterId, bob.characterId);
  markPartyConnection(repo, bob, 1700, "disconnect_grace");
  const after = getPartyState(repo, alice, 1700 + PARTY_DISCONNECT_GRACE_MS + 1);
  assert.equal(after.party?.leaderCharacterId, alice.characterId);
});

test("all members absent past grace disbands the party", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  createParty(repo, alice, 1000, "p_one", req(1));
  markPartyConnection(repo, alice, 2000, "disconnect_grace");
  const gone = getPartyState(repo, alice, 2000 + PARTY_DISCONNECT_GRACE_MS + 1);
  assert.equal(gone.party, undefined);
  assert.equal(gone.deleted === true || gone.party === undefined, true);
});

test("duplicate request id replays and forged membership is rejected", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  const first = createParty(repo, alice, 1000, "p_one", req(1));
  const replay = createParty(repo, alice, 1100, "p_two", req(1));
  assert.equal(replay.replay, true);
  assert.equal(replay.party?.partyId, first.party?.partyId);
  assert.throws(
    () => parsePartyRpcPayload(JSON.stringify({ characterId: "char-a", requestId: req(2), members: ["x"] }), ["characterId", "requestId"], true),
    /stat_injection:members/,
  );
});

test("unbound cave ownership releaser is a no-op", () => {
  assert.equal(releaseCaveOwnershipForDisbandedParty("p_one").released, false);
});

test("storage null allAbsentSince does not disband a live party", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  const created = createParty(repo, alice, 1000, "p_one", req(1));
  assert.equal(created.ok, true);
  const party = created.party!;
  (party as { allAbsentSince?: number | null }).allAbsentSince = null;
  party.members[0].connectionState = "offline";
  party.members[0].lastSeenAt = 50000;
  const expired = expireParty(repo, party, 70000);
  assert.equal(expired.ok, true);
  assert.equal(expired.deleted === true, false);
  assert.notEqual(expired.party, undefined);
  repo.putParty(expired.party!);
  const invited = inviteToParty(repo, alice, actor("b", "Bob"), 70000, req(2));
  assert.equal(invited.ok, true);
  assert.equal(invited.party?.invites.length, 1);
});

test("partyRecordFromStorage ignores null timestamps and object arrays", () => {
  const parsed = partyRecordFromStorage({
    partyId: "p_one",
    leaderCharacterId: "char-a",
    members: {
      "0": {
        accountUserId: "acc-a",
        characterId: "char-a",
        displayName: "Alice",
        joinedAt: 1000,
        connectionState: "online",
        lastSeenAt: 1000,
      },
    },
    invites: [],
    revision: 1,
    createdAt: 1000,
    lastActiveAt: 1000,
    expiresAt: 1000 + PARTY_IDLE_TTL_MS,
    schemaVersion: 1,
    byRequestId: {},
    lootPolicy: "personal",
    allAbsentSince: null,
  });
  assert.notEqual(parsed, null);
  assert.equal(parsed?.allAbsentSince, undefined);
  assert.equal(parsed?.members.length, 1);
  assert.equal(parsed?.members[0].displayName, "Alice");
  const repo = memoryPartyRepository();
  repo.putParty(parsed!);
  repo.putIndex("acc-a", {
    schemaVersion: 1,
    characterId: "char-a",
    partyId: "p_one",
    pendingPartyId: "",
  });
  const invited = inviteToParty(repo, actor("a", "Alice"), actor("b", "Bob"), 70000, req(40));
  assert.equal(invited.ok, true);
});

test("party domain failure codes stay in the RPC payload", () => {
  assert.equal(partyDomainFailureCode("party_missing"), "party_missing");
  assert.equal(partyDomainFailureCode("invalid_target"), "invalid_target");
  assert.equal(partyDomainFailureCode("character_missing"), "character_missing");
  assert.equal(partyDomainFailureCode("malformed_json"), "malformed_json");
  assert.equal(partyDomainFailureCode("stat_injection:members"), "stat_injection:members");
  assert.equal(partyDomainFailureCode("unauthenticated"), "unauthenticated");
  assert.equal(partyDomainFailureCode("selection_foreign"), "selection_foreign");
  assert.equal(partyDomainFailureCode("party_failed"), "party_failed");
});

test("accountOwnsPartyMembership matches the account not the character name", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  const created = createParty(repo, alice, 1000, "p_one", req(50));
  assert.equal(accountOwnsPartyMembership(created.party!, "acc-a"), true);
  assert.equal(accountOwnsPartyMembership(created.party!, "acc-b"), false);
});

test("create while a pending invite exists declines that invite", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  const bob = actor("b", "Bob");
  createParty(repo, alice, 1000, "p_one", req(1));
  assert.equal(inviteToParty(repo, alice, bob, 1000, req(2)).ok, true);
  assert.equal(repo.getIndex(bob.accountUserId, bob.characterId)?.pendingPartyId, "p_one");
  const created = createParty(repo, bob, 1100, "p_two", req(3));
  assert.equal(created.ok, true);
  assert.equal(created.party?.partyId, "p_two");
  assert.equal(repo.getParty("p_one")?.invites.length, 0);
  assert.equal(repo.getParty("p_one")?.members.length, 1);
  assert.equal(repo.getIndex(bob.accountUserId, bob.characterId)?.partyId, "p_two");
  assert.equal(repo.getIndex(bob.accountUserId, bob.characterId)?.pendingPartyId, "");
});

test("accepting an invite leaves the current party first", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  const bob = actor("b", "Bob");
  createParty(repo, alice, 1000, "p_one", req(1));
  createParty(repo, bob, 1000, "p_two", req(2));
  assert.equal(inviteToParty(repo, alice, bob, 1100, req(3)).ok, true);
  assert.equal(repo.getIndex(bob.accountUserId, bob.characterId)?.partyId, "p_two");
  const accepted = acceptPartyInvite(repo, bob, "p_one", 1200, req(4));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.party?.partyId, "p_one");
  assert.equal(accepted.party?.members.length, 2);
  assert.equal(getPartyState(repo, bob, 1300).party?.partyId, "p_one");
  assert.equal(getPartyState(repo, alice, 1300).party?.members.length, 2);
  assert.equal(getPartyState(repo, bob, 1300).party?.members.length, 2);
  assert.equal(repo.getParty("p_two"), null);
});

test("ghost members are pruned and disband does not steal another party index", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  const bob = actor("b", "Bob");
  createParty(repo, alice, 1000, "p_one", req(1));
  createParty(repo, bob, 1000, "p_two", req(2));
  const one = repo.getParty("p_one")!;
  one.members.push({
    accountUserId: bob.accountUserId,
    characterId: bob.characterId,
    displayName: bob.displayName,
    joinedAt: 1000,
    connectionState: "online",
    lastSeenAt: 1000,
  });
  repo.putParty(one);
  const disbanded = disbandParty(repo, alice, 1100, req(3));
  assert.equal(disbanded.ok, true);
  assert.equal(disbanded.deleted, true);
  assert.equal(getPartyState(repo, bob, 1200).party?.partyId, "p_two");
  assert.equal(getPartyState(repo, bob, 1200).party?.members.length, 1);
});

test("self invite kick and promote are invalid_target", () => {
  const repo = memoryPartyRepository();
  const alice = actor("a", "Alice");
  createParty(repo, alice, 1000, "p_one", req(60));
  const selfInvite = inviteToParty(repo, alice, alice, 1000, req(61));
  assert.equal(selfInvite.ok, false);
  assert.equal(selfInvite.code, "invalid_target");
  const selfKick = kickPartyMember(repo, alice, alice.characterId, 1000, req(62));
  assert.equal(selfKick.ok, false);
  assert.equal(selfKick.code, "invalid_target");
  const emptyKick = kickPartyMember(repo, alice, "", 1000, req(63));
  assert.equal(emptyKick.ok, false);
  assert.equal(emptyKick.code, "invalid_target");
  const selfPromote = promotePartyLeader(repo, alice, alice.characterId, 1000, req(64));
  assert.equal(selfPromote.ok, false);
  assert.equal(selfPromote.code, "invalid_target");
});

test("match cache does not keep a character in two parties", () => {
  const cache: { [characterId: string]: MatchPartyCache } = {};
  const pending: { [characterId: string]: { partyId: string; fromDisplayName: string; expiresAt: number } } = {};
  applyPartyMatchSignal(cache, pending, {
    type: "party_update",
    partyId: "p_one",
    characterId: "char-a",
    leaderCharacterId: "char-a",
    revision: 1,
    members: [
      { accountUserId: "acc-a", characterId: "char-a", displayName: "Alice", connectionState: "online" },
      { accountUserId: "acc-b", characterId: "char-b", displayName: "Bob", connectionState: "online" },
    ],
  });
  assert.equal(cache["char-a"]?.partyId, "p_one");
  assert.equal(cache["char-b"]?.partyId, "p_one");
  applyPartyMatchSignal(cache, pending, {
    type: "party_update",
    partyId: "p_two",
    characterId: "char-b",
    leaderCharacterId: "char-b",
    revision: 1,
    members: [{ accountUserId: "acc-b", characterId: "char-b", displayName: "Bob", connectionState: "online" }],
  });
  assert.equal(cache["char-b"]?.partyId, "p_two");
  assert.equal(cache["char-a"]?.partyId, "p_one");
  assert.equal(cache["char-a"].members.length, 1);
  assert.equal(cache["char-a"].members[0].characterId, "char-a");
  applyPartyMatchSignal(cache, pending, {
    type: "party_update",
    partyId: "p_one",
    characterId: "char-a",
    leaderCharacterId: "char-a",
    revision: 2,
    members: [
      { accountUserId: "acc-a", characterId: "char-a", displayName: "Alice", connectionState: "online" },
      { accountUserId: "acc-b", characterId: "char-b", displayName: "Bob", connectionState: "online" },
    ],
  });
  assert.equal(cache["char-b"]?.partyId, "p_two");
  assert.equal(cache["char-a"].members.length, 1);
});
