/**
 * Party Need/Greed rolls. Server-owned integers 1–100. The client never submits a roll number.
 * Tests inject CombatRandom. Rolls are match-lifetime only.
 */

import type { CombatRandom } from "./combat_rng";
import {
  cloneInventory,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import { applyCapacityPlan, planCapacity, type IncomingStack } from "./item_capacity";
import { ITEM_ERROR_INVENTORY_FULL } from "./item_errors";
import { beginAcquisitionIntent, completeAcquisitionIntent } from "./item_txn";
import {
  corpseIsEmpty,
  qualifiesForNeedGreed,
  type CorpseItemEntry,
  type CorpseLootContainer,
} from "./corpse";

export const LOOT_ROLL_NEED = "NEED";
export const LOOT_ROLL_GREED = "GREED";
export const LOOT_ROLL_PASS = "PASS";

export type LootRollChoice = "NEED" | "GREED" | "PASS";
export type LootRollState = "OPEN" | "AWARDED" | "PENDING_PICKUP" | "ALL_PASSED";

export const ERROR_ROLL_CLOSED = "roll_closed";
export const ERROR_CHOICE_ALREADY_SUBMITTED = "choice_already_submitted";
export const ERROR_INVALID_ROLL_CHOICE = "invalid_choice";
export const ERROR_ROLL_MISSING = "invalid_target";

export interface LootRollChoiceRecord {
  characterId: string;
  choice: LootRollChoice;
  requestId: string;
  submittedAtTick: number;
  roll: number;
}

export interface LootRollSubmitRecord {
  ok: boolean;
  code: string;
  choice: LootRollChoice;
}

export interface LootRoll {
  rollId: string;
  corpseId: string;
  corpseEntryId: string;
  itemInstanceId: string;
  itemId: string;
  quantity: number;
  eligibleCharacterIds: string[];
  choices: { [characterId: string]: LootRollChoiceRecord };
  resultByRequestId: { [requestId: string]: LootRollSubmitRecord };
  openedAt: number;
  closesAt: number;
  state: LootRollState;
  winnerCharacterId: string;
  winningChoice: string;
  winningRoll: number;
  revision: number;
}

export interface LootRollNotice {
  userId: string;
  characterId: string;
  code: string;
  message: string;
  eligibleCharacterIds: string[];
}

export interface AwardInventoryBag {
  characterId: string;
  userId: string;
  inventory: PlayerInventory;
  equippedItems?: ReadonlyArray<ItemInstance>;
}

export interface NeedGreedAwardContext {
  bags: { [characterId: string]: AwardInventoryBag };
  itemsById: { [id: string]: ItemDefinition };
  random: CombatRandom;
  nowMs: number;
  namesByCharacterId?: { [characterId: string]: string };
}

export interface NeedGreedMutation {
  rolls: LootRoll[];
  inventories: { [characterId: string]: PlayerInventory };
  persistUserIds: string[];
  notices: LootRollNotice[];
  awardedEntryIds: string[];
  updatedCorpseIds: string[];
  resolvedRollIds: string[];
}

export function isPartyTaggedKill(corpse: { tagPartyId: string; encounterRoster: { length: number } }): boolean {
  return corpse.tagPartyId.length > 0 && corpse.encounterRoster.length >= 2;
}

export function parseLootRollChoice(raw: string): LootRollChoice | "" {
  if (raw === LOOT_ROLL_NEED || raw === LOOT_ROLL_GREED || raw === LOOT_ROLL_PASS) {
    return raw;
  }
  return "";
}

export function rollOneToHundred(random: CombatRandom): number {
  const unit = random.next();
  const scaled = typeof unit === "number" && isFinite(unit) ? unit : 0;
  const bounded = scaled < 0 ? 0 : scaled >= 1 ? 0.999999 : scaled;
  return Math.floor(bounded * 100) + 1;
}

export function createLootRoll(input: {
  rollId: string;
  corpse: CorpseLootContainer;
  entry: CorpseItemEntry;
  openedAt: number;
}): LootRoll {
  const eligible: string[] = [];
  for (let i = 0; i < input.corpse.deathEligibleRoster.length; i++) {
    eligible.push(input.corpse.deathEligibleRoster[i].characterId);
  }
  return {
    rollId: input.rollId,
    corpseId: input.corpse.corpseId,
    corpseEntryId: input.entry.entryId,
    itemInstanceId: input.entry.instanceId,
    itemId: input.entry.itemId,
    quantity: input.entry.quantity,
    eligibleCharacterIds: eligible,
    choices: {},
    resultByRequestId: {},
    openedAt: input.openedAt,
    closesAt: input.corpse.privateUntilTick,
    state: "OPEN",
    winnerCharacterId: "",
    winningChoice: "",
    winningRoll: 0,
    revision: 1,
  };
}

export function openNeedGreedForCorpse(input: {
  corpse: CorpseLootContainer;
  itemsById: { [id: string]: ItemDefinition };
  newId: () => string;
  openedAt: number;
}): LootRoll[] {
  const rolls: LootRoll[] = [];
  if (!isPartyTaggedKill(input.corpse)) {
    return rolls;
  }
  const partySize = input.corpse.encounterRoster.length;
  const eligibleCount = input.corpse.deathEligibleRoster.length;
  for (let i = 0; i < input.corpse.items.length; i++) {
    const entry = input.corpse.items[i];
    const definition = input.itemsById[entry.itemId];
    if (!qualifiesForNeedGreed(definition, partySize)) {
      continue;
    }
    if (eligibleCount >= 2) {
      entry.state = "ROLL_PENDING";
      rolls.push(
        createLootRoll({
          rollId: input.newId(),
          corpse: input.corpse,
          entry: entry,
          openedAt: input.openedAt,
        }),
      );
    }
  }
  return rolls;
}

export function autoAwardSingleEligible(input: {
  corpse: CorpseLootContainer;
  itemsById: { [id: string]: ItemDefinition };
  bags: { [characterId: string]: AwardInventoryBag };
  nowMs: number;
  namesByCharacterId?: { [characterId: string]: string };
}): NeedGreedMutation {
  const mutation = emptyMutation();
  if (!isPartyTaggedKill(input.corpse) || input.corpse.deathEligibleRoster.length !== 1) {
    return mutation;
  }
  const winner = input.corpse.deathEligibleRoster[0];
  const partySize = input.corpse.encounterRoster.length;
  for (let i = 0; i < input.corpse.items.length; i++) {
    const entry = input.corpse.items[i];
    if (entry.state === "CLAIMED" || entry.state === "EXPIRED" || entry.state === "AWARDED_PENDING_PICKUP") {
      continue;
    }
    const definition = input.itemsById[entry.itemId];
    if (!qualifiesForNeedGreed(definition, partySize)) {
      continue;
    }
    const awarded = awardEntryToCharacter({
      corpse: input.corpse,
      entry: entry,
      characterId: winner.characterId,
      bags: input.bags,
      itemsById: input.itemsById,
      nowMs: input.nowMs,
      requestId: awardRequestId("auto", input.corpse.corpseId, entry.entryId),
      winningChoice: "",
      winningRoll: 0,
    });
    writeBackBag(input.bags, awarded);
    mergeAward(mutation, awarded);
    if (awarded.pending) {
      mutation.notices.push(pendingNotice(winner.userId, winner.characterId, entry.itemId, [winner.characterId]));
    }
  }
  if (mutation.awardedEntryIds.length > 0 || mutation.updatedCorpseIds.length > 0) {
    mutation.updatedCorpseIds.push(input.corpse.corpseId);
    input.corpse.revision += 1;
  }
  return mutation;
}

export function submitLootRollChoice(input: {
  rolls: LootRoll[];
  rollId: string;
  characterId: string;
  choice: string;
  requestId: string;
  tick: number;
}): { ok: boolean; code: string; replay: boolean; choice: LootRollChoice | ""; roll: LootRoll | null } {
  const roll = findLootRoll(input.rolls, input.rollId);
  if (roll === null) {
    return { ok: false, code: ERROR_ROLL_MISSING, replay: false, choice: "", roll: null };
  }
  const previous = roll.resultByRequestId[input.requestId];
  if (previous !== undefined) {
    return { ok: previous.ok, code: previous.code, replay: true, choice: previous.choice, roll: roll };
  }
  if (roll.state !== "OPEN") {
    return rememberSubmit(roll, input.requestId, false, ERROR_ROLL_CLOSED, LOOT_ROLL_PASS);
  }
  if (input.tick >= roll.closesAt) {
    return rememberSubmit(roll, input.requestId, false, ERROR_ROLL_CLOSED, LOOT_ROLL_PASS);
  }
  if (!isEligible(roll, input.characterId)) {
    return rememberSubmit(roll, input.requestId, false, "not_eligible", LOOT_ROLL_PASS);
  }
  const parsed = parseLootRollChoice(input.choice);
  if (parsed === "") {
    return rememberSubmit(roll, input.requestId, false, ERROR_INVALID_ROLL_CHOICE, LOOT_ROLL_PASS);
  }
  const existing = roll.choices[input.characterId];
  if (existing !== undefined) {
    return rememberSubmit(roll, input.requestId, false, ERROR_CHOICE_ALREADY_SUBMITTED, existing.choice);
  }
  roll.choices[input.characterId] = {
    characterId: input.characterId,
    choice: parsed,
    requestId: input.requestId,
    submittedAtTick: input.tick,
    roll: 0,
  };
  roll.revision += 1;
  return rememberSubmit(roll, input.requestId, true, "ok", parsed);
}

export function resolveLootRoll(roll: LootRoll, random: CombatRandom): LootRoll {
  if (roll.state !== "OPEN") {
    return roll;
  }
  for (let i = 0; i < roll.eligibleCharacterIds.length; i++) {
    const characterId = roll.eligibleCharacterIds[i];
    if (roll.choices[characterId] === undefined) {
      roll.choices[characterId] = {
        characterId: characterId,
        choice: LOOT_ROLL_PASS,
        requestId: "",
        submittedAtTick: roll.closesAt,
        roll: 0,
      };
    }
  }
  const needPool = poolFor(roll, LOOT_ROLL_NEED);
  const greedPool = poolFor(roll, LOOT_ROLL_GREED);
  const pool = needPool.length > 0 ? needPool : greedPool;
  if (pool.length === 0) {
    roll.state = "ALL_PASSED";
    roll.winnerCharacterId = "";
    roll.winningChoice = LOOT_ROLL_PASS;
    roll.winningRoll = 0;
    roll.revision += 1;
    return roll;
  }
  const picked = pickWinner(pool, random);
  for (let p = 0; p < pool.length; p++) {
    const row = roll.choices[pool[p]];
    if (row !== undefined) {
      const rolled = picked.rolls[pool[p]];
      row.roll = rolled !== undefined ? rolled : 0;
    }
  }
  roll.winnerCharacterId = picked.winner;
  roll.winningChoice = needPool.length > 0 ? LOOT_ROLL_NEED : LOOT_ROLL_GREED;
  roll.winningRoll = picked.winningRoll;
  roll.revision += 1;
  return roll;
}

export function applyNeedGreedPublicBoundary(input: {
  corpses: CorpseLootContainer[];
  rolls: LootRoll[];
  tick: number;
  context: NeedGreedAwardContext;
}): NeedGreedMutation {
  const mutation = emptyMutation();
  mutation.rolls = input.rolls;
  for (let c = 0; c < input.corpses.length; c++) {
    const corpse = input.corpses[c];
    if (corpse.state !== "ACTIVE" || corpse.publicTransitionDone === true) {
      continue;
    }
    if (input.tick < corpse.privateUntilTick) {
      continue;
    }
    let changed = false;
    for (let r = 0; r < input.rolls.length; r++) {
      const roll = input.rolls[r];
      if (roll.corpseId !== corpse.corpseId || roll.state !== "OPEN") {
        continue;
      }
      const resolved = resolveLootRoll(roll, input.context.random);
      mutation.resolvedRollIds.push(resolved.rollId);
      if (resolved.state === "ALL_PASSED") {
        const entry = findEntry(corpse, roll.corpseEntryId);
        if (entry !== null && entry.state === "ROLL_PENDING") {
          entry.state = "PUBLIC_AVAILABLE";
          entry.reservedToCharacterId = "";
        }
        mutation.notices.push(allPassedNotice(roll));
        changed = true;
        continue;
      }
      const entry = findEntry(corpse, roll.corpseEntryId);
      if (entry === null) {
        continue;
      }
      const awarded = awardEntryToCharacter({
        corpse: corpse,
        entry: entry,
        characterId: roll.winnerCharacterId,
        bags: input.context.bags,
        itemsById: input.context.itemsById,
        nowMs: input.context.nowMs,
        requestId: awardRequestId("roll", roll.rollId, entry.entryId),
        winningChoice: roll.winningChoice,
        winningRoll: roll.winningRoll,
      });
      writeBackBag(input.context.bags, awarded);
      mergeAward(mutation, awarded);
      if (awarded.pending) {
        roll.state = "PENDING_PICKUP";
        const bag = input.context.bags[roll.winnerCharacterId];
        if (bag !== undefined) {
          mutation.notices.push(pendingNotice(bag.userId, bag.characterId, roll.itemId, [roll.winnerCharacterId]));
        }
      } else if (awarded.granted) {
        roll.state = "AWARDED";
      }
      mutation.notices.push(resultNotice(roll, input.context));
      changed = true;
    }
    for (let i = 0; i < corpse.items.length; i++) {
      const entry = corpse.items[i];
      if (entry.state === "ROLL_PENDING") {
        entry.state = "PUBLIC_AVAILABLE";
        entry.reservedToCharacterId = "";
        changed = true;
      }
    }
    if (changed) {
      corpse.revision += 1;
      mutation.updatedCorpseIds.push(corpse.corpseId);
    }
  }
  return mutation;
}

export function findLootRoll(rolls: ReadonlyArray<LootRoll>, rollId: string): LootRoll | null {
  for (let i = 0; i < rolls.length; i++) {
    if (rolls[i].rollId === rollId) {
      return rolls[i];
    }
  }
  return null;
}

export function lootRollsForCharacter(rolls: ReadonlyArray<LootRoll>, characterId: string): LootRoll[] {
  const list: LootRoll[] = [];
  for (let i = 0; i < rolls.length; i++) {
    if (isEligible(rolls[i], characterId)) {
      list.push(rolls[i]);
    }
  }
  return list;
}

export function lootRollStateForViewer(roll: LootRoll, characterId: string, tick: number): { [key: string]: unknown } {
  const own = roll.choices[characterId];
  const resolved = roll.state !== "OPEN";
  const choices: { [key: string]: unknown }[] = [];
  if (resolved) {
    const ids = Object.keys(roll.choices);
    ids.sort();
    for (let i = 0; i < ids.length; i++) {
      const row = roll.choices[ids[i]];
      choices.push({
        characterId: row.characterId,
        choice: row.choice,
        roll: row.roll,
      });
    }
  }
  return {
    rollId: roll.rollId,
    corpseId: roll.corpseId,
    corpseEntryId: roll.corpseEntryId,
    itemId: roll.itemId,
    itemInstanceId: roll.itemInstanceId,
    quantity: roll.quantity,
    eligibleCharacterIds: roll.eligibleCharacterIds.slice(),
    openedAt: roll.openedAt,
    closesAt: roll.closesAt,
    state: roll.state,
    revision: roll.revision,
    tick: tick,
    ownChoice: own !== undefined ? own.choice : "",
    winnerCharacterId: roll.winnerCharacterId,
    winningChoice: roll.winningChoice,
    winningRoll: roll.winningRoll,
    choices: choices,
  };
}

export function cloneLootRolls(rolls: ReadonlyArray<LootRoll> | undefined): LootRoll[] {
  const source = Array.isArray(rolls) ? rolls : [];
  const list: LootRoll[] = [];
  for (let i = 0; i < source.length; i++) {
    list.push(cloneLootRoll(source[i]));
  }
  return list;
}

export function cloneLootRoll(roll: LootRoll): LootRoll {
  const choices: { [characterId: string]: LootRollChoiceRecord } = {};
  const choiceIds = Object.keys(roll.choices);
  for (let i = 0; i < choiceIds.length; i++) {
    const row = roll.choices[choiceIds[i]];
    choices[choiceIds[i]] = {
      characterId: row.characterId,
      choice: row.choice,
      requestId: row.requestId,
      submittedAtTick: row.submittedAtTick,
      roll: row.roll,
    };
  }
  const results: { [requestId: string]: LootRollSubmitRecord } = {};
  const requestIds = Object.keys(roll.resultByRequestId);
  for (let r = 0; r < requestIds.length; r++) {
    const row = roll.resultByRequestId[requestIds[r]];
    results[requestIds[r]] = { ok: row.ok, code: row.code, choice: row.choice };
  }
  return {
    rollId: roll.rollId,
    corpseId: roll.corpseId,
    corpseEntryId: roll.corpseEntryId,
    itemInstanceId: roll.itemInstanceId,
    itemId: roll.itemId,
    quantity: roll.quantity,
    eligibleCharacterIds: roll.eligibleCharacterIds.slice(),
    choices: choices,
    resultByRequestId: results,
    openedAt: roll.openedAt,
    closesAt: roll.closesAt,
    state: roll.state,
    winnerCharacterId: roll.winnerCharacterId,
    winningChoice: roll.winningChoice,
    winningRoll: roll.winningRoll,
    revision: roll.revision,
  };
}

export function expireLootRollsForCorpse(rolls: LootRoll[], corpseId: string): LootRoll[] {
  const next: LootRoll[] = [];
  for (let i = 0; i < rolls.length; i++) {
    if (rolls[i].corpseId !== corpseId) {
      next.push(rolls[i]);
    }
  }
  return next;
}

function awardEntryToCharacter(input: {
  corpse: CorpseLootContainer;
  entry: CorpseItemEntry;
  characterId: string;
  bags: { [characterId: string]: AwardInventoryBag };
  itemsById: { [id: string]: ItemDefinition };
  nowMs: number;
  requestId: string;
  winningChoice: string;
  winningRoll: number;
}): {
  granted: boolean;
  pending: boolean;
  inventory?: PlayerInventory;
  userId: string;
  characterId: string;
} {
  const bag = input.bags[input.characterId];
  if (bag === undefined) {
    input.entry.state = "AWARDED_PENDING_PICKUP";
    input.entry.reservedToCharacterId = input.characterId;
    input.corpse.revision += 1;
    return { granted: false, pending: true, userId: "", characterId: input.characterId };
  }
  const inventory = cloneInventory(bag.inventory);
  const userId = bag.userId;
  const definition = input.itemsById[input.entry.itemId];
  if (definition === undefined) {
    return { granted: false, pending: false, userId: userId, characterId: input.characterId };
  }
  const incoming: IncomingStack = {
    itemId: input.entry.itemId,
    quantity: input.entry.quantity,
    instanceId: input.entry.instanceId,
    sourceType: "loot",
    sourceId: input.corpse.corpseId,
  };
  const plan = planCapacity({
    inventory: inventory,
    incoming: [incoming],
    definitions: input.itemsById,
    equippedItems: bag !== undefined ? bag.equippedItems : undefined,
    operationMode: "acquire",
    nowMs: input.nowMs,
  });
  if (!plan.fits) {
    input.entry.state = "AWARDED_PENDING_PICKUP";
    input.entry.reservedToCharacterId = input.characterId;
    input.corpse.revision += 1;
    return { granted: false, pending: true, inventory: inventory, userId: userId, characterId: input.characterId };
  }
  const started = beginAcquisitionIntent({
    inventory: inventory,
    requestId: input.requestId,
    characterId: input.characterId,
    definitionId: input.entry.itemId,
    instanceId: input.entry.instanceId,
    quantity: input.entry.quantity,
    sourceId: input.entry.entryId,
    nowMs: input.nowMs,
    newIds: function () {
      return input.entry.instanceId;
    },
  });
  let grantedInventory = started.inventory;
  if (!started.replay) {
    grantedInventory = applyCapacityPlan(started.inventory, plan, []);
    grantedInventory.persistReason = "loot";
    grantedInventory = completeAcquisitionIntent(grantedInventory, started.intent, input.nowMs);
  }
  input.entry.state = "CLAIMED";
  input.entry.claimedByCharacterId = input.characterId;
  input.entry.reservedToCharacterId = "";
  input.corpse.revision += 1;
  if (corpseIsEmpty(input.corpse)) {
    input.corpse.state = "REMOVED";
  }
  return {
    granted: true,
    pending: false,
    inventory: grantedInventory,
    userId: userId,
    characterId: input.characterId,
  };
}

function pickWinner(
  characterIds: string[],
  random: CombatRandom,
): { winner: string; winningRoll: number; rolls: { [characterId: string]: number } } {
  const rolls: { [characterId: string]: number } = {};
  let contenders = characterIds.slice();
  let rounds = 0;
  while (contenders.length > 1 && rounds < 64) {
    rounds += 1;
    let highest = 0;
    const next: string[] = [];
    for (let i = 0; i < contenders.length; i++) {
      const value = rollOneToHundred(random);
      rolls[contenders[i]] = value;
      if (value > highest) {
        highest = value;
        next.length = 0;
        next.push(contenders[i]);
      } else if (value === highest) {
        next.push(contenders[i]);
      }
    }
    if (next.length === 1) {
      return { winner: next[0], winningRoll: highest, rolls: rolls };
    }
    contenders = next;
  }
  contenders.sort();
  const winner = contenders[0];
  const winningRoll = rolls[winner] !== undefined ? rolls[winner] : rollOneToHundred(random);
  rolls[winner] = winningRoll;
  return { winner: winner, winningRoll: winningRoll, rolls: rolls };
}

function poolFor(roll: LootRoll, choice: LootRollChoice): string[] {
  const pool: string[] = [];
  for (let i = 0; i < roll.eligibleCharacterIds.length; i++) {
    const characterId = roll.eligibleCharacterIds[i];
    const row = roll.choices[characterId];
    if (row !== undefined && row.choice === choice) {
      pool.push(characterId);
    }
  }
  return pool;
}

function isEligible(roll: LootRoll, characterId: string): boolean {
  return roll.eligibleCharacterIds.indexOf(characterId) !== -1;
}

function rememberSubmit(
  roll: LootRoll,
  requestId: string,
  ok: boolean,
  code: string,
  choice: LootRollChoice,
): { ok: boolean; code: string; replay: boolean; choice: LootRollChoice; roll: LootRoll } {
  roll.resultByRequestId[requestId] = { ok: ok, code: code, choice: choice };
  return { ok: ok, code: code, replay: false, choice: choice, roll: roll };
}

function findEntry(corpse: CorpseLootContainer, entryId: string): CorpseItemEntry | null {
  for (let i = 0; i < corpse.items.length; i++) {
    if (corpse.items[i].entryId === entryId) {
      return corpse.items[i];
    }
  }
  return null;
}

function emptyMutation(): NeedGreedMutation {
  return {
    rolls: [],
    inventories: {},
    persistUserIds: [],
    notices: [],
    awardedEntryIds: [],
    updatedCorpseIds: [],
    resolvedRollIds: [],
  };
}

function mergeAward(
  mutation: NeedGreedMutation,
  awarded: { granted: boolean; pending: boolean; inventory?: PlayerInventory; userId: string; characterId: string },
): void {
  if (awarded.inventory !== undefined && (awarded.granted || awarded.pending)) {
    mutation.inventories[awarded.characterId] = awarded.inventory;
  }
  if (awarded.granted && awarded.userId.length > 0) {
    mutation.persistUserIds.push(awarded.userId);
    mutation.awardedEntryIds.push(awarded.characterId);
  }
}

function awardRequestId(kind: string, left: string, right: string): string {
  const raw = kind + "-" + left + "-" + right;
  const compact = raw.replace(/[^A-Za-z0-9_-]/g, "");
  if (compact.length >= 8 && compact.length <= 64) {
    return compact;
  }
  if (compact.length > 64) {
    return compact.slice(0, 64);
  }
  return (compact + "xxxxxxxx").slice(0, 8);
}

function displayName(characterId: string, names?: { [characterId: string]: string }): string {
  if (names !== undefined && names[characterId] !== undefined && names[characterId].length > 0) {
    return names[characterId];
  }
  return characterId;
}

function resultNotice(roll: LootRoll, context: NeedGreedAwardContext): LootRollNotice {
  const winner = displayName(roll.winnerCharacterId, context.namesByCharacterId);
  const message =
    winner +
    " won " +
    roll.itemId +
    " with " +
    (roll.winningChoice.length > 0 ? roll.winningChoice : "Need") +
    " (" +
    String(roll.winningRoll) +
    ").";
  const bag = context.bags[roll.winnerCharacterId];
  return {
    userId: bag !== undefined ? bag.userId : "",
    characterId: roll.winnerCharacterId,
    code: "loot_roll_result",
    message: message,
    eligibleCharacterIds: roll.eligibleCharacterIds.slice(),
  };
}

function allPassedNotice(roll: LootRoll): LootRollNotice {
  return {
    userId: "",
    characterId: "",
    code: "loot_roll_all_passed",
    message: roll.itemId + " passed. It is now public.",
    eligibleCharacterIds: roll.eligibleCharacterIds.slice(),
  };
}

function pendingNotice(
  userId: string,
  characterId: string,
  itemId: string,
  eligibleCharacterIds: string[],
): LootRollNotice {
  return {
    userId: userId,
    characterId: characterId,
    code: ITEM_ERROR_INVENTORY_FULL,
    message: "Your bag is full. " + itemId + " waits on the corpse.",
    eligibleCharacterIds: eligibleCharacterIds,
  };
}

function writeBackBag(
  bags: { [characterId: string]: AwardInventoryBag },
  awarded: { granted: boolean; pending: boolean; inventory?: PlayerInventory; characterId: string },
): void {
  if (awarded.inventory === undefined) {
    return;
  }
  const bag = bags[awarded.characterId];
  if (bag === undefined) {
    return;
  }
  bag.inventory = awarded.inventory;
}
