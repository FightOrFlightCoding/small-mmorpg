import { assembleAccountExport, supportRecoveryId } from "../domain/account_export";
import { catalogFromContent } from "../domain/stats";
import { migrateToCanonicalProgression } from "../domain/progression";
import { content } from "../generated/content";
import { readAccountProfile } from "./account_profile_store";
import { readRoster } from "./roster_store";
import { readCharacter } from "./character_store";
import { readInventory } from "./inventory_store";
import { readEquipment } from "./equipment_store";
import { readProgression, writeProgression } from "./progression_store";
import { readQuests } from "./quest_store";
import { readActiveLocation } from "./location_store";
import { readGameplayLease } from "./gameplay_lease_store";
import { readGold } from "./transaction_store";
import { readTradeAudit } from "./trade_store";
import { nakamaPartyRepository } from "./party_store";

export function buildAccountExportPayload(
  nk: nkruntime.Nakama,
  userId: string,
  nowMs: number,
  registrationMode: string,
): { [key: string]: unknown } {
  let nakamaExport: unknown = {};
  try {
    const raw = nk.accountExportId(userId);
    nakamaExport = JSON.parse(raw);
  } catch {
    nakamaExport = {};
  }
  const profile = readAccountProfile(nk, userId);
  const roster = readRoster(nk, userId);
  const ids = roster !== null ? roster.characterIds.slice() : [];
  const characters: unknown[] = [];
  const boundLocations: unknown[] = [];
  const tradeHistory: unknown[] = [];
  const partyHistory: unknown[] = [];
  const repo = nakamaPartyRepository(nk);
  const catalog = catalogFromContent(content);
  for (let i = 0; i < ids.length; i++) {
    const character = readCharacter(nk, userId, ids[i]);
    const location = readActiveLocation(nk, userId, ids[i]);
    const classId = character !== null && character.classId !== undefined ? character.classId : "";
    const ensured = migrateToCanonicalProgression(readProgression(nk, userId, ids[i]), classId, nowMs, catalog);
    if (ensured.changed) {
      writeProgression(nk, userId, ensured.progression, ids[i]);
    }
    characters.push({
      catalog: character,
      progression: ensured.progression,
      inventory: readInventory(nk, userId, ids[i]),
      equipment: readEquipment(nk, userId, ids[i]),
      quests: readQuests(nk, userId, ids[i]),
      location: location,
    });
    if (location !== null) {
      boundLocations.push(location);
    }
    const audit = readTradeAudit(nk, userId, ids[i]);
    if (audit !== null) {
      tradeHistory.push(audit);
    }
    const partyIndex = repo.getIndex(userId, ids[i]);
    if (partyIndex !== null) {
      const party = partyIndex.partyId.length > 0 ? repo.getParty(partyIndex.partyId) : null;
      partyHistory.push({
        characterId: ids[i],
        partyId: partyIndex.partyId,
        pendingPartyId: partyIndex.pendingPartyId,
        party: party,
      });
    }
  }
  let gold = 0;
  let username = "";
  let disableTime = 0;
  try {
    const account = nk.accountGetId(userId);
    gold = readGold(nk, userId);
    username = account.user !== undefined && typeof account.user.username === "string" ? account.user.username : "";
    disableTime = typeof account.disableTime === "number" ? account.disableTime : 0;
  } catch {
    gold = 0;
  }
  const lease = readGameplayLease(nk, userId);
  return assembleAccountExport({
    accountUserId: userId,
    exportedAt: nowMs,
    nakamaExport: nakamaExport,
    profile:
      profile === null
        ? undefined
        : {
            status: profile.status,
            createdAt: profile.createdAt,
            verifiedAt: profile.verifiedAt,
            acceptedTermsVersion: profile.acceptedTermsVersion,
            acceptedPrivacyVersion: profile.acceptedPrivacyVersion,
            acceptedAt: profile.acceptedAt,
            registrationMode: registrationMode.length > 0 ? registrationMode : profile.registrationMode,
          },
    characters: characters,
    gold: gold,
    settings: { username: username, disableTime: disableTime, supportRecoveryId: supportRecoveryId(userId) },
    legal:
      profile === null
        ? undefined
        : {
            acceptedTermsVersion: profile.acceptedTermsVersion,
            acceptedPrivacyVersion: profile.acceptedPrivacyVersion,
            acceptedAt: profile.acceptedAt,
          },
    transactions: tradeHistory,
    partyHistory: partyHistory,
    tradeHistory: tradeHistory,
    sessionMetadata:
      lease === null
        ? { sessionIdPresent: false }
        : {
            sessionIdPresent: lease.sessionId.length > 0,
            matchId: lease.matchId,
            state: lease.state,
            updatedAt: lease.updatedAt,
            leaseVersion: lease.leaseVersion,
          },
    lease: lease,
    boundLocations: boundLocations,
  });
}
