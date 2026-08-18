import {
  addOrStackItem,
  acceptItemFailureCode,
  type ItemDefinition,
  type PlayerInventory,
} from "./inventory";
import { hashSeed, lcgRng, normalizedLootPolicy } from "./loot_table";
import type { GroupCreditMember } from "./party_credit";

export type PartyLootPolicy = "personal" | "server_assigned" | "ground_free" | "killer" | "party_split";

export interface PartyLootDrop {
  itemId: string;
  quantity: number;
}

export interface PartyLootGrant {
  userId: string;
  characterId: string;
  itemId: string;
  quantity: number;
  instanceId: string;
  code: string;
}

export interface PartyLootAssignment {
  policy: "personal" | "server_assigned";
  eventId: string;
  grants: PartyLootGrant[];
  assignedUserId: string;
}

export function assignPartyLoot(input: {
  eventId: string;
  policy: string;
  drops: ReadonlyArray<PartyLootDrop>;
  eligible: ReadonlyArray<GroupCreditMember>;
  inventories: { [userId: string]: PlayerInventory | undefined };
  itemsById: { [itemId: string]: ItemDefinition };
  newId: () => string;
}): PartyLootAssignment | null {
  const policy = normalizedLootPolicy(input.policy);
  if (policy === "ground" || input.drops.length === 0 || input.eligible.length === 0) {
    return null;
  }
  if (policy === "server_assigned") {
    return assignToOne(input);
  }
  return assignPersonal(input);
}

function assignPersonal(input: {
  eventId: string;
  drops: ReadonlyArray<PartyLootDrop>;
  eligible: ReadonlyArray<GroupCreditMember>;
  inventories: { [userId: string]: PlayerInventory | undefined };
  itemsById: { [itemId: string]: ItemDefinition };
  newId: () => string;
}): PartyLootAssignment {
  const grants: PartyLootGrant[] = [];
  for (let i = 0; i < input.eligible.length; i++) {
    const member = input.eligible[i];
    for (let d = 0; d < input.drops.length; d++) {
      grants.push(tryGrant(input, member, input.drops[d], input.eventId + ":" + member.characterId + ":" + String(d)));
    }
  }
  return {
    policy: "personal",
    eventId: input.eventId,
    grants: grants,
    assignedUserId: "",
  };
}

function assignToOne(input: {
  eventId: string;
  drops: ReadonlyArray<PartyLootDrop>;
  eligible: ReadonlyArray<GroupCreditMember>;
  inventories: { [userId: string]: PlayerInventory | undefined };
  itemsById: { [itemId: string]: ItemDefinition };
  newId: () => string;
}): PartyLootAssignment {
  const rng = lcgRng(hashSeed(input.eventId + ":assignee"));
  const index = Math.floor(rng() * input.eligible.length) % input.eligible.length;
  const member = input.eligible[index];
  const grants: PartyLootGrant[] = [];
  for (let d = 0; d < input.drops.length; d++) {
    grants.push(tryGrant(input, member, input.drops[d], input.eventId + ":assigned:" + String(d)));
  }
  return {
    policy: "server_assigned",
    eventId: input.eventId,
    grants: grants,
    assignedUserId: member.userId,
  };
}

function tryGrant(
  input: {
    inventories: { [userId: string]: PlayerInventory | undefined };
    itemsById: { [itemId: string]: ItemDefinition };
    newId: () => string;
  },
  member: GroupCreditMember,
  drop: PartyLootDrop,
  instanceSeed: string,
): PartyLootGrant {
  const definition = input.itemsById[drop.itemId];
  const inventory = input.inventories[member.userId];
  if (definition === undefined || inventory === undefined) {
    return {
      userId: member.userId,
      characterId: member.characterId,
      itemId: drop.itemId,
      quantity: drop.quantity,
      instanceId: "",
      code: "item_missing",
    };
  }
  const code = acceptItemFailureCode(inventory, drop.itemId, drop.quantity, definition);
  if (code.length > 0) {
    return {
      userId: member.userId,
      characterId: member.characterId,
      itemId: drop.itemId,
      quantity: drop.quantity,
      instanceId: "",
      code: code,
    };
  }
  const instanceId = input.newId();
  input.inventories[member.userId] = addOrStackItem(inventory, drop.itemId, drop.quantity, instanceId, definition);
  return {
    userId: member.userId,
    characterId: member.characterId,
    itemId: drop.itemId,
    quantity: drop.quantity,
    instanceId: instanceId.length > 0 ? instanceId : instanceSeed,
    code: "ok",
  };
}
